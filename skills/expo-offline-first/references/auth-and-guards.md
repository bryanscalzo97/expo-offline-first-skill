# Auth, session and actions that need the network

Code: [`examples/auth-offline.ts`](../examples/auth-offline.ts), [`examples/ensure-online.ts`](../examples/ensure-online.ts)

## Don't sign users out on an offline cold start

Most auth clients fetch the session at launch. Offline, that request fails and `session` is
`null`, which routers interpret as "signed out" and redirect to login. Fix:

- On sign-in / successful session fetch, cache the **minimal user** (id, name, email) in
  `expo-secure-store`.
- While the session is pending, or it failed with anything but `401`, fall back to the cached
  user.
- Only a real sign-out or a `401` clears the cache.
- Re-fetch the session when `onlineManager` reports online: many SDKs do not retry it.
- Token refresh offline must not wipe tokens: treat network errors during refresh as
  "try later", not "invalid".

## Guard actions that cannot be queued

Purchases, restore purchases, sign-in/sign-up, password reset, OAuth, account deletion:

```ts
if (!ensureOnline(t("offline.title"), t("offline.purchaseMessage"), t("common.ok"))) return;
```

- Check **before** opening the native sheet (StoreKit/Play/OAuth) so the user gets a clear
  reason instead of a generic SDK failure.
- A short alert on tap is fine; do not disable the whole screen or show a blocking modal on load.
- Never queue a purchase in the outbox. Never "optimistically" unlock paid features offline;
  use the last known entitlement from the persisted cache (e.g. RevenueCat caches
  `CustomerInfo`), and refresh on reconnect.

## Gating usage/quotas offline

If actions are limited (credits, free tier), persist the last usage snapshot so you can show it
and block enqueueing when the user is clearly out. The server stays the authority: a queued job
can still fail with `rate_limited`, and the pending card must say so.
