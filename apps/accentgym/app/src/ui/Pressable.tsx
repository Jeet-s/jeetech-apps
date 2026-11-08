import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";

import { feedback, type Sfx } from "../audio/sfx";

/**
 * Base tappable: depresses on press, gives haptic (+ optional sound)
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
  role = "button",
  onPressIn,
  onPressOut,
  ...rest
}: Omit<PressableProps, "style" | "children"> & {
  label: string;
  sound?: Sfx | null;
  scale?: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  role?: "button" | "link" | "checkbox" | "tab" | "switch";
  dimDisabled?: boolean;
}) {
  return (
    <Pressable
      {...rest}
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityState={{ ...rest.accessibilityState, disabled: !!disabled }}
      disabled={disabled}
      hitSlop={6}
      onPressIn={(e) => { if (sound) feedback(sound, "light"); onPressIn?.(e); }}
      onPressOut={onPressOut}
      onPress={(e) => {
        onPress?.(e);
      }}
      // Use Pressable's actual state: a disabled/busy transition must never leave
      // an animated opacity stuck on an enabled control after release.
      style={({ pressed }) => [style, { opacity: disabled && dimDisabled ? 0.45 : 1 }, pressed ? { transform: [{ translateY: 3 }, { scale }] } : null]}
    >
      {children}
    </Pressable>
  );
}
