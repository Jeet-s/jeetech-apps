import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BackHandler, Linking, Platform, Settings, StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { Asset } from "expo-asset";
import { useFonts } from "expo-font";
import { art } from "./art";
import { FONT_ASSETS } from "./ui/fonts.generated";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { BannerAd, BannerAdSize } from "react-native-google-mobile-ads";
import { OnboardingScreen } from "./screens/OnboardingScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { MatchesScreen } from "./screens/MatchesScreen";
import { TournamentsScreen } from "./screens/TournamentsScreen";
import { StatsScreen } from "./screens/StatsScreen";
import { MoreScreen } from "./screens/MoreScreen";
import { SetupFlow } from "./screens/SetupFlow";
import { ScoringScreen } from "./screens/ScoringScreen";
import { ResultScreen } from "./screens/ResultScreen";
import { MatchDetailScreen } from "./screens/MatchDetailScreen";
import { TournamentDetailScreen } from "./screens/TournamentDetailScreen";
import { PlayerProfileScreen } from "./screens/PlayerProfileScreen";
import { TeamsScreen } from "./screens/TeamsScreen";
import { SupportScreen } from "./screens/SupportScreen";
import { ProSheet } from "./screens/ProSheet";
import { TAB_BAR_HEIGHT, TabBar, ToastHost, initAudio, isDark, palette } from "./ui";
import { NavContext, type Nav, type Route, type Tab } from "./nav";
import { analytics } from "./modules/analytics";
import { notify } from "./modules/notify";
import { layout, useBannerHeight } from "./modules/layout";
import { ads } from "./modules/ads";
import { iap } from "./modules/iap";
import { store, useSettings } from "./modules/store";
import { appStore, startAppSync } from "./core/data";
import { ScreenshotScene } from "./screenshots";

// Screenshot mode: <scheme>://shot/<id> on Android; on iOS the factory passes the scene as the launch argument
// -AGFShot <id> (iOS 27 asks "Open in …?" for deep links, which would end up in the store screenshots).
const initialShotUrl = (): Promise<string | null | undefined> => {
  const id = Platform.OS === "ios" ? (Settings.get("AGFShot") as string | undefined) : undefined;
  return id ? Promise.resolve(`agf://shot/${id}`) : Linking.getInitialURL();
};

SplashScreen.preventAutoHideAsync().catch(() => {});

// Decode the first-screen art BEFORE the splash hides so the Home hero logo and the empty-state illustration
// are already in memory and never "pop in late" on a blank card (QA: empty-state art flickered on Home).
const PRELOAD_ART = [art.ui_logo_mark, art.es_matches, art.ill_onb_01_start, art.ill_onb_02_offline, art.ill_onb_03_stats];

/**
 * Root of the app runtime. Boot order: fonts → persisted data → audio →
 * consent + ads → billing. Keeps the shell: providers, fonts, onboarding gate,
 * banner slot and screenshot mode.
 */
export default function App() {
  const [fontsLoaded] = useFonts(FONT_ASSETS);
  const [shot, setShot] = useState<string | null | undefined>(undefined);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    initialShotUrl()
      .then((u) => setShot(u?.match(/shot\/([\w-]+)/)?.[1] ?? null))
      .catch(() => setShot(null));
    Promise.all([store.load(), appStore.load(), Asset.loadAsync(PRELOAD_ART).catch(() => {})]).finally(() => {
      setLoaded(true);
      startAppSync(); // cloud backup/sync when enabled; no-op offline
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

const TABS: { id: Tab; label: string; icon: "home" | "ball" | "trophy" | "chart" | "dots" }[] = [
  { id: "home", label: "Home", icon: "home" },
  { id: "matches", label: "Matches", icon: "ball" },
  { id: "tournaments", label: "Cups", icon: "trophy" },
  { id: "stats", label: "Stats", icon: "chart" },
  { id: "more", label: "More", icon: "dots" },
];

/** A full-screen route hides the tab bar and banner (scoring must never show ads). */
const FULLSCREEN = new Set<Route["t"]>(["scoring", "setup", "result"]);

function Main() {
  const settings = useSettings();
  const insets = useSafeAreaInsets();
  const banner = useBannerHeight();
  const [showBanner, setShowBanner] = useState(false);
  const [tab, setTab] = useState<Tab>("home");
  const [stack, setStack] = useState<Route[]>([]);
  const [pro, setPro] = useState<string | null>(null);

  // Light launch bookkeeping only — runs immediately but never blocks the first paint: a session bump, the open
  // event and the local re-engagement nudges (all async/native-queued). The audio codec, AdMob/UMP and billing SDKs
  // are NOT touched here; see the deferred effect below.
  useEffect(() => {
    store.set({ sessions: store.get().sessions + 1 });
    analytics.track("app_open");
    // Audio + reminder scheduling are deferred past the first paint (a 0ms task yields to the UI thread) so they can't
    // jank the opening frames / onboarding taps. They re-arm on every launch (not gated on onboarding).
    const light = setTimeout(() => {
      initAudio().catch(() => {});
      // Warm, specific re-engagement if the scorer stays away (local only; re-armed each launch).
      notify.comeback({ days: 5, title: "Match day?", body: "Your teams and stats are ready. Tap Start and score the first ball." });
      // Re-arm (or clear) the opt-in "finish your match" nudge against the current live match.
      if (store.get().matchReminders) {
        const liveMatch = appStore.get().matches.some((m) => m.status === "live" || m.status === "innings_break");
        if (liveMatch) {
          notify.at("unfinished_match", new Date(Date.now() + 6 * 3600 * 1000), { title: "Finish your match? 🏏", body: "You have a match in progress. Tap to resume scoring where you left off." });
        } else {
          notify.cancel("unfinished_match");
        }
      }
    }, 0);
    const unsub = store.subscribe(() => setShowBanner(ads.canShowBanner()));
    return () => { clearTimeout(light); unsub(); };
  }, []);

  // Heavy native SDK init (AdMob + the UMP consent form, billing) is deferred OFF the first-run critical path: it runs
  // ONLY once the user has reached the app (onboarded) and a short beat AFTER Home has painted. mobileAds().initialize()
  // and AdsConsent.gatherConsent() do real work on the main thread on a fresh install — running them while the user was
  // tapping through onboarding froze the UI into the Android ANR dialog (QA no_anr + startup-performance blocker). The
  // banner never shows during onboarding or the first session anyway, so nothing is lost by waiting. Isolated catches:
  // a throw in one SDK must never take the app down (QA launches_on_device).
  const didHeavyInit = useRef(false);
  useEffect(() => {
    if (!settings.onboarded || didHeavyInit.current) return;
    didHeavyInit.current = true;
    const t = setTimeout(() => {
      (async () => {
        await ads.init().catch(() => {});
        setShowBanner(ads.canShowBanner());
        await iap.init().catch(() => {});
      })();
    }, 600);
    return () => clearTimeout(t);
  }, [settings.onboarded]);
  useEffect(() => {
    if (!showBanner) layout.setBannerHeight(0);
  }, [showBanner]);
  // Android hardware Back: walk the in-app navigation (close the Pro sheet → pop a pushed screen → fall back to
  // the Home tab) instead of letting the OS background the app. Without this the custom nav stack never intercepted
  // Back, so Back from the scoring/detail screens closed the app to the launcher (QA feature_tour: "the app kept
  // closing; focus went to the launcher"). Sheets/Modals consume their own Back via onRequestClose, so this handler
  // only ever sees the tab + stack layer. iOS has no hardware Back button, so this is Android-only.
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (pro !== null) { setPro(null); return true; }
      if (stack.length > 0) { setStack((s) => s.slice(0, -1)); return true; }
      if (tab !== "home") { setTab("home"); return true; }
      return false; // Home root with nothing pushed → let the OS background the app.
    });
    return () => sub.remove();
  }, [pro, stack.length, tab]);
  useEffect(() => {
    if (settings.onboarded && stack.length === 0) analytics.track("screen_view", { screen: tab });
  }, [tab, settings.onboarded, stack.length]);

  const nav = useMemo<Nav>(
    () => ({
      push: (r) => setStack((s) => [...s, r]),
      pop: () => setStack((s) => s.slice(0, -1)),
      replace: (r) => setStack((s) => [...s.slice(0, -1), r]),
      reset: () => setStack([]),
      go: (t) => {
        setStack([]);
        setTab(t);
      },
      openPro: (from) => setPro(from),
    }),
    [],
  );
  const closePro = useCallback(() => setPro(null), []);

  if (!settings.onboarded) {
    return (
      <NavContext.Provider value={nav}>
        <OnboardingScreen onDone={() => nav.go("home")} />
      </NavContext.Provider>
    );
  }

  const top = stack[stack.length - 1];
  const fullscreen = top ? FULLSCREEN.has(top.t) : false;
  const bottom = TAB_BAR_HEIGHT;

  return (
    <NavContext.Provider value={nav}>
      <View style={styles.root}>
        {top ? (
          // Pushed screens slide up like a sheet (Home → New Match was a hard cut in QA). The motion is driven
          // imperatively from a PAINTED first frame (opacity floors at 0.6, translateY 24→0 over ~200ms) — never an
          // `entering` fade-from-zero, which once stuck at opacity 0 on a loaded emulator and left blank frames.
          <RouteEnter key={`${top.t}:${stack.length}`}>
            <RouteScreen route={top} bottomInset={fullscreen ? 0 : bottom} />
          </RouteEnter>
        ) : (
          // Tab content renders instantly (no fade-from-zero) so Home is never a blank frame on first paint.
          <View key={tab} style={styles.root}>
            {tab === "home" ? (
              <HomeScreen bottomInset={bottom} />
            ) : tab === "matches" ? (
              <MatchesScreen bottomInset={bottom} />
            ) : tab === "tournaments" ? (
              <TournamentsScreen bottomInset={bottom} />
            ) : tab === "stats" ? (
              <StatsScreen bottomInset={bottom} />
            ) : (
              <MoreScreen bottomInset={bottom} />
            )}
          </View>
        )}
        {!fullscreen && <TabBar tabs={TABS} active={tab} onChange={nav.go} />}
        <ProSheet visible={!!pro} from={pro ?? ""} onClose={closePro} />
        <ToastHost bottom={(fullscreen ? insets.bottom : TAB_BAR_HEIGHT + insets.bottom + banner) + 12} />
        {!fullscreen && showBanner && (
          <View style={styles.banner} onLayout={(e) => layout.setBannerHeight(e.nativeEvent.layout.height)}>
            <BannerAd unitId={ads.bannerUnitId} size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER} />
          </View>
        )}
      </View>
    </NavContext.Provider>
  );
}

/**
 * Shared-axis entrance for a pushed route: the content is painted on the first frame (opacity 0.6, nudged down 24px)
 * and settles to its resting place in ~200ms, so New Match slides up instead of hard-cutting. It's an imperative
 * animation on a stable mounted View — NOT an `entering` layout animation on a remounting container (which blanked
 * frames in past QA). Each push/replace remounts this via its key, replaying the slide.
 */
function RouteEnter({ children }: { children: React.ReactNode }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withTiming(1, { duration: 200 });
  }, [t]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.6 + t.value * 0.4,
    transform: [{ translateY: (1 - t.value) * 24 }],
  }));
  return <Animated.View style={[styles.root, style]}>{children}</Animated.View>;
}

function RouteScreen({ route, bottomInset }: { route: Route; bottomInset: number }) {
  switch (route.t) {
    case "setup":
      return <SetupFlow tournamentId={route.tournamentId} fixtureId={route.fixtureId} />;
    case "scoring":
      return <ScoringScreen matchId={route.matchId} />;
    case "result":
      return <ResultScreen matchId={route.matchId} />;
    case "match":
      return <MatchDetailScreen matchId={route.matchId} bottomInset={bottomInset} />;
    case "tournament":
      return <TournamentDetailScreen id={route.id} bottomInset={bottomInset} />;
    case "player":
      return <PlayerProfileScreen id={route.id} bottomInset={bottomInset} />;
    case "teams":
      return <TeamsScreen bottomInset={bottomInset} />;
    case "support":
      return <SupportScreen bottomInset={bottomInset} />;
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
  banner: { position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center", backgroundColor: palette.surface },
});
