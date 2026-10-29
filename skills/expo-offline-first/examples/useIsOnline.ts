import { onlineManager } from "@tanstack/react-query";
import { useEffect, useState, useSyncExternalStore } from "react";

const subscribe = (callback: () => void) => onlineManager.subscribe(callback);
const getSnapshot = () => onlineManager.isOnline();

/** Live connectivity, as reported by expo-network through onlineManager (see network.ts). */
export function useIsOnline(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * True only after being offline for `delayMs`, so a short blip (switching Wi-Fi, an
 * elevator) does not flash UI. Coming back online is reported immediately.
 * Use this for UI; use `onlineManager.isOnline()` for decisions like "send or enqueue".
 */
export function useIsOfflineDebounced(delayMs = 1500): boolean {
  const online = useIsOnline();
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    if (online) {
      setOffline(false);
      return;
    }
    const timer = setTimeout(() => setOffline(true), delayMs);
    return () => clearTimeout(timer);
  }, [online, delayMs]);
  return offline;
}
