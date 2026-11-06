import { useEffect, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { Button, Chip, FooterScreen, Icon, palette, radius, space, type } from "../ui";
import { art } from "../art";
import { appStore } from "../core/data";
import { updateSettings } from "../core/state";
import { analytics } from "../modules/analytics";
import type { RecordRequest } from "../app/engine";

const STARTER: RecordRequest = {
  mode: "standard",
  packId: "impromptu",
  promptId: "onboarding_intro",
  promptText: "Introduce yourself in 30–60 seconds.",
  scenario: "Getting started",
  title: "Your first take",
};

const GOALS: { id: string; label: string }[] = [
  { id: "interview", label: "Interviews" },
  { id: "viva", label: "Viva / defence" },
  { id: "pitch", label: "Pitches" },
  { id: "toast", label: "Toasts" },
  { id: "presentation", label: "Presentations" },
  { id: "improve", label: "Just improve" },
];

/**
 * First run → aha on ONE screen with no login, questionnaire gate or paywall:
 * welcome + an optional goal, then straight into recording your first take →
 * the scored report (shown by the record flow). Everything stays on the phone.
 */
export function OnboardingScreen({ onDone }: { onDone: (opts?: { record?: RecordRequest }) => void }) {
  const [goal, setGoal] = useState<string | null>(null);
  const selectedGoal = GOALS.find((g) => g.id === goal) ?? null;
  const fade = useSharedValue(0.6);
  useEffect(() => {
    analytics.track("onboarding_step", { step: 1 });
    fade.value = withTiming(1, { duration: 260 });
  }, [fade]);
  const body = useAnimatedStyle(() => ({ opacity: fade.value }));

  const finish = (record?: RecordRequest) => {
    if (goal) appStore.set((s) => updateSettings(s, { goal }));
    analytics.track("onboarding_done", { tookFirst: !!record });
    onDone(record ? { record } : {});
  };

  return (
    <FooterScreen
      footer={
        <>
          <Button label="Record my first take" size="lg" icon="mic" onPress={() => finish(STARTER)} />
          <Button label="Explore the app first" variant="ghost" sound={null} onPress={() => finish()} style={{ borderWidth: 0 }} />
        </>
      }
    >
      <Animated.View style={[styles.content, body]}>
        <Image source={art.onboarding_private_practice} style={styles.art} resizeMode="contain" accessibilityIgnoresInvertColors />
        <Text style={[type.display, styles.center, { lineHeight: 40 }]}>Speak a little{"\n"}every day</Text>
        <Text style={[type.body, styles.center, { color: palette.inkSoft, lineHeight: 23, marginTop: 2 }]}>
          A coach's feedback in seconds — pace, filler words and a tighter version of your own words. Your first take is free, no sign-up.
        </Text>
        <View style={styles.privacy}>
          <Icon name="lock" size={16} color={palette.primary} />
          <Text style={[type.caption, { flex: 1 }]}>No account. Your audio stays on this device.</Text>
        </View>
        <Text style={[type.caption, { marginTop: space.sm, color: palette.inkSoft }]}>
          Optional — tap a focus to tailor your prompts. You can skip this and change it later.
        </Text>
        <View style={styles.chips}>
          {GOALS.map((g) => (
            <Chip key={g.id} label={g.label} selected={goal === g.id} onPress={() => setGoal(goal === g.id ? null : g.id)} />
          ))}
        </View>
        {/* Reserved line (fixed height, no jump): explains what picking a focus
            actually does, and confirms the selection. */}
        <View style={styles.focusNote}>
          {selectedGoal ? (
            <>
              <Icon name="check" size={15} color={palette.primary} />
              <Text style={[type.caption, { flex: 1, color: palette.primary }]}>
                We'll start you with {selectedGoal.label.toLowerCase()} prompts — change it anytime in Settings.
              </Text>
            </>
          ) : (
            <Text style={[type.caption, { flex: 1, color: palette.inkSoft }]}>
              Your pick sets the practice prompts you'll see first.
            </Text>
          )}
        </View>
      </Animated.View>
    </FooterScreen>
  );
}

const styles = StyleSheet.create({
  dots: { flexDirection: "row", gap: 6, alignSelf: "center" },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: palette.border },
  dotOn: { width: 22, backgroundColor: palette.primary },
  content: { gap: space.md },
  art: { width: "100%", height: 200, marginBottom: space.sm },
  center: { textAlign: "center" },
  privacy: { flexDirection: "row", alignItems: "center", gap: space.sm, backgroundColor: palette.primarySoft, borderRadius: radius.md, padding: space.md, marginTop: space.xs },
  chips: { flexDirection: "row", flexWrap: "wrap", columnGap: space.sm, rowGap: space.sm, marginTop: space.xs },
  focusNote: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 34, marginTop: space.xs },
});
