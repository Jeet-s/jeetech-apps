import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { Button, Card, Confetti, EmptyState, HeroCard, Icon, Pill, SectionHeader, palette, play, radius, shadow, space, type } from "../ui";
import { AudioButton, RouteScreen } from "../components";
import { art } from "../art";
import { appStore, useApp, todayKey } from "../core/data";
import { dueMistakes, masteredCount } from "../core/mistakes";
import { applyReview } from "../core/state";
import { analytics } from "../modules/analytics";
import { review } from "../modules/review";
import { useNav } from "../nav";
import type { DateKey, Mistake } from "../core";
import { bn } from "../util";

type Status = "due" | "scheduled" | "mastered";
const statusOf = (m: Mistake, today: DateKey): Status => (m.mastered ? "mastered" : m.dueAt <= today ? "due" : "scheduled");
const STATUS: Record<Status, { label: string; tone: "warning" | "neutral" | "success"; accent: string }> = {
  due: { label: "আজ রিভিউ", tone: "warning", accent: palette.warning },
  scheduled: { label: "নির্ধারিত", tone: "neutral", accent: palette.border },
  mastered: { label: "আয়ত্ত ✓", tone: "success", accent: palette.success },
};

/**
 * My Mistakes — a lasting LIST of every AI-found correction (with its Bangla explanation and a
 * status), plus a spaced-repetition review for the ones due today. The list is always shown so a
 * correction saved from a role-play session appears here immediately (the old screen only showed
 * the due-today queue, so a freshly saved mistake looked missing).
 */
export function ReviewScreen() {
  const nav = useNav();
  const s = useApp();
  const today = todayKey();
  const [mode, setMode] = useState<"list" | "review">("list");

  if (mode === "review") return <ReviewRunner onDone={() => setMode("list")} />;

  if (s.mistakes.length === 0) {
    return (
      <RouteScreen title="আমার ভুল" onClose={() => nav.back()}>
        <EmptyState
          art={art.es_history_no_conversations}
          title="এখনো কোনো ভুল নেই"
          body="একটা AI চ্যাট করুন — আপনার ভুলগুলো বাংলা ব্যাখ্যাসহ এখানে জমা হয়ে রিভিউয়ের জন্য তৈরি হবে।"
          action={<Button label="AI চ্যাট করুন" icon="chat" onPress={() => { nav.back(); nav.tab("speak"); }} />}
        />
      </RouteScreen>
    );
  }

  const due = dueMistakes(s.mistakes, today);
  const mastered = masteredCount(s.mistakes);
  const rank: Record<Status, number> = { due: 0, scheduled: 1, mastered: 2 };
  const list = [...s.mistakes].sort((a, b) => rank[statusOf(a, today)] - rank[statusOf(b, today)]);

  return (
    <RouteScreen title="আমার ভুল" subtitle={`${bn(s.mistakes.length)}টি সংশোধন`} onClose={() => nav.back()}>
      <HeroCard
        overline="আজ রিভিউয়ের জন্য"
        value={bn(due.length)}
        caption={due.length ? "AI সেশন থেকে জমা হওয়া ভুল — চট করে ঝালিয়ে নিন" : "আজকের রিভিউ শেষ — কাল নতুন আইটেম আসবে"}
        status={{ label: `${bn(mastered)}টি আয়ত্ত`, tone: mastered ? "success" : "neutral" }}
      />

      {due.length ? (
        <Button label={`রিভিউ শুরু করুন (${bn(due.length)})`} size="lg" icon="refresh" onPress={() => setMode("review")} />
      ) : null}

      <SectionHeader title="সব সংশোধন" />
      {list.map((m) => (
        <MistakeCard key={m.id} m={m} today={today} />
      ))}
    </RouteScreen>
  );
}

/** One saved correction: status, the wrong → right pair, the Bangla explanation and tap-to-hear audio. */
function MistakeCard({ m, today }: { m: Mistake; today: DateKey }) {
  const st = STATUS[statusOf(m, today)];
  return (
    <Card accent={st.accent} style={{ gap: space.sm }}>
      <View style={styles.cardHead}>
        <Pill label={st.label} tone={st.tone} />
        <AudioButton label="সঠিক বাক্যটি শুনুন" size={36} tone="soft" />
      </View>
      <Text style={[type.body, { color: palette.inkSoft, textDecorationLine: "line-through" }]}>{m.original || "—"}</Text>
      <View style={styles.correctRow}>
        <Icon name="checkCircle" size={18} color={palette.success} />
        <Text style={[type.bodyStrong, { flex: 1 }]}>{m.corrected}</Text>
      </View>
      <View style={styles.tip}>
        <Text style={[type.label, { color: palette.ink }]}>{m.explanationBn}</Text>
      </View>
    </Card>
  );
}

/** Spaced-repetition review: recall the fix, then self-grade (≤10/day). Returns to the list when done. */
function ReviewRunner({ onDone }: { onDone: () => void }) {
  const s = useApp();
  const today = todayKey();
  const [queue] = useState<Mistake[]>(() => dueMistakes(s.mistakes, today));
  const [i, setI] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [right, setRight] = useState(0);
  const startedMastered = useState(() => masteredCount(s.mistakes))[0];

  if (queue.length === 0) {
    // Nothing due (shouldn't normally happen — the button only shows with due items).
    return (
      <RouteScreen title="রিভিউ" onClose={onDone}>
        <EmptyState art={art.es_history_no_conversations} title="আজ রিভিউ শেষ! 🎉" body="সব আজকের আইটেম সম্পন্ন। তালিকায় ফিরে যান।" action={<Button label="তালিকায় ফিরুন" onPress={onDone} />} />
      </RouteScreen>
    );
  }

  if (i >= queue.length) {
    const gained = masteredCount(appStore.get().mistakes) - startedMastered;
    return (
      <RouteScreen title="রিভিউ সম্পূর্ণ" onClose={onDone}>
        <Confetti trigger={1} />
        <View style={styles.doneWrap}>
          <View style={styles.doneCircle}>
            <Icon name="checkCircle" size={44} color={palette.success} />
          </View>
          <Text style={[type.title, { textAlign: "center" }]}>দারুণ কাজ!</Text>
          <Text style={[type.body, { textAlign: "center", color: palette.inkSoft }]}>
            {bn(queue.length)}টি আইটেম রিভিউ করেছেন · {bn(right)}টি ঠিক{gained > 0 ? ` · ${bn(gained)}টি নতুন আয়ত্ত` : ""}।
          </Text>
          <Button label="তালিকায় ফিরুন" size="lg" onPress={onDone} style={{ alignSelf: "stretch" }} />
        </View>
      </RouteScreen>
    );
  }

  const m = queue[i];
  const grade = (correct: boolean) => {
    appStore.set((st) => applyReview(st, m.id, correct, today));
    if (correct) setRight((r) => r + 1);
    play(correct ? "success" : "pop", 0.5);
    if (i + 1 >= queue.length) {
      analytics.track("review_completed", { count: queue.length });
      review.actionCompleted();
    }
    setRevealed(false);
    setI(i + 1);
  };

  return (
    <RouteScreen title="আমার ভুল" subtitle={`${bn(i + 1)}/${bn(queue.length)}`} onClose={onDone}>
      <View style={styles.pips}>
        {queue.map((_, k) => (
          <View key={k} style={[styles.pip, k < i && styles.pipDone, k === i && styles.pipNow]} />
        ))}
      </View>

      <Card style={{ gap: space.md }}>
        <Text style={type.overline}>আপনি বলেছিলেন</Text>
        <Text style={[type.title, { color: palette.inkSoft, textDecorationLine: "line-through" }]}>{m.original || "—"}</Text>
        {revealed ? (
          <Animated.View entering={FadeIn.duration(220)} style={{ gap: space.md }}>
            <View style={styles.divider} />
            <Text style={type.overline}>সঠিক রূপ</Text>
            <View style={styles.correctRow}>
              <Text style={[type.title, { flex: 1, color: palette.success }]}>{m.corrected}</Text>
              <AudioButton label="সঠিক বাক্যটি শুনুন" size={44} tone="soft" />
            </View>
            <View style={styles.tip}>
              <Text style={[type.label, { color: palette.ink }]}>{m.explanationBn}</Text>
            </View>
          </Animated.View>
        ) : (
          <Text style={[type.body, { color: palette.inkMuted }]}>সঠিক রূপটা মনে করার চেষ্টা করুন, তারপর মিলিয়ে দেখুন।</Text>
        )}
      </Card>

      {revealed ? (
        <View style={styles.gradeRow}>
          <Button label="আবার দরকার" variant="secondary" style={{ flex: 1 }} onPress={() => grade(false)} />
          <Button label="মনে ছিল ✓" style={{ flex: 1 }} onPress={() => grade(true)} />
        </View>
      ) : (
        <Button label="সঠিক রূপ দেখান" size="lg" icon="refresh" onPress={() => setRevealed(true)} />
      )}
    </RouteScreen>
  );
}

const styles = StyleSheet.create({
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
  correctRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  tip: { backgroundColor: palette.primarySoft, borderRadius: radius.md, padding: space.md },
  pips: { flexDirection: "row", gap: 5, justifyContent: "center" },
  pip: { width: 18, height: 6, borderRadius: 3, backgroundColor: palette.border },
  pipDone: { backgroundColor: palette.success },
  pipNow: { backgroundColor: palette.primary },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: palette.border },
  gradeRow: { flexDirection: "row", gap: space.sm },
  doneWrap: { alignItems: "center", gap: space.md, paddingVertical: space.xxl },
  doneCircle: { width: 88, height: 88, borderRadius: 44, backgroundColor: palette.successSoft, alignItems: "center", justifyContent: "center", ...shadow },
});
