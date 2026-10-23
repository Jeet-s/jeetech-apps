import { useEffect, useMemo, useRef, useState } from "react";
import { Modal, StyleSheet, Text, View } from "react-native";
import Animated, { Easing, FadeIn, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Icon, ProgressRing, ToastHost, feedback, palette, radius, space, type } from "../ui";
import { type Block, type BlockDaySettings } from "../core/model";
import { absEnd, absStart } from "../core/blocks";
import { focusCue } from "../core/focus";
import { DAY, dayNumber, fmtDuration, toHHMM } from "../core/time";
import { nowMinutes } from "./helpers";

/**
 * The big full-screen alarm / live-cue scene (Settings → Focus cues). While a
 * block runs it shows a giant countdown ring; as the end approaches it escalates
 * — colour warms, the ring pulses faster and a haptic ladder fires at each
 * pre-end nudge — so a transition is impossible to miss. One-tap Done / Snooze /
 * Skip keep the plan intact without hunting through menus. Fully in-app and
 * offline; respects the global toggle and per-run dismissal.
 */
export function FocusAlert({
  visible,
  block,
  next,
  settings,
  onDone,
  onSnooze,
  onSkip,
  onClose,
}: {
  visible: boolean;
  block: Block | null;
  next: Block | null;
  settings: BlockDaySettings;
  onDone: () => void;
  onSnooze: () => void;
  onSkip: () => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [nowAbs, setNowAbs] = useState(() => (block ? dayNumber(block.date) * DAY + nowMinutes() : 0));
  const pulse = useSharedValue(0);
  const lastNudge = useRef<number | null>(null);

  // Live 1s clock while the scene is open so the countdown feels immediate.
  useEffect(() => {
    if (!visible || !block) return;
    const tick = () => setNowAbs(dayNumber(block.date) * DAY + nowMinutes());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [visible, block]);

  const cue = useMemo(
    () => (block ? focusCue(absStart(block), absEnd(block), nowAbs, settings.preEndNudgesMin) : null),
    [block, nowAbs, settings.preEndNudgesMin],
  );

  // Escalating pulse: faster + deeper as the end nears.
  useEffect(() => {
    if (!visible || !cue) {
      cancelAnimation(pulse);
      pulse.value = 0;
      return;
    }
    const dur = Math.round(1400 - cue.intensity * 900); // 1400ms → 500ms
    cancelAnimation(pulse);
    pulse.value = withRepeat(withTiming(1, { duration: dur, easing: Easing.inOut(Easing.quad) }), -1, true);
    return () => cancelAnimation(pulse);
  }, [visible, cue?.intensity, pulse]);

  // Haptic ladder — one firm tap each time a new nudge step is crossed.
  useEffect(() => {
    if (!visible || !cue) return;
    if (cue.nudgeAt !== lastNudge.current) {
      lastNudge.current = cue.nudgeAt;
      if (cue.nudgeAt != null) feedback(cue.phase === "ending" ? "unlock" : "pop", cue.phase === "ending" ? "success" : "warning");
    }
  }, [visible, cue?.nudgeAt, cue?.phase]);

  useEffect(() => {
    if (visible) lastNudge.current = null;
  }, [visible]);

  const ringStyle = useAnimatedStyle(() => {
    const s = 1 + pulse.value * (0.02 + (cue?.intensity ?? 0) * 0.06);
    return { transform: [{ scale: s }] };
  });

  if (!visible || !block || !cue) return null;

  const ending = cue.phase === "ending";
  const ramping = cue.phase === "ramp";
  const accent = block.color;
  const tint = ending ? palette.danger : ramping ? palette.warning : accent;
  const status = ending ? "Time's up" : cue.minutesLeft <= 1 ? "Less than a minute left" : `${fmtDuration(cue.minutesLeft)} left`;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.root, { backgroundColor: `${tint}14` }]}>
        <Animated.View entering={FadeIn.duration(220)} style={[styles.card, { paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.lg }]}>
          <View style={[styles.badge, { backgroundColor: `${tint}1A` }]}>
            <Icon name={ending ? "bell" : "play"} size={16} color={tint} />
            <Text style={[type.overline, { color: tint }]}>{ending ? "Transition" : "Focus"}</Text>
          </View>

          <Text style={[type.title, styles.center]} numberOfLines={3}>{block.title}</Text>
          <Text style={[type.caption, styles.center]}>{toHHMM(block.start)} – {toHHMM(block.end % DAY)}</Text>

          <Animated.View style={[styles.ringWrap, ringStyle]}>
            <ProgressRing
              value={ending ? 1 : cue.elapsed}
              size={232}
              stroke={18}
              color={tint}
              track={`${tint}22`}
              label={ending ? "Done?" : fmtDuration(cue.minutesLeft)}
              sublabel={ending ? "wrap up" : "left"}
              labelColor={palette.ink}
            />
          </Animated.View>

          <View style={[styles.statusPill, { backgroundColor: `${tint}1A` }]}>
            <Text style={[type.bodyStrong, { color: tint }]}>{status}</Text>
          </View>

          {next ? (
            <Text style={[type.caption, styles.center]}>Up next · {next.title} at {toHHMM(next.start)}</Text>
          ) : (
            <Text style={[type.caption, styles.center]}>Nothing scheduled after this</Text>
          )}

          <View style={styles.actions}>
            <Button label="Done" icon="check" size="lg" onPress={onDone} />
            <View style={styles.row}>
              <View style={styles.half}><Button label="+10 min" icon="clock" variant="secondary" onPress={onSnooze} /></View>
              <View style={styles.half}><Button label="Skip" icon="skip" variant="secondary" onPress={onSkip} /></View>
            </View>
            <Button label="Back to day" variant="ghost" sound={null} onPress={onClose} />
          </View>
        </Animated.View>
      </View>
      {/* Snooze/skip confirmations float above this full-screen scene. */}
      <ToastHost anchor="top" />
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "center", padding: space.lg },
  card: { backgroundColor: palette.surface, borderRadius: radius.xl, padding: space.xl, gap: space.md, alignItems: "center", maxWidth: 480, width: "100%", alignSelf: "center" },
  center: { textAlign: "center" },
  badge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill },
  ringWrap: { alignItems: "center", justifyContent: "center", marginVertical: space.sm },
  statusPill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.pill },
  actions: { alignSelf: "stretch", gap: space.sm, marginTop: space.sm },
  row: { flexDirection: "row", gap: space.sm },
  half: { flex: 1 },
});
