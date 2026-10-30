import { ActivityIndicator, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { Tappable } from "./Pressable";
import { Icon, type IconName } from "./Icon";
import { palette, radius, tones, TOUCH, type, type Tone } from "./theme";
import type { Sfx } from "../audio/sfx";

type Variant = "primary" | "secondary" | "ghost" | "danger";

/** Darken a #RRGGBB colour toward black by `f` (0–1) — used for a button's pressed fill. */
function darken(hex: string, f: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = Math.round(((n >> 16) & 255) * (1 - f));
  const g = Math.round(((n >> 8) & 255) * (1 - f));
  const b = Math.round((n & 255) * (1 - f));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}
// `press` is the colour the fill darkens toward while held, so every tap has a
// visible pressed state (not just the scale spring). Chosen to keep the label readable.
const COLORS: Record<Variant, { bg: string; fg: string; border?: string; press: string }> = {
  primary: { bg: palette.primary, fg: palette.onPrimary, press: palette.primaryDark },
  secondary: { bg: palette.primarySoft, fg: palette.primary, press: palette.border },
  ghost: { bg: "transparent", fg: palette.inkSoft, border: palette.border, press: palette.surfaceAlt },
  danger: { bg: palette.dangerSoft, fg: palette.danger, press: palette.border },
};

/** Primary UI button. Use for every text action; icon-only actions use IconButton. */
export function Button({
  label,
  onPress,
  variant = "primary",
  size = "md",
  icon,
  disabled,
  loading,
  tone,
  disabledFill,
  disabledFg,
  sound = "tap",
  style,
}: {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: "sm" | "md" | "lg";
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  /** Override the fill with a semantic STATE colour (success/warning/danger) — a solid, AA-contrast
   *  tone fill with onPrimary text in both themes. Used e.g. for a Save button that carries the
   *  glucose range of the value being saved. Ignored while disabled. */
  tone?: Tone;
  /** When disabled, paint a muted on-brand fill (e.g. a soft green "Save reading" that is waiting for
   *  input) instead of the default dead grey — reads as "not yet active", not "broken". */
  disabledFill?: string;
  disabledFg?: string;
  sound?: Sfx | null;
  style?: ViewStyle;
}) {
  const c = COLORS[variant];
  const h = size === "lg" ? 56 : size === "sm" ? 40 : TOUCH;
  // A disabled button gets a clearly INACTIVE neutral-grey fill (palette.border) with a lowered
  // contrast muted label — it reads unmistakably as "not yet pressable", never as a pale tinted
  // card that looks tappable. (The brand-tinted surfaceAlt fill used before read as a pale green
  // card on the Ledger palette.) Loading keeps the brand fill (it shows a spinner, not a dead state).
  const muted = disabled && !loading;
  // A `tone` turns the fill into that state's strong colour (tones[tone].fg is the AA text colour,
  // so onPrimary sits on it with AA contrast in light AND dark). The press tint is a touch darker.
  const toneFill = tone && !muted ? tones[tone].fg : null;
  const bg = muted ? disabledFill ?? palette.border : toneFill ?? c.bg;
  const fg = muted ? disabledFg ?? palette.inkMuted : toneFill ? palette.onPrimary : c.fg;
  // A disabled button ALWAYS keeps a defining hairline edge (palette.border) — even when it carries a
  // soft on-brand `disabledFill` — so it reads unmistakably as a button that isn't pressable yet, not
  // as a flat strip of tinted text (a QA reviewer read the pale "Enter 20–600 mg/dL" Save as inactive
  // text). Once valid it takes a strong solid `tone` fill, so active vs. waiting is unmistakable.
  const border = muted ? palette.border : toneFill ?? c.border ?? c.bg;
  const press = toneFill ? darken(toneFill, 0.14) : c.press;
  return (
    <Tappable
      label={label}
      onPress={onPress}
      disabled={disabled || loading}
      dimOnDisabled={false}
      sound={sound}
      scale={0.97}
      pressFrom={bg === "transparent" ? undefined : bg}
      pressTint={press}
      style={[
        styles.base,
        { height: h, backgroundColor: bg, borderColor: border, paddingHorizontal: size === "sm" ? 14 : 20 },
        style,
      ]}
    >
      {loading ? (
        // Keep the label beside a clean spinner (e.g. "Saving…") — a bare ActivityIndicator with the
        // label gone flashed a clipped glyph on the first frame and read as a broken button.
        <View style={styles.row}>
          <ActivityIndicator size="small" color={fg} />
          <Text style={[type.button, { color: fg, fontSize: size === "lg" ? 17 : size === "sm" ? 14 : 16 }]}>{label}</Text>
        </View>
      ) : (
        <View style={styles.row}>
          {icon ? <Icon name={icon} size={size === "sm" ? 18 : 20} color={fg} /> : null}
          <Text style={[type.button, { color: fg, fontSize: size === "lg" ? 17 : size === "sm" ? 14 : 16 }]}>{label}</Text>
        </View>
      )}
    </Tappable>
  );
}

/** Round icon-only button (≥ 48dp target). `label` is read by screen readers. */
export function IconButton({
  icon,
  label,
  onPress,
  tone = "default",
  size = TOUCH,
  style,
}: {
  icon: IconName;
  label: string;
  onPress?: () => void;
  tone?: "default" | "primary" | "danger";
  size?: number;
  style?: ViewStyle;
}) {
  const bg = tone === "primary" ? palette.primary : tone === "danger" ? palette.dangerSoft : palette.surfaceAlt;
  const fg = tone === "primary" ? palette.onPrimary : tone === "danger" ? palette.danger : palette.ink;
  return (
    <Tappable
      label={label}
      onPress={onPress}
      style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: "center", justifyContent: "center" }, style]}
    >
      <Icon name={icon} size={Math.round(size * 0.46)} color={fg} />
    </Tappable>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.md, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
});
