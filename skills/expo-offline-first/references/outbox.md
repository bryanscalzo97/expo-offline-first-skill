# Durable outbox (expo-sqlite)

Code: [`examples/outbox/`](../examples/outbox/): `state.ts` (pure rules), `state.test.ts`,
`outbox-db.ts` (SQLite + files), `OutboxProvider.tsx` (processor), `send-job.ts` (fetch with key).

## When something goes into the outbox

```ts
async function submit(payload, photoUri) {
  if (!onlineManager.isOnline()) {
    await outbox.enqueue({ kind: "create-post", payload, attachmentUri: photoUri });
    toast(t("outbox.queuedToast")); // non-blocking confirmation
    return;
  }
  // online: send directly (still with an Idempotency-Key), OR always go through the outbox.
}
```

Routing **every** write of that kind through the outbox (online or not) is simpler and gives
one code path. Sending directly when online is fine if both paths use the same request function.

## Schema

```sql
CREATE TABLE outbox (
  id TEXT PRIMARY KEY NOT NULL,        -- client UUID = Idempotency-Key
  kind TEXT NOT NULL,                  -- routes to a sender
  status TEXT NOT NULL,                -- pending | sending | failed | done
  payload TEXT NOT NULL,               -- JSON, no file bytes
  attachment TEXT,                     -- path RELATIVE to Documents
  response TEXT,                       -- server answer, saved before applying
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error_code TEXT,
  next_attempt_at INTEGER,             -- backoff, epoch ms
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX outbox_status_created ON outbox (status, created_at);
```

Separate DB file (`outbox.db`), WAL mode, `PRAGMA user_version` for migrations.

## State machine

```
pending ──send──▶ sending ──ok──▶ done ──▶ row deleted
   ▲                 │
   └──transient──────┤  network / 503 / 5xx: backoff 2s, 4s, 8s (±20% jitter), max 3 attempts
                     └──permanent or exhausted──▶ failed ──Retry──▶ pending (attempts reset)
```

| Error | Code | Auto-retry |
| --- | --- | --- |
| `fetch` TypeError | `network` | yes, and stop the loop until reconnect |
| 503 | `unavailable` | yes |
| 500 / 502 / 504 | `server` | yes |
| 429 / quota | `rate_limited` | **no**: retrying burns quota or gets you banned |
| 401 / 403 | `auth` | no: needs the user |
| other 4xx | `rejected` | no: the payload is wrong |
| file gone | `file_missing` | no |
| killed mid-send | `interrupted` | only if the server is idempotent |

Every transition is persisted to SQLite **before** the side effect it guards (mark `sending`
before the request; save `response` before applying it).

## Files: copy to Documents

Image pickers and cameras return URIs in **Caches/tmp** which the OS can purge. On enqueue, copy
into `Paths.document/outbox/<id>.<ext>` **before** inserting the row, and store the **relative**
path (the absolute container path changes across app updates on iOS). Never store base64 in
SQLite. Delete the file together with the row.

## Client UUID as the Idempotency-Key

Generate the id on the device at enqueue time (`expo-crypto` `randomUUID()`) and send it as
`Idempotency-Key` on **every** attempt. Retries, reconnect flushes and post-crash resends then
map to the same server operation. A new key is only created when the user explicitly creates a
new item. See `idempotency.md` for the server half.

## Save the response before applying it

`send` -> `saveResponse(id, response)` -> `apply(job, response)` -> `markDone` -> delete. If the
app dies or `apply` throws after the server answered, the next run finds `response` and applies
it **without calling the server again**. This is what makes "paid" results safe even without
server idempotency.

## Triggers

Flush when:

1. the provider mounts (after load + recovery)
2. `onlineManager` reports online
3. `AppState` becomes `active`
4. the backoff timer for the earliest `nextAttemptAt` fires
5. a job is enqueued or manually retried

## Single-flight

One flush loop at a time (`processingRef`). A trigger during a flush sets `flushAgainRef` and the
loop runs once more. `pickNext` returns nothing while any job is `sending`, and picks the oldest
ready job: ordered, no parallel duplicate sends. If a job fails with `network`, stop the loop
(don't burn other jobs' attempts) and wait for the reconnect trigger.

## Recovery after an app kill

On load: `purge()` (done rows, orphan files), then for every row still `sending`:

- `response` present -> back to `pending` (applying it is free)
- server honors Idempotency-Key -> back to `pending` (resend replays the stored result)
- otherwise -> `failed` / `interrupted`, user decides ("Retrying may send it again")

## Cleanup

- delete row + file on done and on Remove
- `purge()` at startup: `done` rows left behind and files with no row
- consider expiring `failed` jobs older than N days with a visible notice, never silently

## Background execution

The outbox runs while the app is in the foreground. If you need uploads to continue in the
background, use `expo-background-task` to call the same flush (iOS gives you no guarantees on
timing) or a native background `URLSession` upload. The SQLite outbox stays the source of truth.

## Showing jobs

`useOutbox().jobs` (everything not done) renders as **pending cards** where the result will
appear. See `offline-ux.md` and [`examples/ui/PendingCard.tsx`](../examples/ui/PendingCard.tsx).
