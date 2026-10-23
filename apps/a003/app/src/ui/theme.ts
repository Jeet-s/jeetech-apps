/**
 * Design tokens. Every screen uses these — never raw colours, sizes or system
 * fonts. The palette follows the device's light/dark appearance, resolved once
 * at launch (so StyleSheet.create captures the right scheme). The colour values
 * themselves live in src/core/palette.ts as pure data, so the WCAG contrast
 * audit (scripts/validate.ts) can check them without pulling in React Native.
 */
import { Appearance } from "react-native";
import {
  categorical as categoricalColors,
  darkColors,
  darkGradient,
  darkTones,
  lightColors,
  lightGradient,
  lightTones,
  type ToneKey,
} from "../core/palette";

function resolveDark(): boolean {
  try {
    return Appearance.getColorScheme() === "dark";
  } catch {
    return false;
  }
}

/** True when the device is in dark mode (decided at launch). */
export const isDark = resolveDark();

export const palette = isDark ? darkColors : lightColors;

export const gradient = isDark ? darkGradient : lightGradient;

export const categorical = categoricalColors;

export type Tone = ToneKey;
export const tones = isDark ? darkTones : lightTones;

export const fonts = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
};

export const radius = { sm: 8, md: 12, lg: 18, xl: 26, pill: 999 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

/** Minimum touch target (Android guideline: 48dp). */
export const TOUCH = 48;

/** Max content width: a phone column stays readable and centred on tablets. */
export const MAX_CONTENT = 640;

export const type = {
  display: { fontFamily: fonts.bold, fontSize: 32, lineHeight: 38, letterSpacing: -0.6, color: palette.ink },
  title: { fontFamily: fonts.bold, fontSize: 24, lineHeight: 30, letterSpacing: -0.3, color: palette.ink },
  heading: { fontFamily: fonts.semibold, fontSize: 18, lineHeight: 24, color: palette.ink },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 22, color: palette.ink },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22, color: palette.ink },
  label: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 18, color: palette.inkSoft },
  caption: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: palette.inkMuted },
  button: { fontFamily: fonts.semibold, fontSize: 16, letterSpacing: 0.1 },
  number: { fontFamily: fonts.bold, fontSize: 28, letterSpacing: -0.5, color: palette.ink, fontVariant: ["tabular-nums"] as ["tabular-nums"] },
  /** Hero figure (balance, total, streak) — one per screen. */
  hero: { fontFamily: fonts.bold, fontSize: 40, lineHeight: 46, letterSpacing: -1, color: palette.ink, fontVariant: ["tabular-nums"] as ["tabular-nums"] },
  /** Money / quantities inside rows: tabular so columns of figures line up. */
  amount: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22, color: palette.ink, fontVariant: ["tabular-nums"] as ["tabular-nums"] },
  overline: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16, letterSpacing: 0.8, textTransform: "uppercase" as const, color: palette.inkSoft },
};

/** Soft elevation for cards and floating buttons (iOS + Android). On dark, the
 * surface↔bg step carries the separation; the shadow just adds a little depth. */
export const shadow = {
  shadowColor: "#000000",
  shadowOpacity: isDark ? 0.35 : 0.08,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 3,
};

export const shadowStrong = {
  shadowColor: "#000000",
  shadowOpacity: isDark ? 0.5 : 0.18,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 8 },
  elevation: 8,
};

/** Motion presets — use these so every animation in the app feels consistent. */
export const springs = {
  press: { damping: 18, stiffness: 380, mass: 0.6 },
  pop: { damping: 12, stiffness: 240, mass: 0.7 },
  gentle: { damping: 20, stiffness: 160, mass: 1 },
};
export const durations = { fast: 140, base: 220, slow: 360 };
