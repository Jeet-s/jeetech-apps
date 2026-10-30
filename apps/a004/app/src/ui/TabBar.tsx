import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Tappable } from "./Pressable";
import { Icon, type IconName } from "./Icon";
import { useBannerHeight } from "../modules/layout";
import { fonts, palette, shadowStrong, space } from "./theme";

export const TAB_BAR_HEIGHT = 64;

/** Bottom tab bar. Sits above the banner ad (if any) and the gesture area. */
export function TabBar<T extends string>({ tabs, active, onChange }: { tabs: { id: T; label: string; icon: IconName }[]; active: T; onChange: (id: T) => void }) {
  const insets = useSafeAreaInsets();
  const banner = useBannerHeight();
  // Always keep a minimum gap below the labels: on gesture-nav devices (and inside the
  // store-screenshot device frame) the bottom inset can be reported as ~0, which let the
  // Android gesture pill strike through the centre labels ("Insights"/"History"). A small
  // floor guarantees the labels clear the home indicator on every device.
  const bottomPad = Math.max(insets.bottom, space.sm);
  return (
    <View style={[styles.bar, { paddingBottom: bottomPad, bottom: banner }]} accessibilityRole="tablist">
      {tabs.map((t) => {
        const on = t.id === active;
        return (
          <Tappable key={t.id} label={t.label} role="tab" accessibilityState={{ selected: on }} sound={null} onPress={() => onChange(t.id)} style={styles.tab}>
            <View style={[styles.pill, on && { backgroundColor: palette.primarySoft }]}>
              <Icon name={t.icon} size={22} color={on ? palette.primary : palette.inkMuted} />
            </View>
            <Text style={[styles.label, { color: on ? palette.primary : palette.inkMuted, fontFamily: on ? fonts.semibold : fonts.medium }]}>{t.label}</Text>
          </Tappable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // A soft upward elevation lifts the bar off the content so it reads as a floating
  // navigation surface, not a line glued to the list (shadowStrong casts upward via the
  // negative offset below).
  bar: { position: "absolute", left: 0, right: 0, flexDirection: "row", backgroundColor: palette.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border, ...shadowStrong, shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.07 },
  tab: { flex: 1, height: TAB_BAR_HEIGHT, alignItems: "center", justifyContent: "center", gap: 2 },
  pill: { width: 56, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  label: { fontFamily: fonts.medium, fontSize: 12, marginTop: space.xs / 2 },
});
