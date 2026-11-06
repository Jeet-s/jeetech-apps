import { useState } from "react";
import { View } from "react-native";
import { HomeScreen } from "./screens/HomeScreen";
import { PracticeScreen } from "./screens/PracticeScreen";
import { ProgressScreen } from "./screens/ProgressScreen";
import { ReportScreen } from "./screens/ReportScreen";
import { ProSheet } from "./screens/ProSheet";
import { TAB_BAR_HEIGHT, TabBar, palette } from "./ui";
import { appStore, todayKey } from "./core/data";
import { addCustomScenario, completeLesson, createEvent, recordAndAnalyse, selectPack, touchDay, type AppState } from "./core/state";
import { emptyApp } from "./core/state";
import { makeWords, SAMPLE_AI, SAMPLE_FILLERS, SAMPLE_GOOD } from "./core/samples";
import { addDays } from "./core/dates";
import type { AiQualitative } from "./core/types";
import { store } from "./modules/store";
import type { AppNav } from "./app/nav";

/**
 * Screenshot mode: the factory opens the app with <scheme>://shot/<id> and
 * captures the real screens with realistic seeded data (a user two weeks in).
 */
const noop = () => {};
const noopNav: AppNav = {
  record: noop,
  openReport: noop,
  openPack: noop,
  openLesson: noop,
  openEvent: noop,
  openHistory: noop,
  openSupport: noop,
  openAchievements: noop,
  openBackup: noop,
  pro: noop,
  go: noop,
};

// A rich take for the Report hero: a full ~30s take (so the report is the
// complete, confident one — not the provisional short-take state) with a few
// real fillers to highlight and a crisp rewrite.
const SHOT_TEXT =
  "So um good morning everyone today I want to you know talk about how our team ships faster we used to plan for hours but honestly now we decide in minutes and like the result is happier customers and a calmer team and that change came from trusting small experiments over long planning meetings so we test one idea each week and keep what works thank you all so much".split(" ");
const SHOT_WORDS = makeWords(SHOT_TEXT, { wpm: 132, gaps: { 10: 900, 40: 700 } });
const SHOT_AI: AiQualitative = {
  tips: [
    "Open with your one idea — drop the warm-up words.",
    "Trade “um” and “you know” for a short pause.",
    "End on the benefit: happier customers, calmer team.",
  ],
  rewriteText: "Here's how our team ships faster: we decide in minutes, not hours — so customers are happier and the team is calmer.",
  rewriteDiff: [
    { kind: "removed", text: "So um good morning everyone today I want to you know talk about how" },
    { kind: "added", text: "Here's how" },
    { kind: "same", text: "our team ships faster" },
  ],
  openerSuggestion: "Here's the one change that doubled our speed.",
  closerSuggestion: "Faster decisions, happier customers — starting today.",
  clarityNote: "Clear once the warm-up words are gone.",
  confidenceNote: "Steady and assured.",
  onTopic: true,
  modelVersion: "podium-ai-shot+ai",
};

const PACK_ROTATION = ["interview", "pitch", "toast", "meeting", "impromptu", "viva", "presentation", "class"];

function seed(): string {
  const today = todayKey();
  let s: AppState = emptyApp(addDays(today, -16));
  // Two weeks of daily takes → streak, baseline and a rising trend.
  for (let i = 13; i >= 0; i--) {
    const day = addDays(today, -i);
    s = touchDay(s, day);
    s = selectPack(s, PACK_ROTATION[i % PACK_ROTATION.length]);
    const last = i === 0;
    const words = last ? SHOT_WORDS : i % 3 === 0 ? SAMPLE_FILLERS : SAMPLE_GOOD;
    const ai = last ? SHOT_AI : SAMPLE_AI;
    // Keep today's take "standard" (not the daily drill) so the Home scene shows
    // the active 60-second drill call-to-action, not the post-drill "done" card.
    s = recordAndAnalyse(s, { mode: "standard", words, ai }, day, i).state;
  }
  s = addCustomScenario(s, "Series B investor pitch", today, [
    "Open your Series B pitch with traction, not your name.",
    "Explain why now is the moment for this round.",
    "Handle: what stops a big player copying you?",
  ]).state;
  s = createEvent(s, { type: "interview", title: "Final round interview", date: addDays(today, 4) }, today).state;
  s = completeLesson(s, "l_openers", 84);
  appStore.set(() => s);
  return s.reports[s.reports.length - 1]?.id ?? "";
}

function Tabs({ active }: { active: "home" | "practice" | "progress" | "settings" }) {
  return (
    <TabBar
      tabs={[
        { id: "home", label: "Home", icon: "home" },
        { id: "practice", label: "Practice", icon: "mic" },
        { id: "progress", label: "Progress", icon: "chart" },
        { id: "settings", label: "Settings", icon: "settings" },
      ]}
      active={active}
      onChange={noop}
    />
  );
}

export function ScreenshotScene({ id }: { id: string }) {
  const reportId = useState(() => {
    store.set({ onboarded: true, pro: false, adsRemoved: true, sessions: 30 });
    return seed();
  })[0];
  const root = { flex: 1, backgroundColor: palette.bg };

  switch (id) {
    case "report":
      return (
        <View style={root}>
          <ReportScreen reportId={reportId} onClose={noop} onRetake={noop} onPro={noop} />
        </View>
      );
    case "practice":
      return (
        <View style={root}>
          <PracticeScreen bottomInset={TAB_BAR_HEIGHT} nav={noopNav} />
          <Tabs active="practice" />
        </View>
      );
    case "progress":
      return (
        <View style={root}>
          <ProgressScreen bottomInset={TAB_BAR_HEIGHT} nav={noopNav} />
          <Tabs active="progress" />
        </View>
      );
    case "pro":
      return (
        <View style={root}>
          <HomeScreen bottomInset={TAB_BAR_HEIGHT} nav={noopNav} />
          <Tabs active="home" />
          <ProSheet visible from="screenshot" onClose={noop} />
        </View>
      );
    case "home":
    default:
      return (
        <View style={root}>
          <HomeScreen bottomInset={TAB_BAR_HEIGHT} nav={noopNav} />
          <Tabs active="home" />
        </View>
      );
  }
}
