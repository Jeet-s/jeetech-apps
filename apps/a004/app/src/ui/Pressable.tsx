import { Pressable, StyleSheet, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { radius, springs } from "./theme";
import { feedback, type Sfx } from "../audio/sfx";

const APressable = Animated.createAnimatedComponent(Pressable);

/**
 * Base tappable: springs down on press, gives haptic (+ optional sound)
 * feedback, and always carries an accessibility label. Every custom tappable
 * surface in the app is built on this — never a bare Pressable/Touchable.
 */
export function Tappable({
  onPress,
  label,
  sound = "tap",
  scale = 0.97,
  pressTint,
  pressFrom,
  pressOverlay,
  overlayRadius,
  ripple,
  style,
  children,
  disabled,
  dimOnDisabled = true,
  role = "button",
  ...rest
}: Omit<PressableProps, "style" | "children"> & {
  label: string;
  sound?: Sfx | null;
  scale?: number;
  /** Background colour to flash toward while pressed (a visible "darker fill"). */
  pressTint?: string;
  /** The resting background colour `pressTint` animates from (defaults to transparent). */
  pressFrom?: string;
  /** A translucent tint that fades in ON TOP of the content while pressed — the visible pressed
   *  state for opaque surfaces whose own background is covered (e.g. a gradient HeroCard). */
  pressOverlay?: string;
  /** Corner radius for `pressOverlay` so it matches a rounded card (defaults to the card radius). */
  overlayRadius?: number;
  /** Android material ripple colour (ignored on iOS). A clear, platform-native press response. */
  ripple?: string | null;
  /** Dim to 45% when disabled. Buttons opt out and paint their own AA-contrast disabled fill. */
  dimOnDisabled?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  role?: "button" | "link" | "checkbox" | "tab" | "switch";
}) {
  const p = useSharedValue(0);
  const anim = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - p.value * (1 - scale) }],
    ...(pressTint ? { backgroundColor: interpolateColor(p.value, [0, 1], [pressFrom ?? "transparent", pressTint]) } : null),
  }));
  const overlayAnim = useAnimatedStyle(() => ({ opacity: p.value }));
  return (
    <APressable
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      hitSlop={6}
      android_ripple={ripple ? { color: ripple, borderless: false } : undefined}
      onPressIn={() => (p.value = withSpring(1, springs.press))}
      onPressOut={() => (p.value = withSpring(0, springs.press))}
      onPress={(e) => {
        if (sound) feedback(sound, "light");
        onPress?.(e);
      }}
      style={[anim, style, disabled && dimOnDisabled ? { opacity: 0.45 } : null]}
      {...rest}
    >
      {children}
      {pressOverlay ? (
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: pressOverlay, borderRadius: overlayRadius ?? radius.lg }, overlayAnim]}
        />
      ) : null}
    </APressable>
  );
}
