import { useEffect, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { Extrapolation, interpolate, runOnJS, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";
import { Button, FooterScreen, Icon, Tappable, durations, feedback, palette, space, type } from "../ui";
import { art } from "../art";
import { store } from "../modules/store";
import { analytics } from "../modules/analytics";

const AnimatedImage = Animated.createAnimatedComponent(Image);

// Screens 1 & 2 lead with the headline + three concrete bullets only — the old paragraph just restated the bullets
// and slowed a 3-step flow (QA design review). The final screen keeps one short line to frame the payoff.
const STEPS: { art: number; title: string; body?: string; bullets: string[] }[] = [
  {
    art: art.ill_onb_01_start,
    title: "Score in 20 seconds",
    bullets: ["One big tap per ball", "No login, works offline", "Wides, no-balls & every wicket type"],
  },
  {
    art: art.ill_onb_02_offline,
    title: "Every ball, saved offline",
    bullets: ["Unlimited instant undo", "Edit or fix any past ball", "Every ball saved on the device"],
  },
  {
    art: art.ill_onb_03_stats,
    // No body line here — all three slides are now title + three bullets, so the layout and bullet indent match
    // exactly (QA: slide-1 bullets looked indented differently), and "free forever" is said once, not twice.
    title: "Free stats & share cards",
    bullets: ["Career stats, free forever", "Share a card to your group", "Ad-free with Pro"],
  },
];

/** First run → the "aha" in 3 skippable screens, ending on Home with Start Match one tap away. */
export function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const last = step === STEPS.length - 1;

  // `pos` is the fractional page position (0 → 1 → 2). ALL three illustrations stay mounted (and decoded) from the
  // first frame; each one just cross-fades + parallax-slides as `pos` animates between steps. That's the fix for the
  // QA "step-2 illustration pops in late / blank void": a single <Image> whose source swapped per step had to decode
  // the new bitmap on step change, flashing an empty gap — mounting all three removes any per-step decode.
  const pos = useSharedValue(0);
  useEffect(() => {
    pos.value = withTiming(step, { duration: durations.base });
  }, [step, pos]);
  // Text content swaps per step, so it fades via its own 0→1 timer (content is never animated between two strings).
  const t = useSharedValue(1);
  useEffect(() => {
    t.value = 0;
    t.value = withTiming(1, { duration: durations.base });
  }, [step, t]);
  const textStyle = useAnimatedStyle(() => ({
    opacity: 0.55 + t.value * 0.45,
    transform: [{ translateX: (1 - t.value) * 40 }],
  }));

  const finish = () => {
    feedback("whoosh", "medium");
    store.set({ onboarded: true });
    analytics.track("onboarding_done");
    onDone();
  };
  const next = () => {
    if (last) return finish();
    feedback("pop", "light");
    analytics.track("onboarding_step", { step: step + 1 });
    setStep(step + 1);
  };
  const prev = () => {
    if (step === 0) return;
    feedback("pop", "light");
    setStep(step - 1);
  };

  // Swipe left/right to move between steps (the primary Next button stays for tap). A horizontal pan that beats
  // the small vertical threshold flips the page, so the three screens feel like a pager, not a stack of buttons.
  const swipe = Gesture.Pan()
    .activeOffsetX([-18, 18])
    .failOffsetY([-14, 14])
    .onEnd((e) => {
      if (e.translationX <= -40) runOnJS(next)();
      else if (e.translationX >= 40) runOnJS(prev)();
    });

  const s = STEPS[step];
  return (
    <FooterScreen
      top={
        <View style={styles.topRow}>
          {/* Back on the left keeps the top bar symmetric and consistent across all 3 steps (QA: the top area went
              empty on the last step once Skip disappeared) and gives a real back affordance. */}
          {step > 0 ? (
            <Tappable label="Back a step" sound={null} onPress={prev} style={styles.cornerLink}>
              <Icon name="chevronLeft" size={18} color={palette.inkSoft} />
            </Tappable>
          ) : (
            <View style={styles.cornerLink} />
          )}
          <View style={styles.dots} accessibilityLabel={`Step ${step + 1} of ${STEPS.length}`}>
            {STEPS.map((_, i) => (
              <View key={i} style={[styles.dot, i === step && styles.dotOn]} />
            ))}
          </View>
          {/* Skip is a quiet top-right link, not a second big footer button stacked under Next (QA: redundant). */}
          {!last ? (
            <Tappable label="Skip onboarding" sound={null} onPress={finish} style={[styles.cornerLink, { alignItems: "flex-end" }]}>
              <Text style={[type.label, { color: palette.inkSoft }]}>Skip</Text>
            </Tappable>
          ) : (
            <View style={styles.cornerLink} />
          )}
        </View>
      }
      footer={<Button label={last ? "Get started" : "Next"} size="lg" icon={last ? "play" : "chevronRight"} onPress={next} />}
    >
      {/* Animated body scrolls above the fixed footer — on a 720×1280 phone the text can't be clipped under the
          button (the QA layout fail). Content paints on the first frame (opacity never below 0.55). */}
      <GestureDetector gesture={swipe}>
        <View style={styles.body}>
          {/* All three illustrations are mounted (decoded) at once and stacked; only opacity + a small parallax
              slide change per step, so the active art is ALWAYS already in memory — never a blank decode gap. */}
          <View style={styles.artBox}>
            {STEPS.map((st, i) => (
              <OnbArt key={i} source={st.art} index={i} pos={pos} />
            ))}
          </View>
          {/* No "Step X of 3" label here — the dot indicator in the top bar already shows progress (QA: redundant).
              The illustration is enlarged to fill the space that label and the old gap left. */}
          <Animated.View style={[styles.copy, textStyle]}>
            <Text style={[type.display, styles.center]}>{s.title}</Text>
            {s.body ? <Text style={[type.body, styles.center, { color: palette.inkSoft }]}>{s.body}</Text> : null}
            {/* A compact, step-specific value checklist fills what was a large dead gap above the footer (QA), and
                turns the empty lower half into three concrete reasons to score with Gully. */}
            <View style={styles.bullets}>
              {s.bullets.map((b) => (
                <View key={b} style={styles.bulletRow}>
                  <View style={styles.bulletTick}><Icon name="check" size={13} color={palette.primary} /></View>
                  <Text style={[type.body, { flex: 1, color: palette.ink }]} numberOfLines={2}>{b}</Text>
                </View>
              ))}
            </View>
          </Animated.View>
        </View>
      </GestureDetector>
    </FooterScreen>
  );
}

/** One onboarding illustration in the stacked cross-fade — stays mounted; opacity + a small parallax slide track
 *  the fractional page position, so the active art is always decoded and ready (no per-step blank gap). */
function OnbArt({ source, index, pos }: { source: number; index: number; pos: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const d = pos.value - index;
    return {
      opacity: interpolate(pos.value, [index - 1, index, index + 1], [0, 1, 0], Extrapolation.CLAMP),
      transform: [{ translateX: d * -46 }, { scale: interpolate(Math.abs(d), [0, 1], [1, 0.9], Extrapolation.CLAMP) }],
    };
  });
  return (
    <AnimatedImage
      source={source}
      style={[styles.art, style]}
      resizeMode="contain"
      fadeDuration={0}
      accessibilityIgnoresInvertColors
    />
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: "row", alignItems: "center", paddingTop: space.md },
  dots: { flexDirection: "row", gap: 6, flex: 1, justifyContent: "center" },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: palette.border },
  dotOn: { width: 22, backgroundColor: palette.primary },
  cornerLink: { minWidth: 56, minHeight: 44, alignItems: "flex-start", justifyContent: "center", paddingHorizontal: 6 },
  body: { alignItems: "center", gap: space.xl, paddingVertical: space.lg },
  artBox: { width: 312, height: 284, maxWidth: "94%", alignItems: "center", justifyContent: "center" },
  // A stable, centred width so the bullet block's left edge is identical on every slide regardless of how wide
  // that slide's title is (QA: slide-1 bullets looked indented differently). Title/body stay centred via textAlign.
  copy: { alignSelf: "center", alignItems: "stretch", gap: space.md, maxWidth: 360, width: "100%" },
  bullets: { alignSelf: "stretch", gap: space.sm, marginTop: space.sm, paddingHorizontal: space.sm },
  // Top-align so a bullet that wraps to two lines keeps its tick beside the FIRST line, matching single-line rows.
  bulletRow: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
  bulletTick: { width: 24, height: 24, borderRadius: 12, backgroundColor: palette.primarySoft, alignItems: "center", justifyContent: "center" },
  art: { position: "absolute", width: 312, height: 284, maxWidth: "100%" },
  center: { textAlign: "center" },
});
