import { useCallback, useEffect, useState } from "react";
import { Linking, Platform, Settings, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import { FONT_ASSETS } from "./ui/fonts.generated";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { BannerAd, BannerAdSize } from "react-native-google-mobile-ads";
import { OnboardingScreen } from "./screens/OnboardingScreen";
import { PracticeScreen } from "./screens/PracticeScreen";
import { MockScreen } from "./screens/MockScreen";
import { ProgressScreen } from "./screens/ProgressScreen";
import { LearnScreen } from "./screens/LearnScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { ProSheet } from "./screens/ProSheet";
import { AttemptSession, type SessionSpec } from "./screens/AttemptSession";
import type { TabId } from "./screens/nav";
import { TAB_BAR_HEIGHT, TabBar, ToastHost, initAudio, isDark, palette } from "./ui";
import { analytics } from "./modules/analytics";
import { notify } from "./modules/notify";
import { layout, useBannerHeight } from "./modules/layout";
import { ads } from "./modules/ads";
import { iap } from "./modules/iap";
import { store, useSettings } from "./modules/store";
import { bandUpStore, prefsStore, startBandUpSync } from "./core/data";
import { ScreenshotScene } from "./screenshots";

// Screenshot mode: <scheme>://shot/<id> on Android; on iOS the factory passes the scene as the launch argument
// -AGFShot <id> (iOS 27 asks "Open in …?" for deep links, which would end up in the store screenshots).
const initialShotUrl = (): Promise<string | null | undefined> => {
  const id = Platform.OS === "ios" ? (Settings.get("AGFShot") as string | undefined) : undefined;
  return id ? Promise.resolve(`agf://shot/${id}`) : Linking.getInitialURL();
};

SplashScreen.preventAutoHideAsync().catch(() => {});

/**
 * Root of the app runtime. Boot order matters: fonts → persisted data →
 * audio → consent + ads → billing. The shell stays: providers, fonts, the
 * onboarding gate, the banner slot and screenshot mode.
 */
export default function App() {
  const [fontsLoaded] = useFonts(FONT_ASSETS);
  const [shot, setShot] = useState<string | null | undefined>(undefined);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    initialShotUrl()
      .then((u) => setShot(u?.match(/shot\/([\w-]+)/)?.[1] ?? null))
      .catch(() => setShot(null));
    Promise.all([store.load(), bandUpStore.load(), prefsStore.load()]).finally(() => {
      setLoaded(true);
      startBandUpSync(); // cloud backup/sync when enabled; no-op offline
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

const TABS: { id: TabId; label: string; icon: "home" | "trophy" | "chart" | "book" | "settings" }[] = [
  { id: "practice", label: "Practice", icon: "home" },
  { id: "mock", label: "Mock", icon: "trophy" },
  { id: "progress", label: "Progress", icon: "chart" },
  { id: "learn", label: "Learn", icon: "book" },
  { id: "settings", label: "Settings", icon: "settings" },
];

function Main() {
  const settings = useSettings();
  const insets = useSafeAreaInsets();
  const banner = useBannerHeight();
  const [showBanner, setShowBanner] = useState(false);
  const [tab, setTab] = useState<TabId>("practice");
  const [pro, setPro] = useState<string | null>(null);
  const [session, setSession] = useState<{ spec: SessionSpec; onFinish?: (ids: string[]) => void } | null>(null);

  useEffect(() => {
    store.set({ sessions: store.get().sessions + 1 });
    analytics.track("app_open");
    (async () => {
      await initAudio();
      await ads.init();
      setShowBanner(ads.canShowBanner());
      await iap.init();
    })();
    // Warm comeback nudge if the user drifts away (local only, no-op without permission).
    notify.comeback({ days: 3, title: "Your speaking score is waiting", body: "A 3-minute drill keeps your streak and nudges your band up." });
    return store.subscribe(() => setShowBanner(ads.canShowBanner()));
  }, []);
  useEffect(() => {
    if (!showBanner) layout.setBannerHeight(0);
  }, [showBanner]);
  useEffect(() => {
    if (settings.onboarded) analytics.track("screen_view", { screen: tab });
  }, [tab, settings.onboarded]);

  const openPro = useCallback((from: string) => setPro(from), []);
  const closePro = useCallback(() => setPro(null), []);
  const startSession = useCallback((spec: SessionSpec, onFinish?: (ids: string[]) => void) => setSession({ spec, onFinish }), []);

  if (!settings.onboarded) return <OnboardingScreen onDone={() => setTab("practice")} />;

  const bottom = TAB_BAR_HEIGHT;
  const props = { bottomInset: bottom, onPro: openPro, onStart: startSession, onTab: setTab };
  return (
    <View style={styles.root}>
      {/* Route/tab containers stay PLAIN Views — never an `entering` fade on the
          app shell (it flashes blank frames between screens). Icons render via
          react-native-svg (first-frame paint), so there are no Skia placeholder
          flashes to hide. Switching tabs just swaps the inner keyed view. */}
      <View style={styles.root}>
        <View key={tab} style={styles.root}>
          {tab === "practice" ? (
            <PracticeScreen {...props} />
          ) : tab === "mock" ? (
            <MockScreen {...props} />
          ) : tab === "progress" ? (
            <ProgressScreen {...props} />
          ) : tab === "learn" ? (
            <LearnScreen {...props} />
          ) : (
            <SettingsScreen {...props} />
          )}
        </View>
        <TabBar tabs={TABS} active={tab} onChange={setTab} />
      </View>

      {session ? (
        <View style={styles.overlay}>
          <AttemptSession
            spec={session.spec}
            onExit={() => setSession(null)}
            onFinish={session.onFinish}
            onPro={openPro}
          />
        </View>
      ) : null}

      <ProSheet visible={!!pro} from={pro ?? ""} onClose={closePro} />
      <ToastHost bottom={TAB_BAR_HEIGHT + insets.bottom + banner + 12} />
      {showBanner && !session && (
        <View style={styles.banner} onLayout={(e) => layout.setBannerHeight(e.nativeEvent.layout.height)}>
          <BannerAd unitId={ads.bannerUnitId} size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
  overlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 30, backgroundColor: palette.bg },
  banner: { position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center", backgroundColor: palette.surface },
});
