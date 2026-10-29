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
import { AccessibilityInfo, StyleSheet, Text, useColorScheme, View } from "react-native";
import Animated, { FadeInDown, FadeOutDown, LinearTransition } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useIsOfflineDebounced } from "../useIsOnline";
import { BACK_ONLINE_MS, isTabRoot, nextIndicatorState, setIndicatorBusyUntil, type IndicatorState } from "./indicator";

/**
 * Distance from the bottom safe-area inset to the top of the tab bar. ~48 for the iOS 26
 * floating native tab bar; measure yours (or use useBottomTabBarHeight() with JS tabs).
 */
const TAB_BAR_HEIGHT = 48;
const GAP_ABOVE_TAB_BAR = 8;
const SUCCESS = "#10B981";

export function OfflineIndicator() {
  const offline = useIsOfflineDebounced(1500);
  const [state, setState] = useState<IndicatorState>("hidden");
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === "dark";
  const { t } = useTranslation();

  useEffect(() => {
    setState((current) => nextIndicatorState(current, offline));
  }, [offline]);

  useEffect(() => {
    if (state === "hidden") return;
    // VoiceOver/TalkBack users can't see the pill; tell them.
    AccessibilityInfo.announceForAccessibility(t(state === "offline" ? "offline.indicator" : "offline.backOnline"));
    if (state !== "back-online") return;
    setIndicatorBusyUntil(Date.now() + BACK_ONLINE_MS + 250);
    const timer = setTimeout(() => setState("hidden"), BACK_ONLINE_MS);
    return () => clearTimeout(timer);
  }, [state, t]);

  if (state === "hidden" || !isTabRoot(segments)) return null;

  const backOnline = state === "back-online";
  const color = backOnline ? SUCCESS : isDark ? "#E4E4E7" : "#3F3F46";

  return (
    <View pointerEvents="none" style={[styles.container, { bottom: insets.bottom + TAB_BAR_HEIGHT + GAP_ABOVE_TAB_BAR }]}>
      <Animated.View
        entering={FadeInDown.duration(240)}
        exiting={FadeOutDown.duration(200)}
        layout={LinearTransition.duration(200)}
        style={[styles.pill, isDark ? styles.pillDark : styles.pillLight]}
        accessible
        accessibilityRole="text"
        accessibilityLiveRegion="polite"
      >
        <BlurView
          intensity={40}
          tint={isDark ? "systemChromeMaterialDark" : "systemChromeMaterialLight"}
          style={StyleSheet.absoluteFill}
        />
        <Ionicons name={backOnline ? "checkmark-circle" : "cloud-offline-outline"} size={15} color={color} />
        <Text style={[styles.text, { color }]} numberOfLines={1} maxFontSizeMultiplier={1.6}>
          {t(backOnline ? "offline.backOnline" : "offline.indicator")}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: "absolute", left: 0, right: 0, alignItems: "center", zIndex: 1000 },
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
  },
  pillLight: { borderColor: "rgba(0,0,0,0.08)", backgroundColor: "rgba(244,244,245,0.72)" },
  pillDark: { borderColor: "rgba(255,255,255,0.12)", backgroundColor: "rgba(39,39,42,0.72)" },
  text: { fontSize: 14, fontWeight: "500", flexShrink: 1 },
});
