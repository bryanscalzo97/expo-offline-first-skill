/**
 * Durable outbox storage: its own SQLite file (outbox.db), attachments as files under
 * Documents/outbox/, never base64 blobs in the database and never in the cache directory
 * (the OS may purge Caches/tmp at any time).
 */
import { Directory, File, Paths } from "expo-file-system";
import * as SQLite from "expo-sqlite";
import type { OutboxErrorCode, OutboxJobState, OutboxStatus } from "./state";

export interface OutboxJob<P = unknown> extends OutboxJobState {
  /** Client-generated UUID. Also the Idempotency-Key sent to the server. */
  id: string;
  /** What to do with it, e.g. "create-post", "upload-photo". Routes to a sender. */
  kind: string;
  /** JSON-serializable request body (without the file bytes). */
  payload: P;
  /** Path relative to Documents (e.g. "outbox/<id>.jpg"), or null if there is no file. */
  attachment: string | null;
  /**
   * Server response saved as soon as it arrives, before applying it locally. If the app
   * dies or the local save fails, the next run reuses it instead of calling the server again.
   */
  response: unknown | null;
}

type Row = {
  id: string;
  kind: string;
  status: OutboxStatus;
  payload: string;
  attachment: string | null;
  response: string | null;
  attempts: number;
  last_error_code: string | null;
  next_attempt_at: number | null;
  created_at: number;
  updated_at: number;
};

const SCHEMA_VERSION = 1;
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function getDb(): Promise<SQLite.SQLiteDatabase> {
  dbPromise ??= SQLite.openDatabaseAsync("outbox.db").then(async (db) => {
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS outbox (
        id TEXT PRIMARY KEY NOT NULL,
        kind TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending','sending','failed','done')),
        payload TEXT NOT NULL,
        attachment TEXT,
        response TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error_code TEXT,
        next_attempt_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS outbox_status_created ON outbox (status, created_at);
    `);
    // Migrations: bump SCHEMA_VERSION and add `if (version < N) ALTER TABLE ...` steps.
    const row = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
    if ((row?.user_version ?? 0) < SCHEMA_VERSION) {
      await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    }
    return db;
  });
  return dbPromise;
}

function fromRow(row: Row): OutboxJob {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    payload: JSON.parse(row.payload),
    attachment: row.attachment,
    response: row.response ? JSON.parse(row.response) : null,
    attempts: row.attempts,
    lastErrorCode: (row.last_error_code as OutboxErrorCode | null) ?? null,
    nextAttemptAt: row.next_attempt_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Jobs still visible to the user (everything but done), oldest first. */
export async function listJobs(): Promise<OutboxJob[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Row>("SELECT * FROM outbox WHERE status != 'done' ORDER BY created_at ASC");
  return rows.map(fromRow);
}

export async function insertJob(job: OutboxJob): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO outbox
      (id, kind, status, payload, attachment, response, attempts, last_error_code, next_attempt_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      job.id,
      job.kind,
      job.status,
      JSON.stringify(job.payload),
      job.attachment,
      job.response === null ? null : JSON.stringify(job.response),
      job.attempts,
      job.lastErrorCode,
      job.nextAttemptAt,
      job.createdAt,
      job.updatedAt,
    ],
  );
}

/** Persists the state-machine fields (status, attempts, error, backoff). */
export async function saveJobState(job: OutboxJobState & { id: string }): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "UPDATE outbox SET status = ?, attempts = ?, last_error_code = ?, next_attempt_at = ?, updated_at = ? WHERE id = ?",
    [job.status, job.attempts, job.lastErrorCode, job.nextAttemptAt, job.updatedAt, job.id],
  );
}

/** Store the server's answer before doing anything else with it. */
export async function saveResponse(id: string, response: unknown): Promise<void> {
  const db = await getDb();
  await db.runAsync("UPDATE outbox SET response = ? WHERE id = ?", [JSON.stringify(response), id]);
}

export async function deleteJob(job: Pick<OutboxJob, "id" | "attachment">): Promise<void> {
  const db = await getDb();
  await db.runAsync("DELETE FROM outbox WHERE id = ?", [job.id]);
  if (job.attachment) deleteFile(job.attachment);
}

/** Cleanup at startup: rows marked done (app killed right after finishing) and orphan files. */
export async function purge(): Promise<void> {
  const db = await getDb();
  const done = await db.getAllAsync<Pick<Row, "id" | "attachment">>(
    "SELECT id, attachment FROM outbox WHERE status = 'done'",
  );
  for (const row of done) await deleteJob(row);

  const dir = new Directory(Paths.document, OUTBOX_DIR);
  if (!dir.exists) return;
  const live = new Set(
    (await db.getAllAsync<{ attachment: string }>("SELECT attachment FROM outbox WHERE attachment IS NOT NULL")).map(
      (row) => row.attachment,
    ),
  );
  for (const entry of dir.list()) {
    if (entry instanceof File && !live.has(`${OUTBOX_DIR}/${entry.name}`)) {
      try {
        entry.delete();
      } catch {
        // Best effort.
      }
    }
  }
}

// ── Attachments ──────────────────────────────────────────────────────────────

const OUTBOX_DIR = "outbox";

/**
 * Copies a picked file (camera, image picker, document picker: usually in Caches) into
 * Documents/outbox/<id>.<ext>. Returns the path relative to Documents: absolute paths
 * change between installs/updates on iOS, so never store them.
 */
export function copyAttachment(id: string, sourceUri: string): string {
  const dir = new Directory(Paths.document, OUTBOX_DIR);
  if (!dir.exists) dir.create({ intermediates: true });
  const source = new File(sourceUri);
  const extension = source.extension || ".bin"; // includes the dot, e.g. ".jpg"
  const relative = `${OUTBOX_DIR}/${id}${extension}`;
  const destination = new File(Paths.document, relative);
  if (destination.exists) destination.delete();
  source.copy(destination);
  return relative;
}

/** A File for upload (FormData / fetch body), or null if it is gone. */
export function attachmentFile(relative: string): File | null {
  const file = new File(Paths.document, relative);
  return file.exists ? file : null;
}

export function attachmentUri(relative: string): string {
  return new File(Paths.document, relative).uri;
}

function deleteFile(relative: string): void {
  try {
    const file = new File(Paths.document, relative);
    if (file.exists) file.delete();
  } catch {
    // Best effort: a leftover file is removed by the next purge().
  }
}
