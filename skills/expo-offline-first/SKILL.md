---
name: expo-offline-first
description: Use when making an Expo / React Native app work offline or on flaky networks. Covers choosing cache+outbox vs a sync DB (PowerSync, WatermelonDB), wiring expo-network into TanStack Query (onlineManager, focusManager), persisting the query cache in expo-sqlite, queueing mutations and file uploads offline in a durable SQLite outbox, retrying with an Idempotency-Key so users are never double-charged, keeping users signed in offline, guarding purchases/sign-in, and offline UI (indicator above the tab bar, pending cards, grouped "ready" toast).
version: 1.0.0
license: MIT
---

# Expo Offline First

Make an Expo app **usable offline** without losing user input or charging twice. This goes
beyond the `expo-data-fetching` skill (fetch, React Query basics, `onlineManager` intro): use
that for request plumbing, and this one when offline must be a first-class state.

## References

```
references/
  decide-architecture.md   Cache + outbox vs local-first sync DB (PowerSync, WatermelonDB...)
  network-layer.md         expo-network -> onlineManager, AppState -> focusManager, debounce
  query-persistence.md     expo-sqlite kv-store persister, what to persist, hydration gating
  outbox.md                Durable SQLite outbox: schema, state machine, files, triggers, recovery
  idempotency.md           Server side: honoring Idempotency-Key, charges, replays
  auth-and-guards.md       Offline session fallback, guarding purchases and sign-in
  offline-ux.md            Indicator, pending cards, grouped ready toast, a11y, i18n
  testing.md               Unit, simulator, kill-mid-queue and device checklist
examples/
  network.ts  useIsOnline.ts  query-client.ts  ensure-online.ts  auth-offline.ts
  outbox/     state.ts  state.test.ts  outbox-db.ts  OutboxProvider.tsx  send-job.ts
  ui/         OfflineIndicator.tsx  indicator.ts  ReadyToast.tsx  ready-toast.tsx
              ready-notice.ts  PendingCard.tsx  en.json
  server/     idempotency.ts
```

Examples are generic TypeScript for Expo SDK 54+ (new `expo-file-system` API). Copy them into
the app (e.g. `src/services`, `src/hooks`) and adapt imports, query keys and routes.

## When to use

- "Make the app work offline / on bad connections"
- Queueing creates, form submits or uploads made without connection
- Retries that could create duplicates or double-charge (payments, credits, AI generations)
- Users signed out or redirected on an offline cold start
- Offline banners, indicators, "back online", queued/pending states

## Hard rules

1. **Never lose user input.** Anything the user created offline is written to disk (SQLite +
   Documents) before you tell them it's saved. Not in memory, not in Caches/tmp.
2. **Never double-charge.** Every queued write carries a client UUID as `Idempotency-Key` on every
   attempt; the server deduplicates; the client saves the response before applying it.
3. **Never block reads offline.** Cached data renders; offline is shown as a quiet indicator,
   never a blocking modal or a full-screen error over content you already have.

## 1. Decide first

Default to **server-first + persisted cache + outbox**. Reach for a sync DB (PowerSync,
WatermelonDB, Electric, Triplit...) only for multi-device editing of the same records,
collaboration, or days of full offline CRUD. Details: `references/decide-architecture.md`.

Things that never work offline (design around them, never fake them): purchases, OAuth/sign-in,
server-side AI or payment calls.

## 2. Network layer

```ts
// app/_layout.tsx, module scope
setupNetworkManagers(); // expo-network -> onlineManager, AppState -> focusManager
```

- One source of truth: `onlineManager`. Logic uses `onlineManager.isOnline()`; UI uses
  `useIsOnline()` / `useIsOfflineDebounced(1500)`.
- `isInternetReachable === null` means **unknown = online**.
- Debounce UI only, never the "send or enqueue" decision.

See `references/network-layer.md`, `examples/network.ts`, `examples/useIsOnline.ts`.

## 3. Persisted query cache

- `PersistQueryClientProvider` + `createAsyncStoragePersister({ storage: expo-sqlite/kv-store })`.
- `networkMode: "offlineFirst"`, `gcTime >= maxAge`, `buster` = app version.
- **Allowlist** what to persist (profile, the user's own lists, usage snapshot). Never tokens,
  blobs/base64, search results, or prices/stock you'd show as final.
- Gate redirects and empty states on `useIsRestoring()`; keep the splash up until restored.

See `references/query-persistence.md`, `examples/query-client.ts`.

## 4. Durable outbox

A SQLite table (own `outbox.db`) + files in `Documents/outbox/`, processed by a provider.

- **State machine** (pure, unit-tested): `pending -> sending -> done | pending (backoff) | failed`.
  Transient (`network`, 503, 5xx) retry with exponential backoff + jitter, max 3. `429`, `401/403`
  and other 4xx go straight to `failed` with a specific message. Manual Retry resets attempts.
- **Persist each transition before its side effect** (`sending` before the request).
- **Files**: copy picker/camera URIs into Documents *before* inserting the row; store the
  relative path; delete with the row. Never base64 in SQLite.
- **Idempotency**: `id = randomUUID()` at enqueue, sent as `Idempotency-Key` on every attempt.
- **Response first**: `send -> saveResponse -> apply -> markDone -> delete`. A crash after the
  response re-applies it without calling the server.
- **Triggers**: mount, reconnect (`onlineManager.subscribe`), `AppState` active, backoff timer,
  enqueue/retry.
- **Single-flight**: one loop, oldest ready job first, nothing picked while one is `sending`;
  stop the loop on a `network` failure.
- **Recovery**: rows stuck in `sending` after a kill go back to `pending` if a response is saved
  or the server is idempotent, otherwise `failed: interrupted` for the user to decide.
- **Cleanup**: purge `done` rows and orphan files at startup.

See `references/outbox.md`, `examples/outbox/*`.

### Server side

```ts
return withIdempotency(request, { userId, store, fingerprint: body }, async () => {
  const result = await createAndCharge(userId, body); // runs at most once per (user, key)
  return Response.json(result, { status: 201 });
});
```

Reserve `(user_id, key)` with a unique constraint, replay the stored response for a completed
key, `409` while in progress, `422` if the key is reused with a different body, release on 5xx
before side effects. Pass the key through to the payment provider. See `references/idempotency.md`.

## 5. Auth and session

- Cache the minimal user in `expo-secure-store`; while the session is pending or failed with
  anything but `401`, use it. Only sign-out or `401` clears it. Re-fetch on reconnect.
- `ensureOnline()` before purchases, restore, sign-in/up, OAuth: a short alert with the reason,
  checked before the native sheet opens. Never queue purchases; never unlock paid features offline
  beyond the last known entitlement.

See `references/auth-and-guards.md`, `examples/auth-offline.ts`, `examples/ensure-online.ts`.

## 6. UX

- **Indicator** (Spotify / Apple Music style): blurred pill just above the tab bar on tab roots,
  after ~1.5 s offline; turns into "Back online" for ~1.8 s on reconnect; `pointerEvents="none"`.
- **Queued feedback**: short toast + continue the flow, landing on a **pending card**
  (waiting / sending / failed + Retry / Remove) where the result will appear.
- **Ready toast**: one global sonner-native `<Toaster />`, stable id; completions batch into
  "N items ready"; waits for the "Back online" pill; one haptic.
- **No blocking modals** for connectivity. Ever.
- **Accessibility**: `announceForAccessibility` on transitions, `accessibilityLiveRegion="polite"`,
  icon + text (not color alone), Dynamic Type safe layouts, 44 pt targets.
- **i18n**: every string, with plural keys (`_one` / `_other`). See `examples/ui/en.json`.

See `references/offline-ux.md`, `examples/ui/*`.

## 7. Testing

Unit-test the state machine and indicator/notice logic; then Network Link Conditioner on the
simulator, **kill the app mid-queue and mid-send**, airplane mode and captive Wi-Fi on a real
device, VoiceOver/TalkBack. Full checklist: `references/testing.md`.

## Common agent mistakes

- Adding WatermelonDB/PowerSync for an app that only needs to queue a few creates.
- A second NetInfo/expo-network listener per screen instead of `onlineManager`.
- Treating `isInternetReachable === null` as offline (app "offline" on launch).
- Persisting the whole query cache (tokens, blobs, giant lists) or forgetting `gcTime >= maxAge`.
- Redirecting to login/onboarding before the cache and session are restored.
- Relying on TanStack mutation retries / `resumePausedMutations` for writes that must survive an
  app kill.
- Keeping queued work in React state or Zustand/AsyncStorage blobs; keeping picked files in Caches.
- Storing absolute file paths (break after app updates on iOS) or base64 in SQLite.
- Generating a new UUID per attempt (defeats idempotency) or not sending the key at all.
- Auto-retrying 429/401/4xx, retrying without backoff, or processing jobs in parallel.
- Resending a job stuck in `sending` after a crash when the server is not idempotent.
- Showing a blocking "No internet" modal, a red banner on every screen, or one toast per item.
- Hard-coded English strings; string-concatenated plurals.
- Letting a purchase or sign-in fail with a generic SDK error instead of guarding it.
