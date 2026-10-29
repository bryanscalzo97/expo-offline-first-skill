/**
 * Announce work that finished in the background (e.g. an outbox job after reconnect).
 * Completions that land together, or while the toast is still visible, merge into ONE
 * "N items ready" toast (stable id, so it updates in place instead of stacking).
 * Requires a single global <Toaster /> from sonner-native in the root layout.
 */
import * as Haptics from "expo-haptics";
import { router, type Href } from "expo-router";
import i18n from "i18next";
import { toast } from "sonner-native";
import { indicatorBusyUntil } from "./indicator";
import { readyNotice, readyNoticeDelay, type ReadyItem } from "./ready-notice";
import { ReadyToast } from "./ReadyToast";

const TOAST_ID = "items-ready";
const DURATION_MS = 6000;
/** Where a grouped toast goes, e.g. the list that shows all finished items. */
const GROUP_HREF = "/(tabs)" as Href;

let pending: ReadyItem[] = [];
let shown: ReadyItem[] = [];
let pendingHaptic = false;
let timer: ReturnType<typeof setTimeout> | undefined;

export function announceReady(item: ReadyItem, options: { haptic?: boolean } = {}): void {
  pending.push(item);
  pendingHaptic ||= options.haptic ?? true;
  if (timer) clearTimeout(timer);
  timer = setTimeout(show, readyNoticeDelay(Date.now(), indicatorBusyUntil()));
}

function reset() {
  shown = [];
}

function show() {
  timer = undefined;
  const items = [...shown, ...pending];
  const notice = readyNotice(items);
  pending = [];
  if (!notice) return;
  shown = items;
  if (pendingHaptic) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  pendingHaptic = false;

  const open = () => {
    toast.dismiss(TOAST_ID);
    reset();
    router.push(notice.kind === "single" ? (notice.item.href as Href) : GROUP_HREF);
  };

  const single = notice.kind === "single" ? notice.item : undefined;
  toast.custom(
    <ReadyToast
      title={single ? i18n.t("outbox.readyTitle") : i18n.t("outbox.readyGroup", { count: items.length })}
      subtitle={single ? single.subtitle : i18n.t("outbox.readyGroupSubtitle")}
      thumbnailUri={single ? single.thumbnailUri : items.at(-1)?.thumbnailUri}
      actionLabel={i18n.t("outbox.view")}
      onPress={open}
    />,
    { id: TOAST_ID, duration: DURATION_MS, onDismiss: reset, onAutoClose: reset },
  );
}
