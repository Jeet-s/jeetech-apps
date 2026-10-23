import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { springs } from "./theme";
import { haptic, play, type Sfx } from "../audio/sfx";

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
  style,
  children,
  disabled,
  role = "button",
  ...rest
}: Omit<PressableProps, "style" | "children"> & {
  label: string;
  sound?: Sfx | null;
  scale?: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  role?: "button" | "link" | "checkbox" | "tab" | "switch";
}) {
  const p = useSharedValue(0);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: 1 - p.value * (1 - scale) }] }));
  return (
    <APressable
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      hitSlop={6}
      // Acknowledge the touch the instant a finger lands (<100 ms): spring the
      // surface down AND fire the haptic on press-IN, not on release. The sound
      // (if any) plays on the completed press. This keeps the tap count of
      // haptics unchanged but makes every control feel immediately responsive,
      // even if the work it kicks off (opening a sheet, a commit) takes a beat.
      onPressIn={() => {
        p.value = withSpring(1, springs.press);
        if (sound) haptic("light");
      }}
      onPressOut={() => (p.value = withSpring(0, springs.press))}
      onPress={(e) => {
        if (sound) play(sound);
        onPress?.(e);
      }}
      style={[anim, style, disabled ? { opacity: 0.45 } : null]}
      {...rest}
    >
      {children}
    </APressable>
  );
}
