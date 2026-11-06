import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { Button, Chip, FooterScreen, Icon, Tappable, feedback, palette, radius, shadow, space, tones, type } from "../ui";
import { AudioButton, StackHeader } from "../components";
import { appStore, useApp } from "../core/data";
import { PLACEMENT_QUESTIONS, scorePlacement, skippedPlacement, type PlacementAnswers } from "../core/placement";
import { applyPlacement } from "../core/state";
import { analytics } from "../modules/analytics";
import { useNav } from "../nav";
import type { Goal, Level } from "../core";

const GOAL_Q = PLACEMENT_QUESTIONS[0];
const PROBE_QS = PLACEMENT_QUESTIONS.slice(1);
const LEVEL_BN: Record<Level, string> = { A1: "সহজ · A1", A2: "মাঝারি · A2", B1: "কঠিন · B1" };
const GOAL_BN: Record<Goal, string> = { job: "চাকরির জন্য", study: "পড়াশোনার জন্য", daily: "দৈনন্দিন কথাবার্তা" };

/**
 * Re-take the 3-question placement any time (no signup) and reset the learning level.
 * The onboarding placement is one-shot; this keeps the "instant start + placement" feature
 * reachable from Settings with a lasting result (the new level is shown and saved).
 */
export function PlacementScreen() {
  const nav = useNav();
  const s = useApp();
  const [goal, setGoal] = useState<Goal | null>(s.profile.goal);
  const [picks, setPicks] = useState<(string | null)[]>([null, null]);
  const [saved, setSaved] = useState<Level | null>(null);

  const save = () => {
    const probes = PROBE_QS.map((q, i) => !!q.options.find((o) => o.value === picks[i])?.correct);
    const answers: PlacementAnswers = { goal, probes };
    const result = goal ? scorePlacement(answers) : skippedPlacement();
    appStore.set((st) => applyPlacement(st, result));
    analytics.track("placement_retake", { level: result.level });
    feedback("success", "success");
    setSaved(result.level);
  };

  if (saved) {
    const t = tones[saved === "B1" ? "success" : saved === "A2" ? "primary" : "warning"];
    return (
      <FooterScreen
        top={<StackHeader title="স্তর যাচাই" onClose={() => nav.back()} closeIcon="chevronLeft" />}
        footer={<Button label="হয়ে গেছে" size="lg" onPress={() => nav.back()} />}
      >
        <Animated.View entering={FadeIn.duration(220)} style={styles.resultWrap}>
          <View style={[styles.resultBadge, { backgroundColor: t.bg }]}>
            <Icon name="checkCircle" size={40} color={t.fg} />
          </View>
          <Text style={[type.title, styles.center]}>আপনার স্তর সেট হয়েছে</Text>
          <View style={[styles.levelPill, { backgroundColor: t.bg }]}>
            <Text style={[type.heading, { color: t.fg }]}>{LEVEL_BN[saved]}</Text>
          </View>
          <Text style={[type.body, styles.center, { color: palette.inkSoft }]}>
            এই স্তর অনুযায়ী AI দৃশ্যের কঠিনতা ও কুইজ ঠিক হবে। আপনি যেকোনো সময় আবার যাচাই করতে পারবেন।
          </Text>
        </Animated.View>
      </FooterScreen>
    );
  }

  return (
    <FooterScreen
      top={<StackHeader title="স্তর যাচাই" onClose={() => nav.back()} closeIcon="chevronLeft" />}
      footer={
        <>
          <Button label="স্তর সংরক্ষণ করুন" size="lg" icon="check" disabled={!goal} onPress={save} />
          <Button label="পরে করব" variant="secondary" sound={null} onPress={() => nav.back()} />
        </>
      }
    >
      <Text style={[type.body, { color: palette.inkSoft }]}>
        কোনো সাইন-আপ ছাড়াই — ৩টি দ্রুত প্রশ্নে আপনার লেভেল ঠিক করুন। এখন: {LEVEL_BN[s.profile.level]}
      </Text>

      <View style={styles.qCard}>
        <Text style={type.heading}>{GOAL_Q.prompt_bn}</Text>
        <View style={styles.optWrap}>
          {GOAL_Q.options.map((o) => (
            <Chip key={o.value} label={o.label_bn} selected={goal === o.value} onPress={() => setGoal(o.value as Goal)} />
          ))}
        </View>
      </View>

      <View style={styles.optionalRow}>
        <View style={styles.optionalLine} />
        <Text style={[type.caption, { color: palette.inkMuted }]}>ঐচ্ছিক · শুনে বেছে নিন</Text>
        <View style={styles.optionalLine} />
      </View>

      {PROBE_QS.map((q, qi) => (
        <View key={q.id} style={styles.qCard}>
          <Text style={type.heading}>{q.prompt_bn}</Text>
          <Text style={[type.caption, { color: palette.inkSoft }]}>আগে ▶ শুনুন, তারপর যেটা শুনলেন সেটা বেছে নিন।</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            <AudioButton label="এই ক্লিপ শুনুন" size={44} tone="soft" />
            <Text style={[type.label, { color: palette.inkSoft }]}>শুনুন</Text>
          </View>
          <View style={{ gap: space.xs }}>
            {q.options.map((o) => {
              const sel = picks[qi] === o.value;
              return (
                <Tappable
                  key={o.value}
                  label={o.label_bn}
                  role="checkbox"
                  accessibilityState={{ checked: sel }}
                  sound={null}
                  onPress={() => {
                    feedback("pop", "select");
                    setPicks((p) => p.map((v, i) => (i === qi ? o.value : v)));
                  }}
                  style={[styles.optRow, sel && styles.optRowOn]}
                >
                  <View style={[styles.radio, sel && { borderColor: palette.primary, backgroundColor: palette.primary }]}>
                    {sel ? <Icon name="check" size={13} color={palette.onPrimary} /> : null}
                  </View>
                  <Text style={[type.body, { flex: 1, color: sel ? palette.ink : palette.inkSoft }]}>{o.label_bn}</Text>
                </Tappable>
              );
            })}
          </View>
        </View>
      ))}
    </FooterScreen>
  );
}

const styles = StyleSheet.create({
  qCard: { backgroundColor: palette.surface, borderRadius: radius.lg, padding: space.lg, gap: space.sm, ...shadow },
  optWrap: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  optionalRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  optionalLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: palette.border },
  optRow: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 52, paddingHorizontal: space.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: palette.border },
  optRowOn: { borderColor: palette.primary, backgroundColor: palette.primarySoft },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: palette.border, alignItems: "center", justifyContent: "center" },
  center: { textAlign: "center" },
  resultWrap: { alignItems: "center", gap: space.md, paddingVertical: space.xl },
  resultBadge: { width: 88, height: 88, borderRadius: 44, alignItems: "center", justifyContent: "center" },
  levelPill: { borderRadius: radius.pill, paddingHorizontal: space.lg, paddingVertical: space.sm },
});
