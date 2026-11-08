import { useState } from "react";
import { View } from "react-native";
import { PracticeScreen } from "./screens/PracticeScreen";
import { SoundsScreen } from "./screens/SoundsScreen";
import { ProgressScreen } from "./screens/ProgressScreen";
import { ReviewScreen } from "./screens/ReviewScreen";
import { ProSheet } from "./screens/ProSheet";
import { ResultView, SpeakSheet } from "./screens/SpeakSheet";
import { PairDrillSheet } from "./screens/PairDrillSheet";
import { TAB_BAR_HEIGHT, TabBar, Sheet, palette, type IconName } from "./ui";
import { gymStore } from "./core/data";
import { store } from "./modules/store";
import {
  buy,
  chooseAccent,
  chooseLanguage,
  completeDiagnosis,
  completeDrill,
  finishOnboarding,
  recordCustom,
  recordDiagnostic,
  recordPractice,
  advanceSession,
  reviewItem,
} from "./core/state";
import { emptyState, type AppState } from "./core/state";
import { diagnosticsFor } from "./core/sentences";
import { interpret } from "./core/scoring";
import type { ScoreResult } from "./core/types";
import { addDays, dateKey, noonMs } from "./core/dates";
import { addItem } from "./core/srs";

/**
 * Screenshot mode: the factory opens the app with <scheme>://shot/<id> on an
 * emulator and captures the screen for the Play Store listing. Every scene in
 * shots.json must render a REAL state of the app using the real screens — we
 * seed it by driving the real reducers (a Hindi learner ~3 weeks in), so the
 * data is realistic and always valid. No mock-ups, no UI that doesn't exist.
 */
const noop = () => {};

type Tab = "practice" | "sounds" | "progress" | "review" | "settings";
const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: "practice", label: "Practice", icon: "mic" },
  { id: "sounds", label: "Sounds", icon: "target" },
  { id: "progress", label: "Progress", icon: "chart" },
  { id: "review", label: "Review", icon: "book" },
  { id: "settings", label: "Settings", icon: "settings" },
];

// Store fixtures use actual word phonemes. The core test helper intentionally
// distributes tags for coverage; using it here invents incorrect saved-word IPA.
const SHOT_PHONEMES: Record<string, string[]> = {
  we: ["w", "iː"], have: ["h", "æ", "v"], very: ["v", "ɛ", "r", "i"],
  warm: ["w", "ɔ", "r", "m"], weather: ["w", "ɛ", "ð", "ɚ"],
  i: ["aɪ"], think: ["θ", "ɪ", "ŋ", "k"], this: ["ð", "ɪ", "s"],
  is: ["ɪ", "z"], the: ["ð", "ə"], third: ["θ", "ɝ", "d"], month: ["m", "ʌ", "n", "θ"],
  ship: ["ʃ", "ɪ", "p"], sailed: ["s", "eɪ", "l", "d"], with: ["w", "ɪ", "ð"],
  sheep: ["ʃ", "iː", "p"], today: ["t", "ə", "d", "eɪ"],
  vest: ["v", "ɛ", "s", "t"], vine: ["v", "aɪ", "n"],
  thin: ["θ", "ɪ", "n"], those: ["ð", "oʊ", "z"],
  comfortable: ["k", "ʌ", "m", "f", "ɚ", "t", "ə", "b", "əl"],
};

function shotScore(text: string, base: number, focus: Record<string, number> = {}): ScoreResult {
  return {
    confidence: 0.92,
    words: text.match(/[A-Za-z]+/g)!.map(word => {
      const sounds = SHOT_PHONEMES[word.toLowerCase()];
      if (!sounds) throw new Error(`Missing screenshot phonemes: ${word}`);
      const phonemes = sounds.map(ph => ({ ph, expectedIPA: ph, heardIPA: ph, score: focus[ph] ?? base }));
      return { word, phonemes, score: Math.round(phonemes.reduce((sum, p) => sum + p.score, 0) / phonemes.length) };
    }),
  };
}

/** A believable Hindi learner three weeks in, built through the real pipeline. */
function seedGym(pro: boolean): AppState {
  const today = dateKey(new Date());
  const start = addDays(today, -21);
  let s = emptyState(start);
  s = chooseAccent(chooseLanguage(s, "hi"), "us");

  // The 30-second sound check (3 diagnostic lines) → first report + plan.
  for (const d of diagnosticsFor("hi")) {
    const raw = shotScore(d.text, 82, { v: 45, w: 57, θ: 51, ð: 79, ɪ: 80, æ: 81 });
    s = recordDiagnostic(s, raw, { accent: "us", timestamp: noonMs(start), sentenceId: d.id }, start).state;
  }
  s = completeDiagnosis(s, start);
  s = finishOnboarding(s);

  // Three weeks of practice, improving over time → streak, trend and sound map.
  const lines = diagnosticsFor("hi");
  for (let i = 0; i < 21; i++) {
    const day = addDays(start, i + 1);
    const now = noonMs(day);
    // Same three lines each day: comparable weekly averages, no sample-mix jump.
    // Every symbol is attached to its own word; V stays the next focus sound.
    for (const sentence of lines) {
      const raw = shotScore(sentence.text, 84 + Math.floor(i / 7), {
        v: 49 + i, w: 61 + i, θ: 55 + i, ð: 82 + Math.floor(i / 3),
        ɪ: 83 + Math.floor(i / 4), æ: 82 + Math.floor(i / 3),
      });
      s = recordPractice(s, raw, { accent: "us", timestamp: now, sentenceId: sentence.id }, day, now).state;
    }
    // Review the words already encountered, so this is a used spaced queue,
    // rather than thirty untouched words remaining due after three weeks.
    for (const item of s.srs) if (item.dueAt <= day) s = reviewItem(s, item.id, true, day);
  }

  // A minimal-pair drill and a typed word, so Sounds + Review look lived-in.
  s = completeDrill(s, "w", 1, today);
  s = recordCustom(s, "comfortable", shotScore("comfortable", 84), today, noonMs(today)).state;
  // A small, accurate queue; each word contains its named practice sound.
  for (const [word, sound] of [["vest", "v"], ["thin", "θ"], ["those", "ð"]]) {
    const saved = addItem(s.srs, { id: `w${s.nextSrsId}`, text: word, soundTags: [sound], source: "miss" }, today);
    s = { ...s, srs: saved.items, nextSrsId: s.nextSrsId + (saved.added ? 1 : 0) };
  }
  // A real resumable session, part-way through its due-word/sound sequence.
  s = advanceSession(s, today, noonMs(today));
  s = advanceSession(s, today, noonMs(today));

  if (pro) s = buy(s, "lifetime", noonMs(today));
  return s;
}

// Fixed example of the scorer's existing data contract. Every word has its
// phonemes; the real result UI labels the contrast as a text-based suggestion.
const FEEDBACK_TEXT = "The weather is very warm today.";
const FEEDBACK_RAW: ScoreResult = {
  confidence: 0.92,
  words: ([
    ["The", ["ð", "ə"]], ["weather", ["w", "ɛ", "ð", "ɚ"]],
    ["is", ["ɪ", "z"]], ["very", ["v", "ɛ", "r", "i"]],
    ["warm", ["w", "ɔ", "r", "m"]], ["today", ["t", "ə", "d", "eɪ"]],
  ] as [string, string[]][]).map(([word, sounds]) => ({ word, score: 85, phonemes: sounds.map(ph => ({ ph, expectedIPA: ph, heardIPA: ph === "v" ? "w" : ph, score: ph === "v" ? 59 : 88 })) })),
};

/** Reuse the exact post-recording view used by SpeakSheet, without a live mic or AI request. */
function FeedbackScene() {
  const [openWord, setOpenWord] = useState<number | null>(3);
  const attempt = interpret("shot-feedback", FEEDBACK_RAW, { accent: "us", timestamp: noonMs(dateKey(new Date())), sentenceId: "s_start_2" });
  return <Sheet visible fullHeight title="Today's line" onClose={noop}>
    <ResultView attempt={attempt} mode={{ kind: "practice", text: FEEDBACK_TEXT, soundTags: ["w", "v", "ð"] }}
      openWord={openWord} setOpenWord={setOpenWord} accent="us" l1="hi" onRetry={noop} onUnscored={noop} onDone={noop} transcript={FEEDBACK_TEXT} />
  </Sheet>;
}

export function ScreenshotScene({ id }: { id: string }) {
  const pro = id !== "pro";
  useState(() => {
    store.set({ onboarded: true, pro, adsRemoved: true, proSource: pro ? "lifetime" : undefined, sessions: 30 });
    gymStore.set(seedGym(pro));
    return true;
  });
  const root = { flex: 1, backgroundColor: palette.bg };
  const frame = (active: Tab, screen: React.ReactNode) => (
    <View style={root}>
      {screen}
      <TabBar tabs={TABS} active={active} onChange={noop} />
    </View>
  );
  switch (id) {
    case "feedback":
      return <View style={root}><PracticeScreen bottomInset={TAB_BAR_HEIGHT} onPro={noop} /><FeedbackScene /></View>;
    case "sounds":
      return frame("sounds", <SoundsScreen bottomInset={TAB_BAR_HEIGHT} onPro={noop} />);
    case "record":
      return <View style={root}><PracticeScreen bottomInset={TAB_BAR_HEIGHT} onPro={noop} /><SpeakSheet visible mode={{ kind: "practice", sentenceId: "s_start_2", text: FEEDBACK_TEXT, soundTags: ["v", "w", "ð"], title: "Today's line" }} onClose={noop} onPro={noop} /></View>;
    case "drill":
      return <View style={root}><SoundsScreen bottomInset={TAB_BAR_HEIGHT} onPro={noop} /><PairDrillSheet soundId="v" onClose={noop} /></View>;
    case "progress":
      return frame("progress", <ProgressScreen bottomInset={TAB_BAR_HEIGHT} onPro={noop} />);
    case "review":
      return frame("review", <ReviewScreen bottomInset={TAB_BAR_HEIGHT} onPro={noop} />);
    case "pro":
      return (
        <View style={root}>
          <PracticeScreen bottomInset={TAB_BAR_HEIGHT} onPro={noop} />
          <TabBar tabs={TABS} active="practice" onChange={noop} />
          <ProSheet visible from="screenshot" onClose={noop} />
        </View>
      );
    case "practice":
    default:
      return frame("practice", <PracticeScreen bottomInset={TAB_BAR_HEIGHT} onPro={noop} />);
  }
}
