import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { InsightsScreen } from "./screens/InsightsScreen";
import { LogScreen } from "./screens/LogScreen";
import { MealsScreen, MealDetail } from "./screens/MealsScreen";
import { HistoryScreen } from "./screens/HistoryScreen";
import { ProSheet } from "./screens/ProSheet";
import { TAB_BAR_HEIGHT, TabBar, palette, type IconName } from "./ui";
import { sugarStore } from "./core/data";
import { store } from "./modules/store";
import { emptyState, liveMeals, type AppState, type Meal } from "./core/model";
import { addReading } from "./core/readings";
import { addMeal, mealItemFromDish, linkReading } from "./core/meals";
import { addMedication, logMedication } from "./core/medications";
import { addReminder } from "./core/reminders";
import { addSwapGoal, setCuisine, setUnit, acceptDisclaimer } from "./core/profiles";
import { dishById, DISHES } from "./core/dishes";
import { startOfDay, MS_DAY, wallClock } from "./core/dates";

/**
 * Screenshot mode: the factory opens the app with <scheme>://shot/<id> and captures
 * the frame on a real device, then adds its OWN marketing frame + benefit caption.
 *
 * So every scene here is simply the REAL screen, full-bleed, with realistic seeded
 * data and the real tab bar — no phone mockup, no headline, no gradient backdrop and
 * no faux status bar drawn inside the scene (the factory would frame that twice). The
 * data is seeded synchronously and anchored to the device's live "now" so every
 * rolling window (today's readings, 7-day trend, A1C, time-in-range) is full the
 * instant the screen mounts — nothing loads async, and no camera/permission prompt
 * ever appears (see screenshot-seed-anchor-now).
 */
const noop = () => {};

/** The device's current wall-clock moment, built the same way nowTs() does. */
function deviceNow(): number {
  const d = new Date();
  return wallClock(d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes());
}

function seed(): AppState {
  const NOW = deviceNow();
  let s = emptyState(NOW);
  s = acceptDisclaimer(setCuisine(setUnit(s, "mgdl"), "india"));
  const todayMid = startOfDay(NOW);
  const at = (off: number, h: number, m = 0) => todayMid - off * MS_DAY + h * 3_600_000 + m * 60_000;
  const past = (ts: number) => ts <= NOW; // never seed a reading in the future

  const roti = dishById("roti") ?? DISHES[0];
  const rice = dishById("steamed_rice") ?? DISHES[0];
  const dal = dishById("dal") ?? dishById("sambar") ?? DISHES[0];

  // 21 days of fasting + a post-lunch reading; dinners alternate rice/roti with next-morning fasting.
  for (let d = 21; d >= 0; d--) {
    const fastTs = at(d, 7, 10);
    if (past(fastTs)) {
      const fast = 96 + ((d * 7) % 26); // 96–121
      s = addReading(s, { valueMgdl: fast, ts: fastTs, context: "fasting" }, fastTs).state;
    }
    const postTs = at(d, 13, 30);
    if (past(postTs)) {
      const post = 138 + ((d * 13) % 55); // 138–192
      s = addReading(s, { valueMgdl: post, ts: postTs, context: "post_meal" }, postTs).state;
    }

    const mealTs = at(d, 19, 30);
    if (d % 2 === 0 && past(mealTs)) {
      const useRice = d % 4 === 0;
      const dish = useRice ? rice : roti;
      const res = addMeal(s, { items: [mealItemFromDish(dish, useRice ? 1.5 : 2), mealItemFromDish(dal, 1)], ts: mealTs, slot: "dinner", giBand: dish.giBand, swapText: dish.swapIdeas, source: "db" }, mealTs);
      s = res.state;
      // before (pre-dinner) + after (2h later) readings, linked
      const beforeTs = at(d, 19, 0);
      const afterTs = at(d, 21, 30);
      let beforeId: string | null = null;
      let afterId: string | null = null;
      if (past(beforeTs)) {
        const before = addReading(s, { valueMgdl: 108 + (d % 10), ts: beforeTs, context: "pre_meal" }, beforeTs);
        s = before.state;
        beforeId = before.id ?? null;
      }
      if (past(afterTs)) {
        const after = addReading(s, { valueMgdl: (useRice ? 182 : 150) + (d % 9), ts: afterTs, context: "post_meal" }, afterTs);
        s = after.state;
        afterId = after.id ?? null;
      }
      if (res.id && beforeId) s = linkReading(s, beforeId, res.id, beforeTs);
      if (res.id && afterId) s = linkReading(s, afterId, res.id, afterTs);
    }
  }

  // An AI photo-estimated lunch today with a before/after reading linked. This powers the
  // "photo result" scene (a real meal-detail sheet) and shows a labelled estimate in Meals.
  const lunchTs = at(0, 12, 45);
  if (past(lunchTs)) {
    const aiRes = addMeal(
      s,
      {
        items: [
          { name: "Steamed rice", portion: 1, carbsG: 45 },
          { name: "Dal (lentils)", portion: 1, carbsG: 18 },
          { name: "Roti", portion: 2, carbsG: 30 },
          { name: "Mixed veg", portion: 1, carbsG: 8 },
        ],
        ts: lunchTs,
        slot: "lunch",
        giBand: "medium",
        swapText: "Swap half the rice for extra dal or veg to flatten the post-meal spike.",
        source: "ai",
      },
      lunchTs,
    );
    s = aiRes.state;
    const beforeTs = at(0, 12, 30);
    const afterTs = at(0, 14, 45);
    let bId: string | null = null;
    let aId: string | null = null;
    if (past(beforeTs)) { const b = addReading(s, { valueMgdl: 104, ts: beforeTs, context: "pre_meal" }, beforeTs); s = b.state; bId = b.id ?? null; }
    if (past(afterTs)) { const a = addReading(s, { valueMgdl: 158, ts: afterTs, context: "post_meal" }, afterTs); s = a.state; aId = a.id ?? null; }
    if (aiRes.id && bId) s = linkReading(s, bId, aiRes.id, beforeTs);
    if (aiRes.id && aId) s = linkReading(s, aId, aiRes.id, afterTs);
  }

  // Saved medication + a couple of logs
  const med = addMedication(s, { name: "Metformin", type: "pill", defaultDose: 500, doseUnit: "mg" });
  s = med.state;
  if (med.id) {
    const m0 = at(0, 8, 0);
    const m1 = at(1, 8, 0);
    if (past(m1)) s = logMedication(s, { medicationId: med.id, dose: 500, ts: m1 }, m1).state;
    if (past(m0)) s = logMedication(s, { medicationId: med.id, dose: 500, ts: m0 }, m0).state;
  }

  s = addReminder(s, { kind: "fasting", time: "07:00" }).state;
  s = addReminder(s, { kind: "post_meal", time: "21:00" }).state;
  s = addSwapGoal(s, { text: "Swap white rice for millet 3× this week", targetCount: 3 }, NOW).state;
  return s;
}

const TABS: { id: string; label: string; icon: IconName }[] = [
  { id: "log", label: "Log", icon: "home" },
  { id: "meals", label: "Meals", icon: "meal" },
  { id: "insights", label: "Insights", icon: "insights" },
  { id: "history", label: "History", icon: "history" },
  { id: "more", label: "More", icon: "more" },
];

function Tabs({ active }: { active: string }) {
  return <TabBar tabs={TABS} active={active} onChange={noop} />;
}

/** The real photo-meal result: the AI-estimated lunch opened in its detail sheet. */
function PhotoResult({ meal }: { meal: Meal }) {
  return (
    <View style={styles.root}>
      <MealsScreen bottomInset={TAB_BAR_HEIGHT} onPro={noop} />
      <Tabs active="meals" />
      <MealDetail meal={meal} onClose={noop} onEdit={noop} />
    </View>
  );
}

export function ScreenshotScene({ id }: { id: string }) {
  // Seed synchronously so the real screen below mounts with full data — no async load,
  // no blank first frame. Pro is on for the Pro paywall + the Pro-only Insights.
  const [state] = useState<AppState>(() => {
    store.set({ onboarded: true, pro: id === "insights" || id === "pro", adsRemoved: true, sessions: 30 });
    const s = seed();
    sugarStore.set(s);
    return s;
  });

  switch (id) {
    case "photo": {
      const aiMeal = liveMeals(state).find((m) => m.source === "ai") ?? liveMeals(state)[0];
      return aiMeal ? (
        <PhotoResult meal={aiMeal} />
      ) : (
        <View style={styles.root}>
          <MealsScreen bottomInset={TAB_BAR_HEIGHT} onPro={noop} />
          <Tabs active="meals" />
        </View>
      );
    }
    case "insights":
      return (
        <View style={styles.root}>
          <InsightsScreen bottomInset={TAB_BAR_HEIGHT} onPro={noop} onLogMeal={noop} />
          <Tabs active="insights" />
        </View>
      );
    case "meals":
      return (
        <View style={styles.root}>
          <MealsScreen bottomInset={TAB_BAR_HEIGHT} onPro={noop} />
          <Tabs active="meals" />
        </View>
      );
    case "history":
      return (
        <View style={styles.root}>
          <HistoryScreen bottomInset={TAB_BAR_HEIGHT} onPro={noop} />
          <Tabs active="history" />
        </View>
      );
    case "pro":
      return (
        <View style={styles.root}>
          <LogScreen bottomInset={TAB_BAR_HEIGHT} onPro={noop} onLogMeal={noop} />
          <Tabs active="log" />
          <ProSheet visible from="screenshot" onClose={noop} />
        </View>
      );
    case "log":
    default:
      return (
        <View style={styles.root}>
          <LogScreen bottomInset={TAB_BAR_HEIGHT} onPro={noop} onLogMeal={noop} />
          <Tabs active="log" />
        </View>
      );
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
});
