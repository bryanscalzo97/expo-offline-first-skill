/**
 * Connectivity wiring for TanStack Query.
 *
 * - expo-network -> onlineManager: queries pause while offline and resume on reconnect,
 *   and anything subscribed to onlineManager (the outbox, the indicator) gets one source of truth.
 * - AppState -> focusManager: "window focus" on native means the app became active.
 *
 * Call `setupNetworkManagers()` once, at module scope of your root layout (before render).
 */
import { focusManager, onlineManager } from "@tanstack/react-query";
import * as Network from "expo-network";
import { AppState, Platform, type AppStateStatus } from "react-native";

type NetworkSnapshot = {
  isConnected?: boolean | null;
  isInternetReachable?: boolean | null;
};

/**
 * Offline only when the OS is sure. `isInternetReachable` is `null` while unknown
 * (e.g. right after launch); treat unknown as online so nothing is blocked by mistake.
 */
export function isOnlineState(state: NetworkSnapshot): boolean {
  if (state.isConnected === false) return false;
  if (state.isInternetReachable === false) return false;
  return true;
}

let isSetUp = false;

export function setupNetworkManagers(): void {
  // On web, TanStack Query already listens to the browser's online/offline events.
  if (isSetUp || Platform.OS === "web") return;
  isSetUp = true;

  onlineManager.setEventListener((setOnline) => {
    // Seed with the current state; the listener only fires on changes.
    void Network.getNetworkStateAsync()
      .then((state) => setOnline(isOnlineState(state)))
      .catch(() => {});
    const subscription = Network.addNetworkStateListener((state) => setOnline(isOnlineState(state)));
    return () => subscription.remove();
  });

  focusManager.setEventListener((handleFocus) => {
    const subscription = AppState.addEventListener("change", (status: AppStateStatus) => {
      handleFocus(status === "active");
    });
    return () => subscription.remove();
  });
}

/** Synchronous check for event handlers (e.g. "should I send now or enqueue?"). */
export function isOnline(): boolean {
  return onlineManager.isOnline();
}
