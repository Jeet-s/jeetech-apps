import { useState } from "react";
import { View } from "react-native";
import { HomeScreen } from "./screens/HomeScreen";
import { SpeakScreen } from "./screens/SpeakScreen";
import { MeScreen } from "./screens/MeScreen";
import { LessonScreen } from "./screens/LessonScreen";
import { ProSheet } from "./screens/ProSheet";
import { FeedbackView } from "./screens/ConversationScreen";
import { NavProvider, type Nav } from "./nav";
import { TAB_BAR_HEIGHT, TabBar, palette } from "./ui";
import { appStore, todayKey } from "./core/data";
import { addDays } from "./core/dates";
import { emptyState, applyPlacement, completeLesson, completeAiSession, toggleFavorite, type AppState } from "./core/state";
import { parseFeedback } from "./core/feedback";
import { lessonsForCourse } from "./core/catalog";
import { store } from "./modules/store";
import { setShotMode } from "./util";

/**
 * Screenshot mode: the factory opens <scheme>://shot/<id> on an emulator and
 * captures the screen for the Play listing. Every scene renders a REAL screen
 * with realistic seeded data (a learner ~2 weeks in). Ads and billing are off.
 */
const noop = () => {};
const nav: Nav = { go: noop, back: noop, tab: noop, openPro: noop };

function seed(): AppState {
  const today = todayKey();
  let st = emptyState(today);
  st = applyPlacement(st, { level: "A2", goal: "daily", startDay: 1 });
  st = { ...st, profile: { ...st.profile, name: "রিয়া" } };
  // Finish days 1–7 of the 30-day path over the last week (consecutive → a 7-day streak).
  lessonsForCourse("c30")
    .slice(0, 7)
    .forEach((l, i) => {
      st = completeLesson(st, l.id, [80, 100, 80, 90, 100, 80, 90][i], addDays(today, i - 6)).state;
    });
  // A handful of AI sessions for a rising weekly trend + a couple of saved mistakes.
  const scores = [62, 68, 71, 0, 78, 0, 84];
  scores.forEach((sc, i) => {
    if (!sc) return;
    st = completeAiSession(st, {
      scenarioId: "sc_market",
      feedback: parseFeedback({
        fluency: sc,
        clarity: sc + 3,
        grammar: sc - 4,
        pace: sc + 1,
        corrections:
          i === 6
            ? [
                { original: "How much this?", corrected: "How much is this?", explanationBn: "প্রশ্নে 'is' দরকার।" },
                { original: "I want two kilo", corrected: "I want two kilos.", explanationBn: "বহুবচনে 'kilos'।" },
              ]
            : [],
      }),
      durationSec: 150,
      today: addDays(today, i - 6),
      source: "ai",
    }).state;
  });
  st = toggleFavorite(st, "p_daily_002", today);
  st = toggleFavorite(st, "p_shopping_011", today);
  return st;
}

const SAMPLE_FEEDBACK = parseFeedback({
  fluency: 82,
  clarity: 85,
  grammar: 78,
  pace: 80,
  corrections: [
    { original: "How much this?", corrected: "How much is this?", explanationBn: "প্রশ্ন করতে 'is' যোগ করুন — How much is this?" },
    { original: "I want two kilo", corrected: "I would like two kilos, please.", explanationBn: "বহুবচনে 'kilos' এবং বিনয়ী ভাবে 'would like'।" },
    { original: "Give discount", corrected: "Could you give me a discount?", explanationBn: "অনুরোধে 'Could you…?' বেশি ভদ্র।" },
  ],
});

export function ScreenshotScene({ id }: { id: string }) {
  useState(() => {
    setShotMode(true);
    store.set({ onboarded: true, pro: false, adsRemoved: true, sessions: 30 });
    appStore.set(() => seed());
    return true;
  });
  const root = { flex: 1, backgroundColor: palette.bg };
  const withTab = (screen: React.ReactNode, active: "home" | "speak" | "learn" | "me") => (
    <View style={root}>
      {screen}
      <TabBar
        tabs={[
          { id: "home", label: "পথ", icon: "home" },
          { id: "speak", label: "কথা বলুন", icon: "mic" },
          { id: "learn", label: "শিখুন", icon: "book" },
          { id: "me", label: "আমি", icon: "person" },
        ]}
        active={active}
        onChange={noop}
      />
    </View>
  );
  return (
    <NavProvider value={nav}>
      {id === "speak" ? (
        withTab(<SpeakScreen bottomInset={TAB_BAR_HEIGHT} onPro={noop} />, "speak")
      ) : id === "me" ? (
        withTab(<MeScreen bottomInset={TAB_BAR_HEIGHT} onPro={noop} />, "me")
      ) : id === "lesson" ? (
        <View style={root}>
          <LessonScreen lessonId="c30_d3" />
        </View>
      ) : id === "feedback" ? (
        <View style={root}>
          <FeedbackView fb={SAMPLE_FEEDBACK} source="ai" saved={3} scenarioId="sc_market" onClose={noop} />
        </View>
      ) : id === "pro" ? (
        <View style={root}>
          {withTab(<HomeScreen bottomInset={TAB_BAR_HEIGHT} onPro={noop} />, "home")}
          <ProSheet visible from="screenshot" onClose={noop} />
        </View>
      ) : (
        withTab(<HomeScreen bottomInset={TAB_BAR_HEIGHT} onPro={noop} />, "home")
      )}
    </NavProvider>
  );
}
