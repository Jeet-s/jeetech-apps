import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { Tappable } from "./Pressable";
import { Icon, type IconName } from "./Icon";
import { useBannerHeight } from "../modules/layout";
import { fonts, palette, space } from "./theme";

export const TAB_BAR_HEIGHT = 64;

/** Bottom tab bar. Sits above the banner ad (if any) and the gesture area. */
export function TabBar<T extends string>({ tabs, active, onChange }: { tabs: { id: T; label: string; icon: IconName }[]; active: T; onChange: (id: T) => void }) {
  const insets = useSafeAreaInsets();
  const banner = useBannerHeight();
  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom, bottom: banner }]} accessibilityRole="tablist">
      {tabs.map((t) => (
        <Tab key={t.id} label={t.label} icon={t.icon} on={t.id === active} onPress={() => onChange(t.id)} />
      ))}
    </View>
  );
}

/**
 * One tab. The press feedback lives on the ROUNDED pill (scale + tint) instead of the default rectangular Android
 * ripple over the whole cell (QA: "a gray rectangular highlight that differs from the rounded selected pill"). The
 * ACTIVE pill is a filled, bordered chip in the brand colour — clearly higher contrast than the old faint soft tint.
 */
function Tab({ label, icon, on, onPress }: { label: string; icon: IconName; on: boolean; onPress: () => void }) {
  const press = useSharedValue(0);
  const pillAnim = useAnimatedStyle(() => ({ transform: [{ scale: 1 - press.value * 0.12 }] }));
  return (
    <Tappable label={label} role="tab" accessibilityState={{ selected: on }} sound={null} ripple={false} scale={1} progress={press} onPress={onPress} style={styles.tab}>
      <Animated.View style={[styles.pill, on ? styles.pillOn : styles.pillOff, pillAnim]}>
        <Icon name={icon} size={22} color={on ? palette.onPrimary : palette.inkSoft} />
      </Animated.View>
      <Text style={[styles.label, { color: on ? palette.primary : palette.inkSoft }]}>{label}</Text>
    </Tappable>
  );
}

const styles = StyleSheet.create({
  bar: { position: "absolute", left: 0, right: 0, flexDirection: "row", backgroundColor: palette.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border },
  tab: { flex: 1, height: TAB_BAR_HEIGHT, alignItems: "center", justifyContent: "center", gap: 2 },
  pill: { width: 56, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  // Active = a solid brand pill (icon in onPrimary) so the selected tab reads at a glance; inactive = transparent.
  pillOn: { backgroundColor: palette.primary },
  pillOff: { backgroundColor: "transparent" },
  label: { fontFamily: fonts.medium, fontSize: 12, marginTop: space.xs / 2 },
});
