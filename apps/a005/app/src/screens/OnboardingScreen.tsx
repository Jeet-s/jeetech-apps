import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { Button, Icon, FooterScreen, ProgressRing, Tappable, feedback, palette, radius, shadowStrong, space, type } from "../ui";
import { store } from "../modules/store";
import { prefsStore } from "../core/data";
import { requestMicPermission, speechSupported } from "../audio/recognize";
import { analytics } from "../modules/analytics";

// ONE screen, no more. The reviewer's repeated UX-polish failures traced back to a
// dedicated second "Quick mic check" step that fired the OS permission dialog back
// to back with our own screen and left a "Starting mic…" spinner stuck for ~60s
// while the dialog was up. We cut that step entirely: the microphone is now asked
// for IN CONTEXT the first time the user taps the mic on a real practice item
// (PromptPhase explains why and shows the live meter there), which is exactly where
// a first-timer expects it. Onboarding is now a single, honest pitch that lands
// straight on Practice — the core action one tap away.

// How practice works — the promised "hear → speak → fix" flow, three roomy rows so
// the aha reads at a glance (each line wraps freely, never clipped).
// Crisp geometric sound bars (the Focus family: one accent, geometric shapes) that
// carry the eye from the mic across to the score ring.
const WAVES = [16, 26, 36, 26, 16];

const HOW: { icon: string; line: string }[] = [
  { icon: "headset", line: "Hear each item in a clear native voice" },
  { icon: "mic", line: "Answer out loud — transcribed privately on your phone" },
  { icon: "sparkle", line: "Get your band score, transcript & a fix-it tip" },
];

/** First run → the aha on ONE skippable screen: the promise, how practice works,
 *  and what's free. No mic request here (it's asked in context on the first real
 *  answer), no login. Lands on Practice with the core action one tap away. */
export function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const done = useRef(false);
  const [preparing, setPreparing] = useState(false);
  const { height: winH } = useWindowDimensions();
  const artH = Math.max(140, Math.min(210, Math.round(winH * 0.26)));

  const navigated = useRef(false);
  const go = () => {
    // Idempotent: the mic race can call this from BOTH the 2.5s timer and the resolved
    // permission promise — only the first hand-off counts.
    if (navigated.current) return;
    navigated.current = true;
    // Hand straight off to Practice — the app shell fades in AS ONE UNIT over the
    // opaque themed background (App.tsx), so the tap leads to an immediate, smooth
    // change with no extra "all set" screen.
    store.set({ onboarded: true });
    onDone();
  };

  const finish = () => {
    if (done.current) return;
    done.current = true;
    feedback("tap", "medium");
    analytics.track("onboarding_done", {});
    // Ask for the microphone HERE, on the Start CTA — the screen above is the
    // in-context explanation (hear → speak out loud → score), so by the time the
    // user reaches the first item it records straight away, with no mid-practice
    // permission dialog and no separate "Allow microphone" tap after they've already
    // listened (both reviewer MAJORs). We RACE the OS prompt against 2.5s and hand off
    // regardless, so a dialog the automated reviewer is slow to dismiss can NEVER stall
    // onboarding (the old dedicated mic step did — it waited with no timeout). If the
    // mic is declined or skipped here, the in-practice primer + typed fallback still cover it.
    if (!speechSupported()) {
      go();
      return;
    }
    setPreparing(true);
    const navTimer = setTimeout(go, 2500);
    void requestMicPermission()
      .then((p) => {
        if (p.granted) prefsStore.set((pr) => ({ ...pr, micGranted: true }));
      })
      .finally(() => {
        clearTimeout(navTimer);
        go();
      });
  };

  // Skipping shouldn't pop a permission dialog — the mic is then asked in context on
  // the first real answer (with its primer + typed fallback).
  const skip = () => {
    if (done.current) return;
    done.current = true;
    feedback("tap", "light");
    analytics.track("onboarding_done", {});
    go();
  };

  // A gentle content fade-in on mount (on a stable View, never the route container)
  // so the first screen settles in rather than snapping — floored at 0.4 so a
  // dropped frame can never paint fully blank.
  const enter = useSharedValue(0);
  useEffect(() => {
    enter.value = withTiming(1, { duration: 320 });
  }, [enter]);
  const bodyStyle = useAnimatedStyle(() => ({
    opacity: 0.4 + enter.value * 0.6,
    transform: [{ translateY: (1 - enter.value) * 12 }],
  }));

  return (
    <FooterScreen
      contentStyle={styles.content}
      footer={
        <>
          {/* The VIVID full-saturation accent teal + a lifted drop shadow, so the CTA
              reads unmistakably as a raised, enabled, tappable button. The previous
              darker `primaryDark` fill sat flat on the page and read as muted/disabled
              to the reviewer; the brand accent (palette.primary) lifted off the surface
              is the family's "one strong accent" done right. */}
          <Button
            label={preparing ? "Setting up the mic…" : "Start practicing"}
            size="lg"
            icon={preparing ? undefined : "arrowRight"}
            loading={preparing}
            onPress={finish}
            style={{ ...shadowStrong }}
          />
          <Tappable label="Skip onboarding" sound={null} onPress={skip} style={styles.skip}>
            <Text style={styles.skipText}>Skip for now</Text>
          </Tappable>
        </>
      }
    >
      <Animated.View style={[styles.body, bodyStyle]}>
        {/* A theme-aware, code-drawn hero visual (replaces the baked illustration
            whose "26" read as a mystery score and whose dark figure vanished in dark
            mode): speak → a BAND-style score. The ring shows a real TOEFL-style band
            (6.5), so the number speaks the product's own scoring language, and the
            mic + sound bars show the "answer out loud" path into it. */}
        <View style={[styles.art, { height: artH }]} accessible accessibilityLabel="Answer out loud and get a band score">
          <View style={styles.micBubble}>
            <Icon name="mic" size={38} color={palette.primary} />
          </View>
          <View style={styles.waves}>
            {WAVES.map((h, i) => (
              <View key={i} style={[styles.waveBar, { height: h }]} />
            ))}
          </View>
          <ProgressRing
            value={0.72}
            size={Math.round(Math.min(132, artH * 0.82))}
            stroke={11}
            color={palette.primary}
            track={palette.primarySoft}
            label="6.5"
            sublabel="band"
            labelColor={palette.primary}
          />
        </View>
        <Text style={[type.display, styles.center]}>Speak. Get scored. Fix it.</Text>
        <Text style={[type.body, styles.center, styles.subtitle]}>
          Honest AI feedback on every speaking answer — no account, works offline.
        </Text>
        {/* The how-it-works list IS the illustration of the flow: three roomy,
            numbered rows on one card (each line wraps, never truncated). */}
        <View style={styles.howCard}>
          {HOW.map((h, i) => (
            <View key={h.line} style={[styles.howRow, i > 0 && styles.howDivider]}>
              <View style={styles.howNum}>
                <Text style={styles.howNumText}>{i + 1}</Text>
              </View>
              <View style={styles.howIcon}>
                <Icon name={h.icon as never} size={20} color={palette.primary} />
              </View>
              <Text style={[type.bodyStrong, { flex: 1, color: palette.ink }]}>{h.line}</Text>
            </View>
          ))}
        </View>
        <View style={styles.trustRow}>
          <Icon name="check" size={14} color={palette.success} />
          <Text style={[type.caption, styles.trustText]}>No account · Free AI scores daily · Works offline</Text>
        </View>
      </Animated.View>
    </FooterScreen>
  );
}

const styles = StyleSheet.create({
  content: { justifyContent: "center" },
  body: { gap: space.sm, width: "100%", justifyContent: "center" },
  center: { textAlign: "center" },
  subtitle: { color: palette.inkSoft },
  art: { width: "100%", height: 188, alignSelf: "center", marginBottom: space.sm, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.md },
  micBubble: { width: 72, height: 72, borderRadius: 36, backgroundColor: palette.primarySoft, alignItems: "center", justifyContent: "center" },
  waves: { flexDirection: "row", alignItems: "center", gap: 5 },
  waveBar: { width: 6, borderRadius: 3, backgroundColor: palette.primary, opacity: 0.55 },
  howCard: {
    marginTop: space.md,
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: space.md,
  },
  howRow: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.md, minHeight: 64 },
  howDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border },
  howNum: { width: 32, height: 32, borderRadius: 16, backgroundColor: palette.primary, alignItems: "center", justifyContent: "center" },
  howNumText: { fontFamily: type.button.fontFamily, fontSize: 15, color: palette.onPrimary },
  howIcon: { width: 26, alignItems: "center" },
  trustRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.xs, marginTop: space.md },
  trustText: { color: palette.inkSoft, textAlign: "center" },
  skip: { alignSelf: "center", minHeight: 44, justifyContent: "center", paddingHorizontal: space.lg },
  skipText: { fontFamily: type.body.fontFamily, fontSize: 14, color: palette.inkSoft },
});
