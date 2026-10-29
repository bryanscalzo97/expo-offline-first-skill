/** Something that finished in the background, as shown in the "ready" toast. */
export interface ReadyItem {
  id: string;
  /** Context line, e.g. the album/folder/project it belongs to. */
  subtitle?: string;
  thumbnailUri?: string;
  /** Where tapping a single-item toast goes. */
  href: string;
}

export type ReadyNotice = { kind: "single"; item: ReadyItem } | { kind: "group"; count: number };

/** One item gets its own toast; several that finish together collapse into "N items ready". */
export function readyNotice(items: readonly ReadyItem[]): ReadyNotice | null {
  if (items.length === 0) return null;
  if (items.length === 1) return { kind: "single", item: items[0] };
  return { kind: "group", count: items.length };
}

/** Wait a beat to batch completions, and never show while the "Back online" pill is still up. */
export function readyNoticeDelay(now: number, indicatorBusyUntil: number, batchMs = 600): number {
  return Math.max(batchMs, indicatorBusyUntil - now);
}
