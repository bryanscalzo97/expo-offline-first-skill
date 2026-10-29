# Decide first: cache + outbox, or a sync database?

Pick the lightest architecture that meets the product need. Most apps do not need a sync engine.

## Option A: Server-first + persisted cache + outbox (default)

The server stays the source of truth. The client:

- persists a **small allowlist** of query results so screens render offline (`query-persistence.md`)
- queues **writes that must not be lost** in a durable SQLite outbox and replays them with an
  `Idempotency-Key` (`outbox.md`, `idempotency.md`)
- guards actions that cannot be queued (purchases, sign-in) (`auth-and-guards.md`)

Choose it when:

- Writes are mostly **append-only or create-style** (post, upload, order, generate, submit form, like).
- One user edits their own data; conflicts are rare and "last write wins" or "server decides" is fine.
- Offline is a *degraded mode* (minutes to hours), not the main mode.
- You already use TanStack Query (see the `expo-data-fetching` skill for the basics).

Cost: ~5 small files, no new backend.

## Option B: Local-first database with sync

The local DB is the source of truth; a sync engine reconciles with the server.

| Tool | Model | Good for |
| --- | --- | --- |
| PowerSync | SQLite on device, Postgres/Mongo/MySQL backend, sync rules | Existing Postgres backend, partial replication per user |
| WatermelonDB | Lazy SQLite, you write push/pull endpoints | Large local datasets (10k+ rows), custom backend |
| ElectricSQL / Zero / Replicache | Postgres-backed sync, query-driven | Real-time collaborative apps |
| Triplit / Instant / Jazz / RxDB | Full-stack local-first DBs | Greenfield apps that want sync out of the box |

Choose it when:

- Users **edit the same records** from several devices or collaborate (needs merge/CRDT rules).
- The app must work **offline for days** with full read/write (field work, inspections, POS, notes).
- You need **complex local queries** over large data (search, joins, aggregates) offline.

Cost: schema duplicated on device, migrations on both sides, conflict policy, sync auth rules,
a new backend dependency. Do not add this "just in case".

## Quick decision

```
Need multi-device editing of the same records, or days offline with full CRUD?
  yes -> Option B (sync DB)
  no  -> Writes are creates/uploads/one-shot actions?
           yes -> Option A (cache + outbox)
           no  -> Option A + optimistic mutations with resumePausedMutations()
                  for low-stakes edits (toggle, rename) that may be lost on app kill
```

`resumePausedMutations()` (TanStack) survives reconnects but only survives an app kill if the
mutation is registered with `setMutationDefaults` and the cache is persisted. Anything that
costs money, uploads a file, or the user would be upset to lose belongs in the outbox.

## What never works offline (design around it)

- In-app purchases, restore purchases, subscriptions (StoreKit / Play Billing need network).
- OAuth / Sign in with Apple / Google / magic links / OTP.
- Server-side AI, payments, anything with a third-party API: queue it, never fake it.
