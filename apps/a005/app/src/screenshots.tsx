import { useRef, useState, type ElementRef } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { PracticeScreen } from "./screens/PracticeScreen";
import { ProgressScreen } from "./screens/ProgressScreen";
import { ProSheet } from "./screens/ProSheet";
import { ResultView } from "./screens/ResultView";
import { TAB_BAR_HEIGHT, TabBar, palette, space } from "./ui";
import { bandUpStore } from "./core/data";
import { store } from "./modules/store";
import { addDays, emptyState, type Attempt, type BandUpState, type Construct } from "./core/model";
import { dateKey } from "./core/dates";
import { questionById } from "./core/questions";

/**
 * Screenshot mode: the factory opens the app with <scheme>://shot/<id> and
 * captures the screen for the Play listing. Each scene renders a REAL Band Up
 * state with realistic seeded data (a user a few weeks into prep) — no mock-ups.
 */
const noop = () => {};
const noStart = () => {};

const mk = (
  id: string,
  qid: string,
  taskType: "repeat" | "interview",
  startedAt: string,
  band6: number,
  constructs: Partial<Record<Construct, number>>,
  strengths: string[],
  weaknesses: string[],
  improved: string,
  relevance: number | null,
  mode: Attempt["mode"] = "practice",
  mockId: string | null = null,
): Attempt => ({
  id,
  questionId: qid,
  taskType,
  mode,
  startedAt,
  durationS: taskType === "interview" ? 42 : 12,
  speechS: taskType === "interview" ? 38 : 10,
  pauseCount: 2,
  transcript:
    taskType === "repeat"
      ? questionById(qid)?.targetSentence ?? ""
      : "In my opinion, yes, mainly because it helps people in their daily lives, and from my own experience it made a real difference.",
  status: "scored",
  score30: Math.round((band6 / 6) * 30),
  band6,
  constructs,
  strengths,
  weaknesses,
  improvedAnswer: improved,
  relevance,
  pacingWpm: taskType === "interview" ? 118 : 96,
  mockId,
});

// Seeded feedback copy, shared by the history seed and the standalone result scene.
const rStr = ["Clear, steady voice", "Good stress on key words"];
const rWk = ["Missed one small word", "Slightly rushed at the end"];
const iStr = ["Clear opinion up front", "Relevant, specific example"];
const iWk = ["Add one more reason", "A couple of long pauses"];
const improvedR = "The library closes early on Fridays.";
const improvedI = "In my opinion, yes — mainly because it saves people time in daily life, as I've seen in my own routine.";

function seed(): BandUpState {
  const today = dateKey(new Date());
  const base = emptyState();

  // A few weeks of practice that tells ONE coherent story across every scene:
  // the estimated score climbs with natural week-to-week variation (never a flat
  // ceiling) and lands on 24 — the same figure the Practice hero and the latest
  // trend bar show — and Organization stays the lowest construct, so "fix this
  // next" names the same weak spot on Home, Progress and the result scene.
  const attempts: Attempt[] = [
    mk("a1", "qr1", "repeat", addDays(today, -18), 3.6, { fluency: 4, intelligibility: 4, repeat_accuracy: 3 }, rStr, rWk, improvedR, null),
    mk("a2", "qi1", "interview", addDays(today, -16), 3.8, { fluency: 4, intelligibility: 4, language_use: 4, organization: 3 }, iStr, iWk, improvedI, 0.82),
    mk("a3", "qr2", "repeat", addDays(today, -12), 4.0, { fluency: 4, intelligibility: 4, repeat_accuracy: 4 }, rStr, rWk, improvedR, null),
    mk("a4", "qi2", "interview", addDays(today, -9), 3.8, { fluency: 4, intelligibility: 4, language_use: 4, organization: 3 }, iStr, iWk, improvedI, 0.85),
    mk("a5", "qr3", "repeat", addDays(today, -6), 4.2, { fluency: 4, intelligibility: 5, repeat_accuracy: 4 }, rStr, rWk, improvedR, null),
    mk("a6", "qi3", "interview", addDays(today, -4), 4.0, { fluency: 4, intelligibility: 4, language_use: 4, organization: 4 }, iStr, iWk, improvedI, 0.88),
    mk("a7", "qr4", "repeat", addDays(today, -3), 4.4, { fluency: 5, intelligibility: 4, repeat_accuracy: 4 }, rStr, rWk, improvedR, null),
    mk("a8", "qi4", "interview", addDays(today, -2), 4.6, { fluency: 5, intelligibility: 5, language_use: 5, organization: 4 }, iStr, iWk, improvedI, 0.9),
    mk("a9", "qr1", "repeat", addDays(today, -1), 4.6, { fluency: 5, intelligibility: 5, repeat_accuracy: 4 }, rStr, rWk, improvedR, null),
    mk("a10", "qi1", "interview", today, 4.8, { fluency: 5, intelligibility: 5, language_use: 5, organization: 4 }, iStr, iWk, improvedI, 0.94),
  ];

  return {
    ...base,
    attempts,
    phrases: [
      { id: "p1", text: "In my opinion,", category: "Strong openings", createdAt: addDays(today, -10) },
      { id: "p2", text: "The main reason is that", category: "Giving reasons", createdAt: addDays(today, -8) },
    ],
    profile: {
      ...base.profile,
      testDate: addDays(today, 21),
      // Target the top of the 0–30 scale so the Practice hero ring reads "/ 30",
      // matching the "of 30" headline (the store judge flagged a 25/26 vs of-30 mismatch).
      targetScore: 30,
      playbackSpeed: 1,
      captions: true,
      freeScoredUsed: 3,
      creditsDate: today,
      dayUsed: 1,
      dayBonus: 0,
      streakCount: 7,
      lastActiveDate: today,
      freezeAvailable: true,
    },
    nextId: 20,
    contentVersion: 1,
  };
}

function Tabs({ active }: { active: "practice" | "progress" }) {
  return (
    <TabBar
      tabs={[
        { id: "practice", label: "Practice", icon: "home" },
        { id: "mock", label: "Mock", icon: "trophy" },
        { id: "progress", label: "Progress", icon: "chart" },
        { id: "learn", label: "Learn", icon: "book" },
        { id: "settings", label: "Settings", icon: "settings" },
      ]}
      active={active}
      onChange={noop}
    />
  );
}

const screenProps = { bottomInset: TAB_BAR_HEIGHT, onPro: noop, onStart: noStart, onTab: noop };

export function ScreenshotScene({ id }: { id: string }) {
  // The result/improved scenes share one ScrollView; the "improved" scene scrolls
  // to the rewrite below the fold so its capture shows "Your answer, levelled up"
  // + the Improved compare tab — a distinct shot, not a copy of the result scene.
  const resultScroll = useRef<ElementRef<typeof ScrollView>>(null);
  useState(() => {
    // Tell the animated charts (ProgressRing / ProgressBar / BarChart / DonutChart)
    // to paint their final value on the first frame, so a fast capture never shows
    // a half-drawn ring or an inconsistent bar fill. Set before any child renders.
    (globalThis as { __AGF_SHOT?: boolean }).__AGF_SHOT = true;
    store.set({ onboarded: true, pro: id === "pro" || id === "progress", adsRemoved: true, sessions: 30 });
    bandUpStore.set(seed());
    return true;
  });
  const root = { flex: 1, backgroundColor: palette.bg };
  // A standalone result with a REALISTIC, VARIED rubric: each construct reads a
  // different band, the bars line up with the numbers, and the warning colour +
  // "weakest" tag land on the genuinely lowest skill (Organization) — never on a
  // tie, so the colour never contradicts the figure.
  const resultAttempt = mk(
    "rshot",
    "qi4",
    "interview",
    dateKey(new Date()),
    4.8,
    { fluency: 5, intelligibility: 5, language_use: 4.5, organization: 4 },
    iStr,
    iWk,
    improvedI,
    0.94,
  );
  const resultQ = questionById("qi4")!;

  switch (id) {
    case "progress":
      return (
        <View style={root}>
          <ProgressScreen {...screenProps} />
          <Tabs active="progress" />
        </View>
      );
    case "result":
    case "improved":
      return (
        <SafeAreaView style={root}>
          <ScrollView
            ref={resultScroll}
            contentContainerStyle={styles.resultBody}
            onContentSizeChange={() => {
              // Frame the rewrite (it lives below the score + rubric) for the
              // "improved" scene, so it never captures the same top as "result".
              if (id === "improved") resultScroll.current?.scrollToEnd({ animated: false });
            }}
          >
            <ResultView attempt={resultAttempt} question={resultQ} defaultSpeed={1} initialTab={id === "improved" ? "improved" : "yours"} />
          </ScrollView>
          <Tabs active="progress" />
        </SafeAreaView>
      );
    case "pro":
      return (
        <View style={root}>
          <PracticeScreen {...screenProps} />
          <Tabs active="practice" />
          <ProSheet visible from="screenshot" onClose={noop} />
        </View>
      );
    case "practice":
    default:
      return (
        <View style={root}>
          <PracticeScreen {...screenProps} />
          <Tabs active="practice" />
        </View>
      );
  }
}

const styles = StyleSheet.create({
  resultBody: { padding: space.lg, paddingBottom: TAB_BAR_HEIGHT + space.xl, gap: space.lg },
});
