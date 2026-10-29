/**
 * Spotify / Apple Music style connectivity pill, docked just above the tab bar.
 * Appears after ~1.5 s offline, turns into "Back online" for a moment on reconnect, then leaves.
 * Never blocks touches (pointerEvents="none") and never blocks reads.
 *
 * Mount once in the root layout, as a sibling AFTER the navigator:
 *   <Stack />  <OfflineIndicator />
 */
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { useSegments } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AccessibilityInfo, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown, FadeOutDown, LinearTransition } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { OFFLINE_DEBOUNCE_MS, useIsOfflineDebounced } from "../useIsOnline";
import { BACK_ONLINE_MS, isTabRoot, nextIndicatorState, setIndicatorBusyUntil, type IndicatorState } from "./indicator";
import { tokens, useColorSchemeName, type ThemeTokens } from "./theme";

/**
 * Distance from the bottom safe-area inset to the top of the tab bar. ~48 for the iOS 26
 * floating native tab bar; measure yours (or use useBottomTabBarHeight() with JS tabs).
 */
const TAB_BAR_HEIGHT = 48;
const GAP_ABOVE_TAB_BAR = 8;
const INDICATOR_ENTER_MS = 240;
const INDICATOR_EXIT_MS = 200;
const INDICATOR_LAYOUT_MS = 200;
/** Keeps the ready toast waiting until the pill's exit animation has finished too. */
const BUSY_PADDING_MS = 250;
const BLUR_INTENSITY = 40;
const ICON_SIZE = 15;
/** Lets Dynamic Type grow the label without the pill outgrowing the tab bar area. */
const MAX_FONT_SCALE = 1.6;
const Z_INDEX_OVERLAY = 1000;

export function OfflineIndicator() {
  const offline = useIsOfflineDebounced(OFFLINE_DEBOUNCE_MS);
  const [state, setState] = useState<IndicatorState>("hidden");
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const scheme = useColorSchemeName();
  const { t } = useTranslation();

  useEffect(() => {
    setState((current) => nextIndicatorState(current, offline));
  }, [offline]);

  useEffect(() => {
    if (state === "hidden") return;
    // VoiceOver/TalkBack users can't see the pill; tell them.
    AccessibilityInfo.announceForAccessibility(t(state === "offline" ? "offline.indicator" : "offline.backOnline"));
    if (state !== "back-online") return;
    setIndicatorBusyUntil(Date.now() + BACK_ONLINE_MS + BUSY_PADDING_MS);
    const timer = setTimeout(() => setState("hidden"), BACK_ONLINE_MS);
    return () => clearTimeout(timer);
  }, [state, t]);

  if (state === "hidden" || !isTabRoot(segments)) return null;

  const theme = tokens[scheme];
  const styles = themedStyles[scheme];
  const backOnline = state === "back-online";
  const color = backOnline ? theme.success : theme.textSecondary;

  return (
    <View pointerEvents="none" style={[styles.container, { bottom: insets.bottom + TAB_BAR_HEIGHT + GAP_ABOVE_TAB_BAR }]}>
      <Animated.View
        entering={FadeInDown.duration(INDICATOR_ENTER_MS)}
        exiting={FadeOutDown.duration(INDICATOR_EXIT_MS)}
        layout={LinearTransition.duration(INDICATOR_LAYOUT_MS)}
        style={styles.pill}
        accessible
        accessibilityRole="text"
        accessibilityLiveRegion="polite"
      >
        <BlurView intensity={BLUR_INTENSITY} tint={theme.blurTint} style={StyleSheet.absoluteFill} />
        <Ionicons name={backOnline ? "checkmark-circle" : "cloud-offline-outline"} size={ICON_SIZE} color={color} />
        <Text style={[styles.text, { color }]} numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE}>
          {t(backOnline ? "offline.backOnline" : "offline.indicator")}
        </Text>
      </Animated.View>
    </View>
  );
}

function createStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    container: { position: "absolute", left: 0, right: 0, alignItems: "center", zIndex: Z_INDEX_OVERLAY },
    pill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      maxWidth: "88%",
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 999,
      borderCurve: "continuous",
      overflow: "hidden",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      backgroundColor: theme.surface,
    },
    text: { fontSize: 14, fontWeight: "500", flexShrink: 1 },
  });
}

const themedStyles = { light: createStyles(tokens.light), dark: createStyles(tokens.dark) };
