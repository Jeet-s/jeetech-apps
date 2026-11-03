import { ActivityIndicator, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { Tappable } from "./Pressable";
import { Icon, type IconName } from "./Icon";
import { palette, radius, TOUCH, type } from "./theme";
import type { Sfx } from "../audio/sfx";

type Variant = "primary" | "secondary" | "ghost" | "danger";
// `active` is the darker fill shown within ~100ms of a press (a clear "pressed" state the eye catches).
const COLORS: Record<Variant, { bg: string; fg: string; border?: string; active: string }> = {
  primary: { bg: palette.primary, fg: palette.onPrimary, active: palette.primaryDark },
  secondary: { bg: palette.primarySoft, fg: palette.primary, active: palette.primary + "33" },
  ghost: { bg: "transparent", fg: palette.inkSoft, border: palette.border, active: palette.surfaceAlt },
  danger: { bg: palette.dangerSoft, fg: palette.danger, active: palette.danger + "33" },
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
}) {
  const c = COLORS[variant];
  const h = size === "lg" ? 56 : size === "sm" ? 40 : TOUCH;
  // Ghost is transparent; interpolating a colour from "transparent" is unreliable, so it stays scale-only.
  const animatedFill = variant !== "ghost";
  return (
    <Tappable
      label={label}
      onPress={onPress}
      disabled={disabled || loading}
      sound={sound}
      scale={0.96}
      fill={animatedFill ? c.bg : undefined}
      fillActive={animatedFill ? c.active : undefined}
      style={[
        styles.base,
        { height: h, borderColor: c.border ?? c.bg, paddingHorizontal: size === "sm" ? 14 : 20 },
        !animatedFill ? { backgroundColor: c.bg } : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={c.fg} />
      ) : (
        <View style={styles.row}>
          {icon ? <Icon name={icon} size={size === "sm" ? 18 : 20} color={c.fg} /> : null}
          <Text style={[type.button, { color: c.fg, fontSize: size === "lg" ? 17 : size === "sm" ? 14 : 16 }]}>{label}</Text>
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
