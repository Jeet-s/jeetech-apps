/**
 * BlockDay colour palettes — pure data (no React, no RN) so the WCAG contrast
 * audit in scripts/validate.ts can check every pair. src/ui/theme.ts picks the
 * light or dark set at launch (following the device appearance) and builds the
 * live design tokens from it. Keep brand hues identical between schemes; only
 * surfaces, ink and the soft tints flip.
 */
export interface Colors {
  primary: string;
  primaryDark: string;
  primarySoft: string;
  accent: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  bg: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  ink: string;
  inkSoft: string;
  inkMuted: string;
  onPrimary: string;
  scrim: string;
}

/** Light — the original BlockDay cobalt look (unchanged, bar a slightly darker muted ink for AA). */
export const lightColors: Colors = {
  primary: "#0F62FE",
  primaryDark: "#0B47B3",
  primarySoft: "#E6EFFF",
  accent: "#7C5CFF",
  success: "#0E9C92",
  successSoft: "#D7F6F3",
  warning: "#FFB020",
  warningSoft: "#FFF1D6",
  danger: "#E5352B",
  dangerSoft: "#FFE4E2",
  bg: "#F7F8FA",
  surface: "#FFFFFF",
  surfaceAlt: "#EEF1F6",
  border: "#E2E7F0",
  ink: "#0F1A2B",
  inkSoft: "#5B677A",
  inkMuted: "#636D7B",
  onPrimary: "#FFFFFF",
  scrim: "rgba(15,26,43,0.45)",
};

/**
 * Dark — a deep slate with a brighter cobalt. `onPrimary` is near-black so a
 * light-cobalt button still clears AA for its label, while the same cobalt reads
 * clearly as an accent/icon on the dark surfaces. Soft tints become translucent
 * brand washes instead of pale pastels.
 */
export const darkColors: Colors = {
  primary: "#4C8DFF",
  primaryDark: "#2E6BE0",
  primarySoft: "rgba(76,141,255,0.20)",
  accent: "#9B86FF",
  success: "#2FD3C4",
  successSoft: "rgba(47,211,196,0.18)",
  warning: "#FFC24D",
  warningSoft: "rgba(255,194,77,0.18)",
  danger: "#FF6B61",
  dangerSoft: "rgba(255,107,97,0.20)",
  bg: "#0B1017",
  surface: "#161D27",
  surfaceAlt: "#1F2733",
  border: "#2C3643",
  ink: "#F2F5FA",
  inkSoft: "#AEBAC8",
  inkMuted: "#8793A3",
  onPrimary: "#07101F",
  scrim: "rgba(0,0,0,0.60)",
};

/**
 * Categorical colours for charts/categories (distinct from status colours).
 * First five mirror model.ts BLOCK_COLORS so a block reads the same everywhere.
 * Shared across schemes — vivid enough on both the light and dark surfaces.
 */
export const categorical = ["#0F62FE", "#0FB5A9", "#FF6B6B", "#FFB020", "#7C5CFF", "#2ECC71", "#0EA5E9", "#F97316"];

export type ToneKey = "primary" | "success" | "warning" | "danger" | "neutral";

/** Semantic tone → [fg, bg] per scheme (pills, banners, amounts). */
export const lightTones: Record<ToneKey, { fg: string; bg: string }> = {
  primary: { fg: lightColors.primary, bg: lightColors.primarySoft },
  success: { fg: "#0A7D75", bg: lightColors.successSoft },
  warning: { fg: "#9A5B00", bg: lightColors.warningSoft },
  danger: { fg: lightColors.danger, bg: lightColors.dangerSoft },
  neutral: { fg: lightColors.inkSoft, bg: lightColors.surfaceAlt },
};
export const darkTones: Record<ToneKey, { fg: string; bg: string }> = {
  primary: { fg: darkColors.primary, bg: darkColors.primarySoft },
  success: { fg: darkColors.success, bg: darkColors.successSoft },
  warning: { fg: darkColors.warning, bg: darkColors.warningSoft },
  danger: { fg: darkColors.danger, bg: darkColors.dangerSoft },
  neutral: { fg: darkColors.inkSoft, bg: darkColors.surfaceAlt },
};

/** Hero gradient (top-left → bottom-right) for the ONE headline card per screen. */
export const lightGradient = { hero: ["#2E7CF6", "#0B47B3"] as [string, string], onHero: "#FFFFFF", onHeroSoft: "rgba(255,255,255,0.80)" };
export const darkGradient = { hero: ["#2E6BE0", "#123A86"] as [string, string], onHero: "#FFFFFF", onHeroSoft: "rgba(255,255,255,0.82)" };
