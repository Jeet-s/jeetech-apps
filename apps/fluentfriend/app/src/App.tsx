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
import { SpeakScreen } from "./screens/SpeakScreen";
import { LearnScreen } from "./screens/LearnScreen";
import { MeScreen } from "./screens/MeScreen";
import { ProSheet } from "./screens/ProSheet";
import { RouteHost } from "./RouteHost";
import { NavProvider, type Nav, type Route, type Tab } from "./nav";
import { TAB_BAR_HEIGHT, TabBar, ToastHost, initAudio, isDark, palette } from "./ui";
import { analytics } from "./modules/analytics";
import "./modules/qa"; // factory QA hooks (listens for the device suite's agf-qa link)
import { layout, useBannerHeight } from "./modules/layout";
import { ads } from "./modules/ads";
import { iap } from "./modules/iap";
import { store, useSettings } from "./modules/store";
import { appStore, startAppSync } from "./core/data";
import { scheduleComeback } from "./reminders";
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
 * audio → consent + ads → billing. The builder adds screens/flows but keeps
 * this shell: providers, fonts, the onboarding gate, the banner slot and
 * screenshot mode.
 */
export default function App() {
  const [fontsLoaded] = useFonts(FONT_ASSETS);
  const [shot, setShot] = useState<string | null | undefined>(undefined);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    initialShotUrl()
      .then((u) => setShot(u?.match(/shot\/([\w-]+)/)?.[1] ?? null))
      .catch(() => setShot(null));
    Promise.all([store.load(), appStore.load()]).finally(() => {
      setLoaded(true);
      // Cloud backup is OPT-IN: only start syncing once the learner has turned it on in Backup
      // settings (progress is local-first; no anonymous account is created on first launch).
      if (appStore.get().profile.cloudBackupOn) startAppSync();
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

const TABS: { id: Tab; label: string; icon: "home" | "mic" | "book" | "person" }[] = [
  { id: "home", label: "পথ", icon: "home" },
  { id: "speak", label: "কথা বলুন", icon: "mic" },
  { id: "learn", label: "শিখুন", icon: "book" },
  { id: "me", label: "আমি", icon: "person" },
];

function Main() {
  const settings = useSettings();
  const insets = useSafeAreaInsets();
  const banner = useBannerHeight();
  const [showBanner, setShowBanner] = useState(false);
  const [tab, setTab] = useState<Tab>("home");
  const [stack, setStack] = useState<Route[]>([]);
  const [pro, setPro] = useState<string | null>(null);

  useEffect(() => {
    store.set({ sessions: store.get().sessions + 1 });
    analytics.track("app_open");
    void scheduleComeback();
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
  useEffect(() => {
    if (settings.onboarded && stack.length === 0) analytics.track("screen_view", { screen: tab });
  }, [tab, settings.onboarded, stack.length]);

  const openPro = useCallback((from: string) => setPro(from), []);
  const nav = useMemo<Nav>(
    () => ({
      go: (r) => setStack((s) => [...s, r]),
      back: () => setStack((s) => s.slice(0, -1)),
      tab: (t) => {
        setStack([]);
        setTab(t);
      },
      openPro: (from) => setPro(from),
    }),
    [],
  );

  // Android hardware back: pop a pushed route, else go to Home, else let the system background the app.
  const routeOpen = stack.length > 0;
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (pro) {
        setPro(null);
        return true;
      }
      if (stack.length) {
        setStack((s) => s.slice(0, -1));
        return true;
      }
      if (tab !== "home") {
        setTab("home");
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [pro, stack.length, tab]);

  if (!settings.onboarded) {
    return (
      <NavProvider value={nav}>
        <OnboardingScreen onDone={() => setTab("home")} />
      </NavProvider>
    );
  }

  const bottom = TAB_BAR_HEIGHT;
  return (
    <NavProvider value={nav}>
      <View style={styles.root}>
        {/* Stable View, never a keyed `entering` container (Android can stick it at opacity 0 → blank frames). */}
        <View style={styles.root}>
          {tab === "home" ? (
            <HomeScreen bottomInset={bottom} onPro={openPro} />
          ) : tab === "speak" ? (
            <SpeakScreen bottomInset={bottom} onPro={openPro} />
          ) : tab === "learn" ? (
            <LearnScreen bottomInset={bottom} />
          ) : (
            <MeScreen bottomInset={bottom} onPro={openPro} />
          )}
        </View>
        {!routeOpen && <TabBar tabs={TABS} active={tab} onChange={nav.tab} />}
        {routeOpen && (
          <View style={StyleSheet.absoluteFill}>
            <RouteHost route={stack[stack.length - 1]} onPro={openPro} />
          </View>
        )}
        <ProSheet visible={!!pro} from={pro ?? ""} onClose={() => setPro(null)} />
        <ToastHost bottom={TAB_BAR_HEIGHT + insets.bottom + banner + 12} />
        {showBanner && !routeOpen && (
          <View style={styles.banner} onLayout={(e) => layout.setBannerHeight(e.nativeEvent.layout.height)}>
            <BannerAd unitId={ads.bannerUnitId} size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER} />
          </View>
        )}
      </View>
    </NavProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
  banner: { position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center", backgroundColor: palette.surface, zIndex: 1, elevation: 1 },
});
