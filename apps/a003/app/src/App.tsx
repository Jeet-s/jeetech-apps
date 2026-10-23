import { useCallback, useEffect, useState } from "react";
import { Linking, StyleSheet, Text as RNText, TextInput as RNTextInput, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import Animated, { FadeIn } from "react-native-reanimated";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
// Require only the four Inter weights the theme uses (see src/ui/theme.ts).
// Importing from "@expo-google-fonts/inter" eagerly requires all 18 weights
// (~6 MB of TTFs) into the bundle; these direct requires ship only what we use.
const Inter_400Regular = require("@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf");
const Inter_500Medium = require("@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf");
const Inter_600SemiBold = require("@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf");
const Inter_700Bold = require("@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf");
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { BannerAd, BannerAdSize } from "react-native-google-mobile-ads";
import { OnboardingScreen } from "./screens/OnboardingScreen";
import { TodayScreen } from "./screens/TodayScreen";
import { TemplatesScreen } from "./screens/TemplatesScreen";
import { InsightsScreen } from "./screens/InsightsScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { ProSheet } from "./screens/ProSheet";
import { TAB_BAR_HEIGHT, TabBar, ToastHost, initAudio, isDark, palette } from "./ui";
import { analytics } from "./modules/analytics";
import { layout, useBannerHeight } from "./modules/layout";
import { ads } from "./modules/ads";
import { iap } from "./modules/iap";
import { notify } from "./modules/notify";
import { store, useSettings } from "./modules/store";
import { blockDayStore, settingsStore, startBlockDaySync } from "./core/data";
import { completeBlock, skipBlock, snoozeBlock } from "./core/blocks";
import { dateKey } from "./core/time";
import { ScreenshotScene } from "./screenshots";

SplashScreen.preventAutoHideAsync().catch(() => {});

/**
 * Root of the app runtime. Boot order matters: fonts → persisted data →
 * audio → consent + ads → billing. The builder adds screens/flows but keeps
 * this shell: providers, fonts, the onboarding gate, the banner slot and
 * screenshot mode.
 */
export default function App() {
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  // Screenshot mode (<scheme>://shot/<id>): render a store-screenshot scene
  // without ads or billing. undefined = still checking the launch URL.
  const [shot, setShot] = useState<string | null | undefined>(undefined);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    Linking.getInitialURL()
      .then((u) => setShot(u?.match(/shot\/([\w-]+)/)?.[1] ?? null))
      .catch(() => setShot(null));
    Promise.all([store.load(), blockDayStore.load(), settingsStore.load()]).finally(() => {
      setLoaded(true);
      startBlockDaySync(); // cloud backup/sync when enabled; no-op offline
    });
  }, []);
  // Accessibility: respect the device text-size setting everywhere, and raise the
  // scaling cap when the user turns on "Larger text" (Settings → Accessibility).
  useEffect(() => {
    const apply = () => {
      const large = settingsStore.get().largeText;
      const cap = large ? 2.2 : 1.4;
      const base = { allowFontScaling: true, maxFontSizeMultiplier: cap };
      (RNText as unknown as { defaultProps?: object }).defaultProps = { ...((RNText as unknown as { defaultProps?: object }).defaultProps ?? {}), ...base };
      (RNTextInput as unknown as { defaultProps?: object }).defaultProps = { ...((RNTextInput as unknown as { defaultProps?: object }).defaultProps ?? {}), ...base };
    };
    apply();
    return settingsStore.subscribe(apply);
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

type Tab = "today" | "templates" | "insights" | "settings";
const TABS: { id: Tab; label: string; icon: "home" | "layers" | "chart" | "settings" }[] = [
  { id: "today", label: "Today", icon: "home" },
  { id: "templates", label: "Routines", icon: "layers" },
  { id: "insights", label: "Insights", icon: "chart" },
  { id: "settings", label: "Settings", icon: "settings" },
];

function Main() {
  const settings = useSettings();
  const insets = useSafeAreaInsets();
  const banner = useBannerHeight();
  const [showBanner, setShowBanner] = useState(false);
  const [tab, setTab] = useState<Tab>("today");
  const [pro, setPro] = useState<string | null>(null);

  useEffect(() => {
    store.set({ sessions: store.get().sessions + 1 });
    analytics.track("app_open");
    (async () => {
      await initAudio();
      await ads.init();
      setShowBanner(ads.canShowBanner());
      await iap.init();
    })();
    return store.subscribe(() => setShowBanner(ads.canShowBanner()));
  }, []);
  useEffect(() => {
    if (!showBanner) layout.setBannerHeight(0);
  }, [showBanner]);
  // Done / Snooze / Skip tapped on a reminder in the notification shade — mutate
  // the plan through the real core logic, even if the app was in the background,
  // then re-sync the schedule so stale alerts don't linger.
  useEffect(() => {
    return notify.onAction((action, blockId) => {
      if (!blockId) return;
      const today = dateKey(new Date());
      const state = blockDayStore.get();
      if (!state.blocks.some((b) => b.id === blockId)) return;
      const next =
        action === "done" ? completeBlock(state, blockId, today)
        : action === "skip" ? skipBlock(state, blockId, today)
        : action === "snooze" ? snoozeBlock(state, blockId, 10, today).state
        : state;
      if (next !== state) blockDayStore.set(next);
      if (action === "done" || action === "skip") void notify.clearActiveBlock();
      void notify.sync(next.blocks, settingsStore.get());
    });
  }, []);
  useEffect(() => {
    if (settings.onboarded) analytics.track("screen_view", { screen: tab });
  }, [tab, settings.onboarded]);
  const openPro = useCallback((from: string) => setPro(from), []);
  const closePro = useCallback(() => setPro(null), []);

  if (!settings.onboarded) return <OnboardingScreen onDone={() => setTab("today")} />;

  const bottom = TAB_BAR_HEIGHT;
  return (
    <View style={styles.root}>
      <Animated.View key={tab} entering={FadeIn.duration(180)} style={styles.root}>
        {tab === "today" ? (
          <TodayScreen bottomInset={bottom} onPro={openPro} />
        ) : tab === "templates" ? (
          <TemplatesScreen bottomInset={bottom} />
        ) : tab === "insights" ? (
          <InsightsScreen bottomInset={bottom} onPro={openPro} />
        ) : (
          <SettingsScreen bottomInset={bottom} onPro={openPro} />
        )}
      </Animated.View>
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
