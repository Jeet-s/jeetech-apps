import { useCallback, useEffect, useState } from "react";
import { Linking, Platform, Settings, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import Animated, { FadeIn } from "react-native-reanimated";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import { FONT_ASSETS } from "./ui/fonts.generated";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { BannerAd, BannerAdSize } from "react-native-google-mobile-ads";
import { OnboardingScreen } from "./screens/OnboardingScreen";
import { LogScreen } from "./screens/LogScreen";
import { MealsScreen } from "./screens/MealsScreen";
import { InsightsScreen } from "./screens/InsightsScreen";
import { HistoryScreen } from "./screens/HistoryScreen";
import { MoreScreen } from "./screens/MoreScreen";
import { ProSheet } from "./screens/ProSheet";
import { TAB_BAR_HEIGHT, TabBar, ToastHost, initAudio, isDark, palette, type IconName } from "./ui";
import { analytics } from "./modules/analytics";
import { layout, useBannerHeight } from "./modules/layout";
import { ads } from "./modules/ads";
import { iap } from "./modules/iap";
import { notify } from "./modules/notify";
import { store, useSettings } from "./modules/store";
import { sugarStore, snapshotsStore, startSugarSync, asSnapshotList, takePendingMigrationSnapshot } from "./core/data";
import { makeSnapshot, rollSnapshots } from "./core/backup";
import { dayKey } from "./core/dates";
import { ScreenshotScene } from "./screenshots";

// Screenshot mode: <scheme>://shot/<id> on Android; on iOS the factory passes the scene as the launch argument
// -AGFShot <id> (iOS 27 asks "Open in …?" for deep links, which would end up in the store screenshots).
const initialShotUrl = (): Promise<string | null | undefined> => {
  const id = Platform.OS === "ios" ? (Settings.get("AGFShot") as string | undefined) : undefined;
  return id ? Promise.resolve(`agf://shot/${id}`) : Linking.getInitialURL();
};

SplashScreen.preventAutoHideAsync().catch(() => {});

/**
 * Flush any pre-migration safety snapshot produced while loading the store (stored version was
 * older than the app's). Runs BEFORE the first daily snapshot so the "restore last version" point
 * is always present after an update.
 */
function flushMigrationSnapshot(): void {
  const snap = takePendingMigrationSnapshot();
  if (snap) snapshotsStore.set((prev) => rollSnapshots(asSnapshotList(prev), snap));
}

/** Take one local snapshot per day (pre-update safety + restore) once data has loaded. */
function dailySnapshot(): void {
  const now = Date.now();
  const today = dayKey(now);
  const existing = asSnapshotList(snapshotsStore.get());
  if (existing.some((s) => s.day === today)) return;
  snapshotsStore.set((prev) => rollSnapshots(asSnapshotList(prev), makeSnapshot(sugarStore.get(), now)));
}

export default function App() {
  const [fontsLoaded] = useFonts(FONT_ASSETS);
  const [shot, setShot] = useState<string | null | undefined>(undefined);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    initialShotUrl()
      .then((u) => setShot(u?.match(/shot\/([\w-]+)/)?.[1] ?? null))
      .catch(() => setShot(null));
    Promise.all([store.load(), sugarStore.load(), snapshotsStore.load()]).finally(() => {
      setLoaded(true);
      // Defer the daily snapshot (a full JSON.stringify of the store) and cloud sync off the
      // first-paint path — running them inline here blocks the frame that reveals the app, which
      // showed up as a slow cold start. They aren't needed until after the UI is interactive.
      setTimeout(() => {
        flushMigrationSnapshot(); // persist any pre-update rollback point first
        dailySnapshot();
        startSugarSync(); // cloud backup/sync when enabled & Pro; no-op offline
      }, 0);
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

type Tab = "log" | "meals" | "insights" | "history" | "more";
const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: "log", label: "Log", icon: "home" },
  { id: "meals", label: "Meals", icon: "meal" },
  { id: "insights", label: "Insights", icon: "insights" },
  { id: "history", label: "History", icon: "history" },
  { id: "more", label: "More", icon: "more" },
];

function Main() {
  const settings = useSettings();
  const insets = useSafeAreaInsets();
  const banner = useBannerHeight();
  const [showBanner, setShowBanner] = useState(false);
  const [tab, setTab] = useState<Tab>("log");
  const [pro, setPro] = useState<string | null>(null);
  const [mealIntent, setMealIntent] = useState(false);
  const [mealSnap, setMealSnap] = useState(false);

  useEffect(() => {
    store.set({ sessions: store.get().sessions + 1 });
    analytics.track("app_open");
    // Free version shows the factory's standard ads (owner, 2026-10-28: keep ads; Pro / Remove Ads turn them off).
    (async () => {
      await initAudio();
      await ads.init();
      setShowBanner(ads.canShowBanner());
      await iap.init();
    })();
    const unsubscribe = store.subscribe(() => setShowBanner(ads.canShowBanner()));
    // A warm, specific nudge only if the user stays away for 3 days.
    notify.comeback({ days: 3, title: "A quick check-in", body: "A 5-second reading keeps your trends and A1C estimate up to date." });
    return unsubscribe;
  }, []);
  useEffect(() => {
    if (!showBanner) layout.setBannerHeight(0);
  }, [showBanner]);
  useEffect(() => {
    if (settings.onboarded) analytics.track("screen_view", { screen: tab });
  }, [tab, settings.onboarded]);
  useEffect(() => {
    if (tab !== "meals") { setMealIntent(false); setMealSnap(false); }
  }, [tab]);
  const openPro = useCallback((from: string) => setPro(from), []);
  const closePro = useCallback(() => setPro(null), []);
  const goMeals = useCallback((snap?: boolean) => { setTab("meals"); setMealIntent(true); setMealSnap(!!snap); }, []);

  if (!settings.onboarded) return <OnboardingScreen onDone={() => setTab("log")} />;

  const bottom = TAB_BAR_HEIGHT;
  return (
    <View style={styles.root}>
      <View style={styles.root}>
        {tab === "log" ? (
          <LogScreen bottomInset={bottom} onPro={openPro} onLogMeal={goMeals} />
        ) : tab === "meals" ? (
          <MealsScreen bottomInset={bottom} onPro={openPro} openAdd={mealIntent} openSnap={mealSnap} />
        ) : tab === "insights" ? (
          <InsightsScreen bottomInset={bottom} onPro={openPro} onLogMeal={goMeals} />
        ) : tab === "history" ? (
          <HistoryScreen bottomInset={bottom} onPro={openPro} />
        ) : (
          <MoreScreen bottomInset={bottom} onPro={openPro} />
        )}
      </View>
      <TabBar tabs={TABS} active={tab} onChange={setTab} />
      <ProSheet visible={!!pro} from={pro ?? ""} onClose={closePro} />
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
  banner: { position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center", backgroundColor: palette.surface },
});
