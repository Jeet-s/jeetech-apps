import { useState } from "react";
import { View } from "react-native";
import { PracticeScreen } from "./screens/PracticeScreen";
import { SoundsScreen } from "./screens/SoundsScreen";
import { ProgressScreen } from "./screens/ProgressScreen";
import { ReviewScreen } from "./screens/ReviewScreen";
import { ProSheet } from "./screens/ProSheet";
import { ResultView } from "./screens/SpeakSheet";
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
} from "./core/state";
import { emptyState, type AppState } from "./core/state";
import { diagnosticsFor, sentenceForSound } from "./core/sentences";
import { interpret, mockScore } from "./core/scoring";
import type { ScoreResult } from "./core/types";
import { addDays, dateKey, noonMs } from "./core/dates";

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

/** A believable Hindi learner three weeks in, built through the real pipeline. */
function seedGym(pro: boolean): AppState {
  const today = dateKey(new Date());
  const start = addDays(today, -21);
  let s = emptyState(start);
  s = chooseAccent(chooseLanguage(s, "hi"), "us");

  // The 30-second sound check (3 diagnostic lines) → first report + plan.
  for (const d of diagnosticsFor("hi")) {
    const raw = mockScore({ text: d.text, soundTags: d.soundTags }, "us", "weak");
    s = recordDiagnostic(s, raw, { accent: "us", timestamp: noonMs(start), sentenceId: d.id }, start).state;
  }
  s = completeDiagnosis(s, start);
  s = finishOnboarding(s);

  // Three weeks of practice, improving over time → streak, trend and sound map.
  const arc = ["weak", "weak", "improving", "weak", "improving", "good", "improving", "good", "improving", "good", "good", "good", "good", "good", "good", "good", "good", "good", "good", "good", "good"] as const;
  arc.forEach((q, i) => {
    const day = addDays(today, -(arc.length - 1 - i));
    const now = noonMs(day);
    const sentence = sentenceForSound(s.plan[i % s.plan.length], true);
    if (!sentence) return;
    const raw = mockScore({ text: sentence.text, soundTags: sentence.soundTags }, "us", q);
    // Gradual gains across the last week, with /v/ still needing focused work.
    const sample = { ...raw, words: raw.words.map(w => ({ ...w, phonemes: w.phonemes.map(p => ({ ...p, score: Math.max(0, Math.min(98, p.score + (i >= 14 ? (i - 14) * 2 : 0) - (p.ph === "v" ? 9 : 0))) })) })) };
    s = recordPractice(s, sample, { accent: "us", timestamp: now, sentenceId: sentence.id }, day, now).state;
  });

  // A minimal-pair drill and a typed word, so Sounds + Review look lived-in.
  s = completeDrill(s, s.plan[0], 0.85, addDays(today, -1));
  s = recordCustom(s, "comfortable", mockScore({ text: "comfortable", soundTags: [] }, "us", "improving"), today, noonMs(today)).state;
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
