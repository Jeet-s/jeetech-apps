import { ActivityIndicator, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { Tappable } from "./Pressable";
import { Icon, type IconName } from "./Icon";
import { palette, radius, TOUCH, type } from "./theme";
import type { Sfx } from "../audio/sfx";

type Variant = "primary" | "secondary" | "ghost" | "danger";
const COLORS: Record<Variant, { bg: string; fg: string; border?: string }> = {
  primary: { bg: palette.primary, fg: palette.onPrimary },
  secondary: { bg: palette.primarySoft, fg: palette.primary },
  ghost: { bg: "transparent", fg: palette.inkSoft, border: palette.border },
  danger: { bg: palette.dangerSoft, fg: palette.danger },
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
  sound = "tap",
  style,
  fg,
}: {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: "sm" | "md" | "lg";
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  sound?: Sfx | null;
  style?: ViewStyle;
  /** Override the icon + label colour (and the ripple). Use for bespoke states
   *  like a clearly-legible-but-inactive "locked" button, where the variant's
   *  default foreground would be too faint. */
  fg?: string;
}) {
  const c = COLORS[variant];
  const fgColor = fg ?? c.fg;
  const h = size === "lg" ? 56 : size === "sm" ? 40 : TOUCH;
  return (
    <Tappable
      label={label}
      onPress={onPress}
      disabled={disabled || loading}
      sound={sound}
      // A clear press without collapsing a full-width button into a pale "narrow
      // pill" that reads as disabled (the reviewer's note on "Record again"): a
      // gentle spring-down carried mainly by the native ripple + haptic, not a big
      // shrink. Wide buttons barely change size; the ripple does the talking.
      scale={0.98}
      android_ripple={{ color: `${fgColor}33`, borderless: false }}
      style={[
        styles.base,
        { height: h, backgroundColor: c.bg, borderColor: c.border ?? c.bg, paddingHorizontal: size === "sm" ? 14 : 20 },
        style,
      ]}
    >
      <View style={styles.row}>
        {loading ? (
          <ActivityIndicator color={fgColor} size="small" />
        ) : icon ? (
          <Icon name={icon} size={size === "sm" ? 18 : 20} color={fgColor} />
        ) : null}
        {/* Keep the label visible even while loading, so a busy button always says
            what it's doing ("Starting mic…", "Scoring…") instead of a bare spinner. */}
        <Text style={[type.button, { color: fgColor, fontSize: size === "lg" ? 17 : size === "sm" ? 14 : 16 }]}>{label}</Text>
      </View>
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
  // overflow:"hidden" clips the Android press ripple to the rounded shape — without
  // it a ghost/transparent button flashed a flat grey RECTANGLE on press that broke
  // the rounded design (the reviewer flagged "Type my answer instead").
  base: { borderRadius: radius.md, borderWidth: 1, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
});
