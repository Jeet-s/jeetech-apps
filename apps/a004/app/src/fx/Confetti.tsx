import { useEffect, useMemo, useState, memo } from "react";
import { AccessibilityInfo, StyleSheet, useWindowDimensions, type ViewStyle } from "react-native";
import { Canvas, Group, RoundedRect, Circle } from "@shopify/react-native-skia";
import { Easing, useDerivedValue, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";
import { palette } from "../ui/theme";

const COLORS = [palette.primary, palette.success, palette.warning, palette.accent, "#FFFFFF"];

interface P { vx: number; vy: number; spin: number; size: number; color: string; round: boolean; delay: number }

function Particle({ p, t, ox, oy }: { p: P; t: SharedValue<number>; ox: number; oy: number }) {
  const transform = useDerivedValue(() => {
    const k = Math.max(0, t.value - p.delay);
    const x = ox + p.vx * k;
    const y = oy + p.vy * k + 900 * k * k; // gravity
    return [{ translateX: x }, { translateY: y }, { rotate: p.spin * k }];
  });
  const opacity = useDerivedValue(() => Math.max(0, 1 - Math.max(0, t.value - p.delay - 0.6) / 0.6));
  return (
    <Group transform={transform} opacity={opacity}>
      {p.round ? (
        <Circle cx={0} cy={0} r={p.size / 2} color={p.color} />
      ) : (
        <RoundedRect x={-p.size / 2} y={-p.size / 4} width={p.size} height={p.size / 2} r={2} color={p.color} />
      )}
    </Group>
  );
}

/**
 * Confetti / sparkle burst (GPU, Skia). Change `trigger` to fire again. Mount it with the screen
 * (trigger 0 = idle) rather than when the moment happens.
 * Use sparingly on real milestones: a streak record, finishing every task today, unlocking Pro.
 *
 * `style` constrains the canvas (e.g. a top band over the hero) so the burst can be kept away from
 * the screen's primary CTAs. It is fully disabled when the OS "reduce motion" setting is on — a
 * health app for a wide age range must never force motion on people who turned it off.
 */
function ConfettiBase({ trigger, count = 70, origin, style }: { trigger: number; count?: number; origin?: { x: number; y: number }; style?: ViewStyle }) {
  const { width, height } = useWindowDimensions();
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => { if (alive) setReduceMotion(v); }).catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", (v) => setReduceMotion(v));
    return () => { alive = false; sub.remove(); };
  }, []);
  // Starts "finished" (every particle faded out) so the canvas can stay mounted: creating a Skia
  // canvas at the moment of a milestone stalls the frame the user is watching.
  const t = useSharedValue(1.6);
  const particles = useMemo<P[]>(
    () =>
      Array.from({ length: count }, (_, i) => {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.2;
        const sp = 380 + Math.random() * 520;
        return {
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          spin: (Math.random() - 0.5) * 18,
          size: 8 + Math.random() * 10,
          color: COLORS[i % COLORS.length],
          round: Math.random() < 0.3,
          delay: Math.random() * 0.12,
        };
      }),
    // new set per trigger
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trigger, count],
  );
  useEffect(() => {
    if (!trigger) return;
    t.value = 0;
    t.value = withTiming(1.6, { duration: 1600, easing: Easing.linear });
  }, [trigger, t]);
  const ox = origin?.x ?? width / 2;
  const oy = origin?.y ?? height * 0.42;
  // Honour reduce-motion: no particles, no canvas.
  if (reduceMotion) return null;
  return (
    <Canvas style={[styles.fill, style]} pointerEvents="none">
      {particles.map((p, i) => (
        <Particle key={i} p={p} t={t} ox={ox} oy={oy} />
      ))}
    </Canvas>
  );
}

const styles = StyleSheet.create({
  // Top-anchored by default so a caller can cap the height to keep the burst in a hero band.
  fill: { position: "absolute", top: 0, left: 0, right: 0, height: "100%" },
});

// React.memo: an unmemoised Skia <Canvas> redraws on every parent re-render (soak ANR).
export const Confetti = memo(ConfettiBase);
