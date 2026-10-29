/**
 * Inline card for an outbox job, rendered where the result will appear (top of the list,
 * inside the target screen). Shows waiting / sending / failed, with Retry and Remove.
 * This is the offline UX: no blocking modal, the user keeps working.
 */
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useOutbox } from "../outbox/OutboxProvider";
import type { OutboxJob } from "../outbox/outbox-db";
import { canCancel, canRetry, displayState, errorMessageKey } from "../outbox/state";
import { tokens, useColorSchemeName, type ThemeTokens } from "./theme";

/** Small text buttons need a bigger touch target than their glyphs. */
const ACTION_HIT_SLOP = 8;

export function PendingCard({ job }: { job: OutboxJob }) {
  const { t } = useTranslation();
  const { retry, cancel } = useOutbox();
  const styles = themedStyles[useColorSchemeName()];
  const state = displayState(job);
  if (!state) return null;

  const label =
    state === "waiting"
      ? t("outbox.waiting")
      : state === "sending"
        ? t("outbox.sending")
        : t(errorMessageKey(job.lastErrorCode));

  return (
    <View style={styles.card} accessible accessibilityLabel={label} accessibilityLiveRegion="polite">
      {state === "sending" ? <ActivityIndicator /> : null}
      <Text style={styles.label} numberOfLines={2}>
        {label}
      </Text>
      {canRetry(job) ? (
        <Pressable onPress={() => void retry(job.id)} accessibilityRole="button" hitSlop={ACTION_HIT_SLOP}>
          <Text style={styles.action}>{t("outbox.retry")}</Text>
        </Pressable>
      ) : null}
      {canCancel(job) ? (
        <Pressable onPress={() => void cancel(job.id)} accessibilityRole="button" hitSlop={ACTION_HIT_SLOP}>
          <Text style={styles.action}>{t("outbox.remove")}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function createStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    card: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 14, backgroundColor: theme.surfaceMuted },
    label: { flex: 1, fontSize: 14, color: theme.text },
    action: { fontSize: 14, fontWeight: "600", color: theme.accent },
  });
}

const themedStyles = { light: createStyles(tokens.light), dark: createStyles(tokens.dark) };
