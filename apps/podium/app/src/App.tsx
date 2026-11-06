import { useCallback, useEffect, useMemo, useState } from "react";
import { BackHandler, Linking, Platform, Settings, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import { FONT_ASSETS } from "./ui/fonts.generated";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { BannerAd, BannerAdSize } from "react-native-google-mobile-ads";
import { OnboardingScreen } from "./screens/OnboardingScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { PracticeScreen } from "./screens/PracticeScreen";
import { ProgressScreen } from "./screens/ProgressScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { PackScreen } from "./screens/PackScreen";
import { LessonScreen } from "./screens/LessonScreen";
import { EventScreen } from "./screens/EventScreen";
import { SupportScreen } from "./screens/SupportScreen";
import { AchievementsScreen } from "./screens/AchievementsScreen";
import { BackupScreen } from "./screens/BackupScreen";
import { RecordFlow } from "./screens/RecordFlow";
import { ReportScreen } from "./screens/ReportScreen";
import { ProSheet } from "./screens/ProSheet";
import { TAB_BAR_HEIGHT, TabBar, ToastHost, initAudio, isDark, palette } from "./ui";
import { analytics } from "./modules/analytics";
import "./modules/qa"; // factory QA hooks (listens for the device suite's agf-qa link)
import { layout, useBannerHeight } from "./modules/layout";
import { ads } from "./modules/ads";
import { iap } from "./modules/iap";
import { notify } from "./modules/notify";
import { store, useSettings } from "./modules/store";
import { appStore, startAppSync, todayKey } from "./core/data";
import { touchDay } from "./core/state";
import { syncReminders, type RecordRequest } from "./app/engine";
import type { AppNav, ReportMeta } from "./app/nav";
import { ScreenshotScene } from "./screenshots";

const initialShotUrl = (): Promise<string | null | undefined> => {
  const id = Platform.OS === "ios" ? (Settings.get("AGFShot") as string | undefined) : undefined;
  return id ? Promise.resolve(`agf://shot/${id}`) : Linking.getInitialURL();
};

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  const [fontsLoaded] = useFonts(FONT_ASSETS);
  const [shot, setShot] = useState<string | null | undefined>(undefined);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    initialShotUrl()
      .then((u) => setShot(u?.match(/shot\/([\w-]+)/)?.[1] ?? null))
      .catch(() => setShot(null));
    Promise.all([store.load(), appStore.load()]).finally(() => {
      appStore.set((s) => touchDay(s, todayKey())); // roll allowance/streak/entitlement on launch
      startAppSync(); // cloud backup/sync when enabled; no-op offline
      setLoaded(true);
    });
  }, []);
  const ready = fontsLoaded && loaded && shot !== undefined;
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);
  if (!ready) return <View style={styles.root} />;
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar style={isDark ? "light" : "dark"} />
        {shot ? <ScreenshotScene id={shot} /> : <Main />}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

type Tab = "home" | "practice" | "progress" | "settings";
const TABS: { id: Tab; label: string; icon: "home" | "mic" | "chart" | "settings" }[] = [
  { id: "home", label: "Home", icon: "home" },
  { id: "practice", label: "Practice", icon: "mic" },
  { id: "progress", label: "Progress", icon: "chart" },
  { id: "settings", label: "Settings", icon: "settings" },
];

type Route = { t: "pack"; packId: string } | { t: "lesson"; lessonId: string } | { t: "event"; eventId?: string } | { t: "support" } | { t: "achievements" } | { t: "backup" };

function Main() {
  const settings = useSettings();
  const insets = useSafeAreaInsets();
  const banner = useBannerHeight();
  const [showBanner, setShowBanner] = useState(false);
  const [tab, setTab] = useState<Tab>("home");
  const [stack, setStack] = useState<Route[]>([]);
  const [flow, setFlow] = useState<RecordRequest | null>(null);
  const [report, setReport] = useState<{ reportId: string; meta?: ReportMeta } | null>(null);
  const [pro, setPro] = useState<string | null>(null);

  useEffect(() => {
    store.set({ sessions: store.get().sessions + 1 });
    analytics.track("app_open");
    (async () => {
      await initAudio();
      await ads.init();
      setShowBanner(ads.canShowBanner());
      await iap.init();
      // Warm comeback nudge + reschedule reminders (granted users only).
      void notify.comeback({ days: 3, title: "Your coach misses you", body: "Two minutes of practice keeps you sharp." });
      void syncReminders(appStore.get());
    })();
    return store.subscribe(() => setShowBanner(ads.canShowBanner()));
  }, []);
  useEffect(() => {
    if (!showBanner) layout.setBannerHeight(0);
  }, [showBanner]);
  useEffect(() => {
    if (settings.onboarded) analytics.track("screen_view", { screen: tab });
  }, [tab, settings.onboarded]);

  const pop = useCallback(() => setStack((s) => s.slice(0, -1)), []);

  const nav = useMemo<AppNav>(
    () => ({
      record: (req) => setFlow(req),
      openReport: (reportId, meta) => setReport({ reportId, meta }),
      openPack: (packId) => setStack((s) => [...s, { t: "pack", packId }]),
      openLesson: (lessonId) => setStack((s) => [...s, { t: "lesson", lessonId }]),
      openEvent: (eventId) => setStack((s) => [...s, { t: "event", eventId }]),
      openHistory: () => { setStack([]); setTab("progress"); },
      openSupport: () => setStack((s) => [...s, { t: "support" }]),
      openAchievements: () => setStack((s) => [...s, { t: "achievements" }]),
      openBackup: () => setStack((s) => [...s, { t: "backup" }]),
      pro: (from) => setPro(from),
      go: (t) => { setStack([]); setTab(t); },
    }),
    [],
  );

  // Android hardware back: unwind overlays before exiting the app.
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (report) { setReport(null); return true; }
      if (flow) { setFlow(null); return true; }
      if (stack.length) { pop(); return true; }
      if (tab !== "home") { setTab("home"); return true; }
      return false;
    });
    return () => sub.remove();
  }, [report, flow, stack.length, tab, pop]);

  if (!settings.onboarded) {
    return (
      <OnboardingScreen
        onDone={(opts) => {
          store.set({ onboarded: true });
          setTab("home");
          if (opts?.record) setFlow(opts.record);
        }}
      />
    );
  }

  const bottom = TAB_BAR_HEIGHT;
  const top = stack[stack.length - 1];

  return (
    <View style={styles.root}>
      <View style={styles.root}>
        {tab === "home" ? (
          <HomeScreen bottomInset={bottom} nav={nav} />
        ) : tab === "practice" ? (
          <PracticeScreen bottomInset={bottom} nav={nav} />
        ) : tab === "progress" ? (
          <ProgressScreen bottomInset={bottom} nav={nav} />
        ) : (
          <SettingsScreen bottomInset={bottom} nav={nav} />
        )}
      </View>
      <TabBar tabs={TABS} active={tab} onChange={(t) => { setStack([]); setTab(t); }} />

      {/* Pushed screens cover the tabs */}
      {top ? (
        <View style={styles.overlay}>
          {top.t === "pack" ? (
            <PackScreen packId={top.packId} nav={nav} onClose={pop} />
          ) : top.t === "lesson" ? (
            <LessonScreen lessonId={top.lessonId} nav={nav} onClose={pop} />
          ) : top.t === "event" ? (
            <EventScreen eventId={top.eventId} nav={nav} onClose={pop} />
          ) : top.t === "achievements" ? (
            <AchievementsScreen onClose={pop} />
          ) : top.t === "backup" ? (
            <BackupScreen onClose={pop} />
          ) : (
            <SupportScreen onClose={pop} />
          )}
        </View>
      ) : null}

      {/* Record flow covers everything */}
      {flow ? (
        <View style={styles.overlay}>
          <RecordFlow
            req={flow}
            onClose={() => setFlow(null)}
            onPro={setPro}
            onReport={(reportId, meta) => {
              setFlow(null);
              setReport({ reportId, meta: { ...meta, fresh: true } });
            }}
          />
        </View>
      ) : null}

      {/* Report viewer */}
      {report ? (
        <View style={styles.overlay}>
          <ReportScreen
            reportId={report.reportId}
            meta={report.meta}
            onClose={() => setReport(null)}
            onPro={setPro}
            onRetake={(req) => { setReport(null); setFlow(req); }}
          />
        </View>
      ) : null}

      <ProSheet visible={!!pro} from={pro ?? ""} onClose={() => setPro(null)} />
      <ToastHost bottom={TAB_BAR_HEIGHT + insets.bottom + banner + 12} />
      {showBanner && (
        <View style={styles.banner} onLayout={(e) => layout.setBannerHeight(e.nativeEvent.layout.height)}>
          <BannerAd unitId={ads.bannerUnitId} size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
  overlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: palette.bg },
  banner: { position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center", backgroundColor: palette.surface },
});
