# Persisted query cache

Code: [`examples/query-client.ts`](../examples/query-client.ts)

## Setup

```sh
npx expo install expo-sqlite @tanstack/react-query-persist-client @tanstack/query-async-storage-persister
```

```tsx
<PersistQueryClientProvider
  client={queryClient}
  persistOptions={persistOptions}
  onSuccess={() => queryClient.resumePausedMutations()}
>
```

`expo-sqlite/kv-store` is a drop-in AsyncStorage-compatible store backed by SQLite: no size
limit issues like AsyncStorage on Android, synchronous API also available.

## Key settings

| Setting | Value | Why |
| --- | --- | --- |
| `networkMode` | `"offlineFirst"` | Run the queryFn once (it may hit an HTTP cache), then pause instead of failing |
| `gcTime` | `>= maxAge` | Otherwise queries are garbage-collected before they can be persisted/restored |
| `maxAge` | 1-7 days | Older caches are discarded on restore |
| `buster` | app version | A new build drops the cache instead of hydrating an old shape |
| `throttleTime` | ~1000 ms | Batches writes |
| `shouldDehydrateQuery` | allowlist | Persist only what you need offline |

## What to persist

Persist (allowlist by query-key root, `status === "success"` only):

- the current user's profile/settings needed to render the shell
- lists the user opens offline (their items, recent history, favorites)
- small reference data (categories, feature flags, plan/usage snapshot used to gate actions)

Do **not** persist:

- auth tokens or secrets (use `expo-secure-store`)
- large payloads, base64 images/blobs (store files on disk, persist the path)
- search results, infinite lists of other people's content, anything paginated by cursor
- data that is wrong when stale in a harmful way (prices at checkout, stock, balances shown as final)
- errors and pending states

Images: let `expo-image` handle its disk cache (`cachePolicy="disk"` / `"memory-disk"`).

## Hydration gating

Restoring is async. During restore, queries are `pending` and screens may flash empty states or,
worse, redirect (e.g. "no profile -> onboarding"). Gate decisions on `useIsRestoring()`:

```tsx
const isRestoring = useIsRestoring();
if (isRestoring) return null; // keep the splash screen up
```

Keep `SplashScreen.preventAutoHideAsync()` until restore + session are resolved.

## Reads offline

With `offlineFirst` + persistence, a query with cached data renders it and shows `fetchStatus:
"paused"`. Distinguish states in UI:

- `data` present: render it (optionally a subtle "last updated" line). Never replace with an error.
- no data and `fetchStatus === "paused"`: an offline empty state with what still works.
- `isError`: real error (server answered).
