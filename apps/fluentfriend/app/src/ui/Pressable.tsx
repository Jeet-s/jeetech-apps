import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { palette, springs } from "./theme";
import { feedback, type Sfx } from "../audio/sfx";

const APressable = Animated.createAnimatedComponent(Pressable);

// A subtle brand ripple (Android) for primary surfaces — on top of the spring/dim, it gives an
// instant, native-feeling touch response on low-end phones where the JS spring can lag a frame
// (QA: "pressed states are not visible within ~0.1s"). Bounded by the surface's own borderRadius.
const RIPPLE = { color: palette.primary + "22", foreground: true } as const;

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
  style,
  children,
  disabled,
  dimDisabled = true,
  ripple = false,
  role = "button",
  ...rest
}: Omit<PressableProps, "style" | "children"> & {
  label: string;
  sound?: Sfx | null;
  scale?: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  /** Dim to 45% while disabled. Off for surfaces (e.g. Button) that render their own muted disabled look. */
  dimDisabled?: boolean;
  /** Add an Android touch ripple (primary CTAs / option rows) for an instant pressed look on low-end phones. */
  ripple?: boolean;
  role?: "button" | "link" | "checkbox" | "radio" | "tab" | "switch";
}) {
  const p = useSharedValue(0);
  // Scale AND a slight dim while pressed: a 3% scale alone was too subtle to read as a pressed state in QA frames.
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: 1 - p.value * (1 - scale) }], opacity: 1 - p.value * 0.18 }));
  return (
    <APressable
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      hitSlop={6}
      android_ripple={ripple && !disabled ? RIPPLE : undefined}
      onPressIn={() => (p.value = withSpring(1, springs.press))}
      onPressOut={() => (p.value = withSpring(0, springs.press))}
      onPress={(e) => {
        if (sound) feedback(sound, "light");
        onPress?.(e);
      }}
      style={[anim, style, disabled && dimDisabled ? { opacity: 0.45 } : null]}
      {...rest}
    >
      {children}
    </APressable>
  );
}
