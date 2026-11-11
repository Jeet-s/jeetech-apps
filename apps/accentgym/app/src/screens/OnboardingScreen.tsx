import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  Button,
  Card,
  Chip,
  FooterScreen,
  HeroCard,
  Icon,
  Segmented,
  feedback,
  gradient,
  palette,
  space,
  tones,
  type,
} from "../ui";
import { PairDrillSheet } from "./PairDrillSheet";
import { SpeakSheet, type SpeakMode } from "./SpeakSheet";
import { store } from "../modules/store";
import { analytics } from "../modules/analytics";
import { gymStore, useGym } from "../core/data";
import { completeDiagnosis, finishOnboarding, soundReport } from "../core/state";
import { L1_NAME, SOUND_BY_ID, pairsForSound } from "../core/sounds";
import { diagnosticsFor } from "../core/sentences";
import { soundLabel } from "../core/accent";
import { dateKey } from "../core/dates";
import type { Accent, L1 } from "../core/types";

const LANGS: { id: L1; label: string; flag: string }[] = [
  { id: "hi", label: "Hindi", flag: "🇮🇳" },
  { id: "es", label: "Spanish", flag: "🇪🇸" },
  { id: "ar", label: "Arabic", flag: "🇸🇦" },
  { id: "other", label: "Another language", flag: "🌍" },
];

/**
 * One skippable setup screen, then a practice line one tap away. The optional
 * three-line sound check and its report remain available from Practice/Settings.
 */
export function OnboardingScreen({ onDone, onPro, assessmentOnly = false }: { assessmentOnly?: boolean; onDone: () => void; onPro?: (from: string) => void }) {
  const gym = useGym();
  const [step, setStep] = useState(assessmentOnly ? gym.diagnostics.length >= 3 ? 3 : 2 : 1);
  const [lang, setLang] = useState<L1>(gym.profile.nativeLanguage);
  const [accent, setAccent] = useState<Accent>(gym.profile.targetAccent);
  const [mode, setMode] = useState<SpeakMode | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const finished = useRef(false);
  const today = dateKey(new Date());

  const diagnostics = useMemo(() => diagnosticsFor(lang), [lang]);
  const doneCount = gym.diagnostics.length;
  const report = soundReport(gym);

  // Track a viewed step, including the first screen before any interaction.
  // Optional assessments are screen views, not new-user onboarding steps.
  useEffect(() => {
    if (assessmentOnly) analytics.track("screen_view", { screen: step === 2 ? "sound_check" : "sound_plan" });
    else analytics.track("onboarding_step", { step: 1 });
  }, [assessmentOnly, step]);

  const finish = (withPlan: boolean, useChoices = false) => {
    if (finished.current) return;
    finished.current = true;
    if (withPlan && gym.diagnostics.length >= 3 && !gym.reportShown) {
      gymStore.set((s) => completeDiagnosis(s, today));
    }
    gymStore.set((s) => finishOnboarding(s, useChoices ? { nativeLanguage: lang, targetAccent: accent } : undefined));
    feedback("success", "success");
    store.set({ onboarded: true });
    if (!assessmentOnly) analytics.track("onboarding_done", { diagnosed: gym.diagnostics.length });
    onDone();
  };

  const goto = (n: number) => {
    setStep(n);
  };

  const TopDots = (
    <View style={styles.dots} accessibilityLabel={`Step ${step - 1} of 2`}>
      {[2, 3].map((i) => (
        <View key={i} style={[styles.dot, i === step && styles.dotOn, i < step && styles.dotDone]} />
      ))}
    </View>
  );

  if (step === 1) {
    return (
      <FooterScreen
        compact
        top={<Text style={type.caption}>Quick setup · no account needed</Text>}
        footer={
          <>
            <Button
              label="Start practising"
              size="lg"
              icon="mic"
              onPress={() => finish(false, true)}
            />
            <Button label="Skip setup" variant="ghost" onPress={() => finish(false)} />
          </>
        }
      >
        <View style={{ gap: space.md }}>
          <HeroCard overline="WELCOME TO ACCENT GYM" value="One line to start" caption="Listen, then say a short line."
            style={{ padding: space.md }}>
            <Text style={[type.caption, { color: gradient.onHeroSoft }]}>Practise offline without a mic, or record for AI guidance. Scores are transcript-based estimates.</Text>
          </HeroCard>
          <Text style={type.heading}>Your first language</Text>
          <Text style={type.caption}>Choose for a tailored starter sound plan.</Text>
          <View style={styles.chips}>
            {LANGS.map((l) => (
              <Chip key={l.id} label={`${l.flag}  ${l.label}`} selected={lang === l.id} onPress={() => setLang(l.id)} />
            ))}
          </View>
          <Text style={type.heading}>Target accent</Text>
          <Segmented
            value={accent}
            onChange={setAccent}
            options={[
              { value: "us", label: "American" },
              { value: "uk", label: "British" },
            ]}
          />
          <Text style={type.caption}>You can change these in Settings. The full sound check is optional.</Text>
        </View>
      </FooterScreen>
    );
  }

  if (step === 2) {
    return (
      <>
        <FooterScreen
          top={TopDots}
          footer={
            <>
              <Text style={[type.caption, { textAlign: "center" }]}>{doneCount} of 3 recorded</Text>
              <Button label={doneCount >= 3 ? "See my results" : "Skip the check"} variant={doneCount >= 3 ? "primary" : "ghost"} onPress={() => { if (doneCount >= 3) { gymStore.set(s => completeDiagnosis(s, today)); goto(3); } else finish(false); }} />
            </>
          }
        >
          <View style={{ gap: space.lg }}>
            <Text style={type.title}>Your sound check</Text>
            <Text style={[type.caption, { marginTop: -space.sm }]}>Read three lines at your own pace. We’ll find helpful focus sounds for your {L1_NAME[lang]} learning journey.</Text>
            {diagnostics.map((d, i) => {
              const done = i < doneCount;
              return (
                <Card key={d.id} accent={done ? palette.success : palette.primary}>
                  <View style={styles.checkRow}>
                    <View style={[styles.num, done && { backgroundColor: palette.success }]}>
                      {done ? <Icon name="check" size={16} color={palette.onPrimary} /> : <Text style={[type.bodyStrong, { color: palette.onPrimary }]}>{i + 1}</Text>}
                    </View>
                    <Text style={[type.bodyStrong, { flex: 1 }]}>{d.text}</Text>
                  </View>
                  <Button
                    label={done ? "Recorded" : i === doneCount ? "Record this line" : "Record"}
                    icon={done ? "check" : "mic"}
                    variant={done ? "ghost" : i === doneCount ? "primary" : "secondary"}
                    disabled={done || i > doneCount}
                    onPress={() => {
                      setMode({ kind: "diagnostic", sentenceId: d.id, text: d.text, soundTags: d.soundTags, index: i, total: 3 });
                      setSpeaking(true);
                    }}
                  />
                </Card>
              );
            })}
          </View>
        </FooterScreen>
        <SpeakSheet visible={speaking} mode={mode} onPro={onPro} onClose={() => setSpeaking(false)} onScored={(attempt) => {
          if (!attempt || attempt.lowConfidence) return;
          const count = gymStore.get().diagnostics.length;
          if (count >= 3) {
            gymStore.set(s => completeDiagnosis(s, today));
            setSpeaking(false); goto(3);
          } else {
            const d = diagnostics[count];
            setMode({ kind: "diagnostic", sentenceId: d.id, text: d.text, soundTags: d.soundTags, index: count, total: 3 });
          }
        }} />
      </>
    );
  }

  // step 3 — report
  return (
    <FooterScreen
      top={TopDots}
      footer={<Button label="Start training" size="lg" icon="flame" onPress={() => finish(true)} />}
    >
      <ReportStep lang={lang} report={report} />
    </FooterScreen>
  );
}

function ReportStep({ lang, report }: { lang: L1; report: ReturnType<typeof soundReport> }) {
  const [drill, setDrill] = useState<string | null>(null);
  const gym = useGym();
  if (!report) {
    return (
      <View style={{ gap: space.md }}>
        <Text style={type.title}>Your plan is ready</Text>
        <Text style={type.body}>We've set up a {L1_NAME[lang]} starter plan. Record a few lines and it tunes to your real weak sounds.</Text>
      </View>
    );
  }
  return (
    <View style={{ gap: space.md }}>
      <HeroCard overline="SOUND CHECK COMPLETE" value="3 focus sounds" caption={`${L1_NAME[lang]} plan · ${report.items.map(it => soundLabel(it.soundId)).join(" · ")}`} style={{ padding: space.lg }} />
      <Text style={[type.body, { color: palette.inkSoft }]}>Your lowest estimated sounds, each with a drill. Start with number 1.</Text>
      {report.items.map((it, i) => (
        <Card key={it.soundId} accent={tones.warning.fg}>
          <View style={styles.reportRow}>
            <View style={styles.rank}><Text style={[type.bodyStrong, { color: palette.onPrimary }]}>{i + 1}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={type.bodyStrong}>{soundLabel(it.soundId)}</Text>
              <Text style={type.caption}>{it.observed ? `${it.score}% estimated` : "Suggested focus · needs a clearer sample"} · {it.examples.join(", ")}</Text>
            </View>
            <Button label="Drill" variant="secondary" size="sm" icon="target" onPress={() => setDrill(it.soundId)} />
          </View>
          <Text style={[type.caption, { marginVertical: space.sm }]}>{(() => {
            const observations = gym.diagnostics.filter(a => !a.lowConfidence).flatMap(a => a.phonemeScores).filter(p => p.ph === it.soundId);
            const miss = observations.find(p => p.expectedIPA !== p.heardIPA);
            return miss ? `The recognizer suggests a sound substitution. ${SOUND_BY_ID[it.soundId]?.tip}` : observations.length ? `This sound was less clear than your others. ${SOUND_BY_ID[it.soundId]?.tip}` : `Not enough evidence yet. ${SOUND_BY_ID[it.soundId]?.tip}`;
          })()}</Text>
          <Text style={type.bodyStrong}>{(() => { const p = pairsForSound(it.soundId)[0]; return p ? `Listen & choose: ${p.a} / ${p.b}` : `Listen & repeat: ${it.examples[0]}`; })()}</Text>
        </Card>
      ))}
      <PairDrillSheet soundId={drill} onClose={() => setDrill(null)} />
      <Text style={type.caption}>Estimate only — a practice guide, not an official test or therapy.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  dots: { flexDirection: "row", gap: 6, alignSelf: "center" },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: palette.border },
  dotOn: { width: 22, backgroundColor: palette.primary },
  dotDone: { backgroundColor: palette.primary },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  checkRow: { flexDirection: "row", alignItems: "center", gap: space.sm, marginBottom: space.sm },
  num: { width: 28, height: 28, borderRadius: 14, backgroundColor: palette.primary, alignItems: "center", justifyContent: "center" },
  reportRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  rank: { width: 30, height: 30, borderRadius: 15, backgroundColor: tones.warning.fg, alignItems: "center", justifyContent: "center" },
});
