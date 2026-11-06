import { memo, useCallback, useEffect, useRef, useState, type ComponentRef, type ReactNode } from "react";
import { Alert, Linking, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { Easing, useAnimatedKeyboard, useAnimatedProps, useAnimatedStyle, useSharedValue, withRepeat, withTiming, type SharedValue } from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";
import * as DocumentPicker from "expo-document-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Button,
  CONTENT_MAX,
  Card,
  HeroCard,
  Icon,
  IconButton,
  ProgressBar,
  ProgressRing,
  Tappable,
  TextField,
  feedback,
  gradient,
  palette,
  radius,
  space,
  toast,
  type,
} from "../ui";
import { LevelMeter, MetricTile, TranscriptView, scenarioIcon, scoreLabel, scoreTone } from "./widgets";
import { speech, wordsFromTranscript } from "../app/speech";
import { analyseTake, type AnalyseOutcome, type RecordRequest } from "../app/engine";
import { appStore, todayKey, useApp } from "../core/data";
import { canStartTake, drillDoneToday, grantBonusTake } from "../core/state";
import { ads } from "../modules/ads";
import { detectFillers } from "../core/fillers";
import { nextPrompt } from "../core/content";
import { computeMetrics, isAudible, liveWpm, type Metrics } from "../core/metrics";
import { takesRemaining } from "../core/progress";
import { untilNextMidnight } from "../core/dates";
import type { Transcript } from "../core/types";
import { analytics } from "../modules/analytics";

type Phase = "ready" | "permPrimer" | "countin" | "listening" | "analysing" | "typed" | "silent" | "tooShort" | "denied" | "noAllowance" | "practiceResult" | "transcribing" | "fileError";
/** Audio-file import: the picked clip is transcribed on-device, so keep it to a
 * length the recogniser can handle in one pass (a couple of minutes), and be
 * honest about the ceiling up front. */
const MAX_IMPORT_BYTES = 25 * 1024 * 1024;
/** On-device file transcription can stall on an unreadable clip — bail out to the
 * paste fallback rather than hang the screen. */
const TRANSCRIBE_TIMEOUT_MS = 30_000;
/** A natural speaking rate used to estimate an imported clip's duration from its
 * transcript (we score the words; there's no per-word timing from a file). */
const IMPORT_WPM = 140;
/** Under this a take is too brief to score well — the Stop button warns softly. */
const MIN_GOOD_MS = 10_000;
/** Keep the "Scoring…" moment on screen at least this long so the report feels earned. */
const MIN_ANALYSE_MS = 1_100;

const COACH_TIPS = [
  "Open with your single key point in the first line.",
  "Breathe between sentences — a pause beats an 'um'.",
  "End on one clear line they'll remember.",
];

/** The 30-second target: below it the take is a bit short to score well. */
const GOOD_MS = 30_000;

/** A live "Listening…" indicator with a pulsing red dot (liveness cue). */
function ListeningPill() {
  const o = useSharedValue(1);
  useEffect(() => {
    o.value = withRepeat(withTiming(0.3, { duration: 650, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [o]);
  const dot = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <View style={styles.listeningPill} accessibilityLabel="Listening">
      <Animated.View style={[styles.listeningDot, dot]} />
      <Text style={[type.label, { color: palette.danger }]}>Listening…</Text>
    </View>
  );
}

/** The 30-second target marker on the take's progress bar. It pulses with a
 * "30s" label until the user reaches it — a gentle nudge to speak long enough
 * for a confident report — then settles to a solid success tick. */
function GoalMark({ left, reached }: { left: `${number}%`; reached: boolean }) {
  const o = useSharedValue(1);
  useEffect(() => {
    if (reached) {
      o.value = withTiming(1, { duration: 200 });
    } else {
      o.value = withRepeat(withTiming(0.35, { duration: 700, easing: Easing.inOut(Easing.quad) }), -1, true);
    }
  }, [o, reached]);
  const pulse = useAnimatedStyle(() => ({ opacity: reached ? 1 : o.value }));
  return (
    <Animated.View style={[styles.goalWrap, { left }, pulse]} pointerEvents="none">
      <Text style={[type.label, { fontSize: 10, color: reached ? palette.success : palette.primary }]}>30s</Text>
      <View style={[styles.goalMark, { backgroundColor: reached ? palette.success : palette.primary }]} />
    </Animated.View>
  );
}

/** The take's progress fill, animated on the UI thread by a shared value so the
 * 60fps motion never depends on React re-rendering the recorder. Matches the
 * kit ProgressBar's look (8dp, pill) but reads straight off `prog`. */
function TakeBar({ prog, tone, pulsing }: { prog: SharedValue<number>; tone: string; pulsing?: boolean }) {
  const fill = useAnimatedStyle(() => ({ width: `${Math.max(2, Math.min(100, prog.value * 100))}%` }));
  // In the final seconds the whole track breathes, drawing the eye to the
  // imminent auto-stop (paired with the "auto-stops in Ns" caption).
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (pulsing) pulse.value = withRepeat(withTiming(0.45, { duration: 420, easing: Easing.inOut(Easing.quad) }), -1, true);
    else pulse.value = withTiming(1, { duration: 160 });
  }, [pulsing, pulse]);
  const trackPulse = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return (
    <Animated.View style={[styles.takeTrack, pulsing ? trackPulse : null]} accessibilityLabel="Take progress">
      <Animated.View style={[styles.takeFill, { backgroundColor: tone }, fill]} />
    </Animated.View>
  );
}

/**
 * The record → analyse flow (mic check, live meter, timer, transcript, stop)
 * ending in a scored report. Audio is transcribed on-device; a typed fallback
 * covers a denied mic or a device with no recogniser, so the core job never
 * dead-ends. Rendered full-screen above the tabs.
 */
export function RecordFlow({
  req,
  onReport,
  onClose,
  onPro,
}: {
  req: RecordRequest;
  onReport: (reportId: string, meta: { quota: boolean; offline: boolean; req: RecordRequest }) => void;
  onClose: () => void;
  onPro: (from: string) => void;
}) {
  const app = useApp();
  const insets = useSafeAreaInsets();
  const today = todayKey();
  const remaining = takesRemaining(app.allowance);
  // Today's daily drill is always a free scored take, even at 0 remaining — so the
  // footer never warns "no takes left" on the one take that still works. A
  // retake-with-rewrite is likewise free (the "say it instead" loop), so it never
  // dead-ends on the allowance either.
  const drillFree = req.mode === "daily_drill" && !req.practice && !drillDoneToday(app, today);
  const freeTake = drillFree || !!req.retakeOf;

  // Always open on the prompt (so picking a scenario shows its Record screen);
  // the daily allowance is checked when the user actually taps Record, not on
  // entry — a wall before the prompt read as "the feature is broken" in QA.
  const [phase, setPhase] = useState<Phase>(req.startTyped ? "typed" : "ready");
  const [interim, setInterim] = useState("");
  // A "try again with the rewrite" retake pre-loads the AI rewrite so the compose
  // box is never empty — the user tweaks and re-delivers it (or records it).
  const isRewriteRetake = !!req.retakeOf && !!req.rewriteText;
  const [elapsed, setElapsed] = useState(0);
  const [countIn, setCountIn] = useState(0);
  const [stopping, setStopping] = useState(false);
  // The live prompt (shuffleable before recording, for impromptu-style takes).
  const [prompt, setPrompt] = useState<{ id: string; text: string }>({ id: req.promptId, text: req.promptText });
  const [practice, setPractice] = useState<{ transcript: Transcript; metrics: Metrics } | null>(null);
  // Audio-file import: the picked file name (shown while transcribing) and the
  // last failure reason (so the error state can explain + offer a fallback).
  const [importFile, setImportFile] = useState<string>("");
  const [fileError, setFileError] = useState<string>("");
  const transcribeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const level = useSharedValue(0);
  // The take's progress bar is driven ON THE UI THREAD (a shared value animated
  // over maxMs) so the smooth 60fps fill never rides React re-renders — the
  // React timer below ticks only twice a second, just for the clock and copy.
  const prog = useSharedValue(0);
  const startRef = useRef(0);
  const busyRef = useRef(false);
  const shuffleSeedRef = useRef(2);
  const primedRef = useRef(false);
  const cancelledRef = useRef(false);
  const liveRef = useRef<ComponentRef<typeof ScrollView>>(null);
  // Trailing throttle for the live transcript: the on-device recogniser can emit
  // partial results many times a second; flushing each to React state re-renders
  // the whole recorder and blocks the main thread (soak ANR). Cap it to ~3/s and
  // always keep the latest text; the FINAL transcript is passed straight to
  // runAnalysis, so nothing is lost.
  const interimThrottle = useRef<{ last: number; timer: ReturnType<typeof setTimeout> | null; text: string }>({ last: 0, timer: null, text: "" });

  const maxMs = req.finalRun ? 300_000 : 60_000;
  // Shuffle makes sense only for an open prompt pool (not a fixed event/lesson run).
  const canShuffle = !req.finalRun && !req.eventId && !req.lessonId && !req.startTyped && !req.practice;

  const shufflePrompt = useCallback(() => {
    feedback("pop", "light");
    const seen = appStore.get().prompts.seen;
    const p = nextPrompt(req.packId, seen, (shuffleSeedRef.current += 7));
    if (p) setPrompt({ id: p.id, text: p.text });
  }, [req.packId]);

  const clearInterim = useCallback(() => {
    const it = interimThrottle.current;
    if (it.timer) clearTimeout(it.timer);
    it.timer = null;
  }, []);

  useEffect(() => {
    analytics.track("take_started", { mode: req.mode });
    return () => {
      speech.abort();
      clearInterim();
      if (transcribeTimer.current) clearTimeout(transcribeTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Count-up clock while listening. The smooth progress bar runs on the UI thread
  // (the `prog` shared value), so this React tick can stay coarse — 500ms, enough
  // for a second-resolution clock and the live copy, without re-rendering the
  // whole recorder 8× a second (the soak-test ANR).
  useEffect(() => {
    if (phase !== "listening") return;
    const e0 = Date.now() - startRef.current;
    setElapsed(e0);
    const t = setInterval(() => {
      const e = Date.now() - startRef.current;
      setElapsed(e);
      if (e >= maxMs) stop();
    }, 500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, maxMs]);

  const runAnalysis = useCallback(
    async (transcript: string, durationMs: number, typedAnswer = false) => {
      if (busyRef.current) return;
      busyRef.current = true;
      cancelledRef.current = false;
      setPhase("analysing");
      const dwell = new Promise((r) => setTimeout(r, MIN_ANALYSE_MS));

      // Free practice: deterministic feedback on-device, nothing saved or spent.
      if (req.practice) {
        const settings = appStore.get().settings;
        const words = detectFillers(wordsFromTranscript(transcript, durationMs), {
          ignore: settings.ignoreFillers,
          stutterFriendly: settings.stutterFriendly,
        });
        await dwell;
        busyRef.current = false;
        if (cancelledRef.current) return;
        if (!isAudible(words)) {
          feedback("error", "warning");
          const shortClip = words.filter((w) => w.text.trim()).length < 3;
          return setPhase(shortClip ? "tooShort" : "silent");
        }
        feedback("success", "success");
        setPractice({ transcript: { id: "practice", takeId: "practice", words, language: "en" }, metrics: computeMetrics(words) });
        return setPhase("practiceResult");
      }

      const activeReq: RecordRequest = { ...req, promptId: prompt.id, promptText: prompt.text };
      let out: AnalyseOutcome;
      try {
        [out] = await Promise.all([
          analyseTake(activeReq, transcript, durationMs, typedAnswer).catch((): AnalyseOutcome => ({ error: "silent", quota: false, offline: false })),
          dwell,
        ]);
      } catch {
        out = { error: "silent", quota: false, offline: false };
      }
      busyRef.current = false;
      if (cancelledRef.current) return; // user left the scoring screen — don't yank them into a report
      if (out.reportId) {
        feedback("success", "success");
        onReport(out.reportId, { quota: out.quota, offline: out.offline, req: activeReq });
        return;
      }
      if (out.error === "no_allowance") return setPhase("noAllowance");
      feedback("error", "warning");
      analytics.track(out.error === "too_short" ? "take_too_short" : "take_silent_detected", { mode: req.mode });
      setPhase(out.error === "too_short" ? "tooShort" : "silent");
    },
    [req, onReport, prompt],
  );

  // Actually open the mic and start the clock — called when the 3-2-1 count-in
  // finishes, so the timer and the first audio start together (never a frozen
  // 0:00 while words appear).
  const beginListening = useCallback(() => {
    setInterim("");
    setElapsed(0);
    setStopping(false);
    startRef.current = Date.now();
    level.value = 0;
    // Animate the progress fill once, on the UI thread, for the whole take.
    prog.value = 0;
    prog.value = withTiming(1, { duration: maxMs, easing: Easing.linear });
    interimThrottle.current = { last: 0, timer: null, text: "" };
    setPhase("listening");
    feedback("pop", "medium");
    analytics.track("mic_check_passed");
    speech.start({
      onVolume: (v) => {
        level.value = withTiming(v, { duration: 120 });
      },
      onInterim: (t) => {
        // Trailing throttle → at most ~3 React updates a second (keeps the main
        // thread free during a sustained recognition stream).
        const it = interimThrottle.current;
        it.text = t;
        const now = Date.now();
        const since = now - it.last;
        if (since >= 300) {
          it.last = now;
          setInterim(t);
        } else if (!it.timer) {
          it.timer = setTimeout(() => {
            it.timer = null;
            it.last = Date.now();
            setInterim(it.text);
          }, 300 - since);
        }
      },
      onEnd: (finalText) => {
        clearInterim();
        const dur = Math.max(1, Date.now() - startRef.current);
        runAnalysis(finalText, dur);
      },
      onError: () => {
        clearInterim();
        setPhase("typed");
      },
    });
  }, [level, prog, maxMs, runAnalysis, clearInterim]);

  const startListening = useCallback(async () => {
    if (!req.practice && !canStartTake(appStore.get(), today, req.mode, req.retakeOf)) return setPhase("noAllowance");
    const has = await speech.getPermission();
    // Pre-permission explainer the FIRST time: a calm screen that says why we
    // need the mic, so the OS dialog that follows feels expected (not abrupt).
    if (!has && !primedRef.current) {
      primedRef.current = true;
      return setPhase("permPrimer");
    }
    if (!has) {
      const granted = await speech.requestPermission();
      analytics.track(granted ? "mic_permission_granted" : "mic_permission_denied");
      if (!granted) return setPhase("denied");
    } else {
      analytics.track("mic_permission_granted");
    }
    if (!speech.available()) return setPhase("typed");
    // A short 3-2-1 count-in so the user knows exactly when recording starts
    // (QA: the old count-in jumped straight to "1" and stalled). The primary
    // "Start now" button skips it for anyone in a hurry, and reduce-motion goes
    // straight in — so the ≤20s-to-first-take goal still holds.
    if (appStore.get().settings.reduceMotion) return beginListening();
    feedback("pop", "medium");
    setCountIn(3);
    setPhase("countin");
  }, [req.practice, req.mode, today, beginListening]);

  // Drive the 3-2-1 count-in, then open the mic. Each tick decrements; on the
  // last tick we start listening directly, so the orb never flashes a stale "0".
  useEffect(() => {
    if (phase !== "countin") return;
    const t = setTimeout(() => {
      if (countIn <= 1) { beginListening(); return; }
      feedback("pop", "light");
      setCountIn((n) => n - 1);
    }, 680);
    return () => clearTimeout(t);
  }, [phase, countIn, beginListening]);

  const stop = useCallback(() => {
    if (stopping) return;
    setStopping(true);
    feedback("success", "success"); // a clear completion beat on the stop tap
    speech.stop(); // → onEnd → runAnalysis
  }, [stopping]);

  const cancel = useCallback(() => {
    // A stray tap on Back mid-recording shouldn't silently bin the take.
    if (phase === "listening" || phase === "countin") {
      Alert.alert("Discard this take?", "You're in the middle of recording — leaving now loses what you've said.", [
        { text: "Keep recording", style: "cancel" },
        { text: "Discard", style: "destructive", onPress: () => { speech.abort(); clearInterim(); onClose(); } },
      ]);
      return;
    }
    speech.abort();
    clearInterim();
    onClose();
  }, [phase, onClose, clearInterim]);

  // Analyse a full typed answer. The compose field owns its own text (see
  // TypedAnswer) and hands the final string here on submit, so a fast-typed
  // answer is never clipped by a parent re-render dropping keystrokes.
  const analyseTyped = useCallback((text: string) => {
    // Estimate a natural speaking duration (~130 wpm) for a typed answer. The
    // report judges a typed answer by its words (not this estimate), so a full
    // written answer is always scored, never shown as a "too short" recording.
    const dur = Math.round((text.split(/\s+/).filter(Boolean).length / 130) * 60000);
    runAnalysis(text, Math.max(6000, dur), true);
  }, [runAnalysis]);

  const clearTranscribeTimer = useCallback(() => {
    if (transcribeTimer.current) clearTimeout(transcribeTimer.current);
    transcribeTimer.current = null;
  }, []);

  // Import an existing recording: pick an audio file (system picker — no storage
  // permission), transcribe it ON THE DEVICE, then score it through the very same
  // report pipeline as a live take. An unreadable clip (unsupported codec, no
  // recogniser) never dead-ends — it drops to the paste fallback.
  const pickAudioFile = useCallback(async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: "audio/*", copyToCacheDirectory: true, multiple: false });
      if (res.canceled || !res.assets?.length) return;
      const asset = res.assets[0];
      if (asset.size && asset.size > MAX_IMPORT_BYTES) {
        feedback("error", "warning");
        setImportFile(asset.name ?? "your clip");
        setFileError("That file is larger than 25 MB. Trim it to a couple of minutes, or paste the transcript instead.");
        setPhase("fileError");
        return;
      }
      analytics.track("scenario_selected", { pack: "audio_import" });
      // On-device file transcription uses the same recogniser as the mic, so it
      // needs the RECORD_AUDIO grant. Ask (in-context) before transcribing; if
      // it's declined the paste fallback still gives the same report.
      const hasMic = await speech.getPermission();
      if (!hasMic) {
        const granted = await speech.requestPermission();
        if (!granted) {
          feedback("error", "warning");
          setImportFile(asset.name ?? "your recording");
          setFileError("Transcribing on-device needs microphone access (your audio still never leaves the phone). Allow it and try again, or paste the transcript instead.");
          setPhase("fileError");
          return;
        }
      }
      setImportFile(asset.name ?? "your recording");
      setInterim("");
      setFileError("");
      setPhase("transcribing");
      feedback("pop", "light");
      let done = false;
      const fail = (msg: string) => {
        if (done) return;
        done = true;
        clearTranscribeTimer();
        speech.abort();
        feedback("error", "warning");
        setFileError(msg);
        setPhase("fileError");
      };
      clearTranscribeTimer();
      transcribeTimer.current = setTimeout(() => fail("That took too long to read on this device. Try a shorter WAV/M4A clip, or paste the transcript instead."), TRANSCRIBE_TIMEOUT_MS);
      speech.transcribeFile(asset.uri, {
        onInterim: (t) => setInterim(t),
        onDone: (text) => {
          if (done) return;
          done = true;
          clearTranscribeTimer();
          const words = text.trim().split(/\s+/).filter(Boolean).length;
          if (words < 3) {
            fail("We couldn't make out speech in that clip. It may be music, too quiet, or in a format this phone can't read on-device. Paste the transcript instead.");
            return;
          }
          const dur = Math.max(6000, Math.round((words / IMPORT_WPM) * 60000));
          runAnalysis(text.trim(), dur, false);
        },
        onError: () => fail("This phone couldn't read that audio on-device (a common codec/format limit). Paste the transcript instead and you'll get the same scored report."),
      });
    } catch {
      feedback("error", "warning");
      setFileError("Couldn't open that file. Try another, or paste the transcript instead.");
      setPhase("fileError");
    }
  }, [runAnalysis, clearTranscribeTimer]);

  const headerIcon = scenarioIcon(req.packId);
  const mmss = `${Math.floor(elapsed / 60000)}:${String(Math.floor((elapsed % 60000) / 1000)).padStart(2, "0")}`;
  const maxLabel = req.finalRun ? "5 min" : "60 sec";
  const autoStopLabel = req.finalRun ? "5:00" : "1:00";
  // Final-5s warning: a clear, pulsing "auto-stops in Ns" so the auto-stop is
  // never a surprise (QA: "unclear whether recording stops at 60s").
  const msLeft = Math.max(0, maxMs - elapsed);
  const nearEnd = phase === "listening" && msLeft <= 5_000 && !stopping;
  const secsLeft = Math.ceil(msLeft / 1000);

  // Live counters while recording — fills the space below the transcript with
  // something purposeful (words, a rough pace and fillers so far).
  const liveTrimmed = interim.trim();
  const liveWords = liveTrimmed ? liveTrimmed.split(/\s+/).length : 0;
  // A live pace from elapsed SPEECH time, with a 5s warm-up and a plausible-rate
  // cap baked into liveWpm() — it returns null (shown as "–") until a verdict is
  // trustworthy, so an early partial can never flash "210 wpm" at 0:09 (the QA
  // timer/WPM blocker). Rounded to the nearest 5 so it reads as an estimate.
  const paceRaw = liveWpm(liveWords, elapsed);
  const livePace = paceRaw != null ? Math.round(paceRaw / 5) * 5 : null;
  const showPace = livePace != null;
  const liveFillers = liveTrimmed ? (liveTrimmed.match(/\b(ums?|uhs?|erms?|ahs?|like|basically|literally)\b/gi) ?? []).length : 0;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.bar}>
        {phase === "analysing" ? (
          // Explicit "Cancel" (a bare X mid-processing reads as ambiguous).
          <Tappable label="Cancel scoring" onPress={() => { cancelledRef.current = true; speech.abort(); onClose(); }} style={styles.cancelBtn}>
            <Icon name="close" size={16} color={palette.inkSoft} />
            <Text style={[type.label, { color: palette.inkSoft }]}>Cancel</Text>
          </Tappable>
        ) : (
          <IconButton icon="chevronLeft" label="Back" onPress={cancel} />
        )}
        <Text style={type.heading} numberOfLines={1}>{phase === "analysing" ? "" : req.title ?? req.scenario}</Text>
        <View style={{ width: 48 }} />
      </View>

      {phase === "noAllowance" ? (
        <NoAllowance
          onClose={onClose}
          onPro={onPro}
          onBonus={() => {
            analytics.track("rewarded_ad_opted_in");
            const shown = ads.showRewarded(() => {
              appStore.set((s) => grantBonusTake(s));
              feedback("success", "success");
              setPhase(req.startTyped ? "typed" : "ready");
              toast("Bonus take unlocked — record it now");
            });
            if (!shown) toast("No bonus take available right now — free takes refresh at midnight");
          }}
        />
      ) : phase === "analysing" ? (
        <Analysing prompt={prompt.text} />
      ) : phase === "permPrimer" ? (
        <MicPrimer
          onAllow={startListening}
          onType={() => setPhase("typed")}
        />
      ) : phase === "countin" ? (
        <View style={styles.body}>
          {/* Crossfade the count-in content in so the mic→countdown hand-off eases
              rather than snapping (fade on inner content, never the container). */}
          <FadeMount style={styles.fadeFill}>
            <View style={styles.promptStrip}>
              <Icon name={headerIcon} size={14} color={palette.primary} />
              <Text style={[type.caption, { flex: 1, color: palette.inkSoft }]} numberOfLines={1}>{prompt.text}</Text>
            </View>
            <View style={styles.countCenter}>
              <Text style={[type.label, { color: palette.primary, marginBottom: space.sm }]}>Get ready…</Text>
              <CountInOrb n={countIn} />
              <Text style={[type.body, { color: palette.inkSoft, textAlign: "center", marginTop: space.sm }]}>Starting now — speak as soon as the timer begins.</Text>
              <Button label="Start now" variant="primary" size="lg" icon="mic" onPress={beginListening} />
            </View>
          </FadeMount>
        </View>
      ) : phase === "listening" ? (
        <View style={styles.body}>
          {/* Compact prompt line (not a second big card) so it doesn't repeat the header. */}
          <View style={styles.promptStrip}>
            <Icon name={headerIcon} size={14} color={palette.primary} />
            <Text style={[type.caption, { flex: 1, color: palette.inkSoft }]} numberOfLines={1}>{prompt.text}</Text>
          </View>
          <View style={styles.listenCenter}>
            <ListeningPill />
            <LevelMeter level={level} />
            <Text style={[type.hero, { fontVariant: ["tabular-nums"] }]}>{mmss}</Text>
            <Text style={[type.caption, { color: palette.inkSoft }]}>Auto-stops at {autoStopLabel} · audio stays on your device</Text>
          </View>
          {/* Grows to fill the space between the timer and the stats so there's
              no dead area; auto-scrolls to the newest line so the last word is
              never clipped mid-sentence. */}
          <View style={styles.liveBox}>
            <ScrollView
              ref={liveRef}
              style={styles.liveScroll}
              contentContainerStyle={{ padding: space.md }}
              // Jump (not animate) to the newest line: a fresh animated scroll on
              // every partial word stacked up and made the text judder in its card.
              onContentSizeChange={() => liveRef.current?.scrollToEnd({ animated: false })}
              showsVerticalScrollIndicator={false}
            >
              <Text style={[type.body, { color: interim ? palette.ink : palette.inkSoft }]}>
                {interim || "Start speaking — your words appear here as you talk."}
              </Text>
            </ScrollView>
            <LinearGradient pointerEvents="none" colors={[palette.surface, `${palette.surface}00`]} style={styles.liveFadeTop} />
          </View>

          {/* Live counters fill the space with something useful as you speak. */}
          <View style={styles.liveStats}>
            <LiveStat label="Words" value={`${liveWords}`} />
            <View style={styles.liveStatDivider} />
            <LiveStat
              label="Pace"
              value={showPace ? `~${livePace}` : "—"}
              unit={showPace ? "wpm" : undefined}
              tone={showPace && livePace! > 170 ? palette.warning : showPace && livePace! >= 110 ? palette.success : palette.ink}
            />
            <View style={styles.liveStatDivider} />
            <LiveStat label="Fillers" value={`${liveFillers}`} tone={liveFillers >= 3 ? palette.warning : palette.ink} />
          </View>
          {/* Reserved line: a plain tip so an early fast reading never reads as an
              alarm. The pace itself stays neutral until 10s of speech. Padded so
              it never crowds the stats panel above or the footer below. */}
          <Text style={[type.caption, { textAlign: "center", color: palette.inkSoft, minHeight: 18, paddingVertical: space.xs }]}>
            {!showPace ? "Aim for a steady 130–160 wpm" : livePace! > 170 ? "A little fast — aim for 130–160 wpm" : livePace! < 110 ? "Room to pick up the pace — aim for 130–160 wpm" : "Nicely paced — keep it up"}
          </Text>

          <View style={styles.listenFooter}>
            <View style={styles.barWrap}>
              <TakeBar prog={prog} tone={nearEnd || elapsed / maxMs > 0.9 ? palette.warning : elapsed >= GOOD_MS ? palette.success : palette.primary} pulsing={nearEnd} />
              {/* 30-second target marker — pulses until reached, nudging a longer
                  take; a "30s" label makes the minimum explicit. */}
              <GoalMark left={`${Math.min(96, (GOOD_MS / maxMs) * 100)}%`} reached={elapsed >= GOOD_MS} />
            </View>
            <Text style={[type.caption, { textAlign: "center", color: nearEnd ? palette.warning : elapsed >= GOOD_MS ? palette.success : palette.inkSoft }]}>
              {stopping
                ? "Got it — finishing your take…"
                : nearEnd
                  ? `Auto-stops in ${secsLeft}s — wrap up your point`
                  : elapsed < MIN_GOOD_MS
                    ? "Off to a strong start — a short take still gets a quick report"
                    : elapsed >= GOOD_MS
                      ? `Great length — tap stop whenever you're ready · auto-stops at ${autoStopLabel}`
                      : `Keep going to 30s for the best report · auto-stops at ${autoStopLabel}`}
            </Text>
            <Button
              label={stopping ? "Finishing…" : req.practice ? "Stop & see feedback" : "Stop & get my report"}
              icon="stop"
              size="lg"
              variant="primary"
              loading={stopping}
              onPress={stop}
            />
          </View>
        </View>
      ) : phase === "transcribing" ? (
        <Transcribing fileName={importFile} interim={interim} onCancel={() => { clearTranscribeTimer(); speech.abort(); setInterim(""); setPhase("typed"); }} />
      ) : phase === "fileError" ? (
        <Recovery
          icon="micOff"
          title="Couldn't read that audio"
          body={fileError}
          primary={{ label: "Paste the transcript instead", onPress: () => { setInterim(""); setPhase("typed"); } }}
          secondary={{ label: "Choose another file", onPress: pickAudioFile }}
        />
      ) : phase === "typed" ? (
        <TypedAnswer
          prompt={prompt.text}
          initial={req.rewriteText ?? ""}
          isRewriteRetake={isRewriteRetake}
          showMic={speech.available()}
          onAnalyse={analyseTyped}
          onUseMic={() => setPhase("ready")}
          onImportAudio={isRewriteRetake ? undefined : pickAudioFile}
        />
      ) : phase === "denied" ? (
        <Recovery
          icon="micOff"
          title="Microphone is off"
          body="Podium needs the mic to hear your take. Turn it on in Settings, or type your answer instead — your report works either way."
          primary={{ label: "Open settings", onPress: () => Linking.openSettings().catch(() => {}) }}
          secondary={{ label: "Type my answer instead", onPress: () => setPhase("typed") }}
        />
      ) : phase === "silent" ? (
        <Recovery
          icon="mic"
          title="We couldn't hear you"
          body="That take was too quiet, so it didn't count against your daily allowance. Check your mic and try again."
          primary={{ label: "Try again", onPress: startListening }}
          secondary={{ label: "Type my answer instead", onPress: () => setPhase("typed") }}
        />
      ) : phase === "tooShort" ? (
        <Recovery
          icon="mic"
          title="Keep going a little longer"
          body="We need a few more seconds to score your delivery. This take wasn't counted — give it another go."
          primary={{ label: "Record again", onPress: startListening }}
          secondary={{ label: "Type my answer instead", onPress: () => setPhase("typed") }}
        />
      ) : phase === "practiceResult" && practice ? (
        <PracticeResult
          transcript={practice.transcript}
          metrics={practice.metrics}
          insetBottom={insets.bottom}
          onAgain={() => { setPractice(null); setInterim(""); setPhase(req.startTyped ? "typed" : "ready"); }}
          onPro={() => onPro("practice")}
          onClose={onClose}
        />
      ) : (
        // Scrolls on a 720×1280 phone (content is centred on taller screens), so
        // the prompt card and the mic orb can never overlap and the tips never
        // collide with the footer caption. Footer is pinned below.
        <View style={styles.readyRoot}>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.readyScroll} showsVerticalScrollIndicator={false}>
            <Card style={styles.promptCard} accent={palette.primary}>
              <View style={styles.promptHead}>
                <View style={styles.promptIcon}><Icon name={headerIcon} size={16} color={palette.primary} /></View>
                <Text style={[type.overline, { flex: 1 }]} numberOfLines={1}>{req.scenario}</Text>
                {canShuffle ? (
                  <Tappable label="Shuffle prompt" onPress={shufflePrompt} style={styles.shuffleBtn}>
                    <Icon name="shuffle" size={15} color={palette.primary} />
                    <Text style={[type.label, { color: palette.primary }]}>Shuffle</Text>
                  </Tappable>
                ) : null}
              </View>
              <Text style={[type.title, { color: palette.ink }]}>{prompt.text}</Text>
            </Card>

            {/* The record action is the hero — a central mic you tap to start. */}
            <View style={styles.orbWrap}>
              <MicOrb onPress={startListening} />
              <Text style={[type.title, { textAlign: "center", color: palette.ink }]}>Tap to record</Text>
              <Text style={[type.body, { textAlign: "center", color: palette.inkSoft }]}>Speak for up to {maxLabel} · aim for 30s+</Text>
              <View style={styles.micNote}>
                <Icon name="lock" size={14} color={palette.primary} />
                <Text style={[type.caption, { color: palette.inkSoft, flexShrink: 1 }]}>We'll ask for your mic the first time · audio stays on this device</Text>
              </View>
              <View style={styles.micNote}>
                <Icon name="headset" size={14} color={palette.inkMuted} />
                <Text style={[type.caption, { color: palette.inkMuted, flexShrink: 1 }]}>Using your phone mic · wired headsets work; Bluetooth may fall back to the phone mic</Text>
              </View>
            </View>

            {/* Tips: a clear, readable checklist (high contrast for accessibility). */}
            <View style={styles.tipsCard}>
              <Text style={[type.overline, { color: palette.inkSoft }]}>Quick tips</Text>
              {COACH_TIPS.map((t) => (
                <View key={t} style={styles.tipRow}>
                  <Icon name="checkCircle" size={18} color={palette.primary} />
                  <Text style={[type.body, { flex: 1, color: palette.ink }]}>{t}</Text>
                </View>
              ))}
            </View>
          </ScrollView>

          <View style={styles.readyFooter}>
            <Text style={[type.caption, { textAlign: "center", color: remaining > 0 || req.practice || freeTake ? palette.inkSoft : palette.warning }]}>
              {req.practice
                ? "Free practice · not scored or saved"
                : req.retakeOf && remaining === 0
                  ? "Free rewrite retake · fully scored"
                  : drillFree && remaining === 0
                    ? "Your free daily drill · fully scored"
                    : remaining > 0
                      ? `${remaining} free take${remaining === 1 ? "" : "s"} left today`
                      : "No free takes left today — more at midnight. Go Pro to keep going."}
            </Text>
            <Button label="Type my answer instead" variant="ghost" icon="edit" onPress={() => setPhase("typed")} />
          </View>
        </View>
      )}
    </View>
  );
}

const ANALYSE_STEPS = ["Pace & tempo", "Filler words", "Pauses", "Structure"];

function Analysing({ prompt }: { prompt: string }) {
  // The scoring beat: a brand "analysing" orb (NOT a success check — a green tick
  // here read as "done" before the score was ready) eases in, then the steps
  // light up one at a time; the last stays "working" until the real report
  // arrives, so it never reads as "all Done, why still waiting".
  const pop = useSharedValue(0);
  // A short cross-fade into the scoring screen so it eases in rather than snapping
  // over the recorder the instant the user stops.
  const fade = useSharedValue(0);
  const [done, setDone] = useState(0);
  useEffect(() => {
    fade.value = withTiming(1, { duration: 240, easing: Easing.out(Easing.quad) });
    pop.value = withTiming(1, { duration: 420, easing: Easing.out(Easing.back(1.7)) });
    feedback("pop", "light"); // a calm "we've got it" cue — the celebration waits for the score
    const t = setInterval(() => setDone((n) => (n >= ANALYSE_STEPS.length - 1 ? n : n + 1)), 460);
    return () => clearInterval(t);
  }, [pop, fade]);
  const checkAnim = useAnimatedStyle(() => ({ transform: [{ scale: 0.4 + pop.value * 0.6 }], opacity: pop.value }));
  const fadeAnim = useAnimatedStyle(() => ({ opacity: fade.value, transform: [{ translateY: (1 - fade.value) * 8 }] }));
  const total = ANALYSE_STEPS.length;
  return (
    <Animated.View style={[styles.body, { justifyContent: "center" }, fadeAnim]}>
      <View style={styles.analyseHead}>
        <Animated.View style={[styles.confirmCheck, checkAnim]}>
          <Icon name="sparkle" size={30} color={gradient.onHero} />
        </Animated.View>
        <Text style={type.title}>Scoring your take…</Text>
        <Text style={[type.caption, { textAlign: "center" }]}>Measuring your delivery on your device — this takes a moment.</Text>
      </View>
      <Card style={{ gap: space.md }}>
        {/* Determinate progress so the scoring never looks stalled. */}
        <ProgressBar value={(done + 1) / total} tone="primary" />
        {ANALYSE_STEPS.map((label, i) => {
          const complete = i < done;
          const working = i === done;
          return (
            <View key={label} style={styles.checkRow}>
              {complete ? (
                <Icon name="checkCircle" size={22} color={palette.success} />
              ) : working ? (
                <View style={styles.checkWorking}><WorkingDot /></View>
              ) : (
                <View style={styles.checkPending} />
              )}
              <Text style={[type.body, { flex: 1, color: complete || working ? palette.ink : palette.inkMuted }]}>{label}</Text>
              {complete ? <Text style={[type.label, { color: palette.success }]}>Done</Text> : working ? <Text style={[type.label, { color: palette.primary }]}>Scoring…</Text> : null}
            </View>
          );
        })}
      </Card>
      <Text style={[type.caption, { textAlign: "center" }]} numberOfLines={2}>{prompt}</Text>
    </Animated.View>
  );
}

/** Fade (+ a small rise) inner content in on mount, on the UI thread. The child
 * stays mounted so there's no blank frame; only opacity animates — safe to use
 * inside a phase body (never on the route/phase container itself). */
function FadeMount({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const f = useSharedValue(0);
  useEffect(() => {
    f.value = withTiming(1, { duration: 260, easing: Easing.out(Easing.quad) });
  }, [f]);
  const anim = useAnimatedStyle(() => ({ opacity: f.value, transform: [{ translateY: (1 - f.value) * 10 }] }));
  return <Animated.View style={[style, anim]}>{children}</Animated.View>;
}

/** Minimum words for a typed answer to be worth analysing (below this it's too
 * thin to score; the report then needs ~20 for a confident, non-provisional score). */
const MIN_TYPED_WORDS = 8;

const countWords = (s: string) => {
  const t = s.trim();
  return t ? t.split(/\s+/).filter(Boolean).length : 0;
};

/**
 * The compose text input, isolated in its OWN memoised component with props that
 * never change after mount (a stable onChangeText, a fixed initial/label/helper).
 * This is the fix for the repeat "21-word answer truncated to 14 words / …team,
 * bu" blocker: the native Android TextInput rolls back any characters typed since
 * the last JS event-count whenever a re-render re-commits it mid-type. The live
 * word counter lives OUTSIDE this component, so when it updates the parent
 * re-renders but React.memo skips this field entirely — the native input is
 * committed once, then never again while the user types, so every keystroke (fast
 * or programmatic) is kept and the whole answer reaches the report.
 */
const ComposeField = memo(function ComposeField({
  label,
  helper,
  initial,
  onChangeText,
  onBlur,
}: {
  label: string;
  helper: string;
  initial: string;
  onChangeText: (t: string) => void;
  onBlur: () => void;
}) {
  return (
    <TextField
      label={label}
      placeholder="Type your answer…"
      defaultValue={initial}
      onChangeText={onChangeText}
      onBlur={onBlur}
      multiline
      autoCorrect={false}
      autoComplete="off"
      autoCapitalize="sentences"
      textContentType="none"
      importantForAutofill="no"
      style={styles.typedInput}
      helper={helper}
    />
  );
});

/**
 * The typed-answer compose screen. The text field itself is a memoised child
 * (ComposeField) so the live counter's re-renders never re-commit the native
 * input — keystrokes are mirrored into a ref for the submit payload, and the
 * counter catches up on a debounce. The "Analyse my answer" action bar is PINNED
 * below the scroll and padded by the live keyboard height, so it is never hidden
 * behind the keyboard: a covered button made the tester's tap land on "Use the
 * microphone instead" just below it, bouncing them back to the empty Record
 * screen (the "goes back to the Record screen" blocker).
 */
const TypedAnswer = memo(function TypedAnswer({
  prompt,
  initial,
  isRewriteRetake,
  showMic,
  onAnalyse,
  onUseMic,
  onImportAudio,
}: {
  prompt: string;
  initial: string;
  isRewriteRetake: boolean;
  showMic: boolean;
  onAnalyse: (text: string) => void;
  onUseMic: () => void;
  /** Import an existing recording from the device (undefined on a rewrite retake). */
  onImportAudio?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const kb = useAnimatedKeyboard();
  const textRef = useRef(initial);
  const [words, setWords] = useState(() => countWords(initial));
  const countTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enough = words >= MIN_TYPED_WORDS;
  // The ref captures EVERY keystroke synchronously (the submit payload). The live
  // counter is updated on a trailing debounce — but critically it re-renders only
  // the counter below, NOT the memoised ComposeField, so the native input is never
  // re-committed mid-type (which is what truncated the answer before).
  const onChangeText = useCallback((t: string) => {
    textRef.current = t;
    if (countTimer.current) clearTimeout(countTimer.current);
    countTimer.current = setTimeout(() => setWords(countWords(textRef.current)), 180);
  }, []);
  const onBlur = useCallback(() => {
    if (countTimer.current) { clearTimeout(countTimer.current); countTimer.current = null; }
    setWords(countWords(textRef.current));
  }, []);
  useEffect(() => () => { if (countTimer.current) clearTimeout(countTimer.current); }, []);
  const submit = useCallback(() => {
    // Flush any pending debounced count so the gate check uses the latest text.
    if (countTimer.current) { clearTimeout(countTimer.current); countTimer.current = null; }
    const text = textRef.current.trim();
    const n = countWords(text);
    setWords(n);
    if (n < MIN_TYPED_WORDS) {
      feedback("error", "warning");
      toast("Add a sentence or two more, then analyse");
      return;
    }
    onAnalyse(text);
  }, [onAnalyse]);
  // Pin the action bar above the keyboard (edge-to-edge adjustResize): pad by the
  // live keyboard height so the primary button is always reachable.
  const footerStyle = useAnimatedStyle(() => ({
    paddingBottom: Math.max(insets.bottom + space.md, kb.height.value + space.sm),
  }));
  return (
    <View style={styles.typedRoot}>
      <ScrollView contentContainerStyle={styles.scrollBody} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Card style={styles.promptCard} accent={palette.primary}>
          <Text style={type.overline}>Your prompt</Text>
          <Text style={[type.body, { color: palette.ink }]}>{prompt}</Text>
        </Card>
        <Text style={[type.body, { color: palette.inkSoft }]}>
          {isRewriteRetake
            ? "Here's your tightened rewrite, ready to go. Tweak it to sound like you, then analyse it for a fresh score — or record yourself saying it."
            : "Already have a recording? Import the audio file and we'll transcribe it on your device for the same scored report — or type/paste what you'd say below."}
        </Text>
        {onImportAudio ? (
          <>
            <Tappable label="Choose an audio file to import and score" onPress={onImportAudio} style={styles.importRow}>
              <View style={styles.importIcon}><Icon name="document" size={20} color={palette.primary} /></View>
              <View style={{ flex: 1 }}>
                <Text style={type.bodyStrong}>Choose an audio file</Text>
                <Text style={type.caption} numberOfLines={2}>Transcribed on your device · never uploaded</Text>
              </View>
              <Icon name="chevronRight" size={20} color={palette.inkMuted} />
            </Tappable>
            <Text style={[type.caption, { color: palette.inkMuted }]}>
              Short clips work best — up to ~2 min, under 25 MB (WAV or M4A). If a file can't be read on this phone, paste its transcript instead.
            </Text>
            <View style={styles.orDivider}>
              <View style={styles.orLine} />
              <Text style={[type.label, { color: palette.inkMuted }]}>OR TYPE IT</Text>
              <View style={styles.orLine} />
            </View>
          </>
        ) : null}
        <ComposeField
          label={isRewriteRetake ? "Your improved version" : "What you'd say"}
          helper={isRewriteRetake ? "Edit freely — then analyse for a new score." : "Aim for 3–4 sentences (about 20+ words) for a full score."}
          initial={initial}
          onChangeText={onChangeText}
          onBlur={onBlur}
        />
        {/* Reserved-height word counter: turns success once there's enough to score. */}
        <Text style={[type.caption, { minHeight: 18, color: enough ? palette.success : palette.inkSoft }]}>
          {words === 0 ? " " : enough ? `${words} words · ready to analyse` : `${words} word${words === 1 ? "" : "s"} · add a little more`}
        </Text>
      </ScrollView>
      <Animated.View style={[styles.typedFooter, footerStyle]}>
        <Button label="Analyse my answer" icon="sparkle" size="lg" onPress={submit} />
        {showMic ? <Button label={isRewriteRetake ? "Record it instead" : "Use the microphone instead"} variant="ghost" icon="mic" onPress={onUseMic} /> : null}
      </Animated.View>
    </View>
  );
});

/** A small live counter shown under the transcript while recording. */
function LiveStat({ label, value, unit, tone }: { label: string; value: string; unit?: string; tone?: string }) {
  return (
    <View style={styles.liveStat}>
      <Text style={[type.label, { color: palette.inkSoft }]}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 3 }}>
        <Text style={[type.number, { fontSize: 20, color: tone ?? palette.ink }]}>{value}</Text>
        {unit ? <Text style={[type.caption, { marginBottom: 3 }]}>{unit}</Text> : null}
      </View>
    </View>
  );
}

/** Pre-permission explainer: shown once before the OS mic dialog so it feels
 * expected. A typed fallback keeps the flow alive if the user prefers not to. */
function MicPrimer({ onAllow, onType }: { onAllow: () => void; onType: () => void }) {
  return (
    <View style={[styles.body, { justifyContent: "center" }]}>
      <View style={styles.readyIcon}>
        <Icon name="mic" size={30} color={gradient.onHero} />
      </View>
      <Text style={[type.title, { textAlign: "center" }]}>Use your microphone?</Text>
      <Text style={[type.body, { color: palette.inkSoft, textAlign: "center" }]}>
        Podium listens so it can score your pace and fillers. Speech is turned into text on this phone — your audio never leaves the device and isn't saved.
      </Text>
      <Button label="Allow microphone" icon="mic" size="lg" onPress={onAllow} />
      <Button label="Type my answer instead" variant="ghost" icon="edit" onPress={onType} />
    </View>
  );
}

/** The currently-working step's indicator: a solid primary dot with a soft
 * pulsing halo — clearly active (never a pale, barely-visible dot). */
function WorkingDot() {
  const o = useSharedValue(0.3);
  useEffect(() => {
    o.value = withRepeat(withTiming(1, { duration: 650, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [o]);
  const halo = useAnimatedStyle(() => ({ opacity: o.value, transform: [{ scale: 0.9 + o.value * 0.5 }] }));
  return (
    <View style={{ alignItems: "center", justifyContent: "center" }}>
      <Animated.View style={[styles.workingHalo, halo]} />
      <View style={styles.workingCore} />
    </View>
  );
}

/** Imported-audio transcription in progress: a calm working state with the file
 * name and the live transcript as it's recognised on-device, plus a Cancel that
 * drops back to the paste flow (never a hang with no way out). */
function Transcribing({ fileName, interim, onCancel }: { fileName: string; interim: string; onCancel: () => void }) {
  return (
    <View style={[styles.body, { justifyContent: "center" }]}>
      <View style={styles.readyIcon}>
        <Icon name="document" size={30} color={gradient.onHero} />
      </View>
      <Text style={[type.title, { textAlign: "center" }]}>Transcribing your audio…</Text>
      <Text style={[type.body, { color: palette.inkSoft, textAlign: "center" }]} numberOfLines={1}>
        {fileName || "your recording"}
      </Text>
      <View style={styles.transcribeRow}>
        <WorkingDot />
        <Text style={[type.caption, { color: palette.inkSoft }]}>On your device — nothing is uploaded</Text>
      </View>
      {interim ? (
        <Card style={{ maxHeight: 180 }}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={[type.body, { color: palette.ink }]}>{interim}</Text>
          </ScrollView>
        </Card>
      ) : null}
      <Button label="Cancel" variant="ghost" onPress={onCancel} />
    </View>
  );
}

function Recovery({
  icon,
  title,
  body,
  primary,
  secondary,
}: {
  icon: "mic" | "micOff";
  title: string;
  body: string;
  primary: { label: string; onPress: () => void };
  secondary: { label: string; onPress: () => void };
}) {
  return (
    <View style={[styles.body, { justifyContent: "center" }]}>
      <View style={[styles.readyIcon, { backgroundColor: palette.warningSoft }]}>
        <Icon name={icon} size={30} color={palette.warning} />
      </View>
      <Text style={[type.title, { textAlign: "center" }]}>{title}</Text>
      <Text style={[type.body, { color: palette.inkSoft, textAlign: "center" }]}>{body}</Text>
      <Button label={primary.label} size="lg" onPress={primary.onPress} />
      <Button label={secondary.label} variant="ghost" onPress={secondary.onPress} />
    </View>
  );
}

function NoAllowance({ onClose, onPro, onBonus }: { onClose: () => void; onPro: (from: string) => void; onBonus: () => void }) {
  const { hours, minutes } = untilNextMidnight(Date.now());
  return (
    <View style={[styles.body, { justifyContent: "center" }]}>
      <View style={[styles.readyIcon, { backgroundColor: palette.warningSoft }]}>
        <Icon name="clock" size={30} color={palette.warning} />
      </View>
      <Text style={[type.title, { textAlign: "center" }]}>Great work today!</Text>
      <Text style={[type.body, { color: palette.inkSoft, textAlign: "center" }]}>
        You've used your free takes. More arrive at midnight (in {hours}h {minutes}m). Watch a short ad for a bonus take, go Pro for up to 48 a day, or review your past takes.
      </Text>
      <Button label="Watch an ad for a bonus take" icon="play" size="lg" onPress={onBonus} />
      <Button label="See Pro" icon="star" variant="secondary" onPress={() => onPro("allowance")} />
      <Button label="Back" variant="ghost" onPress={onClose} />
    </View>
  );
}

/** The 3-2-1 count-in orb: a big number in the brand circle that pops on each
 * tick with a ring that sweeps full over the second — so the user sees exactly
 * when recording begins (QA delight: the countdown used to stall silently). */
const COUNT_RING = 132;
const COUNT_R = (COUNT_RING - 8) / 2;
const COUNT_C = 2 * Math.PI * COUNT_R;
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
function CountInOrb({ n }: { n: number }) {
  const s = useSharedValue(1);
  const o = useSharedValue(1);
  const sweep = useSharedValue(0);
  useEffect(() => {
    s.value = 1.15;
    s.value = withTiming(1, { duration: 480, easing: Easing.out(Easing.quad) });
    o.value = 0.45;
    o.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.quad) });
    // Fill the ring over this tick's ~680ms so the motion reads as a real timer.
    sweep.value = 0;
    sweep.value = withTiming(1, { duration: 660, easing: Easing.linear });
  }, [n, s, o, sweep]);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  // Cross-fade the numeral itself so "2" and "1" each pop in fresh (never a
  // static or duplicated-looking digit between frames).
  const numAnim = useAnimatedStyle(() => ({ opacity: o.value }));
  const ring = useAnimatedProps(() => ({ strokeDashoffset: COUNT_C * (1 - sweep.value) }));
  return (
    <Animated.View style={[styles.countOrbWrap, anim]} accessibilityLabel={`Starting in ${n}`}>
      <Svg width={COUNT_RING} height={COUNT_RING} style={StyleSheet.absoluteFill}>
        <Circle cx={COUNT_RING / 2} cy={COUNT_RING / 2} r={COUNT_R} stroke={palette.primarySoft} strokeWidth={4} fill="none" />
        <AnimatedCircle
          cx={COUNT_RING / 2}
          cy={COUNT_RING / 2}
          r={COUNT_R}
          stroke={palette.primary}
          strokeWidth={4}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={COUNT_C}
          animatedProps={ring}
          transform={`rotate(-90 ${COUNT_RING / 2} ${COUNT_RING / 2})`}
        />
      </Svg>
      <View style={styles.countOrb}>
        <Animated.Text style={[styles.countNum, numAnim]}>{n}</Animated.Text>
      </View>
    </Animated.View>
  );
}

/** The tap-to-record mic with a slow breathing halo (liveness), a press scale
 * and — on tap — a clear ripple that fires just after the press (+haptic) so the
 * action feels deliberate and satisfying, not just a faint halo. */
function MicOrb({ onPress }: { onPress: () => void }) {
  const ring = useSharedValue(0);
  const ripple = useSharedValue(0);
  useEffect(() => {
    ring.value = withRepeat(withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.quad) }), -1, false);
  }, [ring]);
  const halo = useAnimatedStyle(() => ({ opacity: 0.5 * (1 - ring.value), transform: [{ scale: 1 + ring.value * 0.35 }] }));
  const rippleStyle = useAnimatedStyle(() => ({ opacity: 0.55 * (1 - ripple.value), transform: [{ scale: 1 + ripple.value * 0.8 }] }));
  const handlePress = () => {
    feedback("tap", "heavy"); // firm, unmistakable tap cue
    ripple.value = 0;
    ripple.value = withTiming(1, { duration: 480, easing: Easing.out(Easing.quad) });
    onPress();
  };
  return (
    <View style={{ alignItems: "center", justifyContent: "center", height: 150 }}>
      <Animated.View pointerEvents="none" style={[styles.orbRing, halo]} />
      <Animated.View pointerEvents="none" style={[styles.orbRipple, rippleStyle]} />
      <Tappable label="Start recording" onPress={handlePress} scale={0.88} sound={null} style={styles.orbTap}>
        <Icon name="mic" size={44} color={gradient.onHero} />
      </Tappable>
    </View>
  );
}

/** Free-practice feedback: deterministic metrics + transcript, nothing saved or
 * spent. The paid value (saving, AI rewrite/tips, baseline) is the upgrade CTA. */
function PracticeResult({
  transcript,
  metrics,
  insetBottom,
  onAgain,
  onPro,
  onClose,
}: {
  transcript: Transcript;
  metrics: Metrics;
  insetBottom: number;
  onAgain: () => void;
  onPro: () => void;
  onClose: () => void;
}) {
  const paceNote = metrics.paceVerdict === "fast" ? "A touch fast" : metrics.paceVerdict === "slow" ? "A little slow" : "Nicely paced";
  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.practiceScroll, { paddingBottom: insetBottom + space.xl }]}>
        <HeroCard
          overline="Practice take"
          value={`${metrics.overallScore}`}
          caption={scoreLabel(metrics.overallScore)}
          status={{ label: "Not saved · not scored", tone: "warning" }}
          right={
            <ProgressRing
              value={metrics.overallScore / 100}
              size={88}
              stroke={10}
              color={gradient.onHero}
              track={gradient.pill}
              labelColor={gradient.onHero}
              label={`${metrics.overallScore}`}
              sublabel="/100"
            />
          }
        >
          <Text style={[type.caption, { color: gradient.onHeroSoft }]}>Free practice — go Pro to save takes, track progress and get AI coaching.</Text>
        </HeroCard>

        <View style={styles.grid}>
          <MetricTile label="Pace" value={`${metrics.wpmOverall}`} unit="wpm" note={paceNote} icon="wave" tone={metrics.paceVerdict === "good" ? "success" : "warning"} />
          <MetricTile label="Fillers" value={`${metrics.fillersPerMin}`} unit="/min" note={`${metrics.fillerTotal} this take`} icon="flag" tone={metrics.fillersPerMin < 3 ? "success" : "warning"} />
        </View>
        <View style={styles.grid}>
          <MetricTile label="Pauses" value={`${metrics.pauseStats.count}`} unit="pauses" note={`longest ${(metrics.pauseStats.longestMs / 1000).toFixed(1)}s`} icon="pause" />
          <MetricTile label="Confidence" value={`${metrics.confidence}`} unit="/100" note={`Clarity ${metrics.clarity}`} icon="flame" tone={scoreTone(metrics.confidence)} />
        </View>

        <Card style={{ gap: space.sm }}>
          <Text style={type.label}>YOUR WORDS</Text>
          <TranscriptView transcript={transcript} />
        </Card>
      </ScrollView>
      <View style={[styles.practiceFooter, { paddingBottom: insetBottom + space.md }]}>
        <Button label="Go Pro to save & get AI coaching" icon="star" size="lg" onPress={onPro} />
        <View style={styles.grid}>
          <View style={{ flex: 1 }}><Button label="Practice again" variant="secondary" icon="refresh" onPress={onAgain} /></View>
          <View style={{ flex: 1 }}><Button label="Done" variant="ghost" onPress={onClose} /></View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
  bar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space.sm, paddingVertical: space.sm, gap: space.sm },
  body: { flex: 1, paddingHorizontal: space.lg, paddingBottom: space.xl, gap: space.lg, width: "100%", maxWidth: CONTENT_MAX, alignSelf: "center" },
  scrollBody: { flexGrow: 1, paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.xl, gap: space.lg, width: "100%", maxWidth: CONTENT_MAX, alignSelf: "center" },
  // Typed-answer screen: scrolling body + a pinned action bar that rises with the
  // keyboard so "Analyse my answer" is never covered.
  typedRoot: { flex: 1, width: "100%", maxWidth: CONTENT_MAX, alignSelf: "center" },
  typedFooter: { gap: space.sm, paddingHorizontal: space.lg, paddingTop: space.md, borderTopWidth: 1, borderTopColor: palette.border, backgroundColor: palette.bg },
  promptCard: { gap: 6 },
  readyIcon: { alignSelf: "center", width: 64, height: 64, borderRadius: radius.xl, backgroundColor: gradient.hero[0], alignItems: "center", justifyContent: "center" },
  tipRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  readyFooter: { gap: space.sm, paddingHorizontal: space.lg, paddingBottom: space.lg, paddingTop: space.sm },
  // Ready screen: scrolls on short phones; footer is pinned below the scroll.
  readyRoot: { flex: 1, width: "100%", maxWidth: CONTENT_MAX, alignSelf: "center" },
  readyScroll: { flexGrow: 1, justifyContent: "center", gap: space.lg, paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.lg },
  promptHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  promptIcon: { width: 28, height: 28, borderRadius: 8, backgroundColor: palette.primarySoft, alignItems: "center", justifyContent: "center" },
  promptStrip: { flexDirection: "row", alignItems: "center", gap: space.sm, backgroundColor: palette.surfaceAlt, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.sm },
  orbWrap: { alignItems: "center", justifyContent: "center", gap: space.sm, paddingVertical: space.md },
  orbTap: { width: 120, height: 120, borderRadius: 60, backgroundColor: palette.primary, alignItems: "center", justifyContent: "center", shadowColor: palette.primary, shadowOpacity: 0.3, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
  orbRing: { position: "absolute", width: 120, height: 120, borderRadius: 60, borderWidth: 2, borderColor: palette.primary },
  orbRipple: { position: "absolute", width: 120, height: 120, borderRadius: 60, backgroundColor: palette.primary },
  tipsCard: { alignSelf: "stretch", gap: space.sm, backgroundColor: palette.surfaceAlt, borderRadius: radius.lg, padding: space.md },
  shuffleBtn: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: palette.primarySoft, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  fadeFill: { flex: 1, gap: space.lg, width: "100%" },
  countCenter: { flex: 1, alignItems: "center", justifyContent: "center", gap: space.lg, paddingHorizontal: space.lg },
  countOrbWrap: { width: 132, height: 132, alignItems: "center", justifyContent: "center" },
  countOrb: { width: 112, height: 112, borderRadius: 56, backgroundColor: palette.primary, alignItems: "center", justifyContent: "center", shadowColor: palette.primary, shadowOpacity: 0.3, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
  countNum: { fontFamily: type.hero.fontFamily, fontSize: 64, lineHeight: 72, color: gradient.onHero },
  listenCenter: { alignItems: "center", gap: space.sm, marginTop: space.md },
  listeningPill: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: palette.dangerSoft, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 7 },
  listeningDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: palette.danger },
  liveBox: { flex: 1, minHeight: 108, backgroundColor: palette.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: palette.border, overflow: "hidden" },
  liveScroll: { flex: 1 },
  liveFadeTop: { position: "absolute", top: 0, left: 0, right: 0, height: 20 },
  liveStats: { flexDirection: "row", alignItems: "center", justifyContent: "space-around", backgroundColor: palette.surfaceAlt, borderRadius: radius.lg, paddingVertical: space.sm, paddingHorizontal: space.sm },
  liveStat: { alignItems: "center", gap: 2, flex: 1 },
  liveStatDivider: { width: 1, height: 28, backgroundColor: palette.border },
  micNote: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: space.md },
  listenFooter: { gap: space.md, paddingTop: space.xs },
  barWrap: { justifyContent: "center", marginBottom: space.xs },
  takeTrack: { height: 8, borderRadius: radius.pill, backgroundColor: palette.surfaceAlt, overflow: "hidden" },
  takeFill: { height: 8, borderRadius: radius.pill },
  goalWrap: { position: "absolute", top: -17, alignItems: "center", gap: 1, marginLeft: -9 },
  goalMark: { width: 2, height: 10, borderRadius: 1 },
  typedInput: { minHeight: 120, paddingTop: space.md, textAlignVertical: "top" },
  cancelBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: palette.surfaceAlt },
  analyseHead: { alignItems: "center", gap: space.sm },
  confirmCheck: { width: 64, height: 64, borderRadius: radius.xl, backgroundColor: palette.primary, alignItems: "center", justifyContent: "center" },
  checkRow: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 28 },
  checkPending: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: palette.border },
  checkWorking: { width: 22, height: 22, alignItems: "center", justifyContent: "center" },
  workingHalo: { position: "absolute", width: 22, height: 22, borderRadius: 11, backgroundColor: palette.primarySoft },
  workingCore: { width: 12, height: 12, borderRadius: 6, backgroundColor: palette.primary },
  practiceScroll: { paddingHorizontal: space.lg, paddingTop: space.xs, gap: space.lg, width: "100%", maxWidth: CONTENT_MAX, alignSelf: "center" },
  grid: { flexDirection: "row", gap: space.md },
  practiceFooter: { paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.sm, borderTopWidth: 1, borderTopColor: palette.border, backgroundColor: palette.bg },
  importRow: { flexDirection: "row", alignItems: "center", gap: space.md, backgroundColor: palette.surface, borderRadius: radius.lg, padding: space.md, borderWidth: 1.5, borderColor: palette.primary, minHeight: 64 },
  importIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: palette.primarySoft, alignItems: "center", justifyContent: "center" },
  orDivider: { flexDirection: "row", alignItems: "center", gap: space.md },
  orLine: { flex: 1, height: 1, backgroundColor: palette.border },
  transcribeRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm },
});
