# Server: honoring Idempotency-Key

Code: [`examples/server/idempotency.ts`](../examples/server/idempotency.ts)

The client guarantees it sends the same key for the same logical operation. The server must
guarantee that a key is **processed at most once** and that a replay returns the **original
response**. Without this half, "retry on reconnect" can double-charge.

## Algorithm

1. Read `Idempotency-Key` (validate it is a UUID). Scope it per user: `(user_id, key)`.
2. Fingerprint the request (hash of the body / relevant fields).
3. Atomically reserve: `INSERT ... (status='in_progress') ON CONFLICT DO NOTHING`.
   The **unique constraint** is the lock; do not do "SELECT then INSERT".
4. Reserved -> run the handler. On success (or deterministic 4xx) store status + body, mark
   `completed`. On a 5xx/exception **before any side effect**, delete the reservation so a
   retry can run.
5. Not reserved -> load the record:
   - different fingerprint -> `422` (key reused for another request: client bug)
   - `in_progress` -> `409` + `Retry-After` (client treats it as transient)
   - `completed` -> return the stored status/body, header `Idempotent-Replayed: true`
6. Expire keys after 24-72 h (longer than the client's max offline window + retries).

## Charges and side effects

- Do the irreversible part (charge, quota decrement, external API call) **inside the reserved
  section**, and store its result in the same transaction as `completed` when possible.
- Payment providers (Stripe, etc.) accept their own idempotency key: pass the same client UUID
  (or a derivation) through so the provider deduplicates too.
- If the handler can fail after charging, store the result as `completed` anyway (the client
  receives it on replay) rather than releasing the key.

## Client handling of responses

- `409 in_progress` -> transient (back off, retry with the **same** key).
- `422 idempotency_key_reused` -> permanent failure, log it.
- Replayed `2xx` -> treat exactly like a first success.
