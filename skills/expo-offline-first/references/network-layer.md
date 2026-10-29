# Network layer

Code: [`examples/network.ts`](../examples/network.ts), [`examples/useIsOnline.ts`](../examples/useIsOnline.ts)

## One source of truth: TanStack `onlineManager`

Wire `expo-network` into `onlineManager` once, at module scope of the root layout:

```ts
// app/_layout.tsx
import { setupNetworkManagers } from "@/services/network";
setupNetworkManagers();
```

Everything else reads `onlineManager`:

- queries pause instead of erroring while offline and refetch on reconnect
- the outbox subscribes to it to flush on reconnect
- UI uses `useIsOnline()` / `useIsOfflineDebounced()`
- handlers use `onlineManager.isOnline()` to decide "send now or enqueue"

Do **not** create a second NetInfo/expo-network listener per component or per feature.

## Online semantics

```ts
isConnected === false || isInternetReachable === false -> offline
anything else (including null / unknown)               -> online
```

`isInternetReachable` is `null` right after launch and on some Android devices. Treating unknown
as offline blocks the app on a perfectly good connection. Real failures are still caught: a
request that fails with `TypeError` is classified as `network` by the outbox.

`expo-network` vs `@react-native-community/netinfo`: either works. `expo-network` is part of the
Expo SDK (no extra native config, has `addNetworkStateListener` since SDK 52). Use NetInfo if you
need its reachability URL config.

## Focus: AppState -> `focusManager`

On native, "window focus" means the app became `active`. Wiring `focusManager` lets
`refetchOnWindowFocus` and stale queries refresh when the user returns. The outbox also flushes
on `active`, because iOS may have suspended JS while a reconnect happened.

## Debounce for UI, not for logic

`useIsOfflineDebounced(1500)` reports offline only after 1.5 s; online is immediate. Use it for
the indicator so switching Wi-Fi or leaving an elevator does not flash UI. Never debounce the
"send or enqueue" decision: use `onlineManager.isOnline()` there.

## Web

TanStack Query already listens to `window` online/offline events; `setupNetworkManagers()` is a
no-op on web.
