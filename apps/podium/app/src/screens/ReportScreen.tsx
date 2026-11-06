import { useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  AiReport,
  BarChart,
  Button,
  CONTENT_MAX,
  Card,
  Chip,
  Confetti,
  Icon,
  IconButton,
  Pill,
  ProgressRing,
  Segmented,
  Sheet,
  SkeletonList,
  Tappable,
  feedback,
  gradient,
  palette,
  radius,
  shadowStrong,
  space,
  toast,
  tones,
  type,
  type IconName,
} from "../ui";
import { DiffView, MetricTile, StructureRow, TranscriptView, scoreLabel, scoreTone } from "./widgets";
import { appStore, useApp } from "../core/data";
import { correctFiller, updateSettings } from "../core/state";
import { ai } from "../modules/ai";
import { enableReminders, retryAi, scenarioLabel, type RecordRequest } from "../app/engine";
import { takeProvisional, type ProvisionalReason } from "../core/metrics";
import { trimToSentence } from "../core/text";
import type { PaceVerdict, Report, Transcript, WpmSegment } from "../core/types";
import { useSettings } from "../modules/store";
import { analytics } from "../modules/analytics";

/** The word-time window that best explains the pace verdict (the fastest run, or
 * the slowest if the take dragged) — highlighted in the transcript as evidence. */
function paceEvidenceRange(segs: WpmSegment[], verdict: PaceVerdict): { startMs: number; endMs: number } | null {
  const usable = segs.filter((s) => !s.suspect && s.wpm > 0);
  if (!usable.length) return null;
  const pick =
    verdict === "slow"
      ? usable.reduce((a, b) => (b.wpm < a.wpm ? b : a))
      : usable.reduce((a, b) => (b.wpm > a.wpm ? b : a));
  return { startMs: pick.startMs, endMs: pick.endMs };
}
/** Height reserved for the fixed footer bar (so the fade sits just above it). */
const FOOTER_H = 78;

export function ReportScreen({
  reportId,
  meta,
  onClose,
  onRetake,
  onPro,
}: {
  reportId: string;
  meta?: { quota?: boolean; offline?: boolean; fresh?: boolean; req?: RecordRequest };
  onClose: () => void;
  onRetake: (req: RecordRequest) => void;
  onPro: (from: string) => void;
}) {
  const app = useApp();
  const settings = useSettings();
  const insets = useSafeAreaInsets();
  const report = app.reports.find((r) => r.id === reportId);
  const transcript = report ? app.transcripts.find((t) => t.takeId === report.takeId) : undefined;
  const take = report ? app.takes.find((t) => t.id === report.takeId) : undefined;

  const [offline, setOffline] = useState(!!meta?.offline && !report?.rewriteText);
  const [retrying, setRetrying] = useState(false);
  const [burst, setBurst] = useState(0);
  const [qa, setQa] = useState<{ open: boolean; loading: boolean; questions: string[]; error?: string }>({ open: false, loading: false, questions: [] });
  const [reminderHandled, setReminderHandled] = useState(false);
  const didView = useRef(false);

  // Metric cards link to their evidence lower in the report.
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const paceY = useRef(0);
  const transcriptY = useRef(0);
  const structureY = useRef(0);
  const [activeMetric, setActiveMetric] = useState<"pace" | "fillers" | null>(null);
  const [flashFillers, setFlashFillers] = useState(false);
  const [paceRange, setPaceRange] = useState<{ startMs: number; endMs: number } | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const paceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Reveal the score on a fresh report with a brief "Analyzing your take…" beat
  // (a shimmer, NOT a "0"), then count up to the real score (the ring fills with
  // it). QA caught a false "0 /100" labelled "Strong" flashing before it animated
  // to 74 — the analyzing state removes that false zero at the payoff moment.
  const reduceMotion = app.settings.reduceMotion;
  const animateReveal = !!meta?.fresh && !reduceMotion && !!report;
  const [reveal, setReveal] = useState<"analyzing" | "counting" | "done">(animateReveal ? "analyzing" : "done");
  const [shownScore, setShownScore] = useState<number>(report && !animateReveal ? report.overallScore : 0);
  const countTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Pace evidence = the stretch that drove the verdict (the fastest run, or the
  // slowest if the take dragged). Its word window is highlighted in the
  // transcript so "See evidence" lands ON the words, not just the chart bar.
  const paceEvidence = useMemo(() => paceEvidenceRange(report?.wpmSegments ?? [], report?.paceVerdict ?? "good"), [report?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const showEvidence = (metric: "pace" | "fillers") => {
    feedback("pop", "light");
    setActiveMetric(metric);
    // Always scroll to the read-along transcript so the evidence is visible in
    // context (both metrics underline/tint their own words there).
    const y = transcriptY.current || paceY.current;
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
    if (metric === "fillers") {
      setPaceRange(null);
      setFlashFillers(true);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlashFillers(false), 2200);
    } else {
      setFlashFillers(false);
      setPaceRange(paceEvidence);
      if (paceTimer.current) clearTimeout(paceTimer.current);
      if (paceEvidence) paceTimer.current = setTimeout(() => setPaceRange(null), 2800);
    }
  };
  // Confidence has no in-transcript highlight; its evidence is the structure
  // breakdown (opening/point/close + clarity), so tapping it scrolls there.
  const showConfidence = () => {
    feedback("pop", "light");
    setActiveMetric(null);
    setFlashFillers(false);
    setPaceRange(null);
    scrollRef.current?.scrollTo({ y: Math.max(0, structureY.current - 12), animated: true });
  };
  useEffect(() => () => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
    if (paceTimer.current) clearTimeout(paceTimer.current);
  }, []);

  useEffect(() => {
    if (!report) return;
    const target = report.overallScore;
    if (!animateReveal) { setShownScore(target); setReveal("done"); return; }
    // Hold a short "Analyzing your take…" shimmer (no number), then count up to
    // the real score and reveal the label + status with a soft haptic.
    setReveal("analyzing");
    setShownScore(0);
    const startCount = setTimeout(() => {
      setReveal("counting");
      let n = 0;
      countTimer.current = setInterval(() => {
        n += Math.max(1, Math.ceil(target / 16));
        if (n >= target) {
          setShownScore(target);
          if (countTimer.current) clearInterval(countTimer.current);
          setReveal("done");
          feedback("success", "success");
        } else setShownScore(n);
      }, 45);
    }, 650);
    return () => {
      clearTimeout(startCount);
      if (countTimer.current) clearInterval(countTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report?.id, animateReveal]);

  const promptText = take?.promptText ?? (report ? "Your take" : "");
  const scenario = report ? scenarioLabel(app, take?.packId ?? "") : "";

  useEffect(() => {
    if (report && !didView.current) {
      didView.current = true;
      analytics.track("report_viewed");
      if (meta?.quota) onPro("ai_quota");
      // Celebrate the key moments on a fresh take: the very first baseline (a
      // milestone worth marking) or a genuine personal best afterwards — but
      // never an off-topic or too-thin take, where confetti would read as a
      // reward for a weak attempt.
      const best = Math.max(0, ...app.reports.filter((r) => r.id !== report.id).map((r) => r.overallScore));
      const worthCelebrating = report.onTopic !== false && report.overallScore >= 40;
      const milestone = app.reports.length === 1 || report.overallScore >= best;
      if (meta?.fresh && !app.settings.reduceMotion && worthCelebrating && milestone) {
        // After the score has revealed (analyzing beat + count-up), celebrate.
        setTimeout(() => {
          feedback("unlock", "success");
          setBurst((b) => b + 1);
        }, 1400);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report]);

  if (!report || !transcript) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.bar}>
          <IconButton icon="close" label="Close" onPress={onClose} />
          <Text style={type.heading}>Report</Text>
          <View style={{ width: 48 }} />
        </View>
        <View style={{ padding: space.lg }}><SkeletonList rows={4} /></View>
      </View>
    );
  }

  const aiUsed = report.modelVersion.includes("ai");
  // Provisional ONLY when the take is genuinely too thin to score — judged by how
  // much was SAID (spoken word count), never by how many seconds it took. A full
  // answer delivered quickly (a fast speaker, or the ~60-word QA sample in ~18s)
  // is a complete, confidently scorable take and gets the full report + evidence;
  // only a near-empty handful of words stays provisional. (Old behaviour locked
  // any recording under 25s, which a complete fast take could never clear.)
  const typedTake = !!take?.typed;
  const spokenWords = transcript.words.filter((w) => w.text.trim().length > 0).length;
  const takeDurationMs = take?.durationMs ?? 0;
  // Provisional when the take is too thin OR too rushed to score confidently
  // (content- and duration-aware). This is the short-take guard QA asked for: a
  // ~5s, ~20-word burst at an implied ~300 wpm no longer poses as a confident 74.
  // A typed answer has only an ESTIMATED duration (~130 wpm), so judge it purely by
  // its word count — never by the clock — or a full written answer could be wrongly
  // held as "rushed". Spoken takes still use the real duration.
  const prov = takeProvisional(spokenWords, typedTake ? 0 : takeDurationMs);
  const shortTake = prov.provisional;
  const provReason = prov.reason;
  const takeSeconds = Math.max(1, Math.round(takeDurationMs / 1000));
  const deltaPill: { label: string; tone: "success" | "warning" } | undefined =
    report.isFirstBaseline || report.vsBaselineDelta == null
      ? undefined
      : { label: `${report.vsBaselineDelta >= 0 ? "+" : ""}${report.vsBaselineDelta} vs your average`, tone: report.vsBaselineDelta >= 0 ? "success" : "warning" };
  const heroStatus = shortTake ? { label: "Brief answer · provisional", tone: "warning" as const } : deltaPill;
  const displayScore = reveal === "done" ? report.overallScore : shownScore;

  const toggleFiller = (index: number, isFiller: boolean) => {
    appStore.set((s) => correctFiller(s, report.id, index, isFiller, app.allowance.date));
    feedback("pop", "success");
    analytics.track(isFiller ? "filler_marked" : "filler_marked_not_filler");
    toast(isFiller ? "Counted as a filler — report updated" : "Updated — we won't flag that word again");
  };

  const doRetryAi = async () => {
    setRetrying(true);
    const r = await retryAi(report.id, { promptText, scenario });
    setRetrying(false);
    if (r.ai) {
      setOffline(false);
      feedback("success", "success");
      toast("AI rewrite ready");
    } else if (r.quota) {
      onPro("ai_quota");
    } else {
      feedback("error", "warning");
      toast("Still offline — try again when connected");
    }
  };

  // Off-topic → let the user answer the SAME prompt again (a fresh take, not the
  // rewrite loop), so the banner's call to action actually re-opens that prompt.
  const retrySamePrompt = () => {
    if (!take) return;
    analytics.track("retry_same_prompt");
    onRetake({
      mode: "standard",
      packId: take.packId,
      promptId: take.promptId,
      promptText,
      scenario,
      title: "Try this prompt again",
    });
  };

  const retakeWithRewrite = () => {
    if (!take) return;
    analytics.track("retake_with_rewrite");
    onRetake({
      mode: "standard",
      packId: take.packId,
      promptId: take.promptId,
      promptText,
      scenario,
      retakeOf: take.id,
      title: "Try again with the rewrite",
      // Open straight into the compose screen, pre-loaded with the rewrite, so the
      // box is never empty and one tap scores it (also records if they prefer).
      startTyped: true,
      rewriteText: report.rewriteText,
    });
  };

  const openAudienceQuestions = async () => {
    if (!settings.pro) return onPro("audience_qa");
    setQa({ open: true, loading: true, questions: [] });
    const r = await ai.run("qa_persona", JSON.stringify({ scenario, transcript: transcript.words.map((w) => w.text).join(" ") }));
    const questions = r.ok ? ((r.json as { questions?: string[] })?.questions ?? []).filter((q): q is string => typeof q === "string").slice(0, 5) : [];
    if (questions.length) setQa({ open: true, loading: false, questions });
    else setQa({ open: true, loading: false, questions: [], error: r.ok ? "No questions came back — try again." : r.reason === "quota" ? "Daily AI limit reached." : "Couldn't reach the coach. Try again when connected." });
  };

  const paceNote = report.paceVerdict === "fast" ? "A touch fast" : report.paceVerdict === "slow" ? "A little slow" : "Nicely paced";
  const segData = report.wpmSegments.map((s) => ({ label: `${Math.round(s.startMs / 1000)}s`, value: s.wpm }));

  return (
    <View style={styles.root}>
      {/* One dismiss affordance only: the filled "Done" button in the footer. */}
      <View style={[styles.bar, { paddingTop: insets.top + space.xs }]}>
        <Text style={[type.heading, { textAlign: "center", flex: 1 }]}>Your report</Text>
      </View>

      <ScrollView ref={scrollRef} contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 150 }]}>
        <ScoreHero
          report={report}
          reveal={reveal}
          displayScore={displayScore}
          caption={scoreLabel(report.overallScore)}
          status={heroStatus}
          shortTake={shortTake}
          reason={provReason}
          typed={typedTake}
          words={spokenWords}
          seconds={takeSeconds}
        />

        {/* Off-topic: the take ignored the prompt — say so plainly (the score is
            already capped) and offer to answer the same prompt again. */}
        {report.onTopic === false ? (
          <OffTopicBanner prompt={promptText} onRetry={retrySamePrompt} />
        ) : null}

        {/* Key findings, one glance, right under the score — so the headline
            evidence (pace, fillers, confidence) is above the fold, not buried. */}
        {!shortTake ? (
          <KeyFindings
            report={report}
            onPace={() => showEvidence("pace")}
            onFillers={() => showEvidence("fillers")}
            onConfidence={showConfidence}
            activeMetric={activeMetric}
          />
        ) : null}

        {/* Say it instead — the rewrite of the user's own words is the signature
            payoff, so it leads the report (above the metric grid) and is visible
            with almost no scrolling. */}
        <SayItInstead
          report={report}
          transcript={transcript}
          offline={offline}
          retrying={retrying}
          onRetryAi={doRetryAi}
          onRetake={retakeWithRewrite}
        />

        {shortTake ? (
          // Provisional take: ONE compact "unlock your full report" card instead of
          // four tiles full of dashes (which read as empty/unfinished).
          <LockedMetrics words={spokenWords} reason={provReason} seconds={takeSeconds} wpm={report.wpmOverall} typed={typedTake} onRecord={retakeWithRewrite} />
        ) : (
          <>
            {/* The metrics a speaker checks (pace, fillers, pauses, confidence),
                each measured deterministically from the word timings. */}
            <View style={styles.grid}>
              <MetricTile
                label="Pace"
                value={`${report.wpmOverall}`}
                unit="wpm"
                note={`${paceNote} · measured`}
                icon="wave"
                tone={report.paceVerdict === "good" ? "success" : "warning"}
                onPress={() => showEvidence("pace")}
                active={activeMetric === "pace"}
              />
              <MetricTile
                label="Fillers"
                value={`${report.fillersPerMin}`}
                unit="/min"
                note={`${report.fillerTotal} this take`}
                icon="flag"
                tone={report.fillersPerMin < 3 ? "success" : "warning"}
                onPress={() => showEvidence("fillers")}
                active={activeMetric === "fillers"}
              />
            </View>
            <View style={styles.grid}>
              <MetricTile
                label="Pauses"
                value={`${report.pauseStats.count}`}
                unit="pauses"
                note={`longest ${(report.pauseStats.longestMs / 1000).toFixed(1)}s`}
                icon="pause"
                tone="neutral"
              />
              <MetricTile label="Confidence" value={`${report.confidence}`} unit="/100" note={`Clarity ${report.clarity}`} icon="flame" tone={scoreTone(report.confidence)} />
            </View>
          </>
        )}

        {!shortTake && segData.length > 1 ? (
          <View onLayout={(e) => (paceY.current = e.nativeEvent.layout.y)}>
            <Card style={{ gap: space.md }}>
              <Text style={type.label}>PACE PER 15 SECONDS (WPM)</Text>
              <BarChart data={segData} highlight={segData.length - 1} showValues color={palette.primary} />
              <Text style={type.caption}>{paceNote} overall — {report.wpmOverall} wpm. Aim for a steady 130–150.</Text>
            </Card>
          </View>
        ) : null}

        {!shortTake ? (
          <View onLayout={(e) => (structureY.current = e.nativeEvent.layout.y)}>
            <Card style={{ gap: space.md }}>
              <Text style={type.label}>STRUCTURE & CONFIDENCE · {report.structure.score}/100</Text>
              <StructureRow report={report} />
              <Text style={type.caption}>
                {report.structure.opening && report.structure.point && report.structure.close
                  ? `Opening, point and close all landed — a complete shape. Clarity ${report.clarity}, confidence ${report.confidence}.`
                  : `Aim for a clear opening, one point, and a closing line. Clarity ${report.clarity}, confidence ${report.confidence}.`}
              </Text>
            </Card>
          </View>
        ) : null}

        {/* Tips */}
        {!shortTake ? (
          <Card style={{ gap: space.sm }}>
            <Text style={type.label}>TOP 3 TIPS</Text>
            {report.tips.map((t, i) => (
              <View key={i} style={styles.tipRow}>
                <View style={styles.tipNum}><Text style={[type.label, { color: palette.primary }]}>{i + 1}</Text></View>
                <Text style={[type.body, { flex: 1 }]}>{t}</Text>
              </View>
            ))}
            {aiUsed ? <AiReport feature="speech_report" /> : null}
          </Card>
        ) : null}

        {/* Transcript */}
        <View onLayout={(e) => (transcriptY.current = e.nativeEvent.layout.y)}>
          <TranscriptCard
            transcript={transcript}
            onToggleFiller={toggleFiller}
            highlightFillers={flashFillers}
            highlightRange={paceRange}
            evidenceHint={paceRange ? "pace" : flashFillers ? "fillers" : null}
          />
        </View>

        {/* Opt-in daily reminder — offered AFTER the first take pays off (never at
            launch), so the habit loop has a hook at a time the user chooses. */}
        {meta?.fresh && app.reports.length <= 1 && app.settings.reminderTimes.length === 0 && !reminderHandled ? (
          <ReminderPrompt
            onPick={async (t, label) => {
              appStore.set((s) => updateSettings(s, { reminderTimes: [t] }));
              analytics.track("reminder_time_set");
              const ok = await enableReminders(appStore.get());
              feedback(ok ? "success" : "pop", ok ? "success" : "light");
              setReminderHandled(true);
              toast(ok ? `Daily reminder set for ${label}` : "Allow notifications in Settings to get reminders");
            }}
            onDismiss={() => { feedback("pop", "light"); setReminderHandled(true); }}
          />
        ) : null}

        {/* Audience Q&A (Pro) */}
        <Tappable label="Practice audience questions" onPress={openAudienceQuestions} style={styles.qaRow}>
          <Icon name="users" size={20} color={palette.primary} />
          <View style={{ flex: 1 }}>
            <Text style={type.bodyStrong}>Tough audience questions</Text>
            <Text style={type.caption}>AI asks follow-ups so you can practise the Q&A</Text>
          </View>
          {!settings.pro ? <Pill label="Pro" tone="primary" /> : <Icon name="chevronRight" size={20} color={palette.inkMuted} />}
        </Tappable>
      </ScrollView>

      {/* Soft fade so the scrolling content never looks clipped under the bar. */}
      <LinearGradient
        pointerEvents="none"
        colors={[`${palette.bg}00`, palette.bg]}
        style={[styles.footerFade, { bottom: insets.bottom + FOOTER_H }]}
      />
      <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
        <View style={styles.footerRow}>
          {take ? (
            <View style={{ flex: 1 }}>
              <Button label="Try again" variant="secondary" icon="refresh" onPress={retakeWithRewrite} />
            </View>
          ) : null}
          <View style={{ flex: take ? 1.2 : 1 }}>
            <Button label="Done" icon="check" onPress={onClose} />
          </View>
        </View>
      </View>

      <Sheet visible={qa.open} title="Audience questions" onClose={() => setQa((s) => ({ ...s, open: false }))}>
        {qa.loading ? (
          <SkeletonList rows={4} />
        ) : qa.error ? (
          <Text style={[type.body, { color: palette.inkSoft }]}>{qa.error}</Text>
        ) : (
          <View style={{ gap: space.sm }}>
            {qa.questions.map((q, i) => (
              <View key={i} style={styles.tipRow}>
                <View style={styles.tipNum}><Text style={[type.label, { color: palette.primary }]}>{i + 1}</Text></View>
                <Text style={[type.body, { flex: 1 }]}>{q}</Text>
              </View>
            ))}
            <AiReport feature="qa_persona" />
          </View>
        )}
      </Sheet>

      <Confetti trigger={burst} />
    </View>
  );
}

/** Shown when the AI judged the take didn't address the prompt. Honest, not
 * punishing: it names the prompt, explains the capped score, and offers a
 * one-tap retry of the same prompt. */
function OffTopicBanner({ prompt, onRetry }: { prompt: string; onRetry: () => void }) {
  return (
    <Card style={{ gap: space.md, borderColor: palette.warning, borderWidth: 1 }}>
      <View style={styles.sayHead}>
        <Icon name="info" size={18} color={palette.warning} />
        <Text style={[type.heading, { flex: 1 }]}>This take didn't answer the prompt</Text>
      </View>
      <Text style={[type.body, { color: palette.inkSoft }]}>
        The prompt was “{prompt}”. Your delivery still counts — pace, fillers and clarity are below — but the structure and overall score are held back until you answer what was asked.
      </Text>
      <Button label="Retry same prompt" icon="refresh" onPress={onRetry} />
    </Card>
  );
}

/** A gentle opacity breathe for the "Analyzing…" shimmer. Its child stays
 * mounted (no blank frame); only the opacity animates, on the UI thread. */
function Pulse({ children }: { children: ReactNode }) {
  const o = useSharedValue(0.5);
  useEffect(() => {
    o.value = withRepeat(withTiming(1, { duration: 620, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [o]);
  const anim = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={anim}>{children}</Animated.View>;
}

/** The score headline on the brand gradient. A fresh take first shows a brief
 * "Analyzing your take…" shimmer (NOT a "0"), then the number counts up and the
 * ring fills with it; only once it lands do the label + status appear — so a
 * false "0 /100" mislabelled "Strong" can never flash at the payoff moment.
 *
 * A provisional take (too thin OR too rushed to score confidently) NEVER shows a
 * number: a bare "0/100" reads as a failing grade and punishes a first attempt.
 * Instead we show a warm "Good start", explain why it's provisional, and a ring
 * that tracks the limiting dimension (words said, or seconds spoken) toward a
 * confident read — encouraging, never an inflated or zero score. */
function ScoreHero({
  report,
  reveal,
  displayScore,
  caption,
  status,
  shortTake,
  reason,
  typed,
  words,
  seconds,
}: {
  report: Report;
  reveal: "analyzing" | "counting" | "done";
  displayScore: number;
  caption: string;
  status?: { label: string; tone: "success" | "warning" };
  shortTake: boolean;
  reason: ProvisionalReason;
  typed?: boolean;
  words: number;
  seconds: number;
}) {
  const done = reveal === "done";
  const analyzing = reveal === "analyzing";

  if (shortTake) {
    // Provisional: no score number — a positive state, an honest reason, and a
    // ring tracking whatever is short (content for a thin take, time for a rushed
    // one). The pace figure is surfaced in the copy so a fast burst is explained.
    const rushed = reason === "rushed";
    const ringValue = rushed ? Math.min(1, seconds / 15) : Math.min(1, words / 20);
    const body = rushed
      ? `That was a quick ${seconds}s take at about ${report.wpmOverall} wpm — a touch fast and short to score confidently. Give it a few more seconds at a steadier pace to unlock your score.`
      : typed
        ? "Add a few more sentences to unlock your score and full feedback."
        : "Say a few more sentences to unlock your score and full feedback.";
    return (
      <LinearGradient
        colors={gradient.hero}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.hero, gradient.border ? { borderWidth: 1, borderColor: gradient.border } : null]}
      >
        <View style={styles.heroRow}>
          <View
            style={{ flex: 1, gap: 6 }}
            accessible
            accessibilityLabel={rushed
              ? `Good start. About ${seconds} seconds at ${report.wpmOverall} words per minute — a touch fast to score. Slow down and speak a little longer.`
              : `Good start. You said ${words} words — add a few more sentences to unlock your full score.`}
          >
            <Text style={[type.overline, { color: gradient.onHeroSoft }]}>First take</Text>
            <Text style={[type.title, { color: gradient.onHero }]}>Good start 👏</Text>
            <Text style={[type.body, { color: gradient.onHeroSoft }]}>{body}</Text>
          </View>
          <View style={styles.heroRight}>
            <ProgressRing
              value={ringValue}
              size={92}
              stroke={10}
              color={gradient.onHero}
              track={gradient.pill}
              labelColor={gradient.onHero}
              label={rushed ? `${seconds}` : `${words}`}
              sublabel={rushed ? "sec" : "words"}
            />
          </View>
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient
      colors={gradient.hero}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.hero, gradient.border ? { borderWidth: 1, borderColor: gradient.border } : null]}
    >
      <View style={styles.heroRow}>
        <View
          style={{ flex: 1, gap: 4 }}
          accessible
          accessibilityLabel={analyzing ? "Analyzing your take" : `${report.isFirstBaseline ? "First baseline" : "Your score"}: ${displayScore} out of 100`}
        >
          <Text style={[type.overline, { color: gradient.onHeroSoft }]}>
            {report.isFirstBaseline ? "First baseline" : "Your score"}
          </Text>
          <View style={styles.heroNumSlot}>
            {analyzing ? (
              <Pulse><View style={styles.heroShimmer} /></Pulse>
            ) : (
              <Text style={[type.hero, { color: gradient.onHero }]} numberOfLines={1} adjustsFontSizeToFit>
                {displayScore}
              </Text>
            )}
          </View>
          {analyzing ? (
            <Pulse><Text style={[type.label, { color: gradient.onHeroSoft }]}>Analyzing your take…</Text></Pulse>
          ) : done && caption ? (
            <Text style={[type.label, { color: gradient.onHeroSoft }]}>{caption}</Text>
          ) : null}
          {done && status ? (
            <View style={styles.heroPill}>
              <View style={[styles.heroDot, { backgroundColor: tones[status.tone].bg }]} />
              <Text style={[type.label, { color: gradient.onHero }]}>{status.label}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.heroRight}>
          {analyzing ? (
            <Pulse>
              <ProgressRing value={0} size={92} stroke={10} color={gradient.onHero} track={gradient.pill} labelColor={gradient.onHero} label="" sublabel="" />
            </Pulse>
          ) : (
            <ProgressRing
              value={displayScore / 100}
              size={92}
              stroke={10}
              color={gradient.onHero}
              track={gradient.pill}
              labelColor={gradient.onHero}
              label={`${displayScore}`}
              sublabel="/100"
            />
          )}
        </View>
      </View>
      {done && report.isFirstBaseline ? (
        <Text style={[type.caption, { color: gradient.onHeroSoft }]}>This is your baseline. A few more takes unlock “vs your average”.</Text>
      ) : null}
    </LinearGradient>
  );
}

/** The headline evidence, one glance, right under the score — pace, fillers and
 * confidence — so the key findings sit above the fold instead of being buried
 * below the rewrite and the metric grid. */
function KeyFindings({
  report,
  onPace,
  onFillers,
  onConfidence,
  activeMetric,
}: {
  report: Report;
  onPace: () => void;
  onFillers: () => void;
  onConfidence: () => void;
  activeMetric: "pace" | "fillers" | null;
}) {
  const paceOk = report.paceVerdict === "good";
  const fillersOk = report.fillersPerMin < 3;
  const paceWord = report.paceVerdict === "fast" ? "fast" : report.paceVerdict === "slow" ? "slow" : "on pace";
  return (
    <View style={{ gap: 6 }}>
      <View style={styles.findings}>
        <Finding icon="wave" value={`${report.wpmOverall}`} unit="wpm" note={paceWord} tone={paceOk ? palette.success : palette.warning} onPress={onPace} active={activeMetric === "pace"} />
        <View style={styles.findingDivider} />
        <Finding icon="flag" value={`${report.fillerTotal}`} note={report.fillerTotal === 1 ? "filler" : "fillers"} tone={fillersOk ? palette.success : palette.warning} onPress={onFillers} active={activeMetric === "fillers"} />
        <View style={styles.findingDivider} />
        <Finding icon="flame" value={`${report.confidence}`} unit="/100" note="confidence" tone={tones[scoreTone(report.confidence)].fg} onPress={onConfidence} />
      </View>
      <Text style={[type.caption, { textAlign: "center", color: palette.inkMuted }]}>Tap a card to see its evidence</Text>
    </View>
  );
}

/** One tappable finding — opens its evidence (pace/filler highlight in the
 * transcript, or the structure breakdown for confidence) with a press cue, so a
 * tap on the headline cards is never a no-op. */
function Finding({ icon, value, unit, note, tone, onPress, active }: { icon: IconName; value: string; unit?: string; note: string; tone: string; onPress: () => void; active?: boolean }) {
  return (
    <Tappable
      label={`${value}${unit ? ` ${unit}` : ""} ${note} — see evidence`}
      onPress={onPress}
      scale={0.96}
      sound="pop"
      style={[styles.finding, active ? styles.findingActive : null]}
    >
      <Icon name={icon} size={16} color={tone} />
      <View style={styles.findingValueRow}>
        <Text style={[type.number, { fontSize: 20, color: palette.ink }]}>{value}</Text>
        {unit ? <Text style={[type.caption, { marginBottom: 3 }]}>{unit}</Text> : null}
      </View>
      <Text style={[type.caption, { color: palette.inkSoft }]} numberOfLines={1}>{note}</Text>
    </Tappable>
  );
}

/** "Say it instead": the AI-tightened rewrite of the user's own words, with
 * stronger opener/closer. Shown high in the report (a core pillar). Degrades
 * gracefully offline / before the rewrite is ready. */
function SayItInstead({
  report,
  transcript,
  offline,
  retrying,
  onRetryAi,
  onRetake,
}: {
  report: Report;
  transcript: Transcript;
  offline: boolean;
  retrying: boolean;
  onRetryAi: () => void;
  onRetake: () => void;
}) {
  // Default to the clean "Rewritten" read (interleaved strikethrough + inserts
  // are hard to parse); Markup shows the before→after diff, Original the user's
  // own words.
  const [view, setView] = useState<"rewrite" | "markup" | "original">("rewrite");
  const original = transcript.words.map((w) => w.text).join(" ").replace(/\s+/g, " ").trim();
  // Defensive cap at a sentence boundary so a rewrite from an older report (saved
  // before the coach trimmed it) never shows a dangling, truncated fragment.
  const rewrite = trimToSentence(report.rewriteText);
  return (
    <Card style={{ gap: space.md }}>
      <View style={styles.sayHead}>
        <Icon name="sparkle" size={18} color={palette.primary} />
        <Text style={type.heading}>Say it instead</Text>
      </View>
      {report.rewriteText ? (
        <>
          <Segmented
            options={[
              { value: "rewrite", label: "Rewritten" },
              { value: "markup", label: "Markup" },
              { value: "original", label: "Original" },
            ]}
            value={view}
            onChange={setView}
          />
          {view === "markup" ? (
            <DiffView diff={report.rewriteDiff} rewrite={rewrite} />
          ) : view === "original" ? (
            <Text style={[type.body, { color: palette.inkSoft }]}>{original || "Your own words appear here."}</Text>
          ) : (
            <Text style={[type.body, { color: palette.ink }]}>{rewrite}</Text>
          )}
          {report.openerSuggestion ? (
            <View style={styles.suggest}>
              <Text style={type.label}>STRONGER OPENER</Text>
              <Text style={[type.body, { color: palette.ink }]}>“{report.openerSuggestion}”</Text>
            </View>
          ) : null}
          {report.closerSuggestion ? (
            <View style={styles.suggest}>
              <Text style={type.label}>STRONGER CLOSER</Text>
              <Text style={[type.body, { color: palette.ink }]}>“{report.closerSuggestion}”</Text>
            </View>
          ) : null}
          <Button label="Try again with the rewrite" icon="refresh" onPress={onRetake} />
          <AiReport feature="say_it_instead" />
        </>
      ) : offline ? (
        <>
          <Text style={[type.body, { color: palette.inkSoft }]}>Your rewrite needs the coach, and you're offline. Your score and tips below are ready now — reconnect and retry for a rewrite of your own words.</Text>
          <Button label="Retry rewrite" icon="refresh" loading={retrying} onPress={onRetryAi} />
        </>
      ) : (
        <Text style={[type.body, { color: palette.inkSoft }]}>A tightened rewrite of your own words appears here. Record a longer take to get the most from it.</Text>
      )}
    </Card>
  );
}

/** Transcript with a read-along "play" (highlights each word in time), a
 * full-width speed control, tap-to-jump, and a two-way filler editor: tap ANY
 * word to select it, then mark it a filler or "not a filler". This keeps the
 * filler feature reachable even on a clean take (0 fillers) — every word tap
 * selects + plays from there and opens the editor, so no tap is ever a no-op. */
function TranscriptCard({ transcript, onToggleFiller, highlightFillers, highlightRange, evidenceHint }: { transcript: Transcript; onToggleFiller: (index: number, isFiller: boolean) => void; highlightFillers?: boolean; highlightRange?: { startMs: number; endMs: number } | null; evidenceHint?: "pace" | "fillers" | null }) {
  const words = transcript.words;
  const totalMs = words.length ? words[words.length - 1].endMs : 0;
  const [pos, setPos] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<"0.75" | "1" | "1.25" | "1.5">("1");
  const [selected, setSelected] = useState<number | null>(null);
  const startRef = useRef({ at: 0, from: 0 });

  useEffect(() => {
    if (!playing) return;
    startRef.current = { at: Date.now(), from: pos >= totalMs ? 0 : pos };
    const rate = Number(speed);
    const t = setInterval(() => {
      const p = startRef.current.from + (Date.now() - startRef.current.at) * rate;
      if (p >= totalMs) {
        setPos(totalMs);
        setPlaying(false);
      } else setPos(p);
    }, 120);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, speed]);

  const activeIndex = playing || pos > 0 ? words.findIndex((w) => pos >= w.startMs && pos < w.endMs) : -1;
  const fillerCount = words.filter((w) => w.isFiller).length;
  // The tapped word drives the action bar below. A real word (not a bare pause
  // marker) so "mark a filler" always has a target.
  const sel = selected != null ? words[selected] : null;
  const selFiller = sel?.isFiller ?? false;

  const pickWord = (i: number) => {
    feedback("pop", "light");
    setPlaying(false);
    setPos(words[i].startMs);
    setSelected(i);
  };

  return (
    <Card style={{ gap: space.md }}>
      <View style={styles.playRow}>
        <IconButton
          icon={playing ? "pause" : "play"}
          label={playing ? "Pause read-along" : "Play read-along"}
          tone="primary"
          onPress={() => {
            feedback("pop", "light");
            setPlaying((p) => !p);
          }}
        />
        <View style={{ flex: 1 }}>
          <Text style={type.label}>READ-ALONG</Text>
          <Text style={type.caption}>
            {evidenceHint === "pace"
              ? "Your quickest stretch is highlighted — the pace evidence"
              : evidenceHint === "fillers"
                ? "Filler words are underlined in coral — the evidence"
                : fillerCount > 0
                  ? `${fillerCount} filler${fillerCount === 1 ? "" : "s"} underlined in coral — tap any word to play it or fix a filler`
                  : "No fillers this take — clean delivery 👏 Tap any word to play it, or mark one a filler"}
          </Text>
        </View>
      </View>
      {/* Speed on its own full-width row: bigger, unambiguous hit targets (the
          cramped 132px selector dropped taps at the 1.5× end). */}
      <Segmented
        options={[{ value: "0.75", label: "0.75×" }, { value: "1", label: "1×" }, { value: "1.5", label: "1.5×" }]}
        value={speed === "1.25" ? "1" : speed}
        onChange={setSpeed}
      />
      <TranscriptView
        transcript={transcript}
        activeIndex={activeIndex >= 0 ? activeIndex : undefined}
        selectedIndex={selected ?? undefined}
        highlightFillers={highlightFillers}
        highlightRange={highlightRange ?? undefined}
        onWordPress={(_, i) => pickWord(i)}
      />
      {/* Filler editor — height reserved so it never jumps the layout. Appears
          the moment a word is tapped, and works both ways, so the filler-
          highlighting feature is usable even when the take has 0 fillers. */}
      <View style={styles.wordAction}>
        {sel && sel.text.trim() ? (
          <>
            <Icon name="flag" size={18} color={selFiller ? palette.danger : palette.inkMuted} />
            <Text style={[type.caption, { flex: 1, color: palette.inkSoft }]} numberOfLines={2}>
              {selFiller
                ? `“${sel.text.trim()}” is counted as a filler`
                : `“${sel.text.trim()}” isn't flagged as a filler`}
            </Text>
            <Button
              label={selFiller ? "Not a filler" : "Mark filler"}
              icon={selFiller ? "check" : "flag"}
              variant="secondary"
              size="sm"
              onPress={() => onToggleFiller(selected!, !selFiller)}
            />
          </>
        ) : (
          <Text style={[type.caption, { color: palette.inkMuted, flex: 1 }]} numberOfLines={2}>
            Tap a word above to play from there — or mark it a filler.
          </Text>
        )}
      </View>
    </Card>
  );
}

/** Thin take → one compact, honest "add a few more sentences" card instead of
 * four metric tiles full of dashes. Lists what a fuller answer unlocks and offers
 * a one-tap retake, so the report never looks empty or punishing. Judged by
 * content (words said), never a wall-clock. */
function LockedMetrics({ words, reason, seconds, wpm, typed, onRecord }: { words: number; reason: ProvisionalReason; seconds: number; wpm: number; typed?: boolean; onRecord: () => void }) {
  const locked = ["Pace", "Fillers", "Pauses", "Confidence"];
  const rushed = reason === "rushed";
  const body = rushed
    ? `That was a quick take — about ${seconds}s at ~${wpm} wpm, a touch fast to score the delivery fairly. A slightly longer take at a steadier pace unlocks a reliable score plus pace, fillers, pauses and confidence. Your rewrite is above and the transcript is below.`
    : `That was a brief answer (${words} word${words === 1 ? "" : "s"}). A few more sentences unlock a reliable score plus pace, fillers, pauses and confidence. Your rewrite is above and the transcript is below.`;
  const cta = rushed ? "Record a steadier take" : typed ? "Write a fuller answer" : "Record a longer take";
  return (
    <Card style={{ gap: space.md }}>
      <View style={styles.sayHead}>
        <Icon name="lock" size={18} color={palette.primary} />
        <Text style={[type.heading, { flex: 1 }]}>Unlock your full report</Text>
      </View>
      <Text style={[type.body, { color: palette.inkSoft }]}>{body}</Text>
      <View style={styles.lockedChips}>
        {locked.map((l) => (
          <View key={l} style={styles.lockedChip}>
            <Icon name="lock" size={12} color={palette.inkMuted} />
            <Text style={[type.label, { color: palette.inkMuted }]}>{l}</Text>
          </View>
        ))}
      </View>
      <Button label={cta} icon={rushed || !typed ? "mic" : "edit"} onPress={onRecord} />
    </Card>
  );
}

/** A gentle, dismissible "set a daily reminder" card shown once after the first
 * report — a chosen-time habit hook, asking for notifications only on opt-in. */
function ReminderPrompt({ onPick, onDismiss }: { onPick: (t: string, label: string) => void; onDismiss: () => void }) {
  const times: { t: string; label: string }[] = [
    { t: "08:00", label: "8:00 AM" },
    { t: "12:30", label: "12:30 PM" },
    { t: "18:30", label: "6:30 PM" },
    { t: "21:00", label: "9:00 PM" },
  ];
  return (
    <Card style={{ gap: space.md }}>
      <View style={styles.sayHead}>
        <Icon name="flame" size={18} color={palette.primary} />
        <Text style={[type.heading, { flex: 1 }]}>Build the habit</Text>
        <Tappable label="Not now" onPress={onDismiss} style={styles.dismiss}>
          <Text style={[type.label, { color: palette.inkMuted }]}>Not now</Text>
        </Tappable>
      </View>
      <Text style={[type.body, { color: palette.inkSoft }]}>
        A 60-second take a day keeps your streak alive. Pick a time and we'll send one gentle nudge — only if you haven't practised yet.
      </Text>
      <View style={styles.reminderChips}>
        {times.map((tm) => (
          <Chip key={tm.t} label={tm.label} onPress={() => onPick(tm.t, tm.label)} />
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
  bar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space.sm, paddingBottom: space.sm },
  body: { paddingHorizontal: space.lg, gap: space.lg, width: "100%", maxWidth: CONTENT_MAX, alignSelf: "center" },
  grid: { flexDirection: "row", gap: space.md },
  tipRow: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
  tipNum: { width: 24, height: 24, borderRadius: 12, backgroundColor: palette.primarySoft, alignItems: "center", justifyContent: "center", marginTop: 1 },
  sayHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  dismiss: { paddingHorizontal: space.sm, paddingVertical: 4 },
  reminderChips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  suggest: { gap: 2, backgroundColor: palette.surfaceAlt, borderRadius: radius.md, padding: space.md },
  lockedChips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  lockedChip: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: palette.surfaceAlt, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  playRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  wordAction: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 40, backgroundColor: palette.surfaceAlt, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.sm },
  qaRow: { flexDirection: "row", alignItems: "center", gap: space.md, backgroundColor: palette.surface, borderRadius: radius.lg, padding: space.lg, borderWidth: 1, borderColor: palette.border },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: space.lg, paddingTop: space.md, backgroundColor: palette.bg, borderTopWidth: 1, borderTopColor: palette.border },
  footerRow: { flexDirection: "row", gap: space.sm, width: "100%", maxWidth: CONTENT_MAX, alignSelf: "center" },
  footerFade: { position: "absolute", left: 0, right: 0, height: 32 },
  hero: { borderRadius: radius.xl, padding: space.xl, gap: space.lg, ...shadowStrong, shadowColor: gradient.hero[1], shadowOpacity: 0.28 },
  heroRow: { flexDirection: "row", alignItems: "center", gap: space.lg },
  heroRight: { width: 92, height: 92, alignItems: "center", justifyContent: "center" },
  heroNumSlot: { minHeight: 46, justifyContent: "center" },
  heroShimmer: { width: 112, height: 40, borderRadius: radius.md, backgroundColor: gradient.pill },
  findings: { flexDirection: "row", alignItems: "center", backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, borderRadius: radius.lg, paddingVertical: space.md, paddingHorizontal: space.sm },
  finding: { flex: 1, alignItems: "center", gap: 3, paddingVertical: 4, borderRadius: radius.md },
  findingActive: { backgroundColor: palette.primarySoft },
  findingValueRow: { flexDirection: "row", alignItems: "flex-end", gap: 3 },
  findingDivider: { width: 1, height: 34, backgroundColor: palette.border },
  heroPill: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", marginTop: space.sm, backgroundColor: gradient.pill, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  heroDot: { width: 8, height: 8, borderRadius: 4 },
});
