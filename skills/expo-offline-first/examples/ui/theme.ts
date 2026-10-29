/**
 * Minimal light/dark tokens for the offline UI examples. Placeholder values: map each token to
 * your design system (Colors, semantic tokens, useThemeColor...) instead of keeping these.
 */
import { useColorScheme } from "react-native";

export interface ThemeTokens {
  /** Translucent glass behind the offline pill. */
  surface: string;
  /** Stronger glass for banners that sit over content (ready toast). */
  surfaceElevated: string;
  /** Low-contrast fill for inline cards. */
  surfaceMuted: string;
  /** Image placeholder while a thumbnail loads. */
  placeholder: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  success: string;
  successSoft: string;
  accent: string;
  border: string;
  inverseSurface: string;
  inverseText: string;
  shadow: string;
  blurTint: "systemChromeMaterialLight" | "systemChromeMaterialDark";
}

export type ColorSchemeName = "light" | "dark";

const SUCCESS = "#10B981";
const SUCCESS_SOFT = "rgba(16,185,129,0.18)";
const SYSTEM_FILL = "rgba(120,120,128,0.12)";

export const tokens: Record<ColorSchemeName, ThemeTokens> = {
  light: {
    surface: "rgba(244,244,245,0.72)",
    surfaceElevated: "rgba(250,250,250,0.86)",
    surfaceMuted: SYSTEM_FILL,
    placeholder: "#E4E4E7",
    text: "#18181B",
    textSecondary: "#3F3F46",
    textMuted: "#71717A",
    success: SUCCESS,
    successSoft: SUCCESS_SOFT,
    accent: "#007AFF",
    border: "rgba(0,0,0,0.08)",
    inverseSurface: "#18181B",
    inverseText: "#FFFFFF",
    shadow: "rgba(0,0,0,0.12)",
    blurTint: "systemChromeMaterialLight",
  },
  dark: {
    surface: "rgba(39,39,42,0.72)",
    surfaceElevated: "rgba(24,24,27,0.82)",
    surfaceMuted: SYSTEM_FILL,
    placeholder: "#27272A",
    text: "#FFFFFF",
    textSecondary: "#E4E4E7",
    textMuted: "#A1A1AA",
    success: SUCCESS,
    successSoft: SUCCESS_SOFT,
    accent: "#0A84FF",
    border: "rgba(255,255,255,0.12)",
    inverseSurface: "#FFFFFF",
    inverseText: "#18181B",
    shadow: "rgba(0,0,0,0.25)",
    blurTint: "systemChromeMaterialDark",
  },
};

export function useColorSchemeName(): ColorSchemeName {
  return useColorScheme() === "dark" ? "dark" : "light";
}

export function useThemeTokens(): ThemeTokens {
  return tokens[useColorSchemeName()];
}
