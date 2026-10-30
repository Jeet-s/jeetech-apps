/**
 * Design tokens. Every screen uses these — never raw colours, sizes or system fonts.
 *
 * The look comes from the app's DESIGN FAMILY (src/ui/style.json, written by the factory from the app's
 * genre — a finance app and a dating app must not look alike): fonts, palette (light + dark), radii,
 * density, depth, motion and how the headline card is drawn. Re-skin an app by changing style.json's
 * brand colours/family through the factory, not by hard-coding styles in components. `style.language`
 * describes the family's design language — follow it on every screen.
 */
import style from "./style.json";

type Family = "ledger" | "calm" | "focus" | "spark" | "pulse" | "playful" | "editorial" | "utility" | "lux";
export const design = style as unknown as {
  family: Family;
  label: string;
  scheme: "light" | "dark";
  language: string;
  elevation: "flat" | "soft" | "lifted";
  motion: "calm" | "snappy" | "bouncy";
  hero: "gradient" | "solid" | "tint" | "outline";
  headingCase: "none" | "uppercase";
  headingTracking: number;
};

/**
 * The phone's theme when the app starts (owner, 2026-10-25: dark mode for every app). Dark-first families (pulse,
 * utility, lux) are always dark; the others follow the system Light/Dark setting, read once at launch — a change in
 * the phone's settings applies the next time the app opens. Guarded require: Node scripts (validate) import tokens too.
 */
function systemScheme(): "light" | "dark" | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require("react-native") as typeof import("react-native")).Appearance.getColorScheme() ?? null;
  } catch {
    return null;
  }
}

/** True when the app draws its dark palette (dark-first family, or the phone is in dark theme). */
export const isDark = style.scheme === "dark" || systemScheme() === "dark";
/** "system" = follows the phone's theme (light families); "dark" = the family is dark-first. Settings shows this. */
export const themeMode: "system" | "dark" = style.scheme === "dark" ? "dark" : "system";
const P = (isDark ? style.dark : style.light) as Record<string, string>;

export const palette = {
  // Brand
  primary: P.primary,
  primaryDark: P.primaryDark,
  primarySoft: P.primarySoft,
  accent: P.accent,
  success: P.success,
  successSoft: P.successSoft,
  warning: P.warning,
  warningSoft: P.warningSoft,
  danger: P.danger,
  dangerSoft: P.dangerSoft,
  // Surfaces
  bg: P.bg,
  surface: P.surface,
  surfaceAlt: P.surfaceAlt,
  border: P.border,
  // Text
  ink: P.ink,
  inkSoft: P.inkSoft,
  inkMuted: P.inkMuted,
  onPrimary: P.onPrimary,
  // Overlays
  scrim: P.scrim,
};

/**
 * The ONE headline card per screen (HeroCard), drawn the family's way: a two-hue gradient, a solid brand
 * block, a soft brand tint or an outlined panel. Put text/rings on it with onHero / onHeroSoft — never "#fff".
 */
const heroColors = ((): { hero: [string, string]; onHero: string; onHeroSoft: string; pill: string; border: string | null } => {
  const g = (isDark ? style.gradient.dark : style.gradient.light) as [string, string];
  switch (style.hero) {
    case "solid":
      return { hero: [P.primary, P.primary], onHero: P.onPrimary, onHeroSoft: P.onPrimary === "#FFFFFF" ? "rgba(255,255,255,0.8)" : "rgba(15,23,42,0.7)", pill: "rgba(255,255,255,0.18)", border: null };
    case "tint":
      return { hero: [P.primarySoft, P.surface], onHero: P.ink, onHeroSoft: P.inkSoft, pill: P.surface, border: null };
    case "outline":
      return { hero: [P.surface, P.surface], onHero: P.ink, onHeroSoft: P.inkSoft, pill: P.primarySoft, border: P.border };
    default:
      return { hero: g, onHero: "#FFFFFF", onHeroSoft: "rgba(255,255,255,0.78)", pill: "rgba(255,255,255,0.16)", border: null };
  }
})();
export const gradient = heroColors;

/**
 * Categorical colours for charts, categories and tags — distinct from the status colours
 * (success/warning/danger mean state, never "category 3"). Same order everywhere.
 */
export const categorical: string[] = style.categorical;

/** Semantic tone → [strong, soft] colours. Use for pills, progress, amounts and banners. */
export type Tone = "primary" | "success" | "warning" | "danger" | "neutral";
export const tones: Record<Tone, { fg: string; bg: string }> = {
  primary: { fg: palette.primary, bg: palette.primarySoft },
  success: { fg: palette.success, bg: palette.successSoft },
  warning: { fg: isDark ? palette.warning : "#B45309", bg: palette.warningSoft },
  danger: { fg: palette.danger, bg: palette.dangerSoft },
  neutral: { fg: palette.inkSoft, bg: palette.surfaceAlt },
};

/** display = the family's headline face (serif / condensed / geometric…); the rest = its body face. */
export const fonts = {
  display: style.fonts.display,
  displayBold: style.fonts.displayBold,
  regular: style.fonts.regular,
  medium: style.fonts.medium,
  semibold: style.fonts.semibold,
  bold: style.fonts.bold,
};

export const radius = style.radius;
export const space = style.space;

/** Minimum touch target (Android guideline: 48dp). */
export const TOUCH = 48;

const heading = { textTransform: style.headingCase === "uppercase" ? ("uppercase" as const) : ("none" as const), letterSpacing: style.headingTracking };

export const type = {
  display: { fontFamily: fonts.displayBold, fontSize: 32, lineHeight: 38, ...heading, letterSpacing: style.headingTracking - 0.3, color: palette.ink },
  title: { fontFamily: fonts.displayBold, fontSize: 24, lineHeight: 30, ...heading, color: palette.ink },
  heading: { fontFamily: fonts.display, fontSize: 18, lineHeight: 24, ...heading, color: palette.ink },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 22, color: palette.ink },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22, color: palette.ink },
  label: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 18, color: palette.inkSoft },
  caption: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: palette.inkMuted },
  button: { fontFamily: fonts.semibold, fontSize: 16, letterSpacing: 0.1 },
  number: { fontFamily: fonts.displayBold, fontSize: 28, letterSpacing: -0.5, color: palette.ink, fontVariant: ["tabular-nums"] as ["tabular-nums"] },
  /** Hero figure (balance, total, streak) — one per screen. */
  hero: { fontFamily: fonts.displayBold, fontSize: 40, lineHeight: 46, letterSpacing: -1, color: palette.ink, fontVariant: ["tabular-nums"] as ["tabular-nums"] },
  /** Money / quantities inside rows: tabular so columns of figures line up. */
  amount: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22, color: palette.ink, fontVariant: ["tabular-nums"] as ["tabular-nums"] },
  overline: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16, letterSpacing: 0.8, textTransform: "uppercase" as const, color: palette.inkSoft },
};

/** Card depth, per family: flat = hairline border, soft = light shadow, lifted = floating. */
const depth = { flat: 0, soft: 1, lifted: 1.8 }[style.elevation as "flat" | "soft" | "lifted"] ?? 1;
const shadowInk = isDark ? "#000000" : "#0F172A";
export const shadow = {
  shadowColor: shadowInk,
  shadowOpacity: 0.08 * depth * (isDark ? 2.5 : 1),
  shadowRadius: 12 * Math.max(depth, 0.5),
  shadowOffset: { width: 0, height: 4 * depth },
  elevation: Math.round(3 * depth),
  ...(depth === 0 ? { borderWidth: 1, borderColor: palette.border } : {}),
};

export const shadowStrong = {
  shadowColor: shadowInk,
  shadowOpacity: Math.max(0.06, 0.18 * depth),
  shadowRadius: 18,
  shadowOffset: { width: 0, height: depth === 0 ? 2 : 8 },
  elevation: depth === 0 ? 1 : Math.round(8 * depth * 0.6),
};

/** Motion presets — use these so every animation in the app feels like its family (calm / snappy / bouncy). */
const MOTION = {
  calm: { press: { damping: 22, stiffness: 260, mass: 0.7 }, pop: { damping: 18, stiffness: 160, mass: 0.9 }, gentle: { damping: 24, stiffness: 110, mass: 1.1 }, d: [180, 280, 460] },
  snappy: { press: { damping: 18, stiffness: 420, mass: 0.5 }, pop: { damping: 14, stiffness: 300, mass: 0.6 }, gentle: { damping: 20, stiffness: 180, mass: 0.9 }, d: [110, 180, 300] },
  bouncy: { press: { damping: 12, stiffness: 380, mass: 0.6 }, pop: { damping: 9, stiffness: 240, mass: 0.7 }, gentle: { damping: 14, stiffness: 150, mass: 1 }, d: [140, 240, 380] },
}[style.motion as "calm" | "snappy" | "bouncy"];
export const springs = { press: MOTION.press, pop: MOTION.pop, gentle: MOTION.gentle };
export const durations = { fast: MOTION.d[0], base: MOTION.d[1], slow: MOTION.d[2] };
