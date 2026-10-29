/**
 * Offline-safe session: on a cold start without connection the session request fails and
 * most auth SDKs report "no session", which signs the user out. Fall back to the last
 * session you cached on sign-in until the server actually answers; only a real sign-out
 * or a 401 clears it.
 */
import { onlineManager } from "@tanstack/react-query";
import * as SecureStore from "expo-secure-store";
import { useEffect, useMemo } from "react";

const SESSION_CACHE_KEY = "session-user";

export interface CachedUser {
  id: string;
  name?: string;
  email?: string;
}

/** Call after a successful sign-in / session fetch. Store the minimum, never tokens you don't need. */
export function cacheUser(user: CachedUser | null): void {
  if (user) SecureStore.setItem(SESSION_CACHE_KEY, JSON.stringify({ id: user.id, name: user.name, email: user.email }));
  else void SecureStore.deleteItemAsync(SESSION_CACHE_KEY);
}

function readCachedUser(): CachedUser | null {
  try {
    const raw = SecureStore.getItem(SESSION_CACHE_KEY);
    const parsed = raw ? (JSON.parse(raw) as CachedUser) : null;
    return parsed?.id ? parsed : null;
  } catch {
    return null;
  }
}

/** Adapt the `session` shape to your auth client (Better Auth, Supabase, Clerk, custom). */
export function useOfflineAwareUser(session: {
  user: CachedUser | null;
  isPending: boolean;
  error: { status?: number } | null;
  refetch: () => Promise<unknown>;
}): CachedUser | null {
  const cached = useMemo(readCachedUser, [session.user]);
  const unauthorized = session.error?.status === 401;
  const fallBackToCache = !session.user && (session.isPending || (!!session.error && !unauthorized));

  // The failed session request is usually not retried by the SDK: retry it on reconnect.
  const hasError = !!session.error;
  const { refetch } = session;
  useEffect(() => {
    if (!hasError) return;
    return onlineManager.subscribe((online) => {
      if (online) void refetch();
    });
  }, [hasError, refetch]);

  return session.user ?? (fallBackToCache ? cached : null);
}
