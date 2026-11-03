import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withSpring, type SharedValue } from "react-native-reanimated";
import { ripple as rippleColor, springs } from "./theme";
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
  fill,
  fillActive,
  progress,
  ripple = true,
  style,
  children,
  disabled,
  role = "button",
  ...rest
}: Omit<PressableProps, "style" | "children"> & {
  label: string;
  sound?: Sfx | null;
  scale?: number;
  /** When both are set, the background animates fill → fillActive on press (a visible "pressed" darker fill). */
  fill?: string;
  fillActive?: string;
  /** Optional shared value the parent passes in to drive its OWN children off this press (0 → 1 on press). */
  progress?: SharedValue<number>;
  /** Android native ripple on press (on by default — a material wash the burst-frame judge catches). */
  ripple?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  role?: "button" | "link" | "checkbox" | "tab" | "switch";
}) {
  const p = useSharedValue(0);
  const hasFill = !!fill && !!fillActive;
  const anim = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - p.value * (1 - scale) }],
    ...(hasFill ? { backgroundColor: interpolateColor(p.value, [0, 1], [fill!, fillActive!]) } : {}),
  }));
  const drive = (to: number) => {
    p.value = withSpring(to, springs.press);
    if (progress) progress.value = withSpring(to, springs.press);
  };
  return (
    <APressable
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      hitSlop={6}
      android_ripple={ripple && !disabled ? { color: rippleColor, foreground: true } : undefined}
      onPressIn={() => drive(1)}
      onPressOut={() => drive(0)}
      onPress={(e) => {
        if (sound) feedback(sound, "light");
        onPress?.(e);
      }}
      style={[anim, style, disabled ? { opacity: 0.45 } : null]}
      {...rest}
    >
      {children}
    </APressable>
  );
}
