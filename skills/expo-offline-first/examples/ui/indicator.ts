/** What the offline indicator shows. Pure, so the transitions can be unit-tested. */
export type IndicatorState = "hidden" | "offline" | "back-online";

/** How long "Back online" stays up before the indicator leaves. */
export const BACK_ONLINE_MS = 1800;

/**
 * Next state when the (already debounced) offline flag changes. "Back online" is shown only
 * after the user actually saw "Offline", so a reconnect nobody noticed stays silent.
 */
export function nextIndicatorState(current: IndicatorState, offline: boolean): IndicatorState {
  if (offline) return "offline";
  return current === "offline" ? "back-online" : current;
}

/**
 * Show the pill only on tab roots, where it docks above the tab bar. Pushed screens have their
 * own bottom CTAs and handle offline inline (pending cards, guards). Adapt to your route groups.
 */
export function isTabRoot(segments: readonly string[]): boolean {
  return segments[0] === "(tabs)" && segments.length <= 2;
}

let busyUntil = 0;

/** Set while "Back online" is visible so other notices (the ready toast) wait their turn. */
export function setIndicatorBusyUntil(timestamp: number): void {
  busyUntil = timestamp;
}

export function indicatorBusyUntil(): number {
  return busyUntil;
}
