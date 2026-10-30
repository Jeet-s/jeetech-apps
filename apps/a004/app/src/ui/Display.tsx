import { useEffect } from "react";
import { StyleSheet, Text, View, type ViewStyle } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withSpring, withTiming } from "react-native-reanimated";
// (Easing/withRepeat/withTiming power both the Skeleton pulse and the hero typing caret.)
import { LinearGradient } from "expo-linear-gradient";
import { design, gradient, palette, radius, shadowStrong, space, springs, tones, type, type Tone } from "./theme";

/** A soft blinking caret that sits after the hero number while the user is typing a value, so the
 *  field reads as an active input (not a static figure) — the "where am I typing" cue the Log keypad
 *  needs. Blinks on the UI thread, so it never adds React re-renders. */
function Caret({ color }: { color: string }) {
  const o = useSharedValue(1);
  useEffect(() => {
    o.value = withRepeat(withTiming(0, { duration: 520, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [o]);
  const anim = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[styles.caret, { backgroundColor: color }, anim]} />;
}

/**
 * The hero number. When `animate` is on it gives a small scale+fade "land" on every value change so
 * a fast-changing figure (e.g. the glucose value as the keypad is tapped) reads as a deliberate,
 * in-sync update rather than a laggy flicker — the value and the key press land together on screen.
 * `color` tints the figure (e.g. amber when a typed reading is out of the saveable range); `suffix`
 * appends a smaller unit label; `caret` shows a blinking input caret while the value is being typed.
 */
function HeroValue({ value, animate, color, suffix, caret }: { value: string; animate?: boolean; color?: string; suffix?: string; caret?: boolean }) {
  const s = useSharedValue(1);
  useEffect(() => {
    if (!animate) return;
    s.value = 0.86;
    s.value = withSpring(1, springs.pop);
  }, [value, animate, s]);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: s.value }], opacity: 0.55 + 0.45 * s.value }));
  const tint = color ?? gradient.onHero;
  const text = (
    <View style={styles.heroValueRow}>
      <Text style={[type.hero, { color: tint }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {caret ? <Caret color={tint} /> : null}
      {suffix ? <Text style={[type.label, styles.heroSuffix, { color: gradient.onHeroSoft }]}>{suffix}</Text> : null}
    </View>
  );
  if (!animate) return text;
  return <Animated.View style={[anim, { alignSelf: "flex-start" }]}>{text}</Animated.View>;
}

/**
 * The ONE headline card per screen: the number the user opens the app for
 * (left to spend, today's streak, minutes focused) on the brand gradient,
 * with a label, an optional status line and an optional visual on the right
 * (a ProgressRing, an illustration). Flat white cards everywhere else.
 */
export function HeroCard({
  overline,
  value,
  animateValue,
  valueColor,
  valueSuffix,
  valueCaret,
  caption,
  captionLines,
  status,
  reserveStatus,
  right,
  children,
  style,
}: {
  overline: string;
  value: string;
  /** Give the number a small scale+fade on every change (for a live-updating figure like a reading
   *  being typed) so it reads as an intentional, in-sync update instead of a laggy flicker. */
  animateValue?: boolean;
  /** Tint the hero figure (e.g. amber while a typed reading is out of the saveable range). */
  valueColor?: string;
  /** A smaller unit label after the figure (e.g. "mg/dL") so a live entry reads as a measurement. */
  valueSuffix?: string;
  /** Show a blinking input caret after the figure while the user is typing. */
  valueCaret?: boolean;
  caption?: string;
  /** Pin the caption to a fixed number of lines so the card's height never shifts between states. */
  captionLines?: number;
  status?: { label: string; tone: Tone };
  /** Keep the status pill's vertical space even when `status` is absent, so the card's height
   *  never shifts as the pill comes and goes (e.g. the Log hero from empty → typing → saved). */
  reserveStatus?: boolean;
  right?: React.ReactNode;
  children?: React.ReactNode;
  style?: ViewStyle;
}) {
  return (
    <LinearGradient colors={gradient.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, gradient.border ? { borderWidth: 1, borderColor: gradient.border } : null, style]}>
      <View style={styles.heroRow}>
        <View style={{ flex: 1, gap: 2 }} accessible accessibilityLabel={`${overline}: ${value}${caption ? `, ${caption}` : ""}`}>
          <Text style={[type.overline, { color: gradient.onHeroSoft }]}>{overline}</Text>
          <HeroValue value={value} animate={animateValue} color={valueColor} suffix={valueSuffix} caret={valueCaret} />
          {caption ? <Text style={[type.label, { color: gradient.onHeroSoft }]} numberOfLines={captionLines}>{caption}</Text> : null}
          {status ? (
            <View style={[styles.heroPill]}>
              <View style={[styles.dot, { backgroundColor: tones[status.tone].bg }]} />
              <Text style={[type.label, { color: gradient.onHero }]}>{status.label}</Text>
            </View>
          ) : reserveStatus ? (
            <View style={styles.heroPillSpacer} />
          ) : null}
        </View>
        {right}
      </View>
      {children}
    </LinearGradient>
  );
}

/** Small status pill: "On track", "Due today", "Over by $12", "Pro". */
export function Pill({ label, tone = "neutral", icon }: { label: string; tone?: Tone; icon?: React.ReactNode }) {
  const t = tones[tone];
  return (
    <View style={[styles.pill, { backgroundColor: t.bg }]}>
      {icon}
      <Text style={[type.label, { fontSize: 12, lineHeight: 16, color: t.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/**
 * Animated linear progress, 8dp thick. Tone follows the value unless given:
 * < 0.85 primary, ≥ 0.85 warning, > 1 danger (over budget / over limit).
 */
export function ProgressBar({ value, tone, color, height = 8 }: { value: number; tone?: Tone; color?: string; height?: number }) {
  const t = tone ?? (value > 1 ? "danger" : value >= 0.85 ? "warning" : "primary");
  const w = useSharedValue(0);
  useEffect(() => {
    w.value = withTiming(Math.max(0, Math.min(1, value)), { duration: 500, easing: Easing.out(Easing.cubic) });
  }, [value, w]);
  const fill = useAnimatedStyle(() => ({ width: `${w.value * 100}%` }));
  return (
    <View
      style={[styles.track, { height, borderRadius: height / 2, backgroundColor: tones[t].bg }]}
      accessible
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(Math.min(1, value) * 100) }}
    >
      <Animated.View style={[{ height, borderRadius: height / 2, backgroundColor: color ?? tones[t].fg }, fill]} />
    </View>
  );
}

/**
 * A figure with tabular digits (columns line up) and an optional sign colour:
 * tone="auto" → negative danger, positive success. Format the string yourself
 * (Intl / the app's formatMoney) — this only styles it.
 */
export function Amount({
  value,
  sign,
  tone,
  size = "row",
  style,
}: {
  value: string;
  sign?: number;
  tone?: Tone | "auto";
  size?: "row" | "number" | "hero";
  style?: object;
}) {
  const t = tone === "auto" ? (sign == null || sign === 0 ? undefined : sign < 0 ? "danger" : "success") : tone;
  const base = size === "hero" ? type.hero : size === "number" ? type.number : type.amount;
  return (
    <Text style={[base, t ? { color: tones[t].fg } : null, style]} numberOfLines={1}>
      {value}
    </Text>
  );
}

/** Loading placeholder with a soft pulse. Show skeleton rows, never a blank list or a spinner alone. */
export function Skeleton({ width = "100%", height = 16, round = false, style }: { width?: number | `${number}%`; height?: number; round?: boolean; style?: ViewStyle }) {
  const o = useSharedValue(0.5);
  useEffect(() => {
    o.value = withRepeat(withTiming(1, { duration: 700 }), -1, true);
  }, [o]);
  const pulse = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ width, height, borderRadius: round ? height / 2 : radius.sm, backgroundColor: palette.surfaceAlt }, pulse, style]} />;
}

/** A ready-made skeleton for a list: `rows` × (icon + two lines + trailing figure). */
export function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <View style={{ gap: space.lg }} accessibilityLabel="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={styles.skRow}>
          <Skeleton width={36} height={36} round />
          <View style={{ flex: 1, gap: 6 }}>
            <Skeleton width="60%" height={14} />
            <Skeleton width="35%" height={12} />
          </View>
          <Skeleton width={56} height={14} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radius.xl, padding: space.xl, gap: space.lg, ...shadowStrong, ...(design.hero === "gradient" || design.hero === "solid" ? { shadowColor: gradient.hero[1], shadowOpacity: 0.28 } : {}) },
  heroRow: { flexDirection: "row", alignItems: "center", gap: space.lg },
  heroPill: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", marginTop: space.sm, backgroundColor: gradient.pill, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  // Same vertical footprint as heroPill (marginTop + paddingY + label line) so reserving it
  // keeps the card height identical whether or not a status pill is present.
  heroPillSpacer: { marginTop: space.sm, height: 28 },
  heroValueRow: { flexDirection: "row", alignItems: "flex-end" },
  heroSuffix: { marginLeft: 6, marginBottom: 8 },
  caret: { width: 3, height: 30, borderRadius: 2, marginLeft: 5, marginBottom: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  pill: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  track: { width: "100%", overflow: "hidden" },
  skRow: { flexDirection: "row", alignItems: "center", gap: space.md },
});
