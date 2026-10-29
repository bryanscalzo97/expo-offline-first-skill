/**
 * QueryClient + persisted cache in expo-sqlite's key-value store.
 *
 * Root layout:
 *   setupNetworkManagers();
 *   <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}
 *     onSuccess={() => queryClient.resumePausedMutations()}>
 *
 * Gate screens that must not flash empty state on `useIsRestoring()` (see references/query-persistence.md).
 */
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { QueryClient, type Query } from "@tanstack/react-query";
import type { PersistQueryClientOptions } from "@tanstack/react-query-persist-client";
import Constants from "expo-constants";
import Storage from "expo-sqlite/kv-store";

export const PERSIST_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

/** Query keys (first segment) that are worth showing offline. Allowlist, never "everything". */
const PERSISTED_ROOTS: ReadonlySet<string> = new Set(["profile", "items", "settings"]);

function shouldPersistQuery(query: Query): boolean {
  const root = query.queryKey[0];
  return typeof root === "string" && PERSISTED_ROOTS.has(root) && query.state.status === "success";
}

const persister = createAsyncStoragePersister({
  storage: Storage,
  key: "app-query-cache",
  throttleTime: 1000,
});

export const persistOptions: Omit<PersistQueryClientOptions, "queryClient"> = {
  persister,
  maxAge: PERSIST_MAX_AGE,
  // A new app version drops the cache instead of hydrating a possibly different shape.
  buster: Constants.expoConfig?.version ?? "0",
  dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      // Persisted queries must outlive maxAge or they are garbage-collected before restore.
      gcTime: PERSIST_MAX_AGE,
      // Serve cache offline; pause the fetch (don't error) until the connection is back.
      networkMode: "offlineFirst",
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      // Writes that must survive offline/app kill go through the outbox, not mutation retries.
      retry: 0,
    },
  },
});
