import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Keyboard, StyleSheet, Text, View } from "react-native";
import Animated, { LinearTransition, useAnimatedStyle } from "react-native-reanimated";
import {
  AiReport,
  Button,
  Card,
  Confetti,
  HeroCard,
  Icon,
  FocusSentence,
  InputMeter,
  Pill,
  Sheet,
  TextField,
  Tappable,
  feedback,
  gradient,
  palette,
  radius,
  space,
  springs,
  type,
} from "../ui";
import { useAudioPlayer } from "expo-audio";
import { ModelPlayback } from "../ui/ModelPlayback";
import { MouthGuide } from "../ui/MouthGuide";
import { validateCustomText } from "../core/profile";
import { coachingPhrases, transcriptMatch } from "../core/practice";
import { canOfferPro } from "../modules/purchase-ui";
import { ai } from "../modules/ai";
import { ads } from "../modules/ads";
import { analytics } from "../modules/analytics";
import { review } from "../modules/review";
import { useDictation, tts } from "../modules/speech";
import { gymStore, useGym } from "../core/data";
import {
  completeDrill,
  completeGuidedPractice,
  pro as isProNow,
  recordCustom,
  recordDiagnostic,
  recordPractice,
  reviewItem,
  watchRewarded,
  saveCustomText,
  soundReport,
} from "../core/state";
import {
  CLOSE_SCORE,
  coachingPhoneme,
  flaggedSounds,
  hasEstimatedContrast,
  interpret,
  parseScoreResult,
} from "../core/scoring";
import { ipaForSound, soundLabel } from "../core/accent";
import { SOUND_BY_ID, pairsForSound } from "../core/sounds";
import { remaining } from "../core/quota";
import { dateKey } from "../core/dates";
import type { Attempt, L1, ScoreResult, WordScore } from "../core/types";

export type SpeakMode =
  | { kind: "practice"; sentenceId?: string; text: string; soundTags: string[]; isRetry?: boolean; title?: string }
  | { kind: "diagnostic"; sentenceId: string; text: string; soundTags: string[]; index: number; total: number }
  | { kind: "custom"; text: string; soundTags: string[] }
  | { kind: "drill"; soundId: string; text: string; soundTags: string[] }
  | { kind: "review"; srsId: string; text: string; soundTags: string[] };

type Phase = "ready" | "listening" | "stopping" | "scoring" | "result" | "blocked" | "mismatch" | "error" | "text_done";

/** Promise with a hard timeout so a hung AI call can never freeze the screen (ANR). */
async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([p.catch(() => null), new Promise<null>((r) => { timer = setTimeout(() => r(null), ms); })]);
  } finally { if (timer) clearTimeout(timer); }
}

/**
 * The core "record one line, see every sound scored" flow, reused by Practice,
 * the daily session, Sounds drills and Review. Honesty first: low-confidence or
 * silent input shows "try again", never a fake 90–100%. Every sound is scored;
 * each miss gets a plain AI fix tip, a mouth-position cue and a model/you replay.
 */
export function SpeakSheet({
  visible,
  mode,
  onClose,
  onScored,
  onPro,
  startWithoutMic = false,
}: {
  visible: boolean;
  mode: SpeakMode | null;
  onClose: () => void;
  onScored?: (attempt: Attempt | undefined) => void;
  onPro?: (from: string) => void;
  startWithoutMic?: boolean;
}) {
  const gym = useGym();
  const accent = gym.profile.targetAccent;
  const l1: L1 = gym.profile.nativeLanguage;
  const ipaOn = gym.profile.ipaOn;
  const dict = useDictation(accent);
  const requestId = useRef(0);
  const [selfPractice, setSelfPractice] = useState(false);
  const [expandedHeard, setExpandedHeard] = useState(false);
  const [guidedSaved, setGuidedSaved] = useState(false);
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [heard, setHeard] = useState("");
  const [scoreError, setScoreError] = useState("");
  const [adUnavailable, setAdUnavailable] = useState(false);
  const [rewardStatus, setRewardStatus] = useState("");
  const [phase, setPhase] = useState<Phase>("ready");
  const [attempt, setAttempt] = useState<Attempt | undefined>();
  const [typed, setTyped] = useState("");
  const [typing, setTyping] = useState(false);
  const [openWord, setOpenWord] = useState<number | null>(null);
  const [burst, setBurst] = useState(0);
  const scoredRef = useRef(false);
  const stopAckUntil = useRef(0);

  useEffect(() => () => { requestId.current += 1; }, []);

  const now = Date.now();
  const today = dateKey(new Date());
  const pro = isProNow(gym, now);
  const left = remaining(gym.quota, today, pro);
  const gated = (mode?.kind === "practice" || mode?.kind === "custom") && !pro && left <= 0;

  // Reset when (re)opened.
  useEffect(() => {
    if (visible && mode) {
      requestId.current += 1;
      setSelfPractice(false);
      setExpandedHeard(false);
      setGuidedSaved(false);
      setPhraseIndex(0);
      setHeard(startWithoutMic ? mode.text : "");
      setScoreError("");
      setAdUnavailable(false);
      setRewardStatus("");
      setPhase(startWithoutMic ? "text_done" : gated ? "blocked" : "ready");
      setAttempt(undefined);
      setTyped("");
      setTyping(false);
      setOpenWord(null);
      scoredRef.current = false;
      stopAckUntil.current = 0;
      dict.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, mode?.kind, (mode as { sentenceId?: string })?.sentenceId, (mode as { text?: string })?.text, startWithoutMic]);

  const score = useCallback(
    async (transcript: string, ownWords = false, part = 0) => {
      if (!mode || scoredRef.current) return;
      scoredRef.current = true;
      const request = ++requestId.current;
      setHeard(transcript);
      Keyboard.dismiss();
      const target = ownWords ? coachingPhrases(transcript)[part] ?? transcript : mode.text;
      setPhraseIndex(part);
      const scoringTranscript = ownWords ? target : transcript;
      const match = transcriptMatch(target, scoringTranscript);
      if (!match.accepted) { setPhase("mismatch"); scoredRef.current = false; return; }
      setPhase("scoring");
      // Paint the busy view before starting any service work.
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      if (request !== requestId.current) return;
      // Never synthesize a pronunciation score from a transcript when the scorer is unavailable.
      let raw: ScoreResult | null = null;
      let failure = "AI coaching is unavailable in this build. Model audio and sound guides work offline.";
      if (ai.enabled) {
        const res = await withTimeout(
          ai.run("score_pronunciation", JSON.stringify({ target, transcript: scoringTranscript, accent, nativeLanguage: l1 })),
          45000,
        );
        if (request !== requestId.current) return;
        if (res && res.ok) {
          raw = parseScoreResult(res.json);
          failure = "The coach returned incomplete sound feedback. No score was saved. Retry this phrase or use the offline sound guide.";
        }
        else if (res && !res.ok && res.reason === "quota") {
          onPro?.("ai_quota");
          setPhase("blocked");
          scoredRef.current = false;
          return;
        } else {
          failure = !res ? "The coach did not respond within 45 seconds. No score was saved. Retry this phrase or practise offline."
            : res.reason === "offline" ? "The coaching service could not be reached. Your transcript is safe. Reconnect and retry, or practise offline."
            : res.reason === "busy" ? "The coach is busy with another request. Wait a moment and retry this phrase, or practise offline."
            : res.reason === "disabled" ? "AI coaching is unavailable in this build. Model audio and sound guides work offline."
            : "The coaching service could not return sound feedback. No score was saved. Retry this phrase or use the offline sound guide.";
        }
      }
      if (!raw || !raw.words.length || raw.words.some(w => !w.word || !Number.isFinite(w.score) || w.phonemes.some(p => !Number.isFinite(p.score)))) {
        setScoreError(failure);
        scoredRef.current = false;
        setPhase("error");
        return;
      }
      if (raw.confidence < 0.5) {
        setAttempt(interpret(`uncertain-${now}`, raw, { accent, timestamp: now }));
        setPhase("result");
        scoredRef.current = false;
        return;
      }

      if (transcriptMatch(target, raw.words.map(w => w.word).join(" ")).coverage !== 1) {
        setScoreError("The scorer returned a different sentence. Your input is kept; retry for feedback on this line.");
        setPhase("error"); scoredRef.current = false; return;
      }
      const s0 = gymStore.get();
      const meta = { accent, timestamp: now, recordingPath: dict.recordingUri ?? undefined, sentenceId: mode.kind === "practice" || mode.kind === "diagnostic" ? mode.sentenceId : undefined };
      let out: { state: typeof s0; attempt?: Attempt; blocked?: "quota" };
      if (ownWords) out = recordPractice(s0, raw, { ...meta, sentenceId: undefined, customText: target }, today, now);
      else if (mode.kind === "diagnostic") out = recordDiagnostic(s0, raw, meta, today);
      else if (mode.kind === "custom") out = recordCustom(s0, mode.text, raw, today, now, dict.recordingUri ?? undefined);
      else if (mode.kind === "drill") {
        // Score locally for the drill meter, fold mastery through completeDrill.
        const a = interpret(`drill-${now}`, raw, meta);
        const ratio = Math.max(0, Math.min(1, a.overallScore / 100));
        gymStore.set((s) => completeDrill(s, mode.soundId, ratio, today));
        out = { state: gymStore.get(), attempt: a };
      } else if (mode.kind === "review") {
        // Grade the spaced-repetition item by the attempt; never quota-gated.
        const a = interpret(`rev-${now}`, raw, meta);
        const correct = !a.lowConfidence && a.overallScore >= CLOSE_SCORE;
        gymStore.set((s) => reviewItem(s, mode.srsId, correct, today));
        out = { state: gymStore.get(), attempt: a };
      } else {
        out = recordPractice(s0, raw, { ...meta, isRetry: mode.isRetry }, today, now);
      }
      if (out.blocked === "quota") {
        setPhase("blocked");
        scoredRef.current = false;
        return;
      }
      if (ownWords || (mode.kind !== "drill" && mode.kind !== "review")) gymStore.set(() => out.state);
      const a = out.attempt;
      setAttempt(a);
      if (a?.wordScores.length) {
        const contrast = a.wordScores.findIndex(w => w.phonemes.some(hasEstimatedContrast));
        setOpenWord(contrast >= 0 ? contrast : 0);
      }
      setPhase("result");
      if (a && !a.lowConfidence) {
        analytics.track("core_action", { feature: ownWords ? "free_speech" : mode.kind === "diagnostic" ? "sound_check" : "pronunciation" });
        review.actionCompleted();
        // Celebrate completing practice, rather than an unmeasured pronunciation grade.
        feedback("success", "success");
        setBurst((b) => b + 1);
      } else {
        feedback("error", "warning");
      }

    },
    [mode, accent, l1, now, today, onPro, onScored, dict.recordingUri],
  );

  // When dictation produces a final transcript, score it.
  useEffect(() => {
    if (!visible || !["listening", "stopping", "ready"].includes(phase) || dict.finalText == null) return;
    const text = dict.finalText.trim();
    const request = requestId.current;
    // Stop the mic immediately, but retain the visible checkmark long enough to
    // acknowledge a quick tap before switching to the coaching view.
    const timer = setTimeout(() => {
      if (request !== requestId.current) return;
      if (text) void score(text);
      else { setHeard(""); setPhase("mismatch"); }
    }, Math.max(0, stopAckUntil.current - Date.now()));
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dict.finalText, visible]);

  useEffect(() => {
    if (dict.status === "denied" || dict.status === "error") setPhase(p => p === "listening" || p === "stopping" ? "ready" : p);
  }, [dict.status]);

  useEffect(() => {
    if (phase !== "stopping" || dict.finalText != null) return;
    const timer = setTimeout(() => {
      setHeard(dict.transcript);
      setScoreError("The microphone did not finish sending its words. Your transcript is kept. Retry coaching, record again, or practise without a mic.");
      setPhase("error");
    }, 2500);
    return () => clearTimeout(timer);
  }, [phase, dict.finalText, dict.transcript]);

  const startMic = () => {
    tts.stop();
    feedback("tap", "medium");
    stopAckUntil.current = 0;
    setPhase("listening");
    scoredRef.current = false;
    void dict.start();
  };
  const submitTyped = () => {
    if (validateCustomText(typed)) return;
    dict.reset();
    Keyboard.dismiss();
    setGuidedSaved(false);
    setPhraseIndex(0);
    setHeard(typed.trim());
    if (mode?.kind === "custom") gymStore.set(s => saveCustomText(s, mode.text, today));
    setPhase("text_done");
  };
  const retry = () => {
    requestId.current += 1;
    setSelfPractice(false);
    setAttempt(undefined);
    setOpenWord(null);
    scoredRef.current = false;
    dict.reset();
    setPhase("ready");
  };

  const openGuidedPractice = (text = mode?.text ?? "") => {
    requestId.current += 1;
    scoredRef.current = false;
    dict.reset();
    tts.stop();
    Keyboard.dismiss();
    setHeard(text);
    setPhraseIndex(0);
    setGuidedSaved(false);
    setSelfPractice(false);
    setPhase("text_done");
  };

  const phrases = coachingPhrases(heard);
  const coachingText = selfPractice ? phrases[phraseIndex] ?? heard : mode?.text ?? "";

  const title =
    mode?.kind === "diagnostic"
      ? `Sound check · ${mode.index + 1} of ${mode.total}`
      : mode?.kind === "drill"
        ? `${soundLabel(mode.soundId)} drill`
        : mode?.kind === "custom"
          ? "Your phrase"
          : (mode as { title?: string })?.title ?? "Practice";

  const close = () => {
    requestId.current += 1;
    tts.stop();
    dict.reset();
    onClose();
  };

  if (!mode) return null;
  const recording = phase === "ready" || phase === "listening" || phase === "stopping";
  const recovering = phase === "mismatch" || phase === "error";
  const recordAgain = () => { retry(); setTyping(false); startMic(); };
  return (
    <Sheet fullHeight fillContent={recording && !typing} visible={visible} resetScrollKey={recording ? "recording" : phase} title={selfPractice ? "Your spoken words" : title} onClose={close}
      footer={recovering ? <View style={{ gap: space.sm, paddingTop: space.sm }}>
        <Button label={phase === "error" && heard.trim() ? "Retry coaching" : "Record the prompt again"} icon="refresh" onPress={phase === "error" && heard.trim() ? () => void score(heard, selfPractice, phraseIndex) : recordAgain} />
        {heard.trim() ? phase === "mismatch" ? <Button label={phrases.length > 1 ? "Coach my first phrase instead" : "Coach my words instead"} variant="secondary" onPress={() => { setSelfPractice(true); void score(heard, true); }} /> : <Button label="Record again" variant="secondary" icon="mic" onPress={recordAgain} /> : null}
        <Button label="Listen & say without a mic" variant="ghost" onPress={() => openGuidedPractice()} />
      </View> : phase === "text_done" ? <View style={{ gap: space.sm, paddingTop: space.sm }}>
        <Text style={[type.bodyStrong, { color: palette.ink, minHeight: 26 }]} accessibilityLiveRegion="polite">
          {guidedSaved ? `✓ Saved on this phone · ${gym.streak.current} day${gym.streak.current === 1 ? "" : "s"} in your streak` : "Say it aloud, then save your practice."}
        </Text>
        <Button label={guidedSaved ? "Continue practising" : "I said it — save practice"} icon="check" onPress={() => {
          if (guidedSaved) { if (mode.kind !== "diagnostic" && onScored) onScored(undefined); else close(); return; }
          const before = gymStore.get();
          const after = completeGuidedPractice(before, heard, today);
          if (after === before) return;
          gymStore.set(() => after);
          setGuidedSaved(true);
          tts.stop();
          analytics.track("core_action", { feature: "guided_practice" });
          review.actionCompleted();
          feedback("success", "success"); setBurst(b => b + 1);
        }} />
      </View> : recording && !typing ? <View style={{ gap: space.xs, paddingTop: space.xs }}>
        <RecordControls dict={dict} phase={phase} onStart={startMic}
          onStop={() => { stopAckUntil.current = Date.now() + 320; setPhase("stopping"); dict.stop(); }} />
        {phase === "ready" ? <Button label="Listen & say without a mic" variant="secondary" icon="play" onPress={() => openGuidedPractice()} /> : null}
        <Button label="Type instead" variant="ghost" size="sm" disabled={phase === "stopping"} onPress={() => { dict.reset(); setTyping(true); setPhase("ready"); }} />
      </View> : typing && phase === "ready" ? <View style={{ gap: space.sm }}>
        <Button label="Start listen & say" icon="play" disabled={!!validateCustomText(typed)} onPress={submitTyped} />
        <Button label="Use the mic instead" variant="ghost" onPress={() => { Keyboard.dismiss(); setTyping(false); }} />
      </View> : undefined}>
      <View style={{ gap: space.md, flexGrow: recording && !typing ? 1 : 0 }}>
        {phase === "blocked" ? (
          <QuotaBlock
            unavailable={adUnavailable}
            onPro={() => { close(); onPro?.("speak_quota"); }}
            onWatch={() => {
              const shown = ads.showRewarded(() => {
                gymStore.set((s) => watchRewarded(s, dateKey(new Date())));
                setRewardStatus("3 extra practice attempts added. Your AI service allowance also applies.");
                retry();
              });
              if (!shown) setAdUnavailable(true);
            }}
            onClose={close}
            onPractice={() => openGuidedPractice()}
          />
        ) : (
          <>
            {rewardStatus ? <Text style={[type.bodyStrong, { color: palette.success }]} accessibilityLiveRegion="polite">{rewardStatus}</Text> : null}
            {recording ? <TargetCard text={coachingText} soundTags={selfPractice ? [] : mode.soundTags} ipaOn={ipaOn} accent={accent}
              transcript={selfPractice ? heard : undefined} phrase={selfPractice && phrases.length > 1 ? `${phraseIndex + 1} of ${phrases.length}` : undefined} /> : null}

            {phase === "mismatch" || phase === "error" ? (
              <View style={{ gap: space.md }}>
                <Pill label={phase === "mismatch" ? "No check used" : "No result saved"} tone="neutral" />
                <Text style={type.title}>{phase === "mismatch" ? heard.trim() ? "Different words. Let's reset." : "No words heard yet" : "Coaching could not finish"}</Text>
                {phase === "error" ? <Text style={type.caption}>{scoreError}</Text> : null}
                <Card style={{ gap: space.sm, padding: space.md }}>
                  {!selfPractice ? <>
                    <Text style={type.overline}>PROMPT</Text>
                    <Text style={type.bodyStrong}>{mode.text}</Text>
                  </> : null}
                  <Text style={type.overline}>{phrases.length > 1 ? `YOUR FIRST PHRASE · 1 OF ${phrases.length}` : "YOUR WORDS"}</Text>
                  <Text style={type.body}>{expandedHeard ? heard : phrases[0] || "Try a quiet spot, or use listen & say."}</Text>
                  {phrases.length > 1 ? <Button label={expandedHeard ? "Show first phrase" : "Read full transcript"} variant="ghost" size="sm" onPress={() => setExpandedHeard(v => !v)} /> : null}
                </Card>
                {mode.kind === "diagnostic" && heard.trim() ? <Text style={type.caption}>For your sound plan, record the prompt. Coaching your own words is separate practice.</Text> : null}
              </View>
            ) : phase === "text_done" ? (
              <Card accent={guidedSaved ? palette.success : palette.primary}>
                <Pill label={guidedSaved ? "Practice complete" : "Listen & say · unscored"} tone={guidedSaved ? "success" : "neutral"} />
                <Text style={type.heading}>{guidedSaved ? "Practice saved. Nice work!" : "One phrase. Your pace."}</Text>
                <Text style={type.title}>{heard}</Text>
                {guidedSaved ? <>
                  <Text style={type.body}>Your streak is up to date. This practice is saved on your phone.</Text>
                  <Text style={type.caption}>Listen-and-say builds your habit. Sound scores and AI checks stay unchanged.</Text>
                </> : <>
                  <ModelPlayback text={heard} accent={accent} />
                  {mode.soundTags[0] ? <MouthGuide soundId={mode.soundTags[0]} /> : null}
                  <Text style={type.caption}>Read it aloud. No microphone needed, and no pronunciation score is invented.</Text>
                  <Button label="Use recording instead" variant="ghost" icon="mic" onPress={() => { setTyping(false); retry(); startMic(); }} />
                </>}
              </Card>
            ) : phase === "result" && attempt ? (
              <ResultView
                attempt={attempt}
                mode={selfPractice ? { kind: "custom", text: coachingText, soundTags: [] } : mode}
                openWord={openWord}
                setOpenWord={setOpenWord}
                accent={accent}
                l1={l1}
                onPro={() => onPro?.("fix_tip_quota")}
                onRetry={retry}
                nextPhrase={selfPractice && phraseIndex < phrases.length - 1 ? () => { scoredRef.current = false; setAttempt(undefined); void score(heard, true, phraseIndex + 1); } : undefined}
                onUnscored={() => openGuidedPractice()}
                onDone={() => { dict.reset(); tts.stop(); if (onScored && !(selfPractice && mode.kind === "diagnostic")) onScored(attempt); else close(); }}
                transcript={selfPractice ? coachingText : heard}
                recordingPath={dict.recordingUri}
              />
            ) : phase === "scoring" ? (
              <CoachingProgress text={coachingText} onOffline={() => openGuidedPractice(coachingText)} onCancel={() => {
                requestId.current += 1; scoredRef.current = false;
                setScoreError("Coaching stopped. Your words are kept below. Retry whenever you’re ready."); setPhase("error");
              }} />
            ) : (
              <RecordArea
                dict={dict}
                phase={phase}
                typing={typing}
                typed={typed}
                setTyped={setTyped}
              />
            )}
          </>
        )}
      </View>
      {burst > 0 ? <Confetti trigger={burst} count={24} /> : null}
    </Sheet>
  );
}

function CoachingProgress({ text, onOffline, onCancel }: { text: string; onOffline: () => void; onCancel: () => void }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);
  return <View style={{ gap: space.md }} accessibilityLiveRegion="polite">
    <Pill label="Recording received · words kept" tone="success" />
    <Text style={type.title}>{elapsed >= 8 ? "Your coach needs a little longer" : "Let’s find your next sound to fix"}</Text>
    <Text style={type.body}>“{text}”</Text>
    <Card style={{ gap: space.md }}>
      <View style={styles.progressStep}><Icon name="check" color={palette.inkSoft} size={24} /><Text style={[type.bodyStrong, { flex: 1 }]}>1 · Transcript checked</Text></View>
      <View style={styles.progressStep}><ActivityIndicator color={palette.inkSoft} /><View style={{ flex: 1 }}><Text style={type.bodyStrong}>2 · Waiting for sound feedback</Text><Text style={type.caption}>Every word, for your selected accent</Text></View><Text style={type.amount}>{elapsed}s</Text></View>
      <Text style={type.caption}>Next: recognised words, suggested sound comparisons and model audio. Text alone cannot measure pronunciation.</Text>
    </Card>
    <Button label="Getting coaching…" loading />
    <Text style={[type.caption, { minHeight: 54 }]}>{elapsed >= 8 ? "Your words are safe. Keep waiting, or switch to free offline practice below. If no reply arrives within 45 seconds, you can retry this recording." : "Sound feedback needs a connection. You can keep practising offline at any time."}</Text>
    <Button label="Practise this phrase offline" icon="play" variant="secondary" onPress={onOffline} />
    <Button label="Stop and keep my words" variant="ghost" onPress={onCancel} />
  </View>;
}

function TargetCard({ text, soundTags, ipaOn, accent, transcript, phrase }: { text: string; soundTags: string[]; ipaOn: boolean; accent: "us" | "uk"; transcript?: string; phrase?: string }) {
  const [expanded, setExpanded] = useState(false);
  const tags = soundTags.filter((t) => SOUND_BY_ID[t]);
  return <Card style={{ gap: space.sm, padding: space.md }}>
    {phrase ? <Text style={type.label}>Coaching phrase {phrase}</Text> : null}
    <FocusSentence text={text} soundId={tags[0]} />
    {transcript && transcript !== text ? <>
      <Text style={type.caption}>Full recording · {transcript.trim().split(/\s+/).length} words saved</Text>
      {expanded ? <Text style={type.body}>{transcript}</Text> : null}
      <Button label={expanded ? "Collapse full transcript" : "Expand full transcript"} variant="ghost" onPress={() => setExpanded(v => !v)} />
    </> : null}
    {ipaOn && tags.length ? <View style={styles.ipaRow}>{tags.map(t => <View key={t} style={styles.ipaChip}>
      <Text style={[type.caption, { color: palette.ink }]}>/{ipaForSound(t, accent)}/ as in “{SOUND_BY_ID[t].examples[0]}”</Text>
    </View>)}</View> : null}
    <ModelPlayback text={text} accent={accent} />
  </Card>;
}

function RecordArea({
  dict,
  phase,
  typing,
  typed,
  setTyped,
}: {
  dict: ReturnType<typeof useDictation>;
  phase: Phase;
  typing: boolean;
  typed: string;
  setTyped: (s: string) => void;
}) {
  const stopping = phase === "stopping";
  const listening = phase === "listening";

  if (typing) {
    return (
      <View style={{ gap: space.md }}>
        <TextField
          label="Text-only practice"
          placeholder="Type a line to listen and say aloud"
          maxLength={200}
          value={typed}
          onChangeText={setTyped}
          autoFocus
          multiline
          returnKeyType="done"
        />
        {typed.trim() && validateCustomText(typed) ? <Text style={[type.caption, { color: palette.warning }]}>Add an English word or sentence, up to 200 characters.</Text> : null}
        <Text style={type.caption}>Listen-and-say practice counts toward your streak, without a pronunciation score.</Text>

      </View>
    );
  }

  return (
    <View style={{ gap: space.sm, flexGrow: 1 }}>
      <Animated.View layout={LinearTransition.springify().damping(springs.gentle.damping)} style={styles.transcript}>
        <View style={styles.progressStep}>
          <Icon name={stopping ? "check" : "mic"} size={18} color={palette.primary} />
          <Text style={type.label}>{stopping ? "Microphone stopped" : listening ? "Listening to you" : "Your words"}</Text>
          {listening ? <RecordingClock /> : null}
        </View>
        <InputMeter level={dict.level} />
        <Text style={[type.body, { color: palette.inkSoft }]} accessibilityLiveRegion="polite">
          {dict.transcript || (listening ? "Listening… read the line above" : dict.status === "denied" || dict.status === "error" ? "No mic? Listen-and-say practice works offline and keeps your streak." : "Speak at your own pace. Your words will appear here.")}
        </Text>
      </Animated.View>
    </View>
  );
}

/** Local display timer: never updates the recorder or persisted data. */
function RecordingClock() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);
  return <Text style={[type.amount, { marginLeft: "auto" }]}>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</Text>;
}

/** Kept in the sheet footer so growing speech never pushes Stop off screen. */
function RecordControls({ dict, phase, onStart, onStop }: { dict: ReturnType<typeof useDictation>; phase: Phase; onStart: () => void; onStop: () => void }) {
  const [pressed, setPressed] = useState(false);
  const listening = phase === "listening";
  const stopping = phase === "stopping";
  const orb = useAnimatedStyle(() => ({ transform: [{ scale: phase === "listening" ? 1 + dict.level.value * 0.18 : 1 }] }));
  const ring = useAnimatedStyle(() => ({ opacity: 0.25 + dict.level.value * 0.6, transform: [{ scale: 1 + dict.level.value * 0.3 }] }));
  return <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
      <View style={styles.orbWrap}>
        {listening ? <Animated.View style={[styles.orbRing, ring]} /> : null}
        <Animated.View style={orb}>
          <Tappable
            label={stopping ? "Microphone stopped" : listening ? "Stop" : "Tap to speak"}
            scale={0.88}
            sound="tap"
            disabled={stopping}
            dimDisabled={false}
            onPressIn={() => setPressed(true)}
            onPressOut={() => setPressed(false)}
            onPress={listening ? onStop : onStart}
            style={[styles.orb, listening && { backgroundColor: palette.danger }, pressed && listening && { backgroundColor: palette.dangerSoft, borderBottomWidth: 1 }, stopping && { backgroundColor: palette.primaryDark, borderBottomWidth: 1 }]}
          >
            <Icon name={stopping ? "check" : listening ? "stop" : "mic"} size={stopping || pressed ? 30 : 40} color={pressed && listening ? palette.danger : palette.onPrimary} />
          </Tappable>
        </Animated.View>
      </View>
        <View style={{ flex: 1, gap: space.xs }}>
          <Text style={type.bodyStrong} accessibilityLiveRegion="polite">{stopping ? "Stopped. Checking your words…" : listening ? "Recording · tap stop" : dict.status === "denied" ? "Microphone is off" : "Read the line aloud"}</Text>
          <Text style={type.caption}>{stopping ? "Your words are kept on this phone." : "Audio stays here. Only words go to AI."}</Text>
        </View>
    </View>;
}

export function ResultView({
  attempt,
  mode,
  openWord,
  setOpenWord,
  accent,
  l1,
  onRetry,
  nextPhrase,
  onUnscored,
  onDone,
  transcript,
  recordingPath,
  onPro,
}: {
  attempt: Attempt;
  mode: SpeakMode;
  openWord: number | null;
  setOpenWord: (i: number | null) => void;
  accent: "us" | "uk";
  l1: L1;
  onRetry: () => void;
  nextPhrase?: () => void;
  onUnscored: () => void;
  onDone: () => void;
  transcript: string;
  recordingPath?: string | null;
  onPro?: () => void;
}) {
  const player = useAudioPlayer(recordingPath ?? null);
  const gym = useGym();
  const report = mode.kind === "diagnostic" && mode.index === mode.total - 1 ? soundReport(gym) : null;
  if (attempt.lowConfidence) {
    return (
      <View style={{ gap: space.md, alignItems: "center" }}>
        <View style={[styles.honesty]}>
          <Icon name="mic" size={28} color={palette.warning} />
        </View>
        <Text style={[type.heading, { textAlign: "center" }]}>Low confidence — let's try again</Text>
        <Text style={[type.caption, { textAlign: "center" }]}>
          The text-based coach is uncertain. No pronunciation grade was saved. Record again, or compare with the model.
        </Text>
        <Button label="Try again" icon="refresh" onPress={onRetry} />
        <Button label="Listen & say without a score" variant="secondary" onPress={onUnscored} />
      </View>
    );
  }
  const flagged = flaggedSounds(attempt);
  const words = attempt.wordScores;
  const recognition = transcriptMatch(mode.text, transcript);
  const { matched, total } = recognition;
  return (
    <View style={{ gap: space.lg }}>
      {report ? <Card accent={palette.primary} style={{ gap: space.sm }}>
        <Pill label="Sound check complete" tone="success" />
        <Text style={type.title}>Your 3 priority sounds</Text>
        {report.items.map(item => {
          const pair = pairsForSound(item.soundId)[0];
          return <View key={item.soundId} style={styles.progressStep}>
            <Text style={[type.phonetic, { width: 52 }]}>/{ipaForSound(item.soundId, accent)}/</Text>
            <View style={{ flex: 1 }}><Text style={type.bodyStrong}>{item.name}{item.observed ? "" : " · suggested"}</Text><Text style={type.caption}>{pair ? `Next drill: ${pair.a} / ${pair.b}` : `Next drill: ${item.examples.join(" / ")}`}</Text></View>
          </View>;
        })}
        <Text style={type.caption}>Priorities from your text-based estimates. Open your plan to start each listening drill.</Text>
        <Button label="Open my 3-sound plan" icon="target" onPress={onDone} />
      </Card> : null}
      <HeroCard overline="Practice saved" value={`${matched} of ${total}`} caption="prompt words recognised"
        right={<Icon name="check" size={40} color={gradient.onHero} />}>
        <Text style={[type.caption, { color: gradient.onHeroSoft }]}>Text-based coaching, not an acoustic score. Compare the sound guide with your model.</Text>
      </HeroCard>
      {recognition.missing.length ? <Text style={type.caption}>Not recognised: {recognition.missing.join(", ")}. This may be a recognition error.</Text> : null}
      <AiReport feature="score_pronunciation" />
      <View>
        <Text style={[type.heading, { marginBottom: space.xs }]}>Explore your sounds</Text>
        <Text style={[type.caption, { marginBottom: space.sm }]}>Tap a word. Underlines are AI suggestions to compare.</Text>
        <View style={styles.wordWrap}>
          {words.map((w, i) => {
            const contrast = w.phonemes.some(hasEstimatedContrast);
            const selected = openWord === i;
            return (
              <Tappable key={`${w.word}-${i}`} label={`${w.word}, ${contrast ? "suggested contrast" : "sound guide"}`} accessibilityState={{ selected }} sound="pop" onPress={() => setOpenWord(selected ? null : i)}
                style={[styles.word, { borderColor: selected || contrast ? palette.primary : palette.border, backgroundColor: selected ? palette.primarySoft : palette.surface }]}>
                <Text style={[type.bodyStrong, { color: palette.ink, textDecorationLine: contrast ? "underline" : "none" }]}>{w.word}</Text>
              </Tappable>
            );
          })}
        </View>
      </View>

      {openWord != null ? <FixTip key={`${openWord}-${words[openWord]?.word}`} word={words[openWord]} accent={accent} l1={l1} onPro={onPro} /> : null}

      <View style={styles.replayRow}>
        <Button label="Model" icon="play" variant="secondary" size="sm" onPress={() => tts.speak(mode.text, accent)} />
        <Button label="Your recording" icon="play" variant="ghost" size="sm" disabled={!recordingPath} onPress={() => { tts.stop(); void player.seekTo(0).then(() => player.play()); }} />
      </View>

      {!recordingPath ? <Text style={type.caption}>Recording replay is unavailable for this input. Model audio remains available.</Text> : null}
      <View style={{ gap: space.sm }}>
        <Button label={nextPhrase ? "Coach next phrase" : report ? "Back to my sound plan" : mode.kind === "diagnostic" ? "Next sound-check line" : "Done"} variant={report ? "secondary" : "primary"} icon="check" onPress={nextPhrase ?? onDone} />
        <Button label="Try again" variant="ghost" icon="refresh" onPress={onRetry} />
      </View>
      {flagged.length ? (
        <Text style={[type.caption, { textAlign: "center" }]}>
          Suggested practice from AI text estimates: {flagged.slice(0, 3).map((f) => soundLabel(f.soundId)).join(", ")}
        </Text>
      ) : null}
    </View>
  );
}

function FixTip({ word, accent, l1, onPro }: { word: WordScore; accent: "us" | "uk"; l1: L1; onPro?: () => void }) {
  const worst = useMemo(() => coachingPhoneme(word), [word]);
  const contrast = !!worst && hasEstimatedContrast(worst);
  const catalog = worst && SOUND_BY_ID[worst.ph];
  const [aiTip, setAiTip] = useState<{ tip: string; mouth: string; practiceWord: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [tipStatus, setTipStatus] = useState("");
  const [tipRequest, setTipRequest] = useState<{ word: string; count: number } | null>(null);
  useEffect(() => {
    let alive = true;
    setAiTip(null);
    setTipStatus("");
    setLoading(false);
    if (!catalog || !contrast || !ai.enabled || tipRequest?.word !== word.word) return;
    setLoading(true);
    withTimeout(ai.run("fix_tip", JSON.stringify({ sound: catalog.id, word: word.word, expectedIPA: worst?.expectedIPA, estimatedIPA: worst?.heardIPA, evidence: "transcript_only_suggestion_not_acoustic_error", accent, nativeLanguage: l1 })), 10000)
      .then((res) => {
        if (!alive) return;
        if (res && res.ok && res.json && typeof res.json === "object") {
          const j = res.json as { tip?: string; mouth?: string; practiceWord?: string };
          if (j.tip) setAiTip({ tip: j.tip, mouth: j.mouth ?? catalog.mouthTip, practiceWord: j.practiceWord ?? catalog.examples[0] });
        } else { if (res && !res.ok && res.reason === "quota") onPro?.(); setTipStatus(res && !res.ok && res.reason === "quota" ? "AI allowance used. Your offline sound guide is ready below." : "Using your offline sound guide. Reopen this word to retry AI coaching."); }
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [word.word, worst?.ph, contrast, catalog, accent, l1, tipRequest]);

  if (!catalog) {
    return (
      <Card accent={palette.primary}>
        <Text style={type.bodyStrong}>“{word.word}” · sound guide</Text>
        <Text style={type.caption}>{contrast && worst ? `AI suggests comparing target /${worst.expectedIPA}/ with /${worst.heardIPA}/. This is a text-based suggestion, not a measured error.` : "No sound difference was identified. Compare with the model at your own pace."}</Text>
        <ModelPlayback text={word.word} accent={accent} />
      </Card>
    );
  }
  const tip = aiTip?.tip ?? catalog.tip;
  const mouth = aiTip?.mouth ?? catalog.mouthTip;
  return (
    <Card accent={palette.primary} style={{ gap: space.sm }}>
      <Pill label={contrast ? "AI suggestion · compare by listening" : "Sound guide · no correction flagged"} tone="neutral" />
      <View style={styles.tipHead}>
        <View style={[styles.tipBadge]}>
          <Text style={[type.phonetic, { color: palette.onPrimary }]}>/{ipaForSound(catalog.id, accent)}/</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={type.bodyStrong}>{catalog.name} in “{word.word}”</Text>
          {contrast && worst ? <Text style={type.phonetic}>Target /{worst.expectedIPA}/ · AI suggestion /{worst.heardIPA}/</Text> : <Text style={type.caption}>No different sound was estimated in this word.</Text>}
        </View>
      </View>
      <MouthGuide soundId={catalog.id} />
      <Text style={type.body}>{contrast ? tip : `Explore /${ipaForSound(catalog.id, accent)}/ with the model. Optional practice, not a detected mistake.`}</Text>
      {aiTip?.mouth ? <Text style={type.caption}>{mouth}</Text> : null}
      <ModelPlayback text={word.word} accent={accent} />
      <View style={styles.modelRow}>
        <Button label={`Say "${aiTip?.practiceWord ?? catalog.examples[0]}"`} icon="play" variant="secondary" size="sm"
          onPress={() => tts.speak(aiTip?.practiceWord ?? catalog.examples[0], accent, { slow: true })} />
      </View>
      {ai.enabled && contrast ? <Button label={loading ? "Getting your AI tip…" : "Tailor this tip to my language"} variant="ghost" size="sm" disabled={loading} onPress={() => setTipRequest(r => ({ word: word.word, count: (r?.count ?? 0) + 1 }))} /> : null}
      {aiTip ? <AiReport feature="fix_tip" /> : null}
      {contrast ? <Text style={type.caption}>{loading ? "Getting a tailored tip…" : tipStatus || "AI only received the transcript. Listen to your recording to check this suggestion."}</Text> : null}
    </Card>
  );
}

function QuotaBlock({ unavailable, onPro, onWatch, onClose, onPractice }: { unavailable: boolean; onPro: () => void; onWatch: () => void; onClose: () => void; onPractice: () => void }) {
  return (
    <View style={{ gap: space.md, alignItems: "center" }}>
      <View style={styles.honesty}>
        <Icon name="star" size={28} color={palette.warning} />
      </View>
      <Text style={[type.heading, { textAlign: "center" }]}>{unavailable ? "No ad available right now" : "That’s your 5 free scored lines today"}</Text>
      <Text style={[type.caption, { textAlign: "center" }]}>
        Models, drills and your plan stay free. Subscriptions include up to 134 AI checks a day. You can also watch an ad for 3 more practice attempts.
      </Text>
      {unavailable ? <Text style={type.body}>No extra attempts were added. Return to free model audio and listening drills, or try the ad again later.</Text> : null}
      <Button label={unavailable ? "Try the ad again" : "Watch an ad for 3 more"} icon="play" variant="secondary" onPress={onWatch} />
      {canOfferPro() ? <Button label="See Pro plans" icon="star" onPress={onPro} /> : null}
      <Button label="Keep practising without AI" variant="secondary" onPress={onPractice} />
      <Button label="Back to practice" variant="ghost" onPress={onClose} />
    </View>
  );
}

const styles = StyleSheet.create({
  progressStep: { flexDirection: "row", alignItems: "center", gap: space.sm },
  ipaRow: { flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginTop: space.sm },
  ipaChip: { backgroundColor: palette.primarySoft, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  modelRow: { flexDirection: "row", gap: space.sm, marginTop: space.md, flexWrap: "wrap" },
  orbWrap: { width: 88, height: 88, alignItems: "center", justifyContent: "center" },
  transcript: { flexGrow: 1, minHeight: 128, backgroundColor: palette.surfaceAlt, borderRadius: radius.md, padding: space.md, gap: space.sm },
  orbRing: { position: "absolute", width: 120, height: 120, borderRadius: 60, backgroundColor: palette.primarySoft },
  orb: { width: 80, height: 80, borderRadius: radius.xl, backgroundColor: palette.primaryDark, alignItems: "center", justifyContent: "center" },
  honesty: { width: 60, height: 60, borderRadius: 30, backgroundColor: palette.warningSoft, alignItems: "center", justifyContent: "center" },
  wordWrap: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  word: { borderWidth: 1.5, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 6, minHeight: 48, justifyContent: "center" },
  replayRow: { flexDirection: "row", gap: space.sm, justifyContent: "center" },
  tipHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  tipBadge: { backgroundColor: palette.primary, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 6 },
  mouthCue: { flexDirection: "row", alignItems: "center", gap: space.xs, marginTop: space.xs },
});
