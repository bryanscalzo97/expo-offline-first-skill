import { onlineManager } from "@tanstack/react-query";
import { Alert } from "react-native";

/**
 * Guard for actions that cannot be queued: purchases, restore purchases, sign-in, sign-up,
 * password reset. Explain up front instead of letting the SDK fail with a generic error.
 *
 *   if (!ensureOnline(t("offline.title"), t("offline.purchaseMessage"), t("common.ok"))) return;
 */
export function ensureOnline(title: string, message: string, okLabel: string): boolean {
  if (onlineManager.isOnline()) return true;
  Alert.alert(title, message, [{ text: okLabel }]);
  return false;
}
