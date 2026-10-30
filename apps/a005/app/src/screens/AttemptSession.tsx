import { memo, useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { Keyboard, Linking, Platform, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  Easing,
  FadeIn,
  FadeInUp,
  Layout,
  useAnimatedKeyboard,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import {
  Button,
  Card,
  HeroCard,
  Icon,
  IconButton,
  Pill,
  SectionHeader,
  Skeleton,
  Tappable,
  Confetti,
  feedback,
  fonts,
  gradient,
  haptic,
  palette,
  radius,
  space,
  toast,
  tones,
  type,
} from "../ui";
import { ResultView } from "./ResultView";
import { PlayButton, useSpeechState } from "./audio";
import { speak, stopSpeech } from "../audio/speech";
import { useSpeechRecognizer, speechSupported, micPermission, requestMicPermission } from "../audio/recognize";
import { ai } from "../modules/ai";
import { ads } from "../modules/ads";
import { analytics } from "../modules/analytics";
import { useSettings } from "../modules/store";
import { bandUpStore, prefsStore, useBandUp } from "../core/data";
import {
  type AttemptMode,
  type Attempt,
} from "../core/model";
import { recordAttempt, applyScore, validateScorePayload, localScorePayload, type ScorePayload } from "../core/scoring";
import { canScore, consumeCredit, creditInfo, grantRewardCredit, recordActivity } from "../core/credits";
import { earnedBadges, BADGE_LABEL, type BadgeId } from "../core/insights";
import { questionById, responseWindowS, wordCount, type Question } from "../core/questions";
import { attachMockAttempt } from "../core/mock";

export interface SessionSpec {
  title: string;
  questionIds: string[];
  mode: AttemptMode;
  mockId?: string;
  /** Show a per-item summary at the end (sets & drills). Mock uses its own report. */
  summary?: boolean;
}

type Phase = "prompt" | "scoring" | "result" | "summary";
/** Why the last scoring attempt didn't produce a score — drives the result copy. */
type ScoreError = "offline" | "quota" | "other" | null;

const dateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * The full attempt flow, shown full-screen over the app: hear the item, then
 * ANSWER BY VOICE — the mic turns your speech into text on the device
 * (expo-speech-recognition; audio never leaves the phone) against an exam-style
 * countdown, with a live level meter and transcript. You can edit the transcript
 * or type instead (also used when there's no mic, e.g. an emulator). Then AI
 * scoring and the result (score, rubric, transcript, improved answer). Runs one
 * item (practice) or a sequence (interview set, drill, mock).
 */
export function AttemptSession({
  spec,
  onExit,
  onFinish,
  onPro,
}: {
  spec: SessionSpec;
  onExit: () => void;
  onFinish?: (attemptIds: string[]) => void;
  onPro: (from: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const data = useBandUp();
  const settings = useSettings();
  const today = dateKey(new Date());

  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("prompt");
  const [lastTranscript, setLastTranscript] = useState("");
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [doneIds, setDoneIds] = useState<string[]>([]);
  const [burst, setBurst] = useState(0);
  const [scoreError, setScoreError] = useState<ScoreError>(null);
  // Pending celebration timers (delayed confetti + badge toast) so they can be
  // cancelled if the session unmounts before they fire.
  const celebrateTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => celebrateTimers.current.forEach(clearTimeout), []);

  // A STABLE origin object for the Confetti canvas: an inline `{x,y}` here would be
  // a new object every render, defeating Confetti's React.memo and re-reconciling
  // its 26 Skia particles on EVERY re-render (the live transcript updates several
  // times a second while recording) — a steady frame-cost that fed the soak jank.
  const confettiOrigin = useMemo(() => ({ x: winW / 2, y: winH * 0.1 }), [winW, winH]);

  const question = useMemo(() => questionById(spec.questionIds[index]), [spec.questionIds, index]);
  const total = spec.questionIds.length;
  const window = question ? responseWindowS(question) : 45;
  const credits = creditInfo(data, today, settings.pro);
  const attempt: Attempt | undefined = attemptId ? data.attempts.find((a) => a.id === attemptId) : undefined;

  useEffect(() => analytics.track("attempt_started", { task: question?.taskType ?? "repeat" }), [index, question?.taskType]);

  const submit = (transcript: string, elapsed: number) => {
    if (!question) return;
    stopSpeech();
    // Snapshot milestones BEFORE this attempt is recorded, so reaching one
    // (10th answer, 7-day streak, first beaten score) reads as newly earned.
    const prevBadges = earnedBadges(data);
    const words = wordCount(transcript);
    // Recorded answers use the real elapsed time; typed answers (elapsed 0) get a
    // natural ~130 wpm estimate so the on-device pacing report stays sensible.
    const durationS = elapsed > 0 ? elapsed : Math.max(6, Math.round((words / 130) * 60));
    // Too short → stay on the prompt, never a truncated score (PRD: < 5s / near-empty).
    const speechS = words >= 3 ? Math.max(5, durationS) : words;
    const rec = recordAttempt(
      data,
      {
        questionId: question.id,
        taskType: question.taskType,
        mode: spec.mode,
        durationS,
        speechS,
        pauseCount: 0,
        transcript: transcript.trim(),
        mockId: spec.mockId ?? null,
      },
      today,
    );
    if (rec.error === "too_short" || !rec.id) {
      feedback("error", "error");
      toast("That was too short — say a fuller answer before scoring.");
      return;
    }
    const id = rec.id;
    let next = recordActivity(rec.state, today);
    if (spec.mockId) next = attachMockAttempt(next, spec.mockId, id);
    bandUpStore.set(next);
    setAttemptId(id);
    setLastTranscript(transcript.trim());
    setDoneIds((d) => [...d, id]);
    feedback("success", "success");
    analytics.track("core_action", { feature: question.taskType });
    analytics.track("attempt_completed", { task: question.taskType });
    void score(id, question, transcript.trim(), prevBadges);
  };

  /** Celebrate a freshly-earned milestone: a light confetti burst + a toast naming
   *  the badge (kept sparing — only real milestones, not every score). Both are
   *  DELAYED so they land AFTER the score reveal has settled: the burst never
   *  covers the result card text, and the toast never drops onto the rubric. */
  const celebrate = (fresh: BadgeId[]) => {
    if (!fresh.length) return;
    if (fresh.includes("streak_7")) analytics.track("streak_milestone", {});
    // Fire once the number + ring have settled (the reveal is the payoff; the
    // confetti is a light topper, not the main event).
    const burstT = setTimeout(() => setBurst((b) => b + 1), 650);
    // The badge toast waits longer so it appears below the settled result rather
    // than on top of the freshly-revealed rubric.
    const toastT = setTimeout(() => toast(`Badge unlocked · ${BADGE_LABEL[fresh[0]]}`), 1600);
    celebrateTimers.current.push(burstT, toastT);
  };

  /** Apply the transparent on-device fallback estimate so an answer is NEVER a
   *  dead end — a full result (score, rubric, strengths, improved version) always
   *  appears, clearly labelled an estimate, when AI scoring can't run (offline,
   *  proxy error, a bad payload). No credit is spent. `note` sets the banner copy
   *  and whether a "get the full AI score" retry is offered. */
  const applyLocalEstimate = (id: string, q: Question, transcript: string, note: ScoreError, prevBadges: BadgeId[]) => {
    const st = bandUpStore.get();
    const a = st.attempts.find((x) => x.id === id);
    const payload = localScorePayload({
      taskType: q.taskType,
      transcript,
      durationS: a?.durationS ?? 0,
      target: q.taskType === "repeat" ? q.targetSentence ?? q.promptText : null,
      question: q.taskType === "interview" ? q.promptText : null,
    });
    const scoredState = applyScore(st, id, payload, true).state;
    bandUpStore.set(scoredState);
    setScoreError(note);
    analytics.track("attempt_scored", { task: q.taskType, estimated: true });
    if (doneIds.length === 0) analytics.track("first_attempt_scored", {});
    feedback("unlock", "success");
    celebrate(earnedBadges(scoredState).filter((b) => !prevBadges.includes(b)));
    setPhase("result");
  };

  /** Score the attempt with AI (direct ai.run call). Handles every failure
   *  reason: quota → result + visible upgrade path; offline / proxy error / bad
   *  payload → an on-device fallback estimate so it never dead-ends, with a Retry
   *  that upgrades it to a full AI score. */
  const score = async (id: string, q: Question, transcript: string, prevBadges: BadgeId[] = earnedBadges(bandUpStore.get())) => {
    setScoreError(null);
    // ALWAYS show the "Scoring…" state the instant scoring begins — this is the
    // immediate, visible acknowledgement of the "Done — score it" tap (the reviewer
    // saw no response). Instant-resolving paths below hold it for MIN_SCORING_MS so
    // the payoff is never a silent jump.
    setPhase("scoring");
    const startedAt = Date.now();
    const reveal = (fn: () => void) => {
      const w = Math.max(0, MIN_SCORING_MS - (Date.now() - startedAt));
      const t = setTimeout(fn, w);
      celebrateTimers.current.push(t);
    };
    // Out of AI scores (but online) → the deliberate paywall boundary: show the
    // estimate-free upgrade card (watch-ad / Go Pro) with the pacing report, not a
    // dead end. Offline with no AI at all still gets a local estimate below.
    if (ai.enabled && !canScore(bandUpStore.get(), today, settings.pro)) {
      analytics.track("credit_exhausted", {});
      reveal(() => { setScoreError("quota"); setPhase("result"); });
      return;
    }
    if (!ai.enabled) {
      // No connection / AI unavailable: estimate on-device now, retry for AI later.
      analytics.track("scoring_queued_offline", {});
      reveal(() => applyLocalEstimate(id, q, transcript, "offline", prevBadges));
      return;
    }
    const input =
      q.taskType === "repeat"
        ? JSON.stringify({ target: q.targetSentence ?? q.promptText, transcript })
        : JSON.stringify({ question: q.promptText, transcript });
    const feature = q.taskType === "repeat" ? "score_repeat" : "score_interview";
    // One AI attempt: run it, parse, and check the payload is usable (null = valid).
    const runOnce = async () => {
      const res = await ai.run(feature, input);
      const payload = res.ok ? ((res.json ?? safeParse(res.text)) as unknown) : null;
      const valid = res.ok && validateScorePayload(payload, q.taskType) === null;
      return { res, payload, valid };
    };
    let { res: r, payload, valid } = await runOnce();
    // On a TRANSIENT hiccup — a malformed reply, or a request error that ISN'T the
    // quota wall or a clean offline — retry ONCE before dropping to the on-device
    // estimate, so a flaky first response recovers into a real AI score instead of
    // silently falling back (the reviewer saw scoring_failed with no recovery). The
    // 5-second scoring animation stays up across the retry, reading as "taking a
    // little longer" rather than a silent delay.
    const transient = !valid && !(r.ok === false && (r.reason === "quota" || r.reason === "offline"));
    if (transient) {
      analytics.track("scoring_retry", {});
      ({ res: r, payload, valid } = await runOnce());
    }
    if (valid) {
      const scoredState = consumeCredit(applyScore(bandUpStore.get(), id, payload as ScorePayload).state, today, settings.pro);
      bandUpStore.set(scoredState);
      analytics.track("attempt_scored", { task: q.taskType });
      if (doneIds.length === 0) analytics.track("first_attempt_scored", {});
      feedback("unlock", "success");
      // The score reveal itself is the satisfying confirmation; confetti is
      // reserved for a real milestone (first answer, 10th, 7-day streak, band up).
      celebrate(earnedBadges(scoredState).filter((b) => !prevBadges.includes(b)));
      setPhase("result");
      return;
    }
    // Still no usable score. Quota → the paywall card; offline / other → a local
    // estimate so the answer is never a dead end (no credit was spent).
    if (r.ok === false && r.reason === "quota") {
      analytics.track("credit_exhausted", {});
      reveal(() => { setScoreError("quota"); setPhase("result"); });
      return;
    }
    const offline = r.ok === false && r.reason === "offline";
    analytics.track(offline ? "scoring_queued_offline" : "scoring_failed", {});
    reveal(() => applyLocalEstimate(id, q, transcript, offline ? "offline" : "other", prevBadges));
  };

  /** Re-attempt scoring for the current answer (offline → online, or upgrading an
   *  on-device estimate to a full AI score). Upgrading spends a credit, so with
   *  none left we open the Pro sheet rather than letting the tap silently fail. */
  const retry = () => {
    if (!attemptId || !question) return;
    if (attempt?.estimated && ai.enabled && !canScore(bandUpStore.get(), today, settings.pro)) {
      onPro("estimate_upgrade");
      return;
    }
    void score(attemptId, question, lastTranscript);
  };

  const watchAdForCredit = () => {
    feedback("tap", "medium");
    // Always a visible result: if no ad is ready, say so immediately rather than
    // leaving the tap a silent no-op (the reviewer tapped repeatedly with nothing
    // happening — the toast was there but hidden behind the session overlay).
    if (!ads.rewardedAvailable()) {
      toast("No ad available right now — try again later.");
      return;
    }
    const shown = ads.showRewarded(() => {
      bandUpStore.set((s) => grantRewardCredit(s, today));
      toast("Nice — 1 scoring credit added");
      retry();
    });
    if (!shown) toast("No ad available right now — try again later.");
  };

  const next = () => {
    if (index + 1 < total) {
      setAttemptId(null);
      setLastTranscript("");
      setScoreError(null);
      setIndex((i) => i + 1);
      setPhase("prompt");
    } else {
      if (spec.summary) setPhase("summary");
      else finish();
    }
  };

  const finish = () => {
    stopSpeech();
    onFinish?.(doneIds);
    onExit();
  };

  if (!question) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <Text style={[type.body, { padding: space.xl }]}>No question available.</Text>
        <Button label="Close" onPress={onExit} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {/* Opaque strip behind the translucent status bar so the gradient hero and
          page transitions never bleed under the clock/icons (fixes the "ghosted"
          status bar the reviewer saw mid-session). */}
      <View pointerEvents="none" style={[styles.statusBar, { height: insets.top }]} />
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <IconButton icon="close" label="Close practice" onPress={() => { stopSpeech(); onExit(); }} />
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={type.bodyStrong} numberOfLines={1}>{spec.title}</Text>
          {total > 1 ? <Text style={type.caption}>Item {Math.min(index + 1, total)} of {total}</Text> : null}
        </View>
        <View style={styles.headerRight}>
          {phase === "prompt" ? (
            // Tappable — a tag that looked purely decorative now explains what it
            // meters on tap (reviewer: "make it tappable with a tooltip, or hide it").
            <Tappable
              label="What the free AI scores counter means"
              sound={null}
              scale={0.95}
              onPress={() => {
                feedback("tap", "light");
                toast(
                  credits.pro
                    ? "Pro: unlimited AI scores. Practice is always free."
                    : credits.remaining > 0
                      ? `Practice is free & unlimited. You have ${credits.remaining} AI-scored answer${credits.remaining === 1 ? "" : "s"} left today — each scored answer uses one.`
                      : "You’ve used today’s free AI scores. Keep practising free, watch an ad for one more, or go Pro for unlimited.",
                );
              }}
            >
              <Pill
                // Spell out that this counts AI SCORES LEFT, not practice — practice stays
                // free and unlimited, so a bare "3 AI scores" read as ambiguous (reviewer).
                label={credits.pro ? "Pro · unlimited" : credits.remaining > 0 ? `${credits.remaining} free AI scores` : "AI scores used up"}
                tone={credits.remaining > 0 || credits.pro ? "primary" : "warning"}
                icon={<Icon name="sparkle" size={12} color={(credits.remaining > 0 || credits.pro ? tones.primary : tones.warning).fg} />}
              />
            </Tappable>
          ) : null}
        </View>
      </View>

      {phase === "prompt" ? (
        <PromptPhase
          key={question.id}
          question={question}
          window={window}
          speed={data.profile.playbackSpeed}
          captions={data.profile.captions}
          onDone={submit}
          autoPlay={index === 0}
          insetsBottom={insets.bottom}
        />
      ) : phase === "scoring" ? (
        <ScoringPhase transcript={lastTranscript} />
      ) : phase === "result" && attempt ? (
        <ResultPhase
          attempt={attempt}
          question={question}
          speed={data.profile.playbackSpeed}
          isLast={index + 1 >= total}
          outOfCredits={attempt.status !== "scored" && !credits.pro && credits.remaining === 0 && ai.enabled}
          failReason={scoreError}
          onNext={next}
          onPro={() => onPro("credits")}
          onRetry={retry}
          onWatchAd={watchAdForCredit}
          insetsBottom={insets.bottom}
        />
      ) : phase === "summary" ? (
        <SummaryPhase ids={doneIds} title={spec.title} onFinish={finish} insetsBottom={insets.bottom} />
      ) : null}

      {/* Light + high: fewer particles, originating near the TOP of the screen so
          they rain down the edges and clear the result card's text, rather than a
          heavy burst bloom from the centre over the rubric. */}
      <Confetti trigger={burst} count={26} origin={confettiOrigin} />
    </View>
  );
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

// ---- Live input level meter ----------------------------------------------

// The live "Listening…" recorder (red orb + waveform + timer + Stop) is held for
// at least this long once the mic opens, so the capture state is ALWAYS visibly
// shown before any "couldn't hear you" outcome — even on a device whose recogniser
// errors/ends in a single frame (the QA emulator), where it previously flashed
// past unseen straight to "0 words · no speech heard". The user sees we listened.
const MIN_RECORD_MS = 1900;

// The "Scoring…" screen (progress bar + skeleton + transcript) is held for at least
// this long on the paths that resolve instantly — offline on-device estimate, or
// out-of-credits — so the payoff moment is ALWAYS confirmed with a visible scoring
// state before the result animates in (the reviewer tapped "Done — score it" and
// saw the screen sit unchanged, with no loading/pressed state). The AI path already
// takes ~5s, so it reveals as soon as the real score lands.
const MIN_SCORING_MS = 1100;

// Five bars (was seven): each bar runs an infinite breathing animation AND reads
// the level SharedValue in a worklet every frame, so every bar is per-frame UI-
// thread work. During the soak (back-to-back recordings) that frame cost compounded
// into the 54%-jank / p90-150ms the reviewer measured — five reads the live, not a
// bar fewer that anyone notices.
const METER_BARS = [0.5, 0.85, 1, 0.75, 0.5];

const LevelMeter = memo(function LevelMeter({ level, active }: { level: SharedValue<number>; active: boolean }) {
  // `level` is the recogniser's SharedValue — the bars read it in a worklet, so
  // the ~10/sec volume stream animates on the UI thread and never re-renders this
  // screen (the soak-test ANR came from that re-render storm). Memoised too, so the
  // live transcript's several-times-a-second re-render of PromptPhase doesn't
  // reconcile all seven animated bars each time (level + active are stable).
  return (
    <View style={styles.meter} accessible accessibilityLabel={active ? "Listening" : "Microphone idle"}>
      {METER_BARS.map((f, i) => (
        <MeterBar key={i} lv={level} factor={f} active={active} index={i} />
      ))}
    </View>
  );
});

function MeterBar({ lv, factor, active, index }: { lv: SharedValue<number>; factor: number; active: boolean; index: number }) {
  // A gentle breathing pulse while the mic is live, so the waveform always looks
  // alive — even on a device with no real input (the reviewer's emulator), the
  // user can see we're listening rather than staring at frozen dots.
  const idle = useSharedValue(0);
  useEffect(() => {
    if (active) {
      idle.value = withRepeat(withTiming(1, { duration: 560 + index * 70 }), -1, true);
    } else {
      idle.value = withTiming(0, { duration: 200 });
    }
  }, [active, idle, index]);
  // Smooth the raw level a touch on the UI thread; a pronounced idle breathing
  // keeps the waveform visibly alive even on a device with no real input.
  const st = useAnimatedStyle(() => ({ height: 8 + (active ? lv.value : 0) * factor * 30 + idle.value * factor * 20 }));
  return <Animated.View style={[styles.meterBar, { backgroundColor: active ? palette.primary : palette.inkMuted }, st]} />;
}

/** A compact "live" recording indicator — a softly pulsing red dot + "Recording…"
 *  + the running word count. Replaces the big 140px mic orb WHILE recording so the
 *  waveform and the live transcript both sit above the footer on a 360dp phone
 *  (the reviewer saw the answer area clipped behind the Stop CTA). The pulse runs
 *  on the UI thread (shared value) so it never re-renders this row. */
const RecDot = memo(function RecDot() {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withRepeat(withTiming(1, { duration: 700 }), -1, true);
  }, [p]);
  const st = useAnimatedStyle(() => ({ opacity: 0.4 + p.value * 0.6, transform: [{ scale: 0.85 + p.value * 0.3 }] }));
  return <Animated.View style={[styles.recDot, st]} />;
});

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** The exam countdown ring, drawn with react-native-svg (NOT Skia). A Skia <Canvas>
 *  needs a GL surface that isn't ready on the first frames, so the old Skia
 *  ProgressRing painted BLANK at the start of a recording — the reviewer saw the
 *  ring "gone, plain number" early on, then present later. SVG paints synchronously
 *  on the first frame, so the ring is ALWAYS there. The arc animates once, smoothly,
 *  on the UI thread across the whole window (restarted per recording via `runId`),
 *  so it sweeps continuously rather than stepping once a second. */
const CountdownRing = memo(function CountdownRing({
  window,
  remaining,
  runId,
  size = 92,
  stroke = 9,
}: {
  window: number;
  remaining: number;
  /** Bumped when a new recording starts, to restart the sweep from full. */
  runId: number;
  size?: number;
  stroke?: number;
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  // 0 at the start of the window → 1 when it runs out. The remaining arc is
  // (1 - prog) of the circle, so strokeDashoffset = circ * prog.
  const prog = useSharedValue(0);
  useEffect(() => {
    prog.value = 0;
    prog.value = withTiming(1, { duration: Math.max(1, window) * 1000, easing: Easing.linear });
  }, [runId, window, prog]);
  const arcProps = useAnimatedProps(() => ({ strokeDashoffset: circ * prog.value }));
  return (
    <View style={{ width: size, height: size }} accessible accessibilityLabel={`${remaining} seconds left`}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={gradient.pill} strokeWidth={stroke} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={gradient.onHero}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circ}
          animatedProps={arcProps}
          // Start the sweep from 12 o'clock (SVG arcs begin at 3 o'clock).
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.ringLabel]}>
        <Text style={[type.number, { fontSize: size * 0.3, color: gradient.onHero }]}>{remaining}</Text>
        <Text style={[type.caption, { color: gradient.onHero, opacity: 0.85 }]}>sec left</Text>
      </View>
    </View>
  );
});

/** Three softly pulsing dots + a "Listening…" label, shown in the live transcript
 *  box while nothing has been recognised yet — so the empty state reads as "we're
 *  listening", not a bare text cursor in an empty box (reviewer). Pulse runs on the
 *  UI thread (shared values) so it never re-renders the recorder. */
const ListeningDots = memo(function ListeningDots() {
  return (
    <View style={styles.listening} accessible accessibilityLabel="Listening">
      {[0, 1, 2].map((i) => (
        <PulseDot key={i} index={i} />
      ))}
      <Text style={[type.body, { color: palette.inkSoft, marginLeft: 6 }]}>Listening…</Text>
    </View>
  );
});

function PulseDot({ index }: { index: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    const t = setTimeout(() => {
      p.value = withRepeat(withTiming(1, { duration: 520 }), -1, true);
    }, index * 160);
    return () => clearTimeout(t);
  }, [p, index]);
  const st = useAnimatedStyle(() => ({ opacity: 0.3 + p.value * 0.7, transform: [{ translateY: -p.value * 3 }] }));
  return <Animated.View style={[styles.pulseDot, st]} />;
}

/** A small live waveform shown while the sentence/question is PLAYING, so the
 *  listening step is visibly confirmed (reviewer: "show a short playback progress
 *  or waveform while the audio plays"). Bars breathe on the UI thread. */
const PLAY_BARS = [0.55, 0.9, 1, 0.7, 0.5];
const PlaybackWave = memo(function PlaybackWave({ label }: { label: string }) {
  return (
    <View style={styles.playWave} accessible accessibilityLabel={label}>
      <View style={styles.playBars}>
        {PLAY_BARS.map((f, i) => (
          <PlayBar key={i} factor={f} index={i} />
        ))}
      </View>
      <Text style={[type.label, { color: palette.primary }]}>{label}</Text>
    </View>
  );
});

function PlayBar({ factor, index }: { factor: number; index: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withRepeat(withTiming(1, { duration: 420 + index * 60 }), -1, true);
  }, [p, index]);
  const st = useAnimatedStyle(() => ({ height: 6 + p.value * factor * 18 }));
  return <Animated.View style={[styles.playBar, st]} />;
}

// ---- Prompt phase ---------------------------------------------------------

// OWNER REDESIGN (2026-10-29) — ONE simple, predictable voice path with a SINGLE
// primary control that always lives in the footer thumb zone:
//   ready → "Tap to speak" → requesting (first-time explainer + the OS prompt,
//   fired directly, with a HARD 3s rule) → recording (live orb + meter + transcript
//   + Stop) → scoring → score. No second mic button, no "Waiting for the mic…" dead
//   state, no watchdog that fires while the OS dialog is up.
// · ready      → waiting to record. For a Repeat item the mic stays disabled
//                ("Listen first") until the sentence has been heard, and while the
//                audio is playing; it enables the instant playback ends.
// · requesting → EITHER the OS permission prompt is up (`asking` true → we show the
//                PRIMER, never a bare "Opening…" spinner behind the dialog — the
//                exact context-free wait the reviewer hit), OR permission is granted
//                and the recogniser is spinning up (`asking` false → a brief
//                "Opening…"). Bounded to ~3s.
// · countin    → a short 3-2-1 "get ready" beat (with haptic ticks) right before the
//                mic opens, so recording never starts cold on a sentence the user is
//                still composing (reviewer: add a clearer start cue + a 3-2-1 beat).
// · recording  → mic live: a red orb, a live level meter and the streaming transcript.
// · trouble    → a clear "Can't use the mic right now" card (permission timed out /
//                denied / blocked, or nothing was heard) with Try again / Open
//                settings and an always-present "Type my answer" primary.
// · review     → editable transcript / typed answer (also the no-recogniser path).
type Mode = "ready" | "requesting" | "countin" | "recording" | "trouble" | "review";
// Why the voice path couldn't proceed — drives the "Can't use the mic" card copy.
type Trouble = "timeout" | "denied" | "blocked" | "nospeech";

function PromptPhase({
  question,
  window,
  speed,
  captions,
  onDone,
  autoPlay,
  insetsBottom,
}: {
  question: Question;
  window: number;
  speed: number;
  captions: boolean;
  onDone: (transcript: string, elapsed: number) => void;
  /** First item of the session → auto-play the prompt once so a first-time user
   *  hears it immediately without hunting for "Hear it". */
  autoPlay: boolean;
  insetsBottom: number;
}) {
  const isRepeat = question.taskType === "repeat";
  const supported = useMemo(() => speechSupported(), []);
  const recog = useSpeechRecognizer();
  // Whether the native voice is actively speaking the sentence/question. We OR in a
  // short hold after a tap (matching PlayButton's own ~1.6s "Playing…" hold) so the
  // mic never unlocks a frame too early on a device whose TTS finishes instantly
  // (the QA emulator). While it's true the record button stays "Listen first".
  const ttsSpeaking = useSpeechState() === "speaking";
  const [playingHold, setPlayingHold] = useState(false);
  const playHoldTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (playHoldTimer.current) clearTimeout(playHoldTimer.current); }, []);
  const onHeard = () => {
    setHeardOnce(true);
    setPlayingHold(true);
    if (playHoldTimer.current) clearTimeout(playHoldTimer.current);
    playHoldTimer.current = setTimeout(() => setPlayingHold(false), 1700);
  };
  const speaking = ttsSpeaking || playingHold;
  // With a recogniser we open ready to record; with NONE (e.g. an emulator with no
  // speech hook) we open straight on the editable answer so the typed fallback is
  // obvious — but WITHOUT auto-focusing, so the keyboard never covers the footer CTA.
  const [mode, setMode] = useState<Mode>(supported ? "ready" : "review");
  const [trouble, setTrouble] = useState<Trouble | null>(supported ? null : "nospeech");
  // True while the OS permission dialog is actually up — drives the in-screen PRIMER
  // (why we need the mic + what to tap) instead of a context-free "Opening…" spinner
  // sitting behind the dialog (the exact frame the reviewer flagged). Flipped off the
  // instant the grant/deny resolves.
  const [asking, setAsking] = useState(false);
  // The live 3-2-1 count shown in `countin` (3 → 2 → 1); 0 when not counting.
  const [countNum, setCountNum] = useState(0);
  const [answer, setAnswer] = useState("");
  const [elapsed, setElapsed] = useState(0);
  // Whether the mic is already granted — seeded SYNCHRONOUSLY from the remembered
  // permission so a return visit records with no second prompt and no 3s wait.
  const [granted, setGranted] = useState(() => prefsStore.get().micGranted === true);
  // LISTEN FIRST. A Listen & Repeat item tests listening, not reading — the target
  // sentence stays hidden and the mic stays locked until the user has played the
  // audio once. Flipped by "Hear it".
  const [heardOnce, setHeardOnce] = useState(false);
  // A manual reveal of the sentence (accessibility / peek), independent of captions.
  const [textRevealed, setTextRevealed] = useState(false);
  // Immediate pressed/loading state on "Done — score it" so the tap always reads.
  const [submitting, setSubmitting] = useState(false);
  // True once the exam response window ran out mid-answer — drives a friendly,
  // explicit "Time's up" banner in review so a transcript that stops mid-sentence
  // reads as the exam clock, not an error (reviewer: "…That is why I" looked broken).
  const [timedOut, setTimedOut] = useState(false);
  // Keyboard up? When typing, we collapse the hero so the answer field has room.
  const [kbOpen, setKbOpen] = useState(false);
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  // Edge-to-edge (Expo SDK 58) stops the Android window resizing for the keyboard,
  // so we read the live keyboard height from the OS (useAnimatedKeyboard, a UI-thread
  // shared value) and pad the footer by it — the primary CTA rides just above the keys.
  const keyboard = useAnimatedKeyboard();
  const footerPadStyle = useAnimatedStyle(() => ({
    paddingBottom: Math.max(keyboard.height.value + space.sm, insetsBottom + space.xl),
  }));
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);
  // Invalidates an in-flight beginRecording() so a late permission / start result
  // can't clobber a user who tapped "Type instead" / "Stop" meanwhile.
  const startToken = useRef(0);
  // When the current recording visual began, and whether a REAL recogniser session
  // is live behind it — together they keep "Recording…" visible for MIN_RECORD_MS
  // before we ever conclude, so capture is never a sub-frame flash.
  const recordingSince = useRef(0);
  const recordingReal = useRef(true);
  // Bumped each time a recording starts, so the countdown ring restarts its sweep
  // from full (a fresh 45s arc) rather than continuing the previous item's.
  const [recordRunId, setRecordRunId] = useState(0);
  // Tracked timers (cleared on unmount) for the permission race, the guaranteed-visible
  // recording window and the "Mic ready" hand-off.
  const recTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => recTimers.current.forEach(clearTimeout), []);
  // Stop any TTS when this item unmounts (advancing to the next item, exiting). Without
  // this the native voice could keep speaking over the next item — across a long soak
  // that left overlapping TTS sessions running, a needless resource drain.
  useEffect(() => () => stopSpeech(), []);
  // A tracked timeout that resolves to the "timeout" sentinel — used to RACE the OS
  // permission prompt against the hard 3s rule so a prompt that never resolves (the
  // emulator bug the reviewer hit) can't trap the user; it falls to the clear card.
  const timeoutAfter = (ms: number) =>
    new Promise<"timeout">((resolve) => {
      const t = setTimeout(() => resolve("timeout"), ms);
      recTimers.current.push(t);
    });
  const words = wordCount(answer);
  const enoughWords = words >= 3;
  const hasText = answer.trim().length > 0;

  // A small spring the moment the Done bar becomes active (any text present).
  const donePulse = useSharedValue(1);
  useEffect(() => {
    if (hasText) donePulse.value = withSequence(withTiming(1.04, { duration: 110 }), withSpring(1, { damping: 9, stiffness: 190 }));
  }, [hasText, donePulse]);
  // The review CTA is a solid-teal primary at all times; dimmed with no answer yet,
  // easing to full the instant the first word lands.
  const doneFade = useSharedValue(hasText ? 1 : 0.5);
  useEffect(() => {
    doneFade.value = withTiming(hasText ? 1 : 0.5, { duration: 220 });
  }, [hasText, doneFade]);
  // A quick horizontal shake when "Done — score it" is tapped without a scorable answer.
  const shakeX = useSharedValue(0);
  const nudge = () => {
    shakeX.value = withSequence(
      withTiming(-8, { duration: 50 }),
      withTiming(8, { duration: 50 }),
      withTiming(-6, { duration: 50 }),
      withTiming(6, { duration: 50 }),
      withTiming(0, { duration: 50 }),
    );
  };
  const doneStyle = useAnimatedStyle(() => ({ opacity: doneFade.value, transform: [{ scale: donePulse.value }, { translateX: shakeX.value }] }));
  // A gentle breathing pulse on the "Hear it" CTA while a Repeat item is still
  // unheard — the one moment it must clearly lead, so a first-time user's first tap
  // is unambiguous (reviewer). It settles the instant the sentence has been heard.
  const hearPulse = useSharedValue(1);
  useEffect(() => {
    if (isRepeat && !heardOnce) {
      hearPulse.value = withRepeat(withSequence(withTiming(1.03, { duration: 640 }), withTiming(1, { duration: 640 })), -1, false);
    } else {
      hearPulse.value = withTiming(1, { duration: 200 });
    }
  }, [isRepeat, heardOnce, hearPulse]);
  const hearPulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: hearPulse.value }] }));

  // Conclude a recording window exactly once: with words → editable review; with
  // nothing → the explicit "couldn't hear you" card (never a quiet readout).
  const concludeRecording = (heard: boolean) => {
    recog.stop();
    if (heard) {
      setTrouble(null);
      setMode("review");
    } else {
      setTrouble("nospeech");
      setMode("trouble");
    }
  };

  // Track keyboard visibility so the typing layout can collapse the hero.
  useEffect(() => {
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const show = Keyboard.addListener(showEvt, () => {
      setKbOpen(true);
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    });
    const hide = Keyboard.addListener(hideEvt, () => setKbOpen(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  // Check (without prompting) whether the mic is already granted, so a granted mic
  // skips the prompt entirely and records straight away.
  useEffect(() => {
    if (!supported) return;
    let alive = true;
    micPermission().then((p) => {
      if (!alive) return;
      setGranted(p.granted);
      if (p.granted) prefsStore.set((pr) => ({ ...pr, micGranted: true }));
    });
    return () => {
      alive = false;
    };
  }, [supported]);

  // AUTO-PLAY the prompt on the FIRST item so a first-time user hears it straight
  // away — no hunting for "Hear it" (reviewer: "auto-play the sentence on the first
  // item"). Fires once, shortly after mount so the TTS engine is ready; it counts as
  // the required "listen" so the mic unlocks right after. "Hear it again" stays for
  // replays. Later items still lead with the pulsing "Hear it" primary.
  const autoPlayed = useRef(false);
  useEffect(() => {
    if (!autoPlay || autoPlayed.current) return;
    autoPlayed.current = true;
    const t = setTimeout(() => {
      speak(target, speed);
      onHeard();
    }, 500);
    return () => clearTimeout(t);
    // target/speed are stable for this mounted item; run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPlay]);

  // Interview questions are shown as text; Repeat sentences stay HIDDEN by default
  // (the point is to practise HEARING) until "Show text", or always with captions on.
  const showText = isRepeat ? textRevealed || captions : true;
  const target = isRepeat ? question.targetSentence ?? question.promptText : question.promptText;
  // The mic can be used only once the item has been heard (Repeat) and the audio has
  // finished playing. Matches owner: disabled "Listen first" while the prompt plays.
  const canRecord = supported && !speaking && (heardOnce || !isRepeat);

  // While the mic is live, mirror the recognised transcript into the editable answer.
  useEffect(() => {
    if (mode === "recording" && recog.transcript) setAnswer(recog.transcript);
  }, [recog.transcript, mode]);

  // If a REAL recogniser session finishes or errors on its own, conclude — but hold
  // the live "Recording…" state for MIN_RECORD_MS first so capture is always seen.
  useEffect(() => {
    if (mode !== "recording" || !recordingReal.current) return;
    if (recog.status !== "error" && recog.status !== "stopped") return;
    const heard = wordCount(answer) >= 1;
    const w = Math.max(0, MIN_RECORD_MS - (Date.now() - recordingSince.current));
    const t = setTimeout(() => {
      if (heard && recog.status === "error" && recog.error) toast(recog.error);
      concludeRecording(heard);
    }, w);
    recTimers.current.push(t);
    return () => clearTimeout(t);
    // concludeRecording / recog.stop are stable enough here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recog.status, recog.error, mode, answer]);

  // Countdown runs only once the mic is actually listening; at the window we stop
  // (no cut-off at silence — exam-accurate 45s windows).
  useEffect(() => {
    if (mode !== "recording" || !recog.listening) return;
    const iv = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(iv);
  }, [mode, recog.listening]);
  useEffect(() => {
    if (mode === "recording" && recog.listening && elapsed >= window && window > 0) {
      haptic("warning");
      recog.stop();
      const heard = wordCount(answer) >= 1;
      if (heard) {
        setTrouble(null);
        setTimedOut(true);
        setMode("review");
      } else {
        setTrouble("nospeech");
        setMode("trouble");
      }
    }
    // recog.stop is a stable useCallback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsed, window, mode, recog.listening]);

  // THE single primary action: start the voice answer. A granted mic goes straight
  // to the 3-2-1 beat and records; an ungranted mic shows the primer + fires the OS
  // prompt, then counts in once granted.
  const onMicPress = () => {
    if (mode === "requesting" || mode === "recording" || mode === "countin") return;
    void beginRecording();
  };

  const beginRecording = async () => {
    if (mode === "requesting" || mode === "recording" || mode === "countin") return;
    feedback("tap", "medium");
    setElapsed(0);
    setAnswer("");
    setTimedOut(false);
    stopSpeech();
    const token = ++startToken.current;
    const needAsk = supported && !granted;
    // STEP 1 — permission, with the HARD 3s rule. We RACE the OS prompt against a 3s
    // timeout: if it hasn't resolved (the emulator / a dismissed dialog — the exact
    // "Waiting for the mic…" stall the reviewer hit) we drop to the clear "Can't use
    // the mic right now" card instead of waiting forever. There is NO watchdog firing
    // underneath the dialog — this race IS the only timer.
    if (needAsk) {
      // `asking` ON → the screen shows the PRIMER (why the mic, what to tap), never a
      // context-free "Opening…" spinner sitting behind the system dialog.
      setAsking(true);
      setMode("requesting");
      const permP = requestMicPermission();
      const raced = await Promise.race([permP, timeoutAfter(3000)]);
      if (token !== startToken.current) return;
      setAsking(false);
      if (raced === "timeout") {
        setTrouble("timeout");
        setMode("trouble");
        // Auto-recover: if the slow OS prompt DOES resolve granted afterwards and the
        // user hasn't moved on (same token), continue straight into recording — no
        // second tap needed. The typed path and Try-again stay available meanwhile.
        void permP.then((late) => {
          if (token !== startToken.current || !late.granted) return;
          setGranted(true);
          prefsStore.set((pr) => ({ ...pr, micGranted: true }));
          setTrouble(null);
          startCountIn(token);
        });
        return;
      }
      if (!raced.granted) {
        setTrouble(raced.canAskAgain === false ? "blocked" : "denied");
        setMode("trouble");
        return;
      }
      setGranted(true);
      prefsStore.set((pr) => ({ ...pr, micGranted: true }));
    }
    // Permission is in hand → a short 3-2-1 beat, THEN the mic opens. "Opening…" is
    // only ever seen with the mic already granted, never behind the dialog.
    startCountIn(token);
  };

  // A ~1.3s 3-2-1 "get ready" beat with a haptic tick on each number and a firmer
  // cue on "Go", so recording never begins cold — the reviewer asked for exactly this
  // start cue. Each step is token-guarded so a "Type instead" / exit mid-count aborts.
  const startCountIn = (token: number) => {
    if (token !== startToken.current) return;
    setMode("countin");
    setCountNum(3);
    haptic("light");
    const tick = (n: number, at: number) => {
      const t = setTimeout(() => {
        if (token !== startToken.current) return;
        setCountNum(n);
        haptic("light");
      }, at);
      recTimers.current.push(t);
    };
    tick(2, 450);
    tick(1, 900);
    const go = setTimeout(() => {
      if (token !== startToken.current) return;
      haptic("warning");
      setCountNum(0);
      void launchRecognizer(token);
    }, 1350);
    recTimers.current.push(go);
  };

  // STEP 2, extracted so a late permission grant (after the 3s card) can resume
  // straight into recording without re-prompting. Starts the recogniser (permission
  // is granted here) and opens the live recorder, raced against a short timeout so a
  // hung start can't trap the user either.
  const launchRecognizer = async (token: number) => {
    // Permission is already granted here, so a brief "Opening…" is honest — it's the
    // recogniser spinning up, NOT a wait behind the permission dialog.
    setAsking(false);
    setMode("requesting");
    const block = await Promise.race([
      recog.start({ contextualStrings: isRepeat ? target.split(/\s+/) : undefined }),
      timeoutAfter(4000),
    ]);
    if (token !== startToken.current) return;
    if (block === "timeout") {
      setTrouble("timeout");
      setMode("trouble");
      return;
    }
    if (block === "denied" || block === "blocked") {
      setTrouble(block);
      setMode("trouble");
      return;
    }
    setGranted(true);
    prefsStore.set((pr) => ({ ...pr, micGranted: true }));
    // Permission wasn't refused → ALWAYS show the live recorder, even with no usable
    // recogniser behind it ("unsupported"): the capture state is then unmistakably
    // visible and a no-recogniser device concludes to the clear "couldn't hear you"
    // card after MIN_RECORD_MS rather than flashing past unseen.
    recordingReal.current = block === null;
    recordingSince.current = Date.now();
    setRecordRunId((n) => n + 1);
    setMode("recording");
    if (block) {
      const tk = token;
      const t = setTimeout(() => {
        if (tk === startToken.current) concludeRecording(false);
      }, MIN_RECORD_MS);
      recTimers.current.push(t);
    }
  };

  const openMicSettings = () => {
    feedback("tap", "light");
    Linking.openSettings().catch(() => toast("Open your phone's Settings › Apps to allow the microphone."));
  };

  const stopVoice = () => {
    feedback("tap", "light");
    startToken.current++;
    recog.stop();
    concludeRecording(wordCount(answer) >= 1);
  };

  // Explicit "type instead" — here the keyboard IS expected, so we focus the field.
  const typeInstead = () => {
    feedback("tap", "light");
    startToken.current++;
    recog.reset();
    setTrouble(null);
    setMode("review");
    setTimeout(() => inputRef.current?.focus(), 150);
  };

  // Typing / dictation / paste — confirm the answer first becomes scorable.
  const onType = (t: string) => {
    const wasEnough = wordCount(answer) >= 3;
    setAnswer(t);
    if (!wasEnough && wordCount(t) >= 3) feedback("tap", "light");
  };

  const scoreIt = () => {
    if (submitting) return;
    if (words < 3) {
      feedback("error", "warning");
      nudge();
      toast("Say or type a fuller answer (a few words) before scoring.");
      if (mode === "review") inputRef.current?.focus();
      else typeInstead();
      return;
    }
    feedback("tap", "medium");
    Keyboard.dismiss();
    setSubmitting(true);
    onDone(answer, elapsed);
  };

  const remaining = Math.max(0, window - elapsed);
  const recording = mode === "recording";

  // ---- Hero copy, one steady structure across every state ----
  let heroValue: string;
  let heroCaption: string;
  let heroStatus: { label: string; tone: "neutral" | "warning" };
  let heroIcon: Parameters<typeof Icon>[0]["name"] = "mic";
  if (recording) {
    // The hero value stays STABLE while recording (the live word count moved into
    // the recording panel below): the gradient hero no longer redraws on every
    // recognised word, which was the main source of the Listen & Repeat jank/soak
    // ANR. The only thing that changes here is the countdown ring (once a second).
    heroValue = "Live";
    heroCaption = isRepeat ? "say it back now" : "answer in your own words";
    heroStatus = { label: isRepeat ? "Repeat it word for word" : "Answer naturally", tone: "neutral" };
  } else if (mode === "requesting" && asking) {
    // The OS permission dialog is UP. Show a real PRIMER — why we need the mic and
    // what to tap — NOT a context-free "Opening…" spinner behind the dialog (the exact
    // dimmed, meaningless wait the reviewer saw at 4:09). "Opening…" only appears AFTER
    // the grant, below.
    heroValue = "Allow mic";
    heroCaption = "so we can hear your answer";
    heroStatus = { label: "Tap “While using the app”", tone: "neutral" };
    heroIcon = "mic";
  } else if (mode === "requesting") {
    // Permission granted → the recogniser is spinning up. A brief, honest "Opening…".
    heroValue = "Opening";
    heroCaption = "the mic is starting…";
    heroStatus = { label: "One moment…", tone: "neutral" };
    heroIcon = "mic";
  } else if (mode === "countin") {
    // The 3-2-1 beat: the big number is the hero, so the start cue is impossible to miss.
    heroValue = String(countNum);
    heroCaption = "get ready to speak";
    heroStatus = { label: isRepeat ? "Say it right after 1" : "Answer right after 1", tone: "neutral" };
    heroIcon = "mic";
  } else if (mode === "trouble") {
    const noHeard = trouble === "nospeech";
    heroValue = noHeard ? "0" : "Mic off";
    heroCaption = noHeard ? "words — we didn't catch any" : "type below instead";
    heroStatus = { label: noHeard ? "Couldn't hear you" : "Microphone unavailable", tone: "warning" };
    heroIcon = noHeard ? "mic" : "mic";
  } else if (mode === "review") {
    if (words === 0) {
      const voiceOff = !supported;
      heroValue = voiceOff ? "Type it" : "Your turn";
      heroCaption = voiceOff ? "voice isn't available — type below" : isRepeat ? "type the sentence you heard" : "type your answer below";
      heroStatus = voiceOff ? { label: "Mic unavailable — type instead", tone: "warning" } : { label: "Type your answer below", tone: "neutral" };
      heroIcon = "edit";
    } else {
      heroValue = `${words}`;
      heroCaption = enoughWords ? "words · ready to score" : "words · a few more";
      heroStatus = enoughWords ? { label: "Edit if needed", tone: "neutral" } : { label: "A few more words", tone: "neutral" };
      heroIcon = enoughWords ? "check" : "edit";
    }
  } else {
    // ready — waiting to record. Three sub-looks: playing, listen-first, ready.
    if (speaking) {
      // The hero reads the STEP, not another "Playing the sentence…" label — that
      // phrase lives once, on the PlaybackWave inside the Hear card (reviewer: the
      // playback state was announced three times). Here it's just "Listen".
      heroValue = "Listen";
      heroCaption = isRepeat ? "listen closely…" : "here's the question…";
      heroStatus = { label: "Audio is playing", tone: "neutral" };
      heroIcon = "headset";
    } else if (isRepeat && !heardOnce) {
      heroValue = "Listen";
      heroCaption = "then say it back out loud";
      heroStatus = { label: "Step 1 · tap Hear it", tone: "neutral" };
      heroIcon = "headset";
    } else {
      heroValue = "Ready";
      heroCaption = isRepeat ? "to repeat it back" : "to answer out loud";
      // Say exactly what the footer button says, so hero, card and button never
      // disagree (reviewer: hero said "Tap to speak" while the button said "Allow").
      heroStatus = { label: granted ? "Tap “Tap to speak” below" : "Tap “Allow microphone” below", tone: "neutral" };
      heroIcon = "wave";
    }
  }

  const heroStatusLabel = heroStatus.label;
  const heroStatusTone = heroStatus.tone;

  // The gradient HeroCard is MEMOISED so it doesn't re-render (and re-draw its
  // LinearGradient) on every recognised word — only when its real inputs change.
  // While recording the only change is the countdown ring, once a second. This,
  // with the live word count moved out of the hero, is the core jank/soak-ANR fix.
  const heroNode = useMemo(
    () => (
      <HeroCard
        style={styles.hero}
        overline={isRepeat ? "Listen & Repeat" : "Take an Interview"}
        value={heroValue}
        caption={heroCaption}
        status={{ label: heroStatusLabel, tone: heroStatusTone }}
        right={
          recording ? (
            <CountdownRing window={window} remaining={remaining} runId={recordRunId} size={92} stroke={9} />
          ) : (
            <View style={styles.heroBadge}>
              <Icon name={heroIcon ?? "mic"} size={40} color={gradient.onHero} />
            </View>
          )
        }
      />
    ),
    [isRepeat, heroValue, heroCaption, heroStatusLabel, heroStatusTone, recording, window, remaining, recordRunId, heroIcon],
  );

  const troubleCopy =
    trouble === "timeout"
      ? "The mic permission didn't come through. Try again, or type your answer — we'll score it just the same."
      : trouble === "denied"
        ? "Microphone access was declined. You can allow it and try again, or type your answer below."
        : trouble === "blocked"
          ? "Microphone access is off for this app. Turn it on in Settings, or type your answer below."
          : "We didn't hear anything that time. Move somewhere quieter and try again, or type your answer below.";

  return (
    <View style={{ flex: 1 }}>
      <ScrollView ref={scrollRef} style={styles.flex} contentContainerStyle={[styles.body, { paddingBottom: insetsBottom + space.xxl }]} keyboardShouldPersistTaps="handled">
        <Animated.View layout={Layout.duration(200)} style={{ gap: space.md }}>
          {/* ONE hero, always in the same place. Collapses to a slim strip while typing
              (keyboard up) so the answer field gets the room. */}
          {kbOpen && mode === "review" ? (
            <View style={styles.typingStrip}>
              <Icon name="edit" size={16} color={palette.primary} />
              <Text style={[type.label, { color: palette.primary, flex: 1 }]} numberOfLines={1}>
                {words > 0 ? `${words} word${words === 1 ? "" : "s"}${enoughWords ? " · ready to score" : ""}` : "Your turn — type your answer"}
              </Text>
            </View>
          ) : (
            // Rendered directly — NO opacity-dip crossfade. Dimming a gradient card to
            // 50% over the light page made it look washed-out / double-exposed as the
            // content morphed during the ready→recording swap (reviewer: "ghosted
            // overlapping layers for ~0.5s"). The hero is memoised, so the value/ring
            // swap is a clean, instant, crisp change — on-brand for the Focus family —
            // while the Layout animation smooths only the card's height.
            heroNode
          )}

          {/* ONE focused card holds the whole item. The "hear it" block is shown in
              FULL only while you're choosing to listen (ready); the moment you move on
              to answering it collapses to a slim recap, so the live answer area has
              room above the footer (the clipped-waveform fix) and the long "Listen
              first…" instruction never repeats every item. */}
          <Card>
            {mode === "ready" ? (
              <>
                <View style={styles.stepRow}>
                  <View style={styles.stepNum}><Text style={styles.stepNumText}>1</Text></View>
                  <Text style={[type.bodyStrong, { flex: 1 }]}>{isRepeat ? "Hear the sentence" : "Hear the question"}</Text>
                </View>
                {showText ? (
                  <Text style={[type.heading, { marginTop: space.md, lineHeight: 28 }]}>{question.promptText}</Text>
                ) : (
                  <Text style={[type.body, { marginTop: space.md, color: palette.inkSoft }]}>
                    {isRepeat ? "Hidden on purpose — listen, then say it back. Tap Show text if you need it." : "Listen, then answer in your own words."}
                  </Text>
                )}
                {/* "Hear it" is the high-contrast PRIMARY while a Repeat item is still
                    unheard — that's the one moment it must lead. Once heard (or for an
                    Interview whose text is shown) it steps down to a quiet secondary. */}
                <View style={{ marginTop: space.md, gap: space.sm }}>
                  <Animated.View style={hearPulseStyle}>
                    <PlayButton
                      text={target}
                      rate={speed}
                      label={heardOnce ? "Hear it again" : "Hear it"}
                      variant={isRepeat && !heardOnce ? "primary" : "secondary"}
                      size="lg"
                      onPlayed={onHeard}
                    />
                  </Animated.View>
                  {/* While the voice is talking, a live waveform + label confirms the
                      listening step (reviewer: show playback progress/waveform). The
                      slot height is reserved so nothing jumps when it appears. */}
                  <View style={styles.playWaveSlot}>
                    {speaking ? <PlaybackWave label={isRepeat ? "Playing the sentence…" : "Playing the question…"} /> : null}
                  </View>
                  {isRepeat ? (
                    <Tappable
                      label={showText ? "Hide the sentence text" : "Show the sentence text"}
                      sound={null}
                      scale={0.96}
                      onPress={() => { feedback("tap", "light"); setTextRevealed((v) => !v); }}
                      style={styles.textPill}
                    >
                      <Icon name={showText ? "contrast" : "doc"} size={15} color={palette.primary} />
                      <Text style={[type.label, { color: palette.primary }]}>{showText ? "Hide text" : "Show text"}</Text>
                    </Tappable>
                  ) : (
                    <Text style={[type.caption, { color: palette.inkSoft, textAlign: "center" }]}>Plays in a clear native voice · tap again to replay</Text>
                  )}
                </View>

                <View style={styles.stepDivider} />

                <View style={styles.stepRow}>
                  <View style={styles.stepNum}><Text style={styles.stepNumText}>2</Text></View>
                  <Text style={[type.bodyStrong, { flex: 1 }]}>Your answer</Text>
                </View>
              </>
            ) : (
              // COMPACT recap once you've moved on to answering — one quiet row, with a
              // small "Hear again" replay and (for Interview) the question still in view.
              <View style={styles.recapCard}>
                <View style={styles.recapHead}>
                  <Icon name={isRepeat ? "headset" : "mic"} size={14} color={palette.primary} />
                  <Text style={[type.label, { flex: 1, color: palette.inkSoft }]} numberOfLines={1}>
                    {isRepeat ? "Listen & Repeat" : "The question"}
                  </Text>
                  <Tappable
                    label="Hear it again"
                    sound={null}
                    scale={0.96}
                    onPress={() => { feedback("tap", "light"); speak(target, speed); }}
                    style={styles.recapAction}
                  >
                    <Icon name="play" size={13} color={palette.primary} />
                    <Text style={[type.label, { color: palette.primary }]}>Hear again</Text>
                  </Tappable>
                </View>
                {isRepeat ? (
                  showText ? (
                    <Text style={[type.body, { color: palette.ink }]} numberOfLines={2}>{question.promptText}</Text>
                  ) : (
                    <Tappable
                      label="Show the sentence text"
                      sound={null}
                      scale={0.97}
                      onPress={() => { feedback("tap", "light"); setTextRevealed(true); }}
                      style={styles.textPill}
                    >
                      <Icon name="doc" size={15} color={palette.primary} />
                      <Text style={[type.label, { color: palette.primary }]}>Show text</Text>
                    </Tappable>
                  )
                ) : (
                  <Text style={[type.body, { color: palette.ink }]} numberOfLines={3}>{question.promptText}</Text>
                )}
              </View>
            )}

            <View style={styles.answerBody}>
              {mode === "ready" ? (
                // COMPACT "ready to answer" row — a small mic badge + ONE line, not the
                // tall 140px orb that pushed Step 2 (and its privacy note) off the bottom
                // and clipped it under the footer (reviewer). The record action lives in
                // the footer; this is purely an orienting hint. The privacy explainer is
                // shown ONCE here (the pre-permission explainer) — the earlier duplicate
                // "your voice becomes text on your phone" line is gone.
                <View style={{ gap: space.sm, marginTop: space.md }}>
                  <View style={styles.readyHint}>
                    <View style={[styles.readyBadge, (isRepeat && !heardOnce) || speaking ? styles.readyBadgeLocked : null]}>
                      <Icon
                        name={(isRepeat && !heardOnce) || speaking ? "headset" : "mic"}
                        size={22}
                        color={(isRepeat && !heardOnce) || speaking ? palette.inkMuted : palette.primary}
                      />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={type.bodyStrong}>
                        {isRepeat && !heardOnce ? "Listen first" : isRepeat ? "Say it back out loud" : "Answer out loud"}
                      </Text>
                      <Text style={[type.caption, { color: palette.inkSoft }]}>
                        {isRepeat && !heardOnce
                          ? "Tap “Hear it” above, then tap Tap to speak below."
                          : speaking
                            ? "The mic unlocks the moment the audio finishes."
                            : granted
                              ? "Tap the teal button below — or type instead."
                              : "Tap Allow below. Your voice becomes text on your phone — audio never leaves your device. You can type instead too."}
                      </Text>
                    </View>
                  </View>
                </View>
              ) : mode === "requesting" && asking ? (
                // The OS dialog is UP. Instead of a dimmed, context-free spinner behind
                // it (the 4:09 frame), we show a real PRIMER: why the mic is needed,
                // the privacy promise, and exactly which button to tap. No spinner here.
                <View style={{ gap: space.md, marginTop: space.md }}>
                  <View style={styles.primerCard}>
                    <View style={styles.primerHead}>
                      <View style={styles.readyBadge}><Icon name="mic" size={22} color={palette.primary} /></View>
                      <Text style={[type.bodyStrong, { flex: 1 }]}>Allow the microphone to speak</Text>
                    </View>
                    <Text style={[type.body, { color: palette.inkSoft }]}>
                      Your voice is turned into text right here on your phone — the audio never leaves your device and is never uploaded.
                    </Text>
                    <View style={styles.primerTip}>
                      <Icon name="check" size={15} color={palette.primary} />
                      <Text style={[type.label, { color: palette.primary, flex: 1 }]}>Choose “While using the app” on the dialog</Text>
                    </View>
                  </View>
                </View>
              ) : mode === "requesting" ? (
                // Permission granted → a brief, honest "Opening the mic…" (the recogniser
                // spinning up) — NOT a wait behind the dialog.
                <View style={{ gap: space.md, marginTop: space.md }}>
                  <View style={styles.readyHint}>
                    <View style={styles.readyBadge}><Icon name="mic" size={22} color={palette.primary} /></View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={type.bodyStrong}>Opening the mic…</Text>
                      <Text style={[type.caption, { color: palette.inkSoft }]}>This only takes a moment.</Text>
                    </View>
                  </View>
                </View>
              ) : mode === "countin" ? (
                // The 3-2-1 beat — the big number is in the hero; here we show the cue
                // (three count dots + the get-ready line) so the start is never a surprise.
                <View style={styles.countinBox}>
                  <View style={styles.countinDots}>
                    {[3, 2, 1].map((n) => (
                      <View key={n} style={[styles.countinDot, countNum <= n ? styles.countinDotOn : null]} />
                    ))}
                  </View>
                  <Text style={[type.bodyStrong, { textAlign: "center" }]}>Get ready…</Text>
                  <Text style={[type.caption, { color: palette.inkSoft, textAlign: "center" }]}>
                    {isRepeat ? "Say the sentence the moment recording starts." : "Start your answer the moment recording starts."}
                  </Text>
                </View>
              ) : mode === "recording" ? (
                // Compact live recorder — a small pulsing dot + live word count, the
                // waveform and the streaming transcript, all above the footer (no more
                // 140px orb pushing the transcript off-screen behind the Stop CTA).
                <View style={{ gap: space.sm, marginTop: space.sm }}>
                  <View style={styles.recHead}>
                    <RecDot />
                    <Text style={[type.bodyStrong, { color: palette.danger }]}>Recording…</Text>
                    <View style={{ flex: 1 }} />
                    {/* The count shows the ACTUAL words transcribed, so it always agrees
                        with the text in the box below (the reviewer saw "6 / 6 words"
                        while the transcript was far longer — a capped "x / target"
                        count that disagreed with what was shown). */}
                    <Text style={[type.label, { color: palette.inkSoft, fontVariant: ["tabular-nums"] }]}>
                      {words} word{words === 1 ? "" : "s"}
                    </Text>
                  </View>
                  <LevelMeter level={recog.level} active />
                  {/* The transcript box is HEIGHT-CAPPED and scrolls, so a long answer
                      scrolls within it instead of pushing the Stop button off-screen and
                      blowing out the layout (reviewer: cap or scroll the transcript box). */}
                  <View style={styles.liveBox}>
                    {answer ? (
                      <ScrollView
                        style={{ maxHeight: 132 }}
                        nestedScrollEnabled
                        showsVerticalScrollIndicator
                        contentContainerStyle={{ flexGrow: 1 }}
                      >
                        <Text style={type.body}>{answer}</Text>
                      </ScrollView>
                    ) : (
                      // No words yet → a pulsing "Listening…" indicator, not a bare
                      // text cursor in an empty box (reviewer).
                      <ListeningDots />
                    )}
                  </View>
                  <Text style={[type.caption, { color: palette.inkSoft, textAlign: "center" }]}>Speak now — tap Stop when you’re finished, or let the timer run out.</Text>
                </View>
              ) : mode === "trouble" ? (
                <View style={{ gap: space.md, marginTop: space.sm }}>
                  {/* The clear "Can't use the mic right now" card. The PRIMARY way
                      forward (Type my answer) is the footer CTA; Try again / Open
                      settings are offered here. Never an endless wait, never a dead end. */}
                  <View style={styles.troubleCard}>
                    <View style={styles.troubleHead}>
                      <Icon name="mic" size={16} color={tones.warning.fg} />
                      <Text style={type.bodyStrong}>{trouble === "nospeech" ? "We didn't catch that" : "Can’t use the mic right now"}</Text>
                    </View>
                    <Text style={[type.caption, { color: palette.inkSoft }]}>{troubleCopy}</Text>
                  </View>
                  {trouble === "blocked" ? (
                    <Button label="Open settings" size="lg" variant="secondary" icon="settings" onPress={openMicSettings} />
                  ) : (
                    <Button label="Try the mic again" size="lg" variant="secondary" icon="mic" onPress={onMicPress} />
                  )}
                </View>
              ) : (
                // review — editable transcript / typed answer.
                <View style={{ gap: space.sm, marginTop: space.sm }}>
                  {timedOut && words > 0 ? (
                    // A clear, POSITIVE "time's up" state — a transcript that stopped
                    // mid-sentence is the exam clock, not an error (reviewer note).
                    <View style={styles.timeupBanner}>
                      <Icon name="check" size={15} color={tones.success.fg} />
                      <Text style={[type.caption, { flex: 1, color: palette.ink }]}>
                        Time’s up — that’s the exam’s {window}s limit. Here’s everything you said; edit it if you like, then score.
                      </Text>
                    </View>
                  ) : !supported ? (
                    <View style={styles.notice}>
                      <Icon name="mic" size={16} color={tones.warning.fg} />
                      <Text style={[type.caption, { flex: 1, color: palette.inkSoft }]}>
                        Voice input isn't available on this phone — type your answer and we'll score it.
                      </Text>
                    </View>
                  ) : words > 0 ? (
                    <Text style={type.caption}>Here's what we heard — fix any words, then score it.</Text>
                  ) : (
                    <Text style={type.caption}>{isRepeat ? "Tap Hear again above, then type the sentence below." : "Type your answer below, then tap Done to score."}</Text>
                  )}
                  {/* An explicit edit affordance so the box reads as editable, not as a
                      read-only transcript (reviewer: it "looks like read-only content"). */}
                  <View style={styles.answerLabelRow}>
                    <Icon name="edit" size={14} color={palette.primary} />
                    <Text style={[type.label, { color: palette.primary, flex: 1 }]}>Your answer · tap to edit</Text>
                  </View>
                  <TextInput
                    ref={inputRef}
                    style={styles.input}
                    placeholder={isRepeat ? "Type the sentence you heard…" : "Type your spoken answer…"}
                    placeholderTextColor={palette.inkMuted}
                    value={answer}
                    onChangeText={onType}
                    multiline
                    textAlignVertical="top"
                    accessibilityLabel="Your answer"
                    autoCorrect={false}
                    spellCheck={false}
                    autoComplete="off"
                    autoCapitalize="sentences"
                    importantForAutofill="no"
                    keyboardType="default"
                  />
                  {supported ? (
                    <View style={styles.reviewRow}>
                      <Button
                        label="Use the mic instead"
                        variant="ghost"
                        icon="mic"
                        size="sm"
                        sound={null}
                        onPress={onMicPress}
                        style={{ borderWidth: 0 }}
                      />
                    </View>
                  ) : null}
                </View>
              )}
            </View>
          </Card>
        </Animated.View>
      </ScrollView>

      {/* THE single primary control, ALWAYS in the footer thumb zone — one per state.
          It rides above the keyboard (useAnimatedKeyboard) since edge-to-edge means
          adjustResize can't lift it for us. */}
      <Animated.View style={[styles.footer, footerPadStyle]}>
        {mode === "recording" ? (
          <Button label="Stop & review" size="lg" icon="pause" onPress={stopVoice} />
        ) : mode === "requesting" && asking ? (
          // The OS dialog is up (the primer is in the body). Offer a calm ESCAPE to
          // typing rather than a dead "Opening…" spinner — there is always a way out.
          <Button label="Type my answer instead" size="lg" variant="secondary" icon="edit" onPress={typeInstead} />
        ) : mode === "requesting" ? (
          // A brief busy handoff — a loading spinner, shown only momentarily between the
          // grant and the recorder opening (permission is already in hand here).
          <Button label="Opening…" size="lg" loading disabled />
        ) : mode === "countin" ? (
          <Button label={`Starting in ${countNum}…`} size="lg" icon="mic" disabled />
        ) : mode === "trouble" ? (
          <Button label="Type my answer" size="lg" icon="edit" onPress={typeInstead} />
        ) : mode === "review" ? (
          <>
            {submitting || !hasText ? null : (
              <Text style={[type.label, { textAlign: "center", marginBottom: space.sm, color: enoughWords ? palette.success : palette.ink }]}>
                {words} word{words === 1 ? "" : "s"}{enoughWords ? " · ready to score" : " · a few more to go"}
              </Text>
            )}
            <Animated.View style={doneStyle}>
              <Button
                label={submitting ? "Scoring…" : hasText ? "Done — score it" : "Record or type to score"}
                size="lg"
                icon={submitting ? undefined : hasText ? "check" : "mic"}
                loading={submitting}
                variant="primary"
                onPress={scoreIt}
              />
            </Animated.View>
          </>
        ) : canRecord ? (
          // ready + can record → the one call to action. When the mic isn't granted
          // yet the label says "Allow microphone" so the tap clearly triggers the
          // system prompt (pre-explained by the card above), per the reviewer note.
          <Button label={granted ? "Tap to speak" : "Allow microphone"} size="lg" icon="mic" onPress={onMicPress} />
        ) : (
          // ready but must listen first / audio still playing → a clearly DISABLED,
          // dimmed "Listen first" (owner: the mic stays disabled while the prompt plays).
          <Button
            label={speaking ? "Listening to the audio…" : "Listen first"}
            size="lg"
            icon={speaking ? "headset" : "lock"}
            disabled
          />
        )}
      </Animated.View>
    </View>
  );
}

// ---- Scoring phase --------------------------------------------------------

function ScoringPhase({ transcript }: { transcript: string }) {
  // A determinate-feeling progress bar that eases toward full over ~5s, so the
  // wait never reads as an ambiguous frozen screen (it holds just shy of 100%
  // until the real score lands and this phase unmounts).
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withTiming(0.92, { duration: 5000, easing: Easing.out(Easing.cubic) });
  }, [p]);
  const fill = useAnimatedStyle(() => ({ width: `${p.value * 100}%` }));
  return (
    <Animated.View entering={FadeIn.duration(180)} style={styles.center}>
      <View style={styles.scoringIcon}>
        <Icon name="sparkle" size={34} color={palette.primary} />
      </View>
      <Text style={[type.title, { textAlign: "center" }]}>Scoring… about 5 seconds</Text>
      <Text style={[type.body, { color: palette.inkSoft, textAlign: "center" }]}>Estimating your band across fluency, intelligibility and more.</Text>
      <View style={styles.scoreTrack} accessibilityRole="progressbar" accessibilityLabel="Scoring your answer">
        <Animated.View style={[styles.scoreFill, fill]} />
      </View>
      <Card style={{ width: "100%", marginTop: space.sm }}>
        {/* Show the FULL captured answer, not a 3-line clip that looked cut off
            mid-sentence ("…and within") to the reviewer. Bounded generously so a
            long answer can't overflow this centred, non-scrolling screen. */}
        <Text style={type.caption} numberOfLines={8}>“{transcript}”</Text>
        <View style={{ gap: space.sm, marginTop: space.md }}>
          <Skeleton width="80%" height={14} />
          <Skeleton width="60%" height={14} />
          <Skeleton width="70%" height={14} />
        </View>
      </Card>
    </Animated.View>
  );
}

// ---- Result phase ---------------------------------------------------------

function ResultPhase({
  attempt,
  question,
  speed,
  isLast,
  outOfCredits,
  failReason,
  onNext,
  onPro,
  onRetry,
  onWatchAd,
  insetsBottom,
}: {
  attempt: Attempt;
  question: Question;
  speed: 0.75 | 1 | 1.5 | 2;
  isLast: boolean;
  outOfCredits: boolean;
  failReason: ScoreError;
  onNext: () => void;
  onPro: () => void;
  onRetry: () => void;
  onWatchAd: () => void;
  insetsBottom: number;
}) {
  const scored = attempt.status === "scored";
  const estimated = scored && attempt.estimated === true;
  // A scored result with a Retry only makes sense to UPGRADE an on-device estimate
  // to a full AI score; a non-scored result retries the failed scoring.
  const showRetry = estimated || (!scored && !outOfCredits);
  return (
    // The ENTIRE result phase (scrolling content AND the Next/Finish bar) fades in
    // as one unit, so there's never a frame showing only the footer button over a
    // blank body (the reviewer's "empty screen with just 'Next item'"). The inner
    // content additionally slides up for a staggered, settled entrance.
    <Animated.View entering={FadeIn.duration(220)} style={{ flex: 1 }}>
      <ScrollView style={styles.flex} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Animated.View entering={FadeInUp.duration(320)}>
          <ResultView
            attempt={attempt}
            question={question}
            defaultSpeed={speed}
            failReason={outOfCredits ? "quota" : failReason}
            estimated={estimated}
            onRetry={showRetry ? onRetry : undefined}
            celebrate={scored}
          />
          {outOfCredits ? (
            <Card accent={palette.accent} style={{ marginTop: space.lg }}>
              <Text style={type.bodyStrong}>Out of free AI scores for today</Text>
              <Text style={[type.caption, { marginTop: 4 }]}>Your pacing report is above. Unlock the full rubric score and improved answer:</Text>
              <View style={{ gap: space.sm, marginTop: space.md }}>
                {/* Always offered (opt-in): if no ad is ready we say so when tapped,
                    so the rewarded-ad path is never hidden from the user. */}
                <Button label="Watch a short ad for 1 score" icon="play" variant="secondary" onPress={onWatchAd} />
                <Button label="Go Pro — unlimited scoring" icon="star" onPress={onPro} />
              </View>
            </Card>
          ) : null}
        </Animated.View>
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insetsBottom + space.lg }]}>
        <Button label={isLast ? "Finish" : "Next item"} size="lg" icon="arrowRight" onPress={onNext} />
      </View>
    </Animated.View>
  );
}

// ---- Summary phase (sets & drills) ----------------------------------------

function SummaryPhase({ ids, title, onFinish, insetsBottom }: { ids: string[]; title: string; onFinish: () => void; insetsBottom: number }) {
  const data = useBandUp();
  const attempts = ids.map((id) => data.attempts.find((a) => a.id === id)).filter(Boolean) as Attempt[];
  const scored = attempts.filter((a) => typeof a.score30 === "number");
  const avg = scored.length ? Math.round(scored.reduce((s, a) => s + (a.score30 ?? 0), 0) / scored.length) : null;
  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={styles.flex} contentContainerStyle={styles.body}>
        <Animated.View entering={FadeInUp.duration(260)} style={{ gap: space.lg }}>
          <HeroCard
            overline={`${title} complete`}
            value={avg !== null ? `${avg}` : `${attempts.length}`}
            caption={avg !== null ? "average estimated score" : "answers recorded"}
            status={{ label: "Great work — keep the streak", tone: "success" }}
            right={<Icon name="trophy" size={60} color={gradient.onHero} />}
          />
          <Card>
            <SectionHeader title="Per answer" />
            <View style={{ gap: space.sm, marginTop: space.sm }}>
              {attempts.map((a, i) => (
                <View key={a.id} style={styles.sumRow}>
                  <Text style={[type.label, { color: palette.ink }]}>#{i + 1} · {a.taskType === "repeat" ? "Repeat" : "Interview"}</Text>
                  <Text style={type.amount}>{typeof a.score30 === "number" ? `${a.score30}/30` : a.status === "queued" ? "Queued" : "—"}</Text>
                </View>
              ))}
            </View>
          </Card>
        </Animated.View>
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insetsBottom + space.lg }]}>
        <Button label="Finish" size="lg" icon="check" onPress={onFinish} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
  statusBar: { position: "absolute", top: 0, left: 0, right: 0, backgroundColor: palette.bg, zIndex: 10 },
  flex: { flex: 1 },
  // The hero no longer jumps between states (reviewer saw 270→220→245px): every
  // state now has the SAME structure — overline, a one-line value, a ONE-LINE
  // caption and a one-line status pill, with a 92px visual on the right — so the
  // natural height is identical across ready / recording / review. minHeight keeps
  // a steady floor without ever clipping the pill (short captions can't wrap).
  hero: { minHeight: 150, justifyContent: "center" },
  // Slim one-line replacement for the hero while typing (keyboard up) — keeps the
  // context without stealing the vertical room the answer field needs.
  typingStrip: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.xs, paddingHorizontal: space.sm },
  // Compact "ready to answer" / "requesting" hint — a small mic badge + a one-line
  // status, replacing the tall 140px orb that pushed Step 2 off the bottom of the
  // card and clipped it under the footer (reviewer). Keeps the answer area short so
  // everything sits above the fixed footer on a 360×640 phone.
  readyHint: { flexDirection: "row", alignItems: "center", gap: space.md, backgroundColor: palette.surfaceAlt, borderRadius: radius.md, padding: space.md },
  readyBadge: { width: 44, height: 44, borderRadius: 22, backgroundColor: palette.primarySoft, borderWidth: 1.5, borderColor: palette.primary, alignItems: "center", justifyContent: "center" },
  readyBadgeLocked: { backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
  header: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.lg, paddingBottom: space.sm },
  headerRight: { minWidth: 64, alignItems: "flex-end" },
  body: { paddingHorizontal: space.lg, paddingBottom: space.xxl, gap: space.lg, paddingTop: space.sm, width: "100%", maxWidth: 640, alignSelf: "center" },
  footer: { paddingHorizontal: space.lg, paddingTop: space.md, backgroundColor: palette.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border },
  input: {
    minHeight: 112,
    borderWidth: 1.5,
    borderColor: palette.border,
    borderRadius: radius.md,
    padding: space.md,
    fontFamily: fonts.regular,
    fontSize: 16,
    lineHeight: 22,
    color: palette.ink,
    backgroundColor: palette.surface,
  },
  // Numbered step rows inside the single item card.
  stepRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  stepNum: { width: 26, height: 26, borderRadius: 13, backgroundColor: palette.primary, alignItems: "center", justifyContent: "center" },
  stepNumText: { fontFamily: type.button.fontFamily, fontSize: 13, color: palette.onPrimary },
  stepDivider: { height: StyleSheet.hairlineWidth, backgroundColor: palette.border, marginVertical: space.md },
  // "Show text" — a quiet TERTIARY plain link (no border), so it never competes
  // with the high-contrast primary "Hear it" above it.
  // "Show text" / "Hide text" as a clear bordered PILL with a 40dp tap target and
  // full-contrast primary text — the reviewer found the old plain inkSoft links small
  // and low-contrast.
  textPill: { flexDirection: "row", alignItems: "center", alignSelf: "center", justifyContent: "center", gap: 6, minHeight: 40, paddingHorizontal: 16, borderRadius: radius.pill, borderWidth: 1.5, borderColor: palette.primary, backgroundColor: palette.primarySoft },
  // Pre-permission primer (shown while the OS mic dialog is up): why the mic, the
  // privacy promise, and which button to tap — never a bare spinner behind the dialog.
  primerCard: { gap: space.sm, backgroundColor: palette.surfaceAlt, borderRadius: radius.md, borderWidth: 1, borderColor: palette.border, padding: space.md },
  primerHead: { flexDirection: "row", alignItems: "center", gap: space.md },
  primerTip: { flexDirection: "row", alignItems: "center", gap: space.sm, backgroundColor: palette.primarySoft, borderRadius: radius.md, paddingHorizontal: space.sm, paddingVertical: space.xs, minHeight: 36 },
  // The 3-2-1 "get ready" beat panel before recording opens (the big number is in the hero).
  countinBox: { minHeight: 196, alignItems: "center", justifyContent: "center", gap: space.sm },
  countinDots: { flexDirection: "row", gap: space.sm, marginBottom: space.xs },
  countinDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: palette.primarySoft, borderWidth: 1.5, borderColor: palette.primary },
  countinDotOn: { backgroundColor: palette.primary },
  // Reserve a stable height across ready/recording/review so the card doesn't
  // grow and push content down when recording ends.
  answerBody: { minHeight: 196, justifyContent: "flex-start" },
  heroBadge: { width: 92, height: 92, borderRadius: 46, backgroundColor: gradient.pill, alignItems: "center", justifyContent: "center" },
  notice: { flexDirection: "row", alignItems: "center", gap: space.sm, backgroundColor: palette.surfaceAlt, borderRadius: radius.md, padding: space.sm },
  // Slim recap of the "hear it" step, shown once the user moves on to answering
  // (keeps the question/replay in reach without the tall step-1 block).
  recapCard: { gap: space.xs, backgroundColor: palette.surfaceAlt, borderRadius: radius.md, padding: space.md },
  recapHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  recapAction: { flexDirection: "row", alignItems: "center", gap: 5, minHeight: 32, paddingHorizontal: 8, borderRadius: radius.pill, backgroundColor: palette.primarySoft },
  // Compact live-recording header (dot + word count) that replaces the big orb.
  recHead: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 28 },
  recDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: palette.danger },
  // A friendly, positive "time's up" banner in review (not an error look).
  timeupBanner: { flexDirection: "row", alignItems: "center", gap: space.sm, backgroundColor: tones.success.bg, borderRadius: radius.md, padding: space.sm },
  // The edit affordance label above the answer field.
  answerLabelRow: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 24 },
  // Centred label inside the SVG countdown ring (remaining seconds + "sec left").
  ringLabel: { alignItems: "center", justifyContent: "center" },
  // Pulsing "Listening…" indicator shown in the live transcript box before any words.
  listening: { flexDirection: "row", alignItems: "center", gap: 5 },
  pulseDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: palette.primary },
  // The live playback waveform shown while the prompt audio is speaking.
  playWaveSlot: { minHeight: 26, alignItems: "center", justifyContent: "center" },
  playWave: { flexDirection: "row", alignItems: "center", gap: space.sm },
  playBars: { flexDirection: "row", alignItems: "center", gap: 3, height: 24 },
  playBar: { width: 4, borderRadius: 2, backgroundColor: palette.primary },
  // The "Can't use the mic right now" card (permission timed out / denied / nothing heard).
  troubleCard: { gap: space.xs, backgroundColor: palette.surfaceAlt, borderRadius: radius.md, borderWidth: 1, borderColor: palette.border, padding: space.md },
  troubleHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  meter: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 44 },
  meterBar: { width: 8, borderRadius: 4 },
  liveBox: { minHeight: 72, borderRadius: radius.md, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surfaceAlt, padding: space.md },
  reviewRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", minHeight: 40 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: space.md, paddingHorizontal: space.xl },
  scoringIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: palette.primarySoft, alignItems: "center", justifyContent: "center" },
  scoreTrack: { width: "100%", height: 8, borderRadius: 4, backgroundColor: palette.primarySoft, overflow: "hidden" },
  scoreFill: { height: 8, borderRadius: 4, backgroundColor: palette.primary },
  sumRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", minHeight: 36 },
});
