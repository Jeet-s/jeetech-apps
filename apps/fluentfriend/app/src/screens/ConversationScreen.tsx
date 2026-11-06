import { useEffect, useRef, useState } from "react";
import { Alert, AppState, Image, KeyboardAvoidingView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown, useSharedValue } from "react-native-reanimated";
import {
  AiReport,
  Button,
  Confetti,
  Icon,
  IconButton,
  Pill,
  ProgressBar,
  ProgressRing,
  Tappable,
  TextField,
  feedback as haptic,
  palette,
  play,
  radius,
  shadow,
  space,
  tones,
  type,
} from "../ui";
import { AudioButton, LevelMeter, StackHeader } from "../components";
import { art } from "../art";
import { appStore, useApp, todayKey } from "../core/data";
import { getScenario, SCRIPTED } from "../core/catalog";
import { canUseAi, remaining, dailyLimit } from "../core/quota";
import { parseReply, parseFeedback, type Feedback } from "../core/feedback";
import { completeAiSession, grantRewardBonus } from "../core/state";
import { ai, type AiResult } from "../modules/ai";
import { ads } from "../modules/ads";
import { analytics } from "../modules/analytics";
import { review } from "../modules/review";
import { useSettings } from "../modules/store";
import { startListening, speechSupported, type SpeechSession } from "../speech";
import { MicDeniedNote, MicPrimerSheet, useMicGate } from "../mic";
import { qa } from "../modules/qa";
import { useNav } from "../nav";
import { bn, isShotMode } from "../util";

type Turn = { role: "ai" | "user"; text: string };
type Phase = "chat" | "thinking" | "feedback";
const MIN_USER_TURNS = 3;

/**
 * Race an ai.run() call against a hard wall-clock timeout.
 *
 * The cloud proxy's fetch has no timeout, so a stalled connection (the QA soak saw the backend
 * hook 502-ing / hanging) would otherwise leave the conversation stuck in its "thinking…" state
 * with every control gone — an unresponsive screen the soak monkey keeps tapping, which registers
 * as an ANR. Racing the call against a timer guarantees the UI always resolves and falls back to the
 * scripted / offline path. A timeout is reported as "offline" so callers reuse their keep-input +
 * graceful-fallback branch.
 *
 * NOTE: callers pass ai.run("ai_conversation", …) / ai.run("ai_feedback", …) with the feature id as
 * a STRING LITERAL at the call site (not a variable through this helper) — the AI wiring must be
 * visible as a literal ai.run("<declared id>") call in the screen.
 */
function withAiTimeout(call: Promise<AiResult>, timeoutMs = 12000): Promise<AiResult> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<AiResult>((resolve) => {
    timer = setTimeout(() => resolve({ ok: false, reason: "offline", message: "AI is taking too long — try again in a moment." }), timeoutMs);
  });
  return Promise.race([call, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/** Derive an encouraging offline/scripted fluency score from what the learner said. */
function localFeedback(turns: Turn[]): Feedback {
  const userWords = turns.filter((t) => t.role === "user").reduce((a, t) => a + t.text.trim().split(/\s+/).filter(Boolean).length, 0);
  const base = Math.max(55, Math.min(88, 55 + userWords * 2));
  return parseFeedback({ fluency: base, clarity: base + 2, grammar: base - 3, pace: base, corrections: [] });
}

/** AI scenario role-play: talk by text/voice with Bondhu, then get a fluency score and Bangla corrections. */
export function ConversationScreen({ scenarioId, onPro }: { scenarioId: string; onPro: (from: string) => void }) {
  const nav = useNav();
  const insets = useSafeAreaInsets();
  const s = useApp();
  const { pro, proSource } = useSettings();
  const aiSub = pro && proSource === "subscription"; // larger AI quota is subscription-only
  const scenario = getScenario(scenarioId);
  const today = todayKey();

  const [mode, setMode] = useState<"ai" | "scripted">(() => (ai.enabled && canUseAi(s.quota, today, aiSub) ? "ai" : "scripted"));
  const [turns, setTurns] = useState<Turn[]>([]);
  const [reply, setReply] = useState<{ hintBn: string; suggestions: string[] } | null>(null);
  const [phase, setPhase] = useState<Phase>("chat");
  const [scriptIdx, setScriptIdx] = useState(0);
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [fb, setFb] = useState<Feedback | null>(null);
  const [fbSource, setFbSource] = useState<"ai" | "scripted">("ai");
  const level = useSharedValue(0);
  const session = useRef<SpeechSession | null>(null);
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const inputRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const started = useRef(false);
  const mic = useMicGate();

  const script = scenario ? SCRIPTED[scenario.scriptedFallbackId] : null;
  const userTurns = turns.filter((t) => t.role === "user").length;

  // Stop listening on unmount (nav away / screen blur) — cancel() is silent (no stray turn).
  useEffect(() => () => { session.current?.cancel(); session.current = null; }, []);

  // Stop listening when the app backgrounds, so the mic never stays live off-screen.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (st) => {
      if (st !== "active" && session.current) {
        session.current.cancel();
        session.current = null;
        setListening(false);
      }
    });
    return () => sub.remove();
  }, []);

  // Kick off the first AI line (or the first scripted line) once.
  useEffect(() => {
    if (started.current || !scenario) return;
    started.current = true;
    if (mode === "ai") void askAi([]);
    else advanceScript(0, []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!scenario) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + space.lg }]}>
        <StackHeader title="রোল-প্লে" onClose={() => nav.back()} closeIcon="close" />
      </View>
    );
  }

  const switchToScripted = (note: string) => {
    setMode("scripted");
    setReply(null);
    haptic("pop", "warning");
    advanceScript(scriptIdx, turns, note);
  };

  async function askAi(history: Turn[]) {
    setPhase("thinking");
    const input = JSON.stringify({ scenario: `${scenario!.title_en} — ${scenario!.sceneBn}`, level: scenario!.level, history });
    const res = await withAiTimeout(ai.run("ai_conversation", input));
    if (res.ok) {
      const r = parseReply(res.json ?? res.text);
      setTurns((t) => [...t, { role: "ai", text: r.reply }]);
      setReply({ hintBn: r.hintBn, suggestions: r.suggestions });
      setPhase("chat");
      play("pop", 0.4);
    } else if (res.reason === "quota") {
      analytics.track("quota_hit", { feature: "ai_conversation" });
      setPhase("chat");
      switchToScripted("আজকের AI কোটা শেষ — স্ক্রিপ্টেড রোল-প্লে চলছে।");
    } else if (res.reason === "offline") {
      setPhase("chat");
      switchToScripted("অফলাইন — স্ক্রিপ্টেড রোল-প্লে চলছে।");
    } else {
      setPhase("chat");
      switchToScripted("এই মুহূর্তে AI পাওয়া যাচ্ছে না — স্ক্রিপ্টেড রোল-প্লে চলছে।");
    }
  }

  function advanceScript(fromIdx: number, history: Turn[], note?: string) {
    if (!script) return;
    const turn = script.turns[Math.min(fromIdx, script.turns.length - 1)];
    setTurns([...history, { role: "ai", text: turn.ai }]);
    setReply({ hintBn: note ? `${note} ${turn.hintBn}` : turn.hintBn, suggestions: turn.suggestions });
    setScriptIdx(fromIdx + 1);
    setPhase("chat");
  }

  const say = (said: string) => {
    const t = said.trim();
    if (!t) return;
    const next = [...turns, { role: "user" as const, text: t }];
    setTurns(next);
    setReply(null);
    setText("");
    setTyping(false);
    setInterim("");
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    if (mode === "ai") void askAi(next);
    else if (scriptIdx < script!.turns.length) advanceScript(scriptIdx, next);
  };

  const micListen = async () => {
    if (!speechSupported()) {
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
    setListening(true);
    setInterim("");
    session.current = startListening(qa.speechSample() ?? "Yes, I would like that please.", {
      onLevel: (l) => (level.value = l),
      onInterim: setInterim,
      onFinal: (txt) => {
        session.current = null;
        setListening(false);
        say(txt);
      },
      onError: () => {
        setListening(false);
        setTyping(true);
      },
    });
  };

  const watchRewarded = () => {
    const shown = ads.showRewarded(() => {
      appStore.set((st) => grantRewardBonus(st, today));
      analytics.track("rewarded_ad_opt_in");
      haptic("success", "success");
    });
    if (!shown) onPro("conversation_quota");
  };

  const finishSession = async () => {
    setPhase("thinking");
    let result: Feedback;
    let source: "ai" | "scripted" = mode;
    if (mode === "ai") {
      const input = JSON.stringify({ scenario: scenario.title_en, level: scenario.level, turns });
      const res = await withAiTimeout(ai.run("ai_feedback", input));
      result = res.ok ? parseFeedback(res.json ?? res.text) : localFeedback(turns);
      if (!res.ok) source = "scripted"; // don't save mistakes from a non-AI result
    } else {
      result = localFeedback(turns);
    }
    const done = completeAiSession(appStore.get(), {
      scenarioId,
      feedback: result,
      durationSec: Math.max(60, userTurns * 25),
      today,
      source,
    });
    appStore.set(() => done.state);
    setFb(result);
    setFbSource(source);
    setPhase("feedback");
    play("unlock", 0.7);
    analytics.track("core_action", { feature: "ai_conversation" });
    analytics.track("ai_session_completed", { scenario: scenarioId });
    review.actionCompleted();
  };

  const confirmClose = () => {
    if (phase === "feedback") return nav.back();
    Alert.alert("রোল-প্লে বন্ধ করবেন?", "এই সেশনের অগ্রগতি সংরক্ষণ হবে না।", [
      { text: "চালিয়ে যান", style: "cancel" },
      { text: "বন্ধ করুন", style: "destructive", onPress: () => nav.back() },
    ]);
  };

  // ---- Feedback view ----
  if (phase === "feedback" && fb) {
    return <FeedbackView fb={fb} source={fbSource} saved={fbSource === "ai" ? fb.corrections.length : 0} scenarioId={scenarioId} onClose={() => nav.back()} onPro={onPro} />;
  }

  const left = remaining(s.quota, today, aiSub);
  const quotaOut = mode === "ai" && left <= 0;

  return (
    <KeyboardAvoidingView style={styles.root} behavior="padding">
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <StackHeader
          title={scenario.title_bn}
          subtitle={`${scenario.level} · ${scenario.title_en}`}
          onClose={confirmClose}
          closeIcon="close"
          right={<Pill label={mode === "ai" ? `${bn(left)}/${bn(dailyLimit(aiSub))}` : "স্ক্রিপ্টেড"} tone={mode === "ai" ? (left > 2 ? "success" : "warning") : "neutral"} />}
        />
      </View>

      <ScrollView ref={scrollRef} contentContainerStyle={styles.chat} keyboardShouldPersistTaps="handled">
        <View style={styles.sceneCard}>
          <Icon name="chat" size={18} color={palette.primary} />
          <Text style={[type.label, { color: palette.ink, flex: 1 }]}>{scenario.sceneBn}</Text>
        </View>
        {turns.length === 0 ? (
          <View style={styles.voiceNote}>
            <Icon name="lock" size={14} color={palette.primary} />
            <Text style={[type.caption, { color: palette.inkSoft, flex: 1 }]}>আপনার কণ্ঠ ফোনেই থাকে — শুধু লেখা টেক্সট Bondhu-কে পাঠানো হয়।</Text>
          </View>
        ) : null}
        {turns.map((t, i) => (
          <Bubble key={i} turn={t} />
        ))}
        {phase === "thinking" ? <ThinkingBubble /> : null}
        {turns.some((t) => t.role === "ai") ? <AiReport feature="ai_conversation" /> : null}
      </ScrollView>

      <MicPrimerSheet visible={mic.primerOpen} onAllow={mic.allow} onClose={mic.dismiss} />

      <View style={[styles.inputZone, { paddingBottom: insets.bottom + space.md }]}>
        {mic.denied && !listening && !typing ? <MicDeniedNote /> : null}
        {reply?.hintBn ? (
          <View style={styles.hintRow}>
            <Icon name="chat" size={14} color={palette.primary} />
            <Text style={[type.caption, { color: palette.ink, flex: 1 }]} numberOfLines={2}>{reply.hintBn}</Text>
          </View>
        ) : null}

        {listening ? (
          <View style={styles.listenRow}>
            <LevelMeter level={level} size={72} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={type.bodyStrong}>শুনছি…</Text>
              <Text style={type.caption} numberOfLines={2}>{interim || "…"}</Text>
            </View>
            <Button label="থামুন" variant="secondary" size="sm" onPress={() => session.current?.stop()} />
          </View>
        ) : typing ? (
          <View style={styles.typeRow}>
            <TextField
              ref={inputRef}
              label=""
              placeholder="আপনার উত্তর লিখুন…"
              value={text}
              onChangeText={setText}
              style={{ flex: 1 }}
              returnKeyType="send"
              onSubmitEditing={() => say(text)}
            />
            <IconButton icon="arrowRight" label="পাঠান" tone="primary" onPress={() => say(text)} />
          </View>
        ) : phase === "chat" ? (
          <>
            {reply?.suggestions?.length ? (
              <View style={styles.chips}>
                {reply.suggestions.map((sug, i) => (
                  <Tappable key={i} label={`বলুন: ${sug}`} sound="pop" onPress={() => say(sug)} style={styles.chip}>
                    <Text style={[type.label, { color: palette.primary }]} numberOfLines={1}>{sug}</Text>
                  </Tappable>
                ))}
              </View>
            ) : null}
            <View style={styles.actionRow}>
              <Tappable label="মাইকে চেপে বলুন" sound={null} onPress={micListen} style={styles.micBtn}>
                <Icon name="mic" size={26} color={palette.onPrimary} />
              </Tappable>
              <Tappable label="টাইপ করে উত্তর দিন" onPress={() => { setTyping(true); setTimeout(() => inputRef.current?.focus(), 50); }} style={styles.typeBtn}>
                <Icon name="edit" size={18} color={palette.primary} />
                <Text style={[type.label, { color: palette.primary }]}>লিখুন</Text>
              </Tappable>
              {userTurns >= MIN_USER_TURNS ? (
                <Button label="শেষ করুন" size="sm" onPress={finishSession} />
              ) : null}
            </View>
            {quotaOut ? (
              <View style={styles.quotaRow}>
                <Text style={[type.caption, { flex: 1 }]}>আজকের AI কোটা প্রায় শেষ।</Text>
                <Tappable label="বিজ্ঞাপন দেখে +৩ চ্যাট" sound="pop" onPress={watchRewarded} style={styles.rewardLink}>
                  <Icon name="play" size={14} color={palette.primary} />
                  <Text style={[type.label, { color: palette.primary }]}>+{bn(3)} চ্যাট</Text>
                </Tappable>
              </View>
            ) : null}
          </>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}

function Bubble({ turn }: { turn: Turn }) {
  const ai = turn.role === "ai";
  return (
    <Animated.View entering={FadeInDown.duration(220)} style={[styles.bubbleRow, ai ? styles.left : styles.right]}>
      {ai ? (
        <Image source={art.ui_splash_bondhu} style={styles.avatar} resizeMode="contain" accessibilityIgnoresInvertColors />
      ) : null}
      <View style={[styles.bubble, ai ? styles.aiBubble : styles.userBubble]}>
        <Text style={[type.body, { color: ai ? palette.ink : palette.onPrimary }]}>{turn.text}</Text>
        {ai ? <View style={styles.bubbleAudio}><AudioButton label="এই লাইনটি শুনুন" size={34} tone="soft" /></View> : null}
      </View>
    </Animated.View>
  );
}

function ThinkingBubble() {
  return (
    <View style={[styles.bubbleRow, styles.left]}>
      <Image source={art.ui_splash_bondhu} style={styles.avatar} resizeMode="contain" accessibilityIgnoresInvertColors />
      <View style={[styles.bubble, styles.aiBubble, { flexDirection: "row", alignItems: "center", gap: space.sm }]}>
        <Text style={[type.body, { color: palette.inkSoft }]}>Bondhu ভাবছে…</Text>
      </View>
    </View>
  );
}

export function FeedbackView({ fb, source, saved, scenarioId, onClose, onPro }: { fb: Feedback; source: "ai" | "scripted"; saved: number; scenarioId: string; onClose: () => void; onPro?: (from: string) => void }) {
  const nav = useNav();
  const insets = useSafeAreaInsets();
  const { pro } = useSettings();
  const scenario = getScenario(scenarioId);
  // A gentle Pro nudge ONLY after a genuinely good AI session (never mid-lesson, never on a weak score
  // or an offline practice run) — framed as "keep the conversation going", not a gate (QA monetization).
  const showProPreview = !!onPro && !pro && source === "ai" && fb.fluency >= 70;
  const subs: { label: string; value: number }[] = [
    { label: "স্পষ্টতা", value: fb.clarity },
    { label: "ব্যাকরণ", value: fb.grammar },
    { label: "গতি", value: fb.pace },
  ];
  // Band colour + encouraging line, consistent with the ring: ≥80 success, 50–79 warning, else danger.
  const band = fb.fluency >= 80 ? "success" : fb.fluency >= 50 ? "warning" : "danger";
  const bandFg = tones[band].fg;
  const encourage =
    fb.fluency >= 80 ? "দারুণ! আপনি সাবলীলভাবে বলছেন।" : fb.fluency >= 50 ? "ভালো হচ্ছে — অনুশীলন চালিয়ে যান।" : "শুরুটা হলো — আরেকবার চেষ্টা করুন।";
  const celebrate = source === "ai" && fb.fluency >= 80 && !isShotMode();
  return (
    <View style={styles.root}>
      {celebrate ? <Confetti trigger={1} /> : null}
      <View style={{ paddingTop: insets.top + space.sm, paddingHorizontal: space.lg }}>
        <StackHeader title="ফলাফল" subtitle={scenario?.title_bn} onClose={onClose} closeIcon="close" />
      </View>
      <ScrollView contentContainerStyle={[styles.fbScroll, { paddingBottom: insets.bottom + space.xl }]}>
        <View style={styles.scoreCard}>
          {source === "scripted" ? <Pill label="অনুশীলন · আনুমানিক" tone="neutral" /> : null}
          {/* A coloured, animated arc around the score, with the label centred UNDER the circle (not a
              left-aligned heading that wraps), an encouraging line, and the three sub-scores as mini bars. */}
          <ProgressRing
            value={fb.fluency / 100}
            size={136}
            stroke={14}
            color={bandFg}
            track={palette.surfaceAlt}
            label={bn(fb.fluency)}
            sublabel="/ ১০০"
          />
          <Text style={[type.heading, styles.scoreLabel]}>{source === "scripted" ? "অনুশীলন সম্পূর্ণ" : "সাবলীলতা স্কোর"}</Text>
          <Text style={[type.body, styles.scoreLabel, { color: bandFg }]}>{encourage}</Text>
          <View style={styles.subBars}>
            {subs.map((sub) => {
              const t = sub.value >= 80 ? "success" : sub.value >= 50 ? "warning" : "danger";
              return (
                <View key={sub.label} style={styles.subBar}>
                  <View style={styles.subBarHead}>
                    <Text style={type.label}>{sub.label}</Text>
                    <Text style={[type.amount, { fontSize: 14, color: tones[t].fg }]}>{bn(sub.value)}</Text>
                  </View>
                  <ProgressBar value={sub.value / 100} tone={t} />
                </View>
              );
            })}
          </View>
        </View>
        {source === "scripted" ? (
          <View style={styles.practiceNote}>
            <Icon name="chat" size={16} color={palette.inkSoft} />
            <Text style={[type.caption, { color: palette.inkSoft, flex: 1 }]}>
              এটি অফলাইন অনুশীলন — আনুমানিক স্কোর, তাই সাপ্তাহিক ট্রেন্ডে যোগ হয় না। পুরো সাবলীলতা বিশ্লেষণ ও বাংলা সংশোধনের জন্য ইন্টারনেট সংযোগ দরকার।
            </Text>
          </View>
        ) : null}

        {fb.corrections.length ? (
          <>
            <Text style={type.title}>সংশোধন ({bn(fb.corrections.length)})</Text>
            {fb.corrections.map((c, i) => (
              <View key={i} style={styles.corr}>
                <View style={styles.corrLine}>
                  <Icon name="close" size={16} color={palette.danger} />
                  <Text style={[type.body, { flex: 1, color: palette.inkSoft, textDecorationLine: "line-through" }]}>{c.original || "—"}</Text>
                </View>
                <View style={styles.corrLine}>
                  <Icon name="checkCircle" size={16} color={palette.success} />
                  <Text style={[type.bodyStrong, { flex: 1 }]}>{c.corrected}</Text>
                  <AudioButton label="সঠিক বাক্যটি শুনুন" size={34} tone="soft" />
                </View>
                <View style={styles.corrTip}>
                  <Text style={[type.label, { color: palette.ink }]}>{c.explanationBn}</Text>
                </View>
              </View>
            ))}
            <AiReport feature="ai_feedback" />
          </>
        ) : (
          <View style={styles.noCorr}>
            <Icon name="checkCircle" size={22} color={palette.success} />
            <Text style={[type.body, { flex: 1 }]}>দারুণ! বড় কোনো ভুল চোখে পড়েনি। অনুশীলন চালিয়ে যান।</Text>
          </View>
        )}

        {saved > 0 ? (
          <Tappable label="আমার ভুল খুলুন" sound="pop" onPress={() => { nav.back(); nav.go({ name: "review" }); }} style={styles.savedRow}>
            <Icon name="refresh" size={16} color={palette.primary} />
            <Text style={[type.label, { color: palette.ink, flex: 1 }]}>{bn(saved)}টি ভুল “আমার ভুল”-এ সংরক্ষিত — ট্যাপ করে রিভিউ করুন।</Text>
            <Icon name="chevronRight" size={16} color={palette.inkMuted} />
          </Tappable>
        ) : source === "scripted" ? (
          <Text style={[type.caption, { textAlign: "center" }]}>স্ক্রিপ্টেড রোল-প্লে — ভুল সংরক্ষণ হয় শুধু AI সেশনে।</Text>
        ) : null}

        {showProPreview ? (
          <Tappable label="Pro দেখুন — দিনে ৫৩টি AI চ্যাট" sound="pop" onPress={() => onPro!("good_session")} style={styles.proPreview}>
            <View style={styles.proPreviewIcon}>
              <Icon name="star" size={20} color={palette.onPrimary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={type.bodyStrong}>দারুণ সেশন! আরও চালিয়ে যান?</Text>
              <Text style={[type.caption, { color: palette.inkSoft }]}>Pro-তে দিনে ৫৩টি AI চ্যাট ও বিজ্ঞাপন-মুক্ত — ইচ্ছা হলে।</Text>
            </View>
            <Icon name="chevronRight" size={18} color={palette.inkMuted} />
          </Tappable>
        ) : null}
      </ScrollView>
      <View style={[styles.fbFooter, { paddingBottom: insets.bottom + space.md }]}>
        {saved > 0 ? <Button label="আমার ভুল রিভিউ করুন" variant="secondary" icon="refresh" onPress={() => { nav.back(); nav.go({ name: "review" }); }} /> : null}
        <Button label="হয়ে গেছে" size="lg" onPress={onClose} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
  header: { paddingHorizontal: space.lg },
  chat: { padding: space.lg, gap: space.md },
  sceneCard: { flexDirection: "row", alignItems: "center", gap: space.sm, backgroundColor: palette.primarySoft, borderRadius: radius.md, padding: space.md },
  voiceNote: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: space.xs },
  bubbleRow: { flexDirection: "row", alignItems: "flex-end", gap: space.xs, maxWidth: "100%" },
  left: { justifyContent: "flex-start" },
  right: { justifyContent: "flex-end" },
  avatar: { width: 30, height: 30 },
  bubble: { maxWidth: "82%", borderRadius: radius.lg, paddingHorizontal: space.md, paddingVertical: space.sm, ...shadow },
  aiBubble: { backgroundColor: palette.surface, borderTopLeftRadius: 4 },
  userBubble: { backgroundColor: palette.primary, borderTopRightRadius: 4 },
  bubbleAudio: { marginTop: space.xs, alignSelf: "flex-start" },
  inputZone: { paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.sm, backgroundColor: palette.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border },
  hintRow: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: palette.primarySoft, borderRadius: radius.md, paddingHorizontal: space.md, padding: space.sm },
  listenRow: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.sm },
  typeRow: { flexDirection: "row", alignItems: "flex-end", gap: space.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  chip: { borderWidth: 1, borderColor: palette.primarySoft, backgroundColor: palette.primarySoft, borderRadius: radius.pill, paddingHorizontal: 14, minHeight: 40, justifyContent: "center", maxWidth: "100%" },
  actionRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  micBtn: { width: 52, height: 52, borderRadius: 26, backgroundColor: palette.primary, alignItems: "center", justifyContent: "center", ...shadow },
  typeBtn: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 48, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: palette.primarySoft },
  quotaRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  rewardLink: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 40, paddingHorizontal: 10, borderRadius: radius.pill, borderWidth: 1, borderColor: palette.primarySoft },
  fbScroll: { padding: space.lg, gap: space.md },
  scoreCard: { alignItems: "center", gap: space.sm, backgroundColor: palette.surface, borderRadius: radius.xl, padding: space.xl, ...shadow },
  scoreLabel: { textAlign: "center", alignSelf: "stretch" },
  practiceNote: { flexDirection: "row", alignItems: "flex-start", gap: space.sm, backgroundColor: palette.surfaceAlt, borderRadius: radius.md, padding: space.md },
  subBars: { alignSelf: "stretch", gap: space.md, marginTop: space.md },
  subBar: { gap: 6 },
  subBarHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  corr: { backgroundColor: palette.surface, borderRadius: radius.lg, padding: space.lg, gap: space.sm, ...shadow },
  corrLine: { flexDirection: "row", alignItems: "center", gap: space.sm },
  corrTip: { backgroundColor: palette.primarySoft, borderRadius: radius.md, padding: space.md },
  noCorr: { flexDirection: "row", alignItems: "center", gap: space.md, backgroundColor: palette.successSoft, borderRadius: radius.lg, padding: space.lg },
  savedRow: { flexDirection: "row", alignItems: "center", gap: space.sm, backgroundColor: palette.primarySoft, borderRadius: radius.md, padding: space.md },
  proPreview: { flexDirection: "row", alignItems: "center", gap: space.md, backgroundColor: palette.surface, borderRadius: radius.lg, borderWidth: 1.5, borderColor: palette.warningSoft, padding: space.md, ...shadow },
  proPreviewIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: palette.warning, alignItems: "center", justifyContent: "center" },
  fbFooter: { paddingHorizontal: space.lg, paddingTop: space.md, gap: space.sm, backgroundColor: palette.bg },
});
