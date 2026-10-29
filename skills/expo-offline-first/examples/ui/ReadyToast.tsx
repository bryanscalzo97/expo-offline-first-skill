/**
 * Apple Music style "ready" banner for sonner-native's toast.custom(): artwork, title,
 * muted context line and an action pill. The whole banner is one button; sonner-native
 * handles swipe-to-dismiss around it.
 */
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { tokens, useColorSchemeName, type ThemeTokens } from "./theme";

export interface ReadyToastProps {
  title: string;
  subtitle?: string;
  thumbnailUri?: string;
  actionLabel: string;
  onPress: () => void;
}

const THUMB = 44;
const FALLBACK_ICON_SIZE = 22;
const BLUR_INTENSITY = 40;
const IMAGE_FADE_MS = 150;
const PRESSED_OPACITY = 0.85;

export function ReadyToast({ title, subtitle, thumbnailUri, actionLabel, onPress }: ReadyToastProps) {
  const scheme = useColorSchemeName();
  const theme = tokens[scheme];
  const styles = themedStyles[scheme];

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      accessibilityHint={actionLabel}
      style={({ pressed }) => [styles.toast, pressed && styles.pressed]}
    >
      <BlurView intensity={BLUR_INTENSITY} tint={theme.blurTint} style={StyleSheet.absoluteFill} />
      {thumbnailUri ? (
        <Image source={{ uri: thumbnailUri }} style={styles.thumb} contentFit="cover" transition={IMAGE_FADE_MS} />
      ) : (
        <View style={styles.fallback}>
          <Ionicons name="checkmark" size={FALLBACK_ICON_SIZE} color={theme.success} />
        </View>
      )}
      <View style={styles.texts}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={styles.pill} importantForAccessibility="no-hide-descendants">
        <Text style={styles.pillText}>{actionLabel}</Text>
      </View>
    </Pressable>
  );
}

function createStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    toast: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      marginHorizontal: 16,
      paddingVertical: 10,
      paddingLeft: 10,
      paddingRight: 12,
      borderRadius: 22,
      borderCurve: "continuous",
      overflow: "hidden",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      backgroundColor: theme.surfaceElevated,
      boxShadow: `0 6px 16px ${theme.shadow}`,
    },
    pressed: { opacity: PRESSED_OPACITY },
    thumb: { width: THUMB, height: THUMB, borderRadius: 10, borderCurve: "continuous", backgroundColor: theme.placeholder },
    fallback: {
      width: THUMB,
      height: THUMB,
      borderRadius: THUMB / 2,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.successSoft,
    },
    texts: { flex: 1, gap: 1 },
    title: { color: theme.text, fontSize: 14, fontWeight: "600" },
    subtitle: { color: theme.textMuted, fontSize: 12 },
    pill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, backgroundColor: theme.inverseSurface },
    pillText: { color: theme.inverseText, fontSize: 14, fontWeight: "600" },
  });
}

const themedStyles = { light: createStyles(tokens.light), dark: createStyles(tokens.dark) };
