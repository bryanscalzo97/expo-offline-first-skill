/**
 * Durable outbox processor. Sends one job at a time while online: on start, on reconnect,
 * when the app returns to the foreground, and when a backoff timer expires.
 *
 *   <OutboxProvider send={send} apply={apply} onDone={announceReady}>
 *
 * - `send` performs the network call. It MUST forward `idempotencyKey` as the
 *   `Idempotency-Key` header so a retry never creates (or charges) twice.
 * - `apply` writes the server result into local state (cache, DB, store). It may fail;
 *   the response is already on disk, so the next run applies it without calling the server.
 */
import { onlineManager } from "@tanstack/react-query";
import { randomUUID } from "expo-crypto";
import type { File } from "expo-file-system";
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import * as OutboxDb from "./outbox-db";
import type { OutboxJob } from "./outbox-db";
import {
  canCancel,
  classifyError,
  manualRetry,
  markDone,
  markFailure,
  nextWakeAt,
  pickNext,
  recoverInterrupted,
  startSending,
} from "./state";

/** Set to false if your server does not deduplicate on Idempotency-Key yet. */
const SERVER_IS_IDEMPOTENT = true;

export type SendJob = (
  job: OutboxJob,
  context: { idempotencyKey: string; attachment: File | null },
) => Promise<unknown>;
export type ApplyResult = (job: OutboxJob, response: unknown) => Promise<void>;

interface OutboxContextValue {
  /** Jobs not yet done (waiting, sending or failed), oldest first. Render them as pending cards. */
  jobs: OutboxJob[];
  enqueue: (input: { kind: string; payload: unknown; attachmentUri?: string }) => Promise<OutboxJob>;
  retry: (id: string) => Promise<void>;
  cancel: (id: string) => Promise<void>;
}

const OutboxContext = createContext<OutboxContextValue | null>(null);

export function OutboxProvider({
  children,
  send,
  apply,
  onDone,
}: {
  children: ReactNode;
  send: SendJob;
  apply: ApplyResult;
  onDone?: (job: OutboxJob) => void;
}) {
  const [jobs, setJobs] = useState<OutboxJob[]>([]);
  const jobsRef = useRef<OutboxJob[]>([]);
  const loadedRef = useRef(false);
  const processingRef = useRef(false);
  const flushAgainRef = useRef(false);
  const wakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const commit = useCallback((next: OutboxJob[]) => {
    jobsRef.current = next;
    setJobs(next);
  }, []);

  /** Disk first, then React state: the DB is the source of truth. */
  const persist = useCallback(
    async (job: OutboxJob) => {
      await OutboxDb.saveJobState(job);
      commit(jobsRef.current.map((item) => (item.id === job.id ? job : item)));
    },
    [commit],
  );

  const remove = useCallback(
    async (job: OutboxJob) => {
      await OutboxDb.deleteJob(job);
      commit(jobsRef.current.filter((item) => item.id !== job.id));
    },
    [commit],
  );

  const processJob = useCallback(
    async (job: OutboxJob): Promise<"continue" | "stop"> => {
      const sending = startSending(job, Date.now());
      await persist(sending);

      const attachment = sending.attachment ? OutboxDb.attachmentFile(sending.attachment) : null;
      if (sending.attachment && !attachment) {
        await persist(markFailure(sending, "file_missing", Date.now()));
        return "continue";
      }

      try {
        // A response already received (app killed / apply failed last time) is reused, never re-requested.
        let response = sending.response;
        if (response === null) {
          response = await send(sending, { idempotencyKey: sending.id, attachment });
          await OutboxDb.saveResponse(sending.id, response);
        }
        await apply(sending, response);
        await persist(markDone(sending, Date.now()));
        await remove(sending);
        onDone?.(sending);
        return "continue";
      } catch (error) {
        const code = classifyError(error);
        await persist(markFailure(sending, code, Date.now()));
        // Offline again: wait for the reconnect event instead of burning attempts.
        return code === "network" ? "stop" : "continue";
      }
    },
    [apply, onDone, persist, remove, send],
  );

  const flushRef = useRef<() => Promise<void>>(async () => {});

  const scheduleWake = useCallback(() => {
    if (wakeTimerRef.current) clearTimeout(wakeTimerRef.current);
    wakeTimerRef.current = null;
    const wakeAt = nextWakeAt(jobsRef.current);
    if (wakeAt === null) return;
    wakeTimerRef.current = setTimeout(() => void flushRef.current(), Math.max(0, wakeAt - Date.now()) + 50);
  }, []);

  /** Single-flight: a flush requested while one is running sets a flag and re-runs once. */
  const flush = useCallback(async () => {
    if (!loadedRef.current) return;
    if (processingRef.current) {
      flushAgainRef.current = true;
      return;
    }
    processingRef.current = true;
    try {
      do {
        flushAgainRef.current = false;
        while (onlineManager.isOnline()) {
          const next = pickNext(jobsRef.current, Date.now());
          if (!next) break;
          if ((await processJob(next)) === "stop") break;
        }
      } while (flushAgainRef.current && onlineManager.isOnline());
    } catch (error) {
      console.error("Outbox flush failed:", error);
    } finally {
      processingRef.current = false;
      scheduleWake();
    }
  }, [processJob, scheduleWake]);

  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  // Load, clean up, recover jobs interrupted by an app kill, then flush.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await OutboxDb.purge();
        const now = Date.now();
        const recovered: OutboxJob[] = [];
        for (const job of await OutboxDb.listJobs()) {
          if (job.status !== "sending") {
            recovered.push(job);
            continue;
          }
          // Response already on disk: finishing it is free. Otherwise it depends on the server.
          const next =
            job.response !== null
              ? { ...job, status: "pending" as const, nextAttemptAt: null, updatedAt: now }
              : recoverInterrupted(job, now, { serverIsIdempotent: SERVER_IS_IDEMPOTENT });
          await OutboxDb.saveJobState(next);
          recovered.push(next);
        }
        if (!cancelled) commit(recovered);
      } catch (error) {
        console.error("Loading the outbox failed:", error);
      } finally {
        loadedRef.current = true;
      }
      if (!cancelled) void flushRef.current();
    })();
    return () => {
      cancelled = true;
    };
  }, [commit]);

  // Triggers: reconnect and foreground.
  useEffect(() => {
    const unsubscribeOnline = onlineManager.subscribe((online) => {
      if (online) void flushRef.current();
    });
    const appState = AppState.addEventListener("change", (status) => {
      if (status === "active") void flushRef.current();
    });
    return () => {
      unsubscribeOnline();
      appState.remove();
      if (wakeTimerRef.current) clearTimeout(wakeTimerRef.current);
    };
  }, []);

  const enqueue = useCallback<OutboxContextValue["enqueue"]>(
    async ({ kind, payload, attachmentUri }) => {
      const id = randomUUID();
      // Copy the file BEFORE inserting the row: a row must never point at a file that isn't there.
      const attachment = attachmentUri ? OutboxDb.copyAttachment(id, attachmentUri) : null;
      const now = Date.now();
      const job: OutboxJob = {
        id,
        kind,
        payload,
        attachment,
        response: null,
        status: "pending",
        attempts: 0,
        lastErrorCode: null,
        nextAttemptAt: null,
        createdAt: now,
        updatedAt: now,
      };
      await OutboxDb.insertJob(job);
      commit([...jobsRef.current, job]);
      void flushRef.current();
      return job;
    },
    [commit],
  );

  const retry = useCallback(
    async (id: string) => {
      const job = jobsRef.current.find((item) => item.id === id);
      if (!job) return;
      await persist(manualRetry(job, Date.now()));
      void flushRef.current();
    },
    [persist],
  );

  const cancel = useCallback(
    async (id: string) => {
      const job = jobsRef.current.find((item) => item.id === id);
      if (!job || !canCancel(job)) return;
      await remove(job);
    },
    [remove],
  );

  const value = useMemo(() => ({ jobs, enqueue, retry, cancel }), [jobs, enqueue, retry, cancel]);
  return <OutboxContext.Provider value={value}>{children}</OutboxContext.Provider>;
}

export function useOutbox(): OutboxContextValue {
  const value = use(OutboxContext);
  if (!value) throw new Error("useOutbox must be used inside <OutboxProvider>");
  return value;
}
