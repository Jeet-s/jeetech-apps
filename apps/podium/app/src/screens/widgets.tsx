/**
 * Shared Podium UI pieces built on the kit (src/ui) and theme tokens: the live
 * mic level meter, the highlighted transcript, the rewrite diff, small metric
 * tiles and scenario helpers. Kept here so every screen reads the same.
 */
import { memo, useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming, type SharedValue } from "react-native-reanimated";
import { Icon, type IconName, Tappable, palette, radius, space, tones, type, type Tone } from "../ui";
import type { DiffSpan, Report, Transcript, Word } from "../core/types";
import { getPack } from "../core/content";

/** Score → semantic tone (state colour only). */
export function scoreTone(score: number): Tone {
  if (score >= 75) return "success";
  if (score >= 55) return "primary";
  if (score >= 40) return "warning";
  return "danger";
}

/** Score → tinted chip colours (uses the semantic tone's fg/bg). */
export function scoreColors(score: number): { fg: string; bg: string } {
  return tones[scoreTone(score)];
}

export const scoreLabel = (score: number): string =>
  score >= 85 ? "Excellent" : score >= 70 ? "Strong" : score >= 55 ? "Solid" : score >= 40 ? "Getting there" : "Keep practising";

/** Pack → kit icon (library packs carry an icon name; custom = sparkle). */
export function scenarioIcon(packId: string): IconName {
  if (packId.startsWith("custom_")) return "sparkle";
  const icon = getPack(packId)?.icon;
  return (icon && icon in ICON_SET ? icon : "mic") as IconName;
}
const ICON_SET: Record<string, true> = {
  shuffle: true, flag: true, briefcase: true, chart: true, users: true, rocket: true,
  grad: true, book: true, glass: true, leaf: true, star: true, phone: true,
};

const BAR_COUNT = 13;
const WEIGHTS = Array.from({ length: BAR_COUNT }, (_, i) => 0.5 + 0.5 * Math.sin((i / (BAR_COUNT - 1)) * Math.PI));
// Each bar bobs on its own slightly-offset cycle so the waveform is in constant
// motion (never a frozen hump between frames), and its amplitude tracks the live
// input level — so it reads as real audio, not a static graphic.
const DURATIONS = Array.from({ length: BAR_COUNT }, (_, i) => 300 + ((i * 53) % 260));

function MeterBar({ level, weight, duration, color }: { level: SharedValue<number>; weight: number; duration: number; color: string }) {
  const osc = useSharedValue(0);
  useEffect(() => {
    osc.value = withRepeat(withTiming(1, { duration, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [osc, duration]);
  const style = useAnimatedStyle(() => {
    const lvl = Math.max(0.08, Math.min(1, level.value));
    const dyn = 0.3 + 0.7 * osc.value; // per-bar motion, independent of others
    const h = 6 + lvl * weight * dyn * 48;
    return { height: h };
  });
  return <Animated.View style={[styles.meterBar, { backgroundColor: color }, style]} />;
}

/** Live input meter driven by a Reanimated shared value (0..1) — never React
 * state per frame (avoids ANR). Each bar animates independently so the waveform
 * is visibly alive while its height follows the real mic amplitude. Memoised. */
export const LevelMeter = memo(function LevelMeter({ level, color = palette.primary }: { level: SharedValue<number>; color?: string }) {
  return (
    <View style={styles.meter} accessible accessibilityLabel="Microphone input level">
      {WEIGHTS.map((w, i) => (
        <MeterBar key={i} level={level} weight={w} duration={DURATIONS[i]} color={color} />
      ))}
    </View>
  );
});

/** A metric evidence tile: label, big value, a one-line "why". When `onPress`
 * is set it becomes tappable (jumps to the linked evidence) and shows a small
 * "See evidence" affordance. */
export function MetricTile({ label, value, unit, note, tone = "neutral", icon, onPress, active }: { label: string; value: string; unit?: string; note?: string; tone?: Tone; icon?: IconName; onPress?: () => void; active?: boolean }) {
  const t = tones[tone];
  const inner = (
    <>
      <View style={styles.tileHead}>
        {icon ? <Icon name={icon} size={16} color={t.fg} /> : null}
        <Text style={type.label} numberOfLines={1}>{label}</Text>
        {onPress ? <View style={{ flex: 1 }} /> : null}
        {onPress ? <Icon name="chevronRight" size={16} color={active ? palette.primary : palette.inkMuted} /> : null}
      </View>
      <View style={styles.tileValueRow}>
        <Text style={[type.number, { color: palette.ink }]}>{value}</Text>
        {unit ? <Text style={[type.caption, { marginBottom: 4 }]}>{unit}</Text> : null}
      </View>
      {note ? <Text style={type.caption} numberOfLines={2}>{note}</Text> : null}
      {onPress ? <Text style={[type.caption, { color: palette.primary }]}>See evidence</Text> : null}
    </>
  );
  const tileStyle = [styles.tile, { backgroundColor: palette.surface, borderColor: active ? palette.primary : palette.border }];
  return onPress ? (
    <Tappable label={`${label} ${value}${unit ? ` ${unit}` : ""} — see evidence`} onPress={onPress} scale={0.98} style={tileStyle}>
      {inner}
    </Tappable>
  ) : (
    <View style={tileStyle}>{inner}</View>
  );
}

/**
 * Word-level transcript with fillers (coral underline + colour, never colour
 * alone), long pauses, the active (read-along) word and the tapped word
 * highlighted. EVERY word is tappable: a tap selects it (so the card can play
 * from there and offer a filler toggle) — there is no silent, no-feedback tap,
 * and the filler editor stays reachable even on a clean take with no fillers.
 */
export const TranscriptView = memo(function TranscriptView({
  transcript,
  activeIndex,
  selectedIndex,
  highlightFillers,
  highlightRange,
  onWordPress,
}: {
  transcript: Transcript;
  activeIndex?: number;
  /** The word the user tapped — always highlighted (even word 0 at pos 0). */
  selectedIndex?: number;
  /** Briefly pulse every flagged filler (tapping the Fillers metric). */
  highlightFillers?: boolean;
  /** Tint every word spoken inside this time window (tapping the Pace metric's
   * "See evidence" — the stretch that drove the pace verdict). */
  highlightRange?: { startMs: number; endMs: number };
  onWordPress?: (word: Word, index: number) => void;
}) {
  // One flowing <Text> with nested word spans — NOT a flex-wrap of per-word
  // Views, which overlapped mid-line on Android ("In the ne" over "In the
  // next…"). Nested Text wraps correctly and still takes per-word onPress.
  return (
    <Text style={[type.body, styles.transcript]}>
      {transcript.words.map((w, i) => {
        // The active (moving read-along) word OR the word the user tapped both
        // get the strong highlight — so every tap shows a lasting visible effect.
        const lit = i === activeIndex || i === selectedIndex;
        const filler = w.isFiller;
        const inPace = !!highlightRange && w.text.trim().length > 0 && w.startMs >= highlightRange.startMs && w.startMs < highlightRange.endMs;
        return (
          <Text
            key={i}
            onPress={() => onWordPress?.(w, i)}
            suppressHighlighting
            accessibilityLabel={filler ? `${w.text}, marked a filler — tap to edit it` : `${w.text}, tap to play from here or mark a filler`}
            style={[
              inPace && !lit && styles.wordPaceText,
              filler && styles.wordFillerText,
              filler && highlightFillers && !lit && styles.wordFillerFlash,
              lit && styles.wordActiveText,
            ]}
          >
            {w.isPause ? "·  " : ""}
            {w.text}
            {i < transcript.words.length - 1 ? " " : ""}
          </Text>
        );
      })}
    </Text>
  );
});

const normWord = (s: string): string => s.trim().toLowerCase().replace(/[.,!?;:"'’”]+$/g, "");

/** Drop no-op edits (a word struck through and re-added unchanged, e.g.
 * "and"→"and", which reads like a bug) and any empty spans, merging the pair
 * back into a single kept word so the diff only shows real changes. */
export function cleanDiff(diff: DiffSpan[]): DiffSpan[] {
  const out: DiffSpan[] = [];
  for (let i = 0; i < diff.length; i++) {
    const d = diff[i];
    if (!d.text.trim()) continue;
    const next = diff[i + 1];
    const noop =
      d.kind === "removed" && next && next.kind === "added" && normWord(d.text) === normWord(next.text);
    const noopRev =
      d.kind === "added" && next && next.kind === "removed" && normWord(d.text) === normWord(next.text);
    if (noop || noopRev) {
      const keep = noop ? next!.text : d.text;
      const prev = out[out.length - 1];
      // Fold it onto an adjacent kept span so spacing stays natural.
      if (prev && prev.kind === "same") prev.text = `${prev.text} ${keep}`.trim();
      else out.push({ kind: "same", text: keep });
      i++; // skip the paired span
      continue;
    }
    out.push({ ...d });
  }
  return out;
}

/** Side-by-side-feel rewrite diff: removed (struck, coral), added (green), kept (ink). */
export function DiffView({ diff, rewrite }: { diff: DiffSpan[]; rewrite: string }) {
  const clean = cleanDiff(diff);
  if (!clean.length) {
    return <Text style={[type.body, { color: palette.ink }]}>{rewrite}</Text>;
  }
  return (
    <Text style={type.body}>
      {clean.map((d, i) => (
        <Text
          key={i}
          style={
            d.kind === "removed"
              ? { color: palette.danger, textDecorationLine: "line-through" }
              : d.kind === "added"
                ? { color: palette.success, fontFamily: type.bodyStrong.fontFamily }
                : { color: palette.inkSoft }
          }
        >
          {d.text}
          {i < clean.length - 1 ? " " : ""}
        </Text>
      ))}
    </Text>
  );
}

/** A structure pill row: Opening · Point · Close with tick/cross. */
export function StructureRow({ report }: { report: Report }) {
  const parts: { label: string; ok: boolean }[] = [
    { label: "Opening", ok: report.structure.opening },
    { label: "Point", ok: report.structure.point },
    { label: "Close", ok: report.structure.close },
  ];
  return (
    <View style={styles.structRow}>
      {parts.map((p) => (
        <View key={p.label} style={[styles.structPill, { backgroundColor: p.ok ? palette.successSoft : palette.surfaceAlt }]}>
          <Icon name={p.ok ? "check" : "close"} size={14} color={p.ok ? palette.success : palette.inkMuted} />
          <Text style={[type.label, { color: p.ok ? palette.success : palette.inkMuted }]}>{p.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  meter: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, height: 60 },
  meterBar: { width: 6, borderRadius: 3, minHeight: 6 },
  tile: { flex: 1, borderRadius: radius.lg, padding: space.md, gap: 4, borderWidth: 1, borderColor: palette.border },
  tileHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  tileValueRow: { flexDirection: "row", alignItems: "flex-end", gap: 4 },
  transcript: { lineHeight: 28 },
  wordActiveText: { color: palette.onPrimary, backgroundColor: palette.primary, fontFamily: type.bodyStrong.fontFamily },
  wordFillerText: { color: palette.danger, textDecorationLine: "underline", fontFamily: type.bodyStrong.fontFamily },
  wordFillerFlash: { backgroundColor: palette.dangerSoft },
  wordPaceText: { color: palette.primary, backgroundColor: palette.primarySoft, fontFamily: type.bodyStrong.fontFamily },
  structRow: { flexDirection: "row", gap: space.sm },
  structPill: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 8, borderRadius: radius.md },
});
