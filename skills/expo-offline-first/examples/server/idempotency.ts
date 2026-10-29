/**
 * Server side: honor `Idempotency-Key` so an outbox retry never creates or charges twice.
 * Framework-agnostic (Web Request/Response): works in Expo Router API routes (`+api.ts`),
 * Next.js route handlers, Hono, Bun, Cloudflare Workers. Swap `store` for your DB.
 *
 * Table (Postgres flavour):
 *   CREATE TABLE idempotency_keys (
 *     user_id     TEXT NOT NULL,
 *     key         TEXT NOT NULL,
 *     request_hash TEXT NOT NULL,
 *     status      TEXT NOT NULL,          -- 'in_progress' | 'completed'
 *     response_status INT,
 *     response_body   TEXT,
 *     created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
 *     PRIMARY KEY (user_id, key)          -- the unique constraint does the real work
 *   );
 *   -- Expire rows after 24-72 h with a cron job.
 */

export interface IdempotencyRecord {
  requestHash: string;
  status: "in_progress" | "completed";
  responseStatus?: number;
  responseBody?: string;
}

export interface IdempotencyStore {
  /** Atomic insert (INSERT ... ON CONFLICT DO NOTHING). Returns false if the key already exists. */
  reserve(userId: string, key: string, requestHash: string): Promise<boolean>;
  get(userId: string, key: string): Promise<IdempotencyRecord | null>;
  complete(userId: string, key: string, status: number, body: string): Promise<void>;
  /** Drop the reservation when the work failed BEFORE any side effect, so the client can retry. */
  release(userId: string, key: string): Promise<void>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Wraps a handler. `fingerprint` is what makes two requests "the same" (e.g. the JSON payload
 * plus the file's size/hash); reusing a key for a different request is a client bug -> 422.
 */
export async function withIdempotency(
  request: Request,
  options: { userId: string; store: IdempotencyStore; fingerprint: string },
  handler: () => Promise<Response>,
): Promise<Response> {
  const key = request.headers.get("Idempotency-Key");
  if (!key) return handler(); // or 400 if every call to this endpoint must be idempotent
  if (!UUID.test(key)) return Response.json({ error: "invalid_idempotency_key" }, { status: 400 });

  const { userId, store } = options;
  const requestHash = await sha256(options.fingerprint);

  if (!(await store.reserve(userId, key, requestHash))) {
    const existing = await store.get(userId, key);
    if (!existing) return Response.json({ error: "conflict" }, { status: 409 });
    if (existing.requestHash !== requestHash) {
      return Response.json({ error: "idempotency_key_reused" }, { status: 422 });
    }
    if (existing.status === "in_progress") {
      // Same request still running (the client timed out and retried). Client backs off.
      return Response.json({ error: "in_progress" }, { status: 409, headers: { "Retry-After": "5" } });
    }
    // Replay: the exact stored response, no new side effects, no new charge.
    return new Response(existing.responseBody ?? null, {
      status: existing.responseStatus ?? 200,
      headers: { "Content-Type": "application/json", "Idempotent-Replayed": "true" },
    });
  }

  let response: Response;
  try {
    response = await handler();
  } catch (error) {
    await store.release(userId, key);
    throw error;
  }

  // Cache successes and deterministic client errors; release on 5xx so a retry can run again.
  // Only safe if the handler charges/creates nothing before it fails with 5xx (do the charge last,
  // or inside the same DB transaction as the result).
  if (response.status >= 500) {
    await store.release(userId, key);
    return response;
  }
  const body = await response.clone().text();
  await store.complete(userId, key, response.status, body);
  return response;
}

/* Usage in an Expo Router API route (app/api/jobs/[kind]+api.ts):

export async function POST(request: Request) {
  const user = await requireUser(request);
  const form = await request.formData();
  const payload = String(form.get("payload") ?? "");
  const file = form.get("file") as File | null;
  return withIdempotency(
    request,
    { userId: user.id, store: idempotencyStore, fingerprint: `${payload}:${file?.size ?? 0}` },
    async () => {
      const result = await createThing(user.id, JSON.parse(payload), file); // side effect + charge
      return Response.json(result, { status: 201 });
    },
  );
}
*/
