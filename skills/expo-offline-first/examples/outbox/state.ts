/**
 * Pure state rules for a durable outbox. No I/O, no React: unit-test it directly.
 *
 * pending ──send──▶ sending ──ok──▶ done ──▶ (row deleted)
 *    ▲                 │
 *    └──transient──────┤ (backoff, up to MAX_AUTO_ATTEMPTS)
 *                      └──permanent / exhausted──▶ failed ──manual retry──▶ pending
 */

export type OutboxStatus = "pending" | "sending" | "failed" | "done";

export type OutboxErrorCode =
  | "network" // fetch could not reach the server
  | "unavailable" // 503 / maintenance
  | "server" // 502 / 504 / 500 from a gateway
  | "rate_limited" // 429 or quota: never retried automatically
  | "auth" // 401 / 403: needs the user
  | "rejected" // any other 4xx / validation error
  | "interrupted" // app killed while sending, server may have processed it
  | "file_missing"; // the attached file is gone from disk

export interface OutboxJobState {
  status: OutboxStatus;
  /** Send attempts since the job was created or manually retried. */
  attempts: number;
  lastErrorCode: OutboxErrorCode | null;
  /** Epoch ms before which a pending job must not be sent (backoff). */
  nextAttemptAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export const MAX_AUTO_ATTEMPTS = 3;
export const BACKOFF_BASE_MS = 2_000;
export const BACKOFF_MAX_MS = 5 * 60_000;

const TRANSIENT: ReadonlySet<OutboxErrorCode> = new Set(["network", "unavailable", "server"]);

export function isTransient(code: OutboxErrorCode): boolean {
  return TRANSIENT.has(code);
}

/** Maps a thrown request error to an outbox error code. Expects HTTP errors to carry `status`. */
export function classifyError(error: unknown): OutboxErrorCode {
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? Number((error as { status: unknown }).status)
      : undefined;
  if (status !== undefined && Number.isFinite(status)) {
    if (status === 429) return "rate_limited";
    if (status === 401 || status === 403) return "auth";
    if (status === 503) return "unavailable";
    if (status === 500 || status === 502 || status === 504) return "server";
    return "rejected";
  }
  // fetch rejects with a TypeError when the server can't be reached.
  if (error instanceof TypeError) return "network";
  return "rejected";
}

/** Exponential backoff with jitter: ~2s, 4s, 8s… capped at 5 minutes. */
export function backoffDelay(attempts: number, random: () => number = Math.random): number {
  const exponent = Math.max(0, attempts - 1);
  const base = Math.min(BACKOFF_BASE_MS * 2 ** exponent, BACKOFF_MAX_MS);
  return Math.round(base * (0.8 + random() * 0.4)); // ±20%
}

export function startSending<T extends OutboxJobState>(job: T, now: number): T {
  return { ...job, status: "sending", attempts: job.attempts + 1, nextAttemptAt: null, updatedAt: now };
}

export function markDone<T extends OutboxJobState>(job: T, now: number): T {
  return { ...job, status: "done", lastErrorCode: null, nextAttemptAt: null, updatedAt: now };
}

export function markFailure<T extends OutboxJobState>(
  job: T,
  code: OutboxErrorCode,
  now: number,
  random?: () => number,
): T {
  if (isTransient(code) && job.attempts < MAX_AUTO_ATTEMPTS) {
    return {
      ...job,
      status: "pending",
      lastErrorCode: code,
      nextAttemptAt: now + backoffDelay(job.attempts, random),
      updatedAt: now,
    };
  }
  return { ...job, status: "failed", lastErrorCode: code, nextAttemptAt: null, updatedAt: now };
}

/** The user tapped Retry: start over with a fresh attempt budget. */
export function manualRetry<T extends OutboxJobState>(job: T, now: number): T {
  if (job.status !== "failed") return job;
  return { ...job, status: "pending", attempts: 0, lastErrorCode: null, nextAttemptAt: null, updatedAt: now };
}

/**
 * A job left in "sending" after an app kill may already have been processed by the server.
 * - Server honors Idempotency-Key: resending is safe, put it back to pending.
 * - Server does NOT: never resend on your own; fail it and let the user decide.
 */
export function recoverInterrupted<T extends OutboxJobState>(
  job: T,
  now: number,
  options: { serverIsIdempotent: boolean },
): T {
  if (job.status !== "sending") return job;
  if (options.serverIsIdempotent) {
    return { ...job, status: "pending", nextAttemptAt: null, updatedAt: now };
  }
  return { ...job, status: "failed", lastErrorCode: "interrupted", nextAttemptAt: null, updatedAt: now };
}

export function canCancel(job: OutboxJobState): boolean {
  return job.status === "pending" || job.status === "failed";
}

export function canRetry(job: OutboxJobState): boolean {
  return job.status === "failed";
}

export function isReady(job: OutboxJobState, now: number): boolean {
  return job.status === "pending" && (job.nextAttemptAt === null || job.nextAttemptAt <= now);
}

/** Oldest ready job first, one at a time (nothing is picked while another job is sending). */
export function pickNext<T extends OutboxJobState>(jobs: readonly T[], now: number): T | undefined {
  if (jobs.some((job) => job.status === "sending")) return undefined;
  return jobs.filter((job) => isReady(job, now)).sort((a, b) => a.createdAt - b.createdAt)[0];
}

/** When the processor should wake up for the next backed-off job, if any. */
export function nextWakeAt(jobs: readonly OutboxJobState[]): number | null {
  const times = jobs
    .filter((job) => job.status === "pending" && job.nextAttemptAt !== null)
    .map((job) => job.nextAttemptAt as number);
  return times.length > 0 ? Math.min(...times) : null;
}

/** What a pending card shows. */
export type OutboxDisplayState = "waiting" | "sending" | "failed";

export function displayState(job: OutboxJobState): OutboxDisplayState | null {
  if (job.status === "pending") return "waiting";
  if (job.status === "sending") return "sending";
  if (job.status === "failed") return "failed";
  return null;
}

/** i18n key for a failed job's message. Every user-facing string goes through i18n. */
export function errorMessageKey(code: OutboxErrorCode | null): string {
  return `outbox.errors.${code ?? "rejected"}`;
}
