import { useCallback, useEffect, useState } from "react";
import { Linking, Platform, Settings, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import { FONT_ASSETS } from "./ui/fonts.generated";
const APP_FONTS = { ...FONT_ASSETS, Inter_400Regular: require("@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf") };
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { BannerAd, BannerAdSize } from "react-native-google-mobile-ads";
import { OnboardingScreen } from "./screens/OnboardingScreen";
import { PracticeScreen } from "./screens/PracticeScreen";
import { SoundsScreen } from "./screens/SoundsScreen";
import { ProgressScreen } from "./screens/ProgressScreen";
import { ReviewScreen } from "./screens/ReviewScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { ProSheet } from "./screens/ProSheet";
import { TAB_BAR_HEIGHT, TabBar, ToastHost, initAudio, isDark, palette } from "./ui";
import { canOfferPro } from "./modules/purchase-ui";
import { notify } from "./modules/notify";
import { analytics } from "./modules/analytics";
import "./modules/qa"; // factory QA hooks (listens for the device suite's agf-qa link)
import { layout, useBannerHeight } from "./modules/layout";
import { ads } from "./modules/ads";
import { initializePurchases } from "./modules/restore-purchases";
import { store, useSettings } from "./modules/store";
import { gymStore, startGymSync } from "./core/data";
import { buy } from "./core/state";
import { freeEntitlement, isPro as entIsPro } from "./core/entitlement";
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
  const [fontsLoaded] = useFonts(APP_FONTS);
  // Screenshot mode (<scheme>://shot/<id>): render a store-screenshot scene
  // without ads or billing. undefined = still checking the launch URL.
  const [shot, setShot] = useState<string | null | undefined>(undefined);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    initialShotUrl()
      .then((u) => setShot(u?.match(/shot\/([\w-]+)/)?.[1] ?? null))
      .catch(() => setShot(null));
    Promise.all([store.load(), gymStore.load()]).finally(() => {
      setLoaded(true);
      startGymSync(); // cloud backup/sync when enabled; no-op offline
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

type Tab = "practice" | "sounds" | "progress" | "review" | "settings";
const TABS: { id: Tab; label: string; icon: "mic" | "target" | "chart" | "book" | "settings" }[] = [
  { id: "practice", label: "Practice", icon: "mic" },
  { id: "sounds", label: "Sounds", icon: "target" },
  { id: "progress", label: "Progress", icon: "chart" },
  { id: "review", label: "Review", icon: "book" },
  { id: "settings", label: "Settings", icon: "settings" },
];

/**
 * Keep the in-app Pro entitlement (quota gate, drives unlimited scoring) in
 * sync with the store's purchase state. Purchases/restores set `store.pro`;
 * mirror that into the gym entitlement so a paying user actually gets unlimited
 * scored lines, and drop it again if a subscription lapses on restore.
 */
function reconcileEntitlement() {
  const s = store.get();
  const now = Date.now();
  const g = gymStore.get();
  const proStore = !!s.pro;
  const proGym = entIsPro(g.entitlement, now);
  if (proStore && !proGym) {
    const plan = s.proSource === "subscription" ? "pro_monthly" : "lifetime";
    gymStore.set((st) => buy(st, plan, now));
  } else if (!proStore && proGym && g.entitlement.source === "purchase") {
    // A bridged purchase we created, now gone (sub lapsed on restore) → back to free.
    gymStore.set((st) => ({ ...st, entitlement: freeEntitlement() }));
  }
}

function Main() {
  const settings = useSettings();
  const insets = useSafeAreaInsets();
  const banner = useBannerHeight();
  const [showBanner, setShowBanner] = useState(false);
  const [tab, setTab] = useState<Tab>("practice");
  const [pro, setPro] = useState<string | null>(null);
  const [assessment, setAssessment] = useState(false);

  useEffect(() => {
    store.set({ sessions: store.get().sessions + 1 });
    analytics.track("app_open");
    void notify.comeback({ days: 2, title: "Your next sound is waiting", body: "One short line and a listening drill — keep your Accent Gym streak moving." });
    reconcileEntitlement();
    // Billing must not wait for ad consent or an ad-network connection.
    const billing = initializePurchases().then(reconcileEntitlement);
    (async () => {
      await initAudio();
      await ads.init();
      setShowBanner(ads.canShowBanner());
      await billing;
    })();
    return store.subscribe(() => {
      setShowBanner(ads.canShowBanner());
      reconcileEntitlement();
    });
  }, []);
  useEffect(() => {
    if (!showBanner) layout.setBannerHeight(0);
  }, [showBanner]);
  useEffect(() => {
    if (settings.onboarded) analytics.track("screen_view", { screen: tab });
  }, [tab, settings.onboarded]);
  const openPro = useCallback((from: string) => { if (canOfferPro()) setPro(from); }, []);
  const closePro = useCallback(() => setPro(null), []);

  if (!settings.onboarded) return <><OnboardingScreen onDone={() => setTab("practice")} onPro={openPro} /><ProSheet visible={!!pro} from={pro ?? ""} onClose={closePro} /></>;
  if (assessment) return <><OnboardingScreen assessmentOnly onDone={() => setAssessment(false)} onPro={openPro} /><ProSheet visible={!!pro} from={pro ?? ""} onClose={closePro} /></>;

  const bottom = TAB_BAR_HEIGHT;
  return (
    <View style={styles.root}>
      {/* Plain View, not a keyed `entering={FadeIn}` container: on Android a remounting entering animation can stick at
          opacity 0, so QA saw blank frames between tabs and after onboarding (Band Up, Gully Score, Sugar Plate). */}
      <View style={styles.root}>
        {tab === "practice" ? (
          <PracticeScreen bottomInset={bottom} onPro={openPro} onAssessment={() => setAssessment(true)} />
        ) : tab === "sounds" ? (
          <SoundsScreen bottomInset={bottom} onPro={openPro} />
        ) : tab === "progress" ? (
          <ProgressScreen bottomInset={bottom} onPro={openPro} />
        ) : tab === "review" ? (
          <ReviewScreen bottomInset={bottom} onPro={openPro} />
        ) : (
          <SettingsScreen bottomInset={bottom} onPro={openPro} />
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
