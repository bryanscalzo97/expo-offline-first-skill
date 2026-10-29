/**
 * Apple Music style "ready" banner for sonner-native's toast.custom(): artwork, title,
 * muted context line and an action pill. The whole banner is one button; sonner-native
 * handles swipe-to-dismiss around it.
 */
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";

export interface ReadyToastProps {
  title: string;
  subtitle?: string;
  thumbnailUri?: string;
  actionLabel: string;
  onPress: () => void;
}

const THUMB = 44;

export function ReadyToast({ title, subtitle, thumbnailUri, actionLabel, onPress }: ReadyToastProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      accessibilityHint={actionLabel}
      style={({ pressed }) => [styles.toast, pressed && { opacity: 0.85 }]}
    >
      <BlurView intensity={40} tint="systemChromeMaterialDark" style={StyleSheet.absoluteFill} />
      {thumbnailUri ? (
        <Image source={{ uri: thumbnailUri }} style={styles.thumb} contentFit="cover" transition={150} />
      ) : (
        <View style={styles.fallback}>
          <Ionicons name="checkmark" size={22} color="#10B981" />
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

const styles = StyleSheet.create({
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
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(24,24,27,0.82)",
    boxShadow: "0 6px 16px rgba(0,0,0,0.25)",
  },
  thumb: { width: THUMB, height: THUMB, borderRadius: 10, borderCurve: "continuous", backgroundColor: "#27272A" },
  fallback: {
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(16,185,129,0.18)",
  },
  texts: { flex: 1, gap: 1 },
  title: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },
  subtitle: { color: "#A1A1AA", fontSize: 12 },
  pill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, backgroundColor: "#FFFFFF" },
  pillText: { color: "#18181B", fontSize: 14, fontWeight: "600" },
});
