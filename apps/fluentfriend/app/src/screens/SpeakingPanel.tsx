import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, StyleSheet, Text, TextInput, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { Button, Confetti, Icon, Tappable, TextField, durations, feedback, fonts, palette, play, radius, shadow, space, type } from "../ui";
import { LevelMeter, PhraseAudio, ScoreBadge, SoundWave } from "../components";
import { PASS_SCORE, scoreSpeaking, type SpeakResult } from "../core/speaking";
import { startListening, speechSupported, type SpeechSession } from "../speech";
import { MicDeniedNote, MicPrimerSheet, useMicGate } from "../mic";
import { useApp } from "../core/data";
import { bn } from "../util";
import type { Phrase } from "../core";

type Phase = "idle" | "listening" | "scoring" | "result";

// The interactive area is ONE fixed-height box so the phrase card + heading above it never move
// when the state swaps (QA: "the card and heading jump upward ~20px when listening starts" — the
// FooterScreen centres its body, so any height change shifted the whole column). The focal circle
// (mic / live meter) lives in a fixed-footprint zone at the TOP of the box, so it also stays put.
const STAGE_H = 304;
const STAGE_H_COMPACT = 256;
const CIRCLE_ZONE = 120; // reserves the live-meter ripple so the mic and the meter share one centre

/**
 * Repeat-after-me: hear the phrase (normal / slow), then say it. In QA the
 * speech hook feeds a transcript; on a real device the learner types (or uses
 * the keyboard's voice dictation) — always a tap-only fallback, never a dead end.
 * Word-level highlights + a Bangla tip come from the pure scorer.
 */
export function SpeakingPanel({
  phrase,
  slow,
  onPass,
  compact,
}: {
  phrase: Phrase;
  slow: boolean;
  onPass: (r: SpeakResult) => void;
  compact?: boolean;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [heard, setHeard] = useState(false); // becomes true once the learner has played the model line
  const [interim, setInterim] = useState("");
  const [heardText, setHeardText] = useState("");
  const [result, setResult] = useState<SpeakResult | null>(null);
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState("");
  const [burst, setBurst] = useState(0); // confetti trigger on a passing result
  const [elapsed, setElapsed] = useState(0); // seconds, shown while listening so the recording state is unmistakable
  const level = useSharedValue(0);
  const pulse = useSharedValue(0);
  const session = useRef<SpeechSession | null>(null);
  const inputRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const startedAt = useRef(0); // wall-clock ms when listening began — drives a real timer, never a stuck 0:00
  const scoreTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canListen = speechSupported();
  const mic = useMicGate();
  const streak = useApp().streak; // for the day-progress nudge shown right after a win

  // Stop listening on unmount (nav away / screen blur) — cancel() is silent (no stray score).
  useEffect(() => () => { session.current?.cancel(); session.current = null; if (scoreTimer.current) clearTimeout(scoreTimer.current); }, []);

  // Stop listening when the app goes to the background, so the mic never stays live off-screen.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (st) => {
      if (st !== "active" && session.current) {
        session.current.cancel();
        session.current = null;
        setPhase((p) => (p === "listening" ? "idle" : p));
      }
    });
    return () => sub.remove();
  }, []);

  // A slow breathing ring behind the idle mic — it reads as "tap me", and keeps the circle alive
  // so the idle state never looks like a frozen frame.
  useEffect(() => {
    const idle = phase === "idle" && !typing;
    pulse.value = idle
      ? withRepeat(withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.quad) }), -1, true)
      : withTiming(0, { duration: 200 });
  }, [phase, typing, pulse]);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + pulse.value * 0.22 }], opacity: 0.16 - pulse.value * 0.1 }));

  // A live elapsed counter while listening, driven from the WALL CLOCK (not a +1 tick that can read
  // 0:00 for a whole second while words already stream in — QA: "timer stays at 0:00 while the
  // transcript is complete"). Sampled 4×/s so it's visibly moving the instant recording starts.
  useEffect(() => {
    if (phase !== "listening") {
      setElapsed(0);
      return;
    }
    setElapsed(0);
    // 500ms sampling keeps the seconds display accurate while halving listening-time re-renders —
    // the interim transcript already re-renders a few times/s, and together they were enough to jank
    // the core moment (QA). The mic level + waveform animate on the UI thread, not via React state.
    const id = setInterval(() => {
      const secs = Math.max(0, (Date.now() - startedAt.current) / 1000);
      setElapsed(secs);
    }, 500);
    return () => clearInterval(id);
  }, [phase]);

  const finish = (text: string) => {
    // Show a brief, calm "analysing" beat and DEFER the heavy result render (score count-up +
    // confetti) off the frame that ends the speech session — mounting all of it the instant the last
    // word lands is what froze the UI at the core moment (QA: "System UI isn't responding").
    setHeardText(text.trim());
    setPhase("scoring");
    play("whoosh", 0.4);
    if (scoreTimer.current) clearTimeout(scoreTimer.current);
    scoreTimer.current = setTimeout(() => {
      const r = scoreSpeaking(phrase.en, text);
      setResult(r);
      setPhase("result");
      feedback(r.celebrate ? "success" : "pop", r.celebrate ? "success" : "warning");
      if (r.passed) onPass(r); // "said it" → advance the flow (≥60)
      if (r.celebrate) setBurst((b) => b + 1); // confetti ONLY on a genuinely great take (≥80)
    }, 650);
  };

  const listen = async () => {
    if (!canListen) {
      // Real device with no recognizer — fall back to typing / keyboard dictation.
      setTyping(true);
      setTimeout(() => inputRef.current?.focus(), 50);
      return;
    }
    // Ask for the mic in context (Bangla primer → OS dialog). Denied → keep the typed path.
    const ok = await mic.ensure();
    if (!ok) {
      setTyping(true);
      setTimeout(() => inputRef.current?.focus(), 50);
      return;
    }
    play("pop", 0.5);
    setInterim("");
    startedAt.current = Date.now();
    setPhase("listening");
    session.current = startListening(phrase.en, {
      onLevel: (l) => (level.value = l),
      onInterim: setInterim,
      onFinal: (t) => {
        session.current = null;
        finish(t);
      },
      onError: () => {
        setTyping(true);
        setPhase("idle");
      },
    });
  };

  const stop = () => {
    session.current?.stop();
    session.current = null;
  };

  const reset = () => {
    if (scoreTimer.current) clearTimeout(scoreTimer.current);
    setResult(null);
    setInterim("");
    setHeardText("");
    setTyped("");
    setTyping(false);
    setPhase("idle");
  };

  // "ঠিক শুনিনি?" — the recogniser misheard, so let the learner TYPE what they actually said instead of
  // re-recording into the same wrong transcript (QA: the link "did nothing" and there was "no way to
  // type an answer"). Opens the typed fallback pre-filled with what was heard, ready to correct.
  const editHeard = () => {
    if (scoreTimer.current) clearTimeout(scoreTimer.current);
    setTyped(heardText);
    setResult(null);
    setPhase("idle");
    setTyping(true);
    feedback("pop", "light");
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const mmss = (secs: number) => {
    const t = Math.floor(secs);
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
  };

  const stageStyle = [styles.swap, { height: compact ? STAGE_H_COMPACT : STAGE_H }];

  return (
    <View style={{ gap: space.md }}>
      {/* Only mount the full-bleed Skia confetti AFTER a win — an always-on absoluteFill Canvas
          reads back black in store-screenshot capture (this panel appears in the lesson scene). */}
      {burst > 0 ? <Confetti trigger={burst} count={32} /> : null}
      <MicPrimerSheet visible={mic.primerOpen} onAllow={mic.allow} onClose={mic.dismiss} />

      <View style={[styles.phraseCard, compact && { padding: space.md }]}>
        {/* Breathing room between the English, Bangla and romanized lines so they never read as one
            cramped block, and the card grows with the content on a 1.3× font scale (QA phrase-card
            layout). No fixed height anywhere. */}
        <View style={styles.phraseLines}>
          <Text style={type.title}>{phrase.en}</Text>
          <Text style={[type.body, { color: palette.inkSoft }]}>{phrase.bn}</Text>
          <Text style={type.caption}>{phrase.romanBn}</Text>
        </View>
        <PhraseAudio en={phrase.en} size={48} emphasize={!heard} onPlayed={() => setHeard(true)} />
      </View>

      <View style={stageStyle}>
        {phase === "result" && result ? (
          // No route-level `entering=` (an entering fade from opacity 0 on a swapped box left the
          // lower half blank in QA capture frames). ResultReveal animates a MOUNTED inner view from
          // a safe 0.6 opacity → 1 with a tiny rise, so the score/banner slides in smoothly.
          <ResultReveal style={styles.resultBox}>
            <View style={styles.resultTop}>
              <ScoreBadge score={result.score} size={60} />
              <View style={{ flex: 1, gap: 4 }}>
                {/* Copy + colour follow the score BAND, so praise never sits beside a low number
                    (QA trust fix). Green + celebration only in the "great" band (≥80); amber below. */}
                <Text style={[type.heading, { color: result.band === "great" ? palette.success : palette.warning }]}>
                  {result.band === "great"
                    ? "দারুণ বলেছেন! 🎉"
                    : result.band === "ok"
                      ? "প্রায় ঠিক — আরেকবার বলুন"
                      : "আরেকবার চেষ্টা করুন"}
                </Text>
                {/* ONE corrected transcript — the sentence AS IT SHOULD BE SAID (original case), with
                    the single weakest word underlined in calm amber. This replaces both the lowercase
                    word-echo and the separate "আমরা শুনলাম" quote the QA flagged as a duplicate. */}
                <Text style={[type.caption, { color: palette.inkMuted }]}>সঠিক বাক্য</Text>
                <View style={styles.words}>
                  {result.words.map((w, i) => {
                    // Highlight the ONE focus word on every take: a missed word in amber, or — on a
                    // perfect take — the trickiest sound to keep polishing, underlined in brand teal
                    // (so the result is never a bare score with nothing to look at).
                    const focus = i === result.focusIndex;
                    const err = !w.ok;
                    const hl = focus ? (result.focusTone === "error" ? palette.warning : palette.primary) : null;
                    return (
                      <Text
                        key={i}
                        style={[
                          type.body,
                          { color: err ? palette.warning : hl ?? palette.ink },
                          focus && { fontFamily: fonts.semibold, textDecorationLine: "underline" },
                        ]}
                      >
                        {w.surface}
                        {i < result.words.length - 1 ? " " : ""}
                      </Text>
                    );
                  })}
                </View>
              </View>
            </View>
            {/* A Bangla pronunciation line on EVERY take — a fix for a missed word, or a "polish this
                sound" nudge on a perfect one (QA: the result "has no Bangla tip"). */}
            <View style={styles.tip}>
              <Icon name="chat" size={16} color={palette.primary} />
              <Text style={[type.label, { color: palette.ink, flex: 1 }]}>{result.coachTipBn}</Text>
            </View>
            {/* A day-progress nudge right after a win, so the reason to return is visible at the
                moment of success (QA delight: "add a small streak / day-progress update"). */}
            {result.passed ? (
              <View style={styles.winProgress}>
                <Icon name="flame" size={18} color={palette.accent} />
                <Text style={[type.label, { color: palette.ink, flex: 1 }]}>
                  {streak.current > 0 ? `🔥 ${bn(streak.current)} দিনের ধারা চলছে — রোজ এসে বাড়ান।` : "দারুণ শুরু! কাল ফিরে এসে প্রথম ধারা গড়ুন।"}
                </Text>
              </View>
            ) : null}
            <View style={styles.resultActions}>
              <Button label="আবার বলুন" variant="secondary" icon="refresh" onPress={reset} style={{ flex: 1 }} />
              {/* Misheard → type the real answer (not a silent re-record into the same wrong transcript). */}
              <Tappable label="ঠিক শুনিনি? টাইপ করে বলুন" role="link" onPress={editHeard} style={styles.misheard}>
                <Icon name="edit" size={15} color={palette.inkSoft} />
                <Text style={[type.label, { color: palette.inkSoft }]}>ঠিক শুনিনি?</Text>
              </Tappable>
            </View>
          </ResultReveal>
        ) : phase === "listening" ? (
          <View style={styles.state}>
            <View style={styles.circleZone}>
              {/* A live mic (not a pause glyph, which reads as "audio paused") so it's unmistakable the
                  app is HEARING the learner, not playing a clip. Tap to stop. */}
              <Tappable label="থামুন — মাইকে চাপুন" sound={null} onPress={stop}>
                <LevelMeter level={level} size={96} icon="mic" />
              </Tappable>
            </View>
            <View style={styles.listeningRow}>
              <Text style={[type.heading, { color: palette.primary }]}>🎤 শুনছি…</Text>
              <View style={styles.recDot} />
              <Text style={[type.number, { color: palette.inkSoft, fontSize: 15 }]}>{mmss(elapsed)}</Text>
            </View>
            {/* A live waveform so it's obvious the mic is picking up the voice. */}
            <SoundWave active height={22} />
            <View style={styles.interimBox}>
              <Text style={[type.body, { color: palette.ink, textAlign: "center" }]} numberOfLines={2}>
                {interim || "বলতে শুরু করুন…"}
              </Text>
            </View>
            {/* "থামুন" ends the recording and scores it (it's a submit, not a pause) — the icon + copy
                now say so, removing the pause/submit ambiguity QA flagged. */}
            <Button label="থামুন ও দেখুন" variant="secondary" icon="check" onPress={stop} />
          </View>
        ) : phase === "scoring" ? (
          // A short processing beat so the listening→result hand-off feels smooth and the heavy result
          // render lands on a quiet frame (QA: "show a brief processing state; defer heavy rendering").
          <View style={[styles.state, { justifyContent: "center", flex: 1 }]}>
            <View style={styles.circleZone}>
              <ActivityIndicator size="large" color={palette.primary} />
            </View>
            <Text style={[type.bodyStrong, { color: palette.primary }]}>বিশ্লেষণ করছি…</Text>
            {heardText ? (
              <Text style={[type.body, { color: palette.inkSoft, textAlign: "center" }]} numberOfLines={2}>“{heardText}”</Text>
            ) : null}
          </View>
        ) : typing ? (
          <View style={styles.typingBox}>
            <TextField
              ref={inputRef}
              label="যা বললেন টাইপ করুন (বা কীবোর্ডের 🎤 চাপুন)"
              placeholder={phrase.en}
              value={typed}
              onChangeText={setTyped}
              autoCapitalize="none"
              returnKeyType="done"
              onSubmitEditing={() => typed.trim() && finish(typed)}
            />
            <Button label="পরীক্ষা করুন" icon="check" disabled={!typed.trim()} onPress={() => finish(typed)} />
            {canListen ? <Button label="বরং বলে দেখি" variant="ghost" onPress={() => setTyping(false)} /> : null}
          </View>
        ) : (
          <View style={styles.state}>
            <View style={styles.circleZone}>
              <Animated.View pointerEvents="none" style={[styles.pulseRing, pulseStyle]} />
              <Tappable label="ট্যাপ করে বলুন" sound={null} onPress={listen} style={styles.mic}>
                <Icon name="mic" size={38} color={palette.onPrimary} />
              </Tappable>
            </View>
            {/* ONE instruction that names the gesture unambiguously — TAP (not press-and-hold), which QA
                flagged as unclear. Before the model line is heard it carries the two-step cue; after,
                it's the short "tap to speak" prompt beside the breathing mic. */}
            <Text style={[type.bodyStrong, { textAlign: "center", color: heard ? palette.primary : palette.ink }]}>
              {heard ? "🎤 ট্যাপ করে বলুন" : "প্রথমে ▶ চেপে শুনুন, তারপর মাইকে ট্যাপ করে বলুন"}
            </Text>
            {/* If the mic was denied, a calm note + Settings shortcut (the typed path still works);
                otherwise a one-line pre-permission note so the mic request is never a surprise
                (QA: "mic permission is unexplained"). Shown BEFORE the learner taps the mic. */}
            {mic.denied ? (
              <MicDeniedNote />
            ) : canListen ? (
              <View style={styles.micNote}>
                <Icon name="lock" size={13} color={palette.inkMuted} />
                <Text style={[type.caption, { color: palette.inkMuted, flex: 1 }]} numberOfLines={2}>
                  মাইক শুধু আপনার কথা শোনার জন্য — রেকর্ডিং ফোনেই থাকে।
                </Text>
              </View>
            ) : null}
            <Tappable
              label="টাইপ করে উত্তর দিন"
              role="link"
              onPress={() => { setTyping(true); setTimeout(() => inputRef.current?.focus(), 50); }}
              style={styles.typeLink}
            >
              <Icon name="edit" size={16} color={palette.inkSoft} />
              <Text style={[type.label, { color: palette.inkSoft }]}>টাইপ করে উত্তর দিন</Text>
            </Tappable>
          </View>
        )}
      </View>
    </View>
  );
}

/** Smoothly reveals the result card: a MOUNTED inner view rising from 0.6 → 1 opacity (never from 0,
 *  so it can't stick blank on Android) with a small upward slide — QA: "animate the score/banner in". */
function ResultReveal({ children, style }: { children: React.ReactNode; style?: object }) {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withTiming(1, { duration: durations.base, easing: Easing.out(Easing.cubic) });
  }, [v]);
  const anim = useAnimatedStyle(() => ({ opacity: 0.6 + 0.4 * v.value, transform: [{ translateY: (1 - v.value) * 10 }] }));
  return <Animated.View style={[style, anim]}>{children}</Animated.View>;
}

export { PASS_SCORE };

const styles = StyleSheet.create({
  phraseCard: { backgroundColor: palette.surface, borderRadius: radius.lg, padding: space.lg, gap: space.md, ...shadow },
  phraseLines: { gap: 6 },
  micNote: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: space.md },
  // One fixed-height slot for every state (idle mic / listening / result / typing). Fixed (not
  // minHeight) so the box never grows — the card above keeps its exact position when recording starts.
  swap: { justifyContent: "flex-start" },
  state: { alignItems: "center", gap: space.sm, paddingTop: space.xs },
  circleZone: { height: CIRCLE_ZONE, alignItems: "center", justifyContent: "center" },
  pulseRing: { position: "absolute", width: 112, height: 112, borderRadius: 56, backgroundColor: palette.primary },
  mic: { width: 92, height: 92, borderRadius: 46, backgroundColor: palette.primary, alignItems: "center", justifyContent: "center", ...shadow },
  listeningRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  recDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: palette.danger },
  typeLink: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, paddingHorizontal: 12 },
  interimBox: { minHeight: 44, justifyContent: "center", paddingHorizontal: space.md, alignSelf: "stretch" },
  typingBox: { gap: space.md, alignSelf: "stretch" },
  resultBox: { backgroundColor: palette.surface, borderRadius: radius.lg, padding: space.lg, gap: space.md, ...shadow },
  resultTop: { flexDirection: "row", alignItems: "center", gap: space.md },
  words: { flexDirection: "row", flexWrap: "wrap" },
  tip: { flexDirection: "row", alignItems: "center", gap: space.sm, backgroundColor: palette.primarySoft, borderRadius: radius.md, padding: space.md },
  heard: { backgroundColor: palette.surfaceAlt, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.sm, gap: 2 },
  winProgress: { flexDirection: "row", alignItems: "center", gap: space.sm, backgroundColor: palette.warningSoft, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.sm },
  resultActions: { flexDirection: "row", alignItems: "center", gap: space.sm },
  misheard: { flexDirection: "row", alignItems: "center", gap: 5, minHeight: 44, paddingHorizontal: space.md, justifyContent: "center" },
});
