import { useState } from "react";
import { View } from "react-native";
import { TodayScreen } from "./screens/TodayScreen";
import { TemplatesScreen } from "./screens/TemplatesScreen";
import { InsightsScreen } from "./screens/InsightsScreen";
import { ProSheet } from "./screens/ProSheet";
import { TAB_BAR_HEIGHT, TabBar, palette } from "./ui";
import { type BlockDayState, STARTER_TEMPLATES, defaultSettings, emptyState } from "./core/model";
import { blocksForDay, completeBlock, duration, skipBlock, startBlock } from "./core/blocks";
import { applyTemplate, createFromStarter } from "./core/templates";
import { addDays, dateKey } from "./core/time";
import { blockDayStore, settingsStore } from "./core/data";
import { store } from "./modules/store";

/**
 * Screenshot mode: the factory opens the app with <scheme>://shot/<id> on an
 * emulator and captures the screen for the Play Store listing. Every scene
 * renders a REAL state of the app using the real screens, seeded to look like a
 * user a few weeks in. Ads and billing are off here.
 */
const noop = () => {};

function seed(): BlockDayState {
  const today = dateKey(new Date());
  let s = emptyState();
  const workday = createFromStarter(s, STARTER_TEMPLATES[0], today);
  s = workday.state;
  const tplId = workday.id!;

  // A few weeks of completed days → streak, insights and overruns.
  for (let d = 12; d >= 1; d--) {
    const day = addDays(today, -d);
    s = applyTemplate(s, tplId, day, "replace", "auto", day).state;
    blocksForDay(s, day).forEach((b, i) => {
      if (d % 5 === 0 && i >= 4) s = skipBlock(s, b.id, day);
      else if (i < 6) s = completeBlock(s, b.id, day, duration(b) + (i % 3 === 0 ? 15 : 0));
    });
  }

  // Today: a live plan — a couple done, one happening now.
  s = applyTemplate(s, tplId, today, "replace", "auto", today).state;
  const tb = blocksForDay(s, today);
  if (tb[0]) s = completeBlock(s, tb[0].id, today);
  if (tb[1]) s = completeBlock(s, tb[1].id, today, duration(tb[1]) + 20);
  if (tb[2]) s = startBlock(s, tb[2].id, today);

  // A second saved routine so the Routines tab looks lived-in.
  s = createFromStarter(s, STARTER_TEMPLATES[1], today).state;
  return s;
}

function Tabs({ active }: { active: "today" | "templates" | "insights" | "settings" }) {
  return (
    <TabBar
      tabs={[
        { id: "today", label: "Today", icon: "home" },
        { id: "templates", label: "Routines", icon: "layers" },
        { id: "insights", label: "Insights", icon: "chart" },
        { id: "settings", label: "Settings", icon: "settings" },
      ]}
      active={active}
      onChange={noop}
    />
  );
}

export function ScreenshotScene({ id }: { id: string }) {
  useState(() => {
    store.set({ onboarded: true, pro: id === "insights" || id === "pro", adsRemoved: true, sessions: 30 });
    settingsStore.set({ ...defaultSettings(), remindersEnabled: true, workStart: 9 * 60, workEnd: 17 * 60 });
    blockDayStore.set(seed());
    return true;
  });
  const root = { flex: 1, backgroundColor: palette.bg };
  switch (id) {
    case "insights":
      return (
        <View style={root}>
          <InsightsScreen bottomInset={TAB_BAR_HEIGHT} onPro={noop} />
          <Tabs active="insights" />
        </View>
      );
    case "routines":
      return (
        <View style={root}>
          <TemplatesScreen bottomInset={TAB_BAR_HEIGHT} />
          <Tabs active="templates" />
        </View>
      );
    case "edit":
      return (
        <View style={root}>
          <TodayScreen bottomInset={TAB_BAR_HEIGHT} onPro={noop} demo="actions" />
          <Tabs active="today" />
        </View>
      );
    case "pro":
      return (
        <View style={root}>
          <TodayScreen bottomInset={TAB_BAR_HEIGHT} onPro={noop} />
          <Tabs active="today" />
          <ProSheet visible from="screenshot" onClose={noop} />
        </View>
      );
    case "today":
    default:
      return (
        <View style={root}>
          <TodayScreen bottomInset={TAB_BAR_HEIGHT} onPro={noop} />
          <Tabs active="today" />
        </View>
      );
  }
}
