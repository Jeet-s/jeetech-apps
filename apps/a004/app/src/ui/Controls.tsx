import { forwardRef, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { Tappable } from "./Pressable";
import { Icon, type IconName } from "./Icon";
import { fonts, palette, radius, space, springs, TOUCH, type } from "./theme";
import { feedback } from "../audio/sfx";

/** A reanimated style that gives a small scale "pop" each time `on` turns true — so picking an
 *  option (a chip, a segment) has a satisfying selection animation, not just an instant restyle. */
function useSelectPop(on: boolean) {
  const s = useSharedValue(1);
  const prev = useRef(on);
  useEffect(() => {
    if (on && !prev.current) {
      s.value = 1.12;
      s.value = withSpring(1, springs.pop);
    }
    prev.current = on;
  }, [on, s]);
  return useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
}

/** Labelled text input with focus ring, helper and error text. */
export const TextField = forwardRef<React.ComponentRef<typeof TextInput>, TextInputProps & { label: string; error?: string | null; helper?: string }>(
  function TextField({ label, error, helper, style, onFocus, onBlur, ...rest }, ref) {
    const [focused, setFocused] = useState(false);
    const border = error ? palette.danger : focused ? palette.primary : palette.border;
    return (
      <View style={{ gap: 6 }}>
        <Text style={type.label}>{label}</Text>
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          placeholderTextColor={palette.inkMuted}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[styles.input, { borderColor: border }, style]}
          {...rest}
        />
        {error ? <Text style={[type.caption, { color: palette.danger }]}>{error}</Text> : helper ? <Text style={type.caption}>{helper}</Text> : null}
      </View>
    );
  },
);

/** Settings-style switch row. */
export function Toggle({ label, value, onChange, description }: { label: string; value: boolean; onChange: (v: boolean) => void; description?: string }) {
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: withSpring(value ? 20 : 0, springs.press) }] }));
  const track = useAnimatedStyle(() => ({ backgroundColor: withTiming(value ? palette.primary : palette.border, { duration: 160 }) }));
  return (
    <Tappable label={label} role="switch" sound={null} scale={0.99} onPress={() => { feedback("pop", "select"); onChange(!value); }} style={styles.row} accessibilityState={{ checked: value }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={type.bodyStrong}>{label}</Text>
        {description ? <Text style={type.caption}>{description}</Text> : null}
      </View>
      <Animated.View style={[styles.track, track]}>
        <Animated.View style={[styles.knob, knob]} />
      </Animated.View>
    </Tappable>
  );
}

/** Tappable list row: icon, title, subtitle, trailing value/chevron. */
export function ListItem({
  title,
  subtitle,
  icon,
  iconTint = palette.primary,
  value,
  onPress,
  chevron = !!onPress,
  destructive,
  trailing,
}: {
  title: string;
  subtitle?: string;
  icon?: IconName;
  iconTint?: string;
  value?: string;
  /** Custom right side (an Amount, a Pill, a ProgressBar column) instead of `value`. */
  trailing?: React.ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  destructive?: boolean;
}) {
  const body = (
    <>
      {icon ? (
        <View style={[styles.iconWrap, { backgroundColor: destructive ? palette.dangerSoft : iconTint === palette.primary ? palette.primarySoft : `${iconTint}1F` }]}>
          <Icon name={icon} size={20} color={destructive ? palette.danger : iconTint} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={[type.bodyStrong, destructive && { color: palette.danger }]} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={type.caption} numberOfLines={2}>{subtitle}</Text> : null}
      </View>
      {trailing ?? (value ? <Text style={[type.amount, { color: palette.inkSoft }]}>{value}</Text> : null)}
      {chevron ? <Icon name="chevronRight" size={20} color={palette.inkMuted} /> : null}
    </>
  );
  return onPress ? (
    <Tappable label={title} onPress={onPress} scale={0.99} style={styles.item}>{body}</Tappable>
  ) : (
    <View style={styles.item} accessible accessibilityLabel={value ? `${title}: ${value}` : title}>{body}</View>
  );
}

/** Small selectable pill. A selected chip carries a check so the chosen state is a
 *  lasting, unmistakable delta (not just a transient press animation). */
export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress?: () => void }) {
  const pop = useSelectPop(!!selected);
  return (
    <Animated.View style={pop}>
      <Tappable
        label={label}
        role="checkbox"
        accessibilityState={{ checked: !!selected }}
        onPress={onPress}
        sound="pop"
        style={[styles.chip, selected ? { backgroundColor: palette.primary, borderColor: palette.primary } : null]}
      >
        {selected ? <Icon name="check" size={13} color={palette.onPrimary} /> : null}
        <Text style={[type.label, { color: selected ? palette.onPrimary : palette.ink }]}>{label}</Text>
      </Tappable>
    </Animated.View>
  );
}

/** Segmented control for 2-4 options. Standard treatment: a quiet track holds the
 *  options, and the SELECTED segment is a raised surface pill (every segment carries
 *  the same transparent border, so selecting one never shifts the layout and the
 *  control never looks lop-sided). Selected text is primary + semibold. */
export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={styles.segment} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.value === value;
        return <SegItem key={o.value} label={o.label} on={on} onPress={() => onChange(o.value)} />;
      })}
    </View>
  );
}

/** One segment of a Segmented control, with a scale pop when it becomes the selected option. */
function SegItem({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const pop = useSelectPop(on);
  return (
    <Tappable
      label={label}
      role="tab"
      accessibilityState={{ selected: on }}
      sound="pop"
      onPress={onPress}
      style={[styles.segItem, on && styles.segOn]}
    >
      <Animated.Text style={[type.label, on && { fontFamily: fonts.semibold }, { color: on ? palette.primary : palette.inkSoft }, pop]}>{label}</Animated.Text>
    </Tappable>
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: TOUCH,
    borderWidth: 1.5,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: palette.ink,
    backgroundColor: palette.surface,
  },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: TOUCH + 8, paddingVertical: space.sm },
  track: { width: 48, height: 28, borderRadius: 14, padding: 3 },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#fff", elevation: 2 },
  item: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: TOUCH + 12, paddingVertical: space.sm },
  iconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  chip: { flexDirection: "row", alignItems: "center", gap: 5, minHeight: 36, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, justifyContent: "center" },
  segment: { flexDirection: "row", backgroundColor: palette.surfaceAlt, borderRadius: radius.md, padding: 4, gap: 4 },
  // Every item carries the same transparent hairline border so selecting one never shifts the layout.
  segItem: { flex: 1, minHeight: 38, alignItems: "center", justifyContent: "center", borderRadius: radius.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: "transparent" },
  // Selected state is a clean, soft primary-tinted pill — the same on-brand "selected" cue as a
  // selected Chip and the active TabBar pill — NOT the grey-outlined, drop-shadowed cap it used to
  // be, which a QA reviewer read as a harsh "focus rectangle" around mg/dL. Flat (no shadow/outline),
  // so it stays calm and consistent in both light and dark themes.
  segOn: { backgroundColor: palette.primarySoft },
});
