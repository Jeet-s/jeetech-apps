import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  BarChart,
  Button,
  Card,
  HeroCard,
  Icon,
  Pill,
  ProgressBar,
  ProgressRing,
  Screen,
  Stat,
  palette,
  gradient,
  space,
  tones,
  type,
} from "../ui";
import { SpeakSheet, type SpeakMode } from "./SpeakSheet";
import { useGym } from "../core/data";
import { getMastery, firstVsNow } from "../core/mastery";
import { clarityLabel, clarityScore, retestDue } from "../core/assessment";
import { diagnosticsFor } from "../core/sentences";
import { SOUND_BY_ID } from "../core/sounds";
import { soundLabel } from "../core/accent";
import { addDays, dateKey, keyFromMs, weekdayLabel } from "../core/dates";
import type { Attempt } from "../core/types";

/** Weekly score history from confident attempts, grouped by local day. */
function last7(attempts: Attempt[], today: string): { label: string; value: number }[] {
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  return days.map((d) => {
    const dayAtts = attempts.filter((a) => !a.lowConfidence && keyFromMs(a.timestamp) === d);
    const avg = dayAtts.length ? Math.round(dayAtts.reduce((s, a) => s + a.overallScore, 0) / dayAtts.length) : 0;
    return { label: weekdayLabel(d), value: avg };
  });
}

export function ProgressScreen({ bottomInset }: { bottomInset: number; onPro: (from: string) => void }) {
  const gym = useGym();
  const today = dateKey(new Date());
  const l1 = gym.profile.nativeLanguage;

  const [mode, setMode] = useState<SpeakMode | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [retestIdx, setRetestIdx] = useState(0);

  const allAttempts = useMemo(() => [...gym.diagnostics, ...gym.attempts], [gym.diagnostics, gym.attempts]);
  const clarity = clarityScore(allAttempts);
  const band = clarity > 0 ? clarityLabel(clarity) : "—";
  const dueRetest = retestDue(gym.assessments, today) || gym.attempts.length === 0;
  const history = useMemo(() => last7(gym.attempts, today), [gym.attempts, today]);
  const hasHistory = history.some((h) => h.value > 0);

  // Before/after per sound (first trend point vs latest).
  const improvements = gym.plan
    .map((id) => ({ id, m: getMastery(gym.mastery, id), fv: firstVsNow(getMastery(gym.mastery, id)) }))
    .filter((x) => x.fv && x.m.trend.length >= 2 && x.fv.now - x.fv.first >= 1)
    .sort((a, b) => (b.fv!.now - b.fv!.first) - (a.fv!.now - a.fv!.first))
    .slice(0, 3);

  const retestLines = diagnosticsFor(l1);
  const startRetest = () => {
    setRetestIdx(0);
    const d = retestLines[0];
    setMode({ kind: "practice", sentenceId: d.id, text: d.text, soundTags: d.soundTags, title: "Re-test · 1 of 3" });
    setSpeaking(true);
  };
  const onRetestClose = () => {
    const next = retestIdx + 1;
    if (next < retestLines.length) {
      const d = retestLines[next];
      setRetestIdx(next);
      setMode({ kind: "practice", sentenceId: d.id, text: d.text, soundTags: d.soundTags, title: `Re-test · ${next + 1} of 3` });
    } else {
      setSpeaking(false);
    }
  };

  return (
    <>
      <Screen title="Progress" subtitle="Your clarity over time" bottomInset={bottomInset}>
        <HeroCard
          overline="Pronunciation clarity · estimate"
          value={`${clarity}/100`}
          caption={band}
          status={{ label: dueRetest ? "Re-test ready" : "Keep practising", tone: dueRetest ? "warning" : "primary" }}
          right={<ProgressRing value={clarity / 100} size={68} stroke={6} color={gradient.onHero} track={gradient.pill} />}
        >
          <Text style={[type.caption, { color: gradient.onHeroSoft }]}>Average of confident AI text estimates. {band.split(" · ")[0]} is a practice band, not a test of overall English proficiency.</Text>
        </HeroCard>

        <Card>
          <Text style={type.heading}>Clarity · last 7 days</Text>
          <Text style={[type.caption, { marginBottom: space.md }]}>Daily average · 0–100, higher is clearer</Text>
          {hasHistory ? (
            <BarChart data={history} highlight={6} showValues maxValue={100} height={104} color={palette.primary} />
          ) : (
            <Text style={type.caption}>Score a few lines and your trend will fill in here.</Text>
          )}
          {improvements[0] ? <Text style={[type.caption, { marginTop: space.md }]}>{soundLabel(improvements[0].id)}: {improvements[0].fv!.first} → {improvements[0].fv!.now} since your first practice. Keep this sound in your warm-up.</Text> : null}
        </Card>

        <Card>
          <View style={styles.rowBetween}>
            <View style={{ flex: 1 }}>
              <Text style={type.heading}>Refresh your clarity estimate</Text>
              <Text style={type.caption}>Read 3 lines to refresh your clarity estimate and see what improved.</Text>
            </View>
          </View>
          <View style={{ height: space.md }} />
          <Button label="Start re-test" icon="refresh" onPress={startRetest} />
        </Card>

        <Card>
          <Text style={type.heading}>Your sound map</Text>
          <Text style={[type.caption, { marginBottom: space.sm }]}>How each plan sound is landing right now.</Text>
          <View style={{ gap: space.md }}>
            {gym.plan.map((id) => {
              const s = SOUND_BY_ID[id];
              if (!s) return null;
              const m = getMastery(gym.mastery, id);
              const tone = m.mastered ? "success" : m.score >= 70 ? "primary" : m.score >= 50 ? "warning" : "danger";
              return (
                <View key={id} style={styles.mapRow}>
                  <Text style={[type.bodyStrong, { width: 92 }]} numberOfLines={1}>{s.name}</Text>
                  <View style={{ flex: 1 }}><ProgressBar value={m.score / 100} tone={tone === "danger" ? "danger" : tone === "warning" ? "warning" : m.mastered ? "success" : "primary"} /></View>
                  <Text style={[type.amount, { width: 40, textAlign: "right", color: tones[tone].fg }]}>{m.score}</Text>
                </View>
              );
            })}
          </View>
        </Card>

        {improvements.length ? (
          <Card accent={palette.success}>
            <Text style={type.heading}>Before → after</Text>
            <Text style={[type.caption, { marginBottom: space.sm }]}>Your biggest gains since you started.</Text>
            {improvements.map(({ id, fv }) => (
              <View key={id} style={styles.baRow}>
                <Text style={[type.bodyStrong, { flex: 1 }]}>{soundLabel(id)}</Text>
                <Text style={type.amount}>{fv!.first}</Text>
                <Icon name="chevronRight" size={16} color={palette.success} />
                <Text style={[type.amount, { color: palette.success }]}>{fv!.now}</Text>
                <Pill label={`+${fv!.now - fv!.first}`} tone="success" />
              </View>
            ))}
          </Card>
        ) : null}

        <Card>
          <View style={styles.statRow}>
            <Stat value={`${gym.streak.current}`} label="Day streak" tone={palette.primary} />
            <Stat value={`${gym.streak.best}`} label="Best streak" />
            <Stat value={`${gym.streak.freezesLeft}`} label="Freezes left" />
          </View>
        </Card>
      </Screen>

      <SpeakSheet visible={speaking} mode={mode} onClose={() => setSpeaking(false)} onScored={onRetestClose} />
    </>
  );
}

const styles = StyleSheet.create({
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
  mapRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  baRow: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.xs },
  statRow: { flexDirection: "row", gap: space.md },
});
