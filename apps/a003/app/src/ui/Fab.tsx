import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeInDown, FadeOut, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { Tappable } from "./Pressable";
import { Icon, type IconName } from "./Icon";
import { feedback } from "../audio/sfx";
import { palette, radius, shadow, shadowStrong, space, springs, type } from "./theme";

export interface FabAction {
  icon: IconName;
  label: string;
  onPress: () => void;
  tint?: string;
}

/**
 * Floating speed-dial. One primary circle that rotates its glyph and expands
 * upward into a short stack of LABELLED actions over a dim scrim — so every
 * action stays named (no icon-only riddles) while the screen chrome stays clean.
 * Position it above the tab bar/banner with `bottom`.
 */
export function Fab({
  actions,
  bottom = 0,
  icon = "plus",
  label = "Create",
}: {
  actions: FabAction[];
  bottom?: number;
  icon?: IconName;
  label?: string;
}) {
  // A single action needs no menu — the FAB just performs it on tap.
  const single = actions.length === 1;
  const [open, setOpen] = useState(false);
  const spin = useSharedValue(0);
  useEffect(() => {
    spin.value = withSpring(open ? 1 : 0, springs.pop);
  }, [open, spin]);
  const glyph = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 135}deg` }] }));
  const close = () => setOpen(false);
  const onFab = () => {
    feedback("pop", "select");
    if (single) return actions[0].onPress();
    setOpen((o) => !o);
  };
  return (
    <>
      {open ? (
        <AnimatedPressable
          entering={FadeIn.duration(140)}
          exiting={FadeOut.duration(140)}
          style={[StyleSheet.absoluteFill, styles.scrim]}
          onPress={close}
          accessibilityLabel="Close menu"
        />
      ) : null}
      <View style={[styles.wrap, { bottom: bottom + space.lg }]} pointerEvents="box-none">
        {open && !single ? (
          <View style={styles.actions}>
            {actions.map((a, i) => (
              <Animated.View key={a.label} entering={FadeInDown.springify().damping(16).stiffness(220).delay(i * 45)} style={styles.actionRow}>
                <View style={styles.labelChip}>
                  <Text style={[type.label, { color: palette.ink }]} numberOfLines={1}>{a.label}</Text>
                </View>
                <Tappable
                  label={a.label}
                  sound="tap"
                  onPress={() => { close(); a.onPress(); }}
                  style={[styles.mini, { backgroundColor: a.tint ?? palette.primary }]}
                >
                  <Icon name={a.icon} size={22} color="#fff" />
                </Tappable>
              </Animated.View>
            ))}
          </View>
        ) : null}
        <Tappable
          label={single ? actions[0].label : open ? "Close menu" : label}
          role="button"
          accessibilityState={{ expanded: open }}
          sound={null}
          onPress={onFab}
          style={styles.fab}
        >
          <Animated.View style={glyph}>
            <Icon name={icon} size={28} color={palette.onPrimary} />
          </Animated.View>
        </Tappable>
      </View>
    </>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const styles = StyleSheet.create({
  scrim: { backgroundColor: palette.scrim, zIndex: 20 },
  wrap: { position: "absolute", right: space.lg, alignItems: "flex-end", gap: space.md, zIndex: 21 },
  actions: { alignItems: "flex-end", gap: space.md, marginBottom: space.xs },
  actionRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  labelChip: { backgroundColor: palette.surface, borderRadius: radius.sm, paddingHorizontal: space.md, paddingVertical: 6, ...shadow },
  mini: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", ...shadow },
  fab: { width: 60, height: 60, borderRadius: 30, backgroundColor: palette.primary, alignItems: "center", justifyContent: "center", ...shadowStrong, shadowColor: palette.primary, shadowOpacity: 0.4 },
});
