/**
 * Shared presentational helpers for the Sugar Plate screens: wall-clock epoch
 * helpers (the core stores local wall-clock as UTC), formatting, the glucose
 * keypad, a no-native-picker date/time editor and small rows. All built from
 * the UI kit + theme tokens (Ledger family) — no hard-coded colours or fonts.
 */
import { memo, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { Icon, IconButton, Screen, Tappable, feedback, palette, radius, space, type, type IconName } from "../ui";
import { wallClock, MS_DAY, timeLabel } from "../core/dates";
import { type Level } from "../core/readings";
import { CONTEXT_LABEL, CONTEXTS, type Context } from "../core/model";
import { MMOL_FACTOR, UNIT_LABEL, type Unit } from "../core/units";
import { type Tone } from "../ui/theme";

/** Format a glucose DELTA (mg/dL difference) in the user's unit, signed, with unit label. */
export function formatDelta(deltaMgdl: number, unit: Unit): string {
  const v = unit === "mmol" ? Math.round((deltaMgdl / MMOL_FACTOR) * 10) / 10 : Math.round(deltaMgdl);
  return `${v > 0 ? "+" : ""}${v} ${UNIT_LABEL[unit]}`;
}

// ── Wall-clock epochs ─────────────────────────────────────────────────────────
// The core reads ts back with UTC getters, so build ts from LOCAL wall-clock
// parts via wallClock() and format with UTC getters — stable on every device.

export function nowTs(): number {
  const d = new Date();
  return wallClock(d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes());
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${DOW[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export function relativeDay(ts: number, now: number): string {
  const a = Math.floor(ts / MS_DAY);
  const b = Math.floor(now / MS_DAY);
  if (a === b) return "Today";
  if (a === b - 1) return "Yesterday";
  return formatDate(ts);
}

export function formatDateTime(ts: number, now = nowTs()): string {
  return `${relativeDay(ts, now)} · ${timeLabel(ts)}`;
}

// ── Reading level → tone + icon (never colour alone) ────────────────────────────

export function levelTone(level: Level["level"]): Tone {
  return level === "in_range" ? "success" : level === "high" ? "warning" : "danger";
}

export function levelColor(level: Level["level"]): string {
  return level === "in_range" ? palette.success : level === "high" ? palette.warning : palette.danger;
}

export function levelIcon(level: Level): IconName {
  return level.icon === "arrow-up" ? "arrowUp" : level.icon === "arrow-down" ? "arrowDown" : "check";
}

// ── Sub-screen scaffold (More tab pages) with a back control ────────────────────

export function SubScreen({ title, subtitle, onBack, bottomInset, right, children, contentStyle }: {
  title: string; subtitle?: string; onBack: () => void; bottomInset: number; right?: React.ReactNode; children: React.ReactNode; contentStyle?: ViewStyle;
}) {
  return (
    <Screen bottomInset={bottomInset} contentStyle={contentStyle}>
      <View style={styles.backRow}>
        <IconButton icon="chevronLeft" label="Back" onPress={onBack} />
        <View style={{ flex: 1 }}>
          <Text style={type.title} numberOfLines={1} accessibilityRole="header">{title}</Text>
          {subtitle ? <Text style={type.caption}>{subtitle}</Text> : null}
        </View>
        {right}
      </View>
      {children}
    </Screen>
  );
}

// ── Glucose keypad (the 5-second core action) ──────────────────────────────────

/**
 * Glucose keypad, unit-aware. The bottom-left slot is a real, balanced key: in
 * mmol/L it is "." (one decimal, e.g. 5.6); in mg/dL it is "00" (a common shortcut
 * for round values like 100 or 120). No empty/dead cell. The backspace key is
 * deliberately set apart from the digits — a bordered "surface" cap (not the solid
 * digit fill) that takes a SUBTLE grey pressed tint (never danger red: a red cap
 * reads as a destructive/delete warning while the user is simply editing) — so the
 * eye reads it as the delete key, not a number, and a finger aiming for "0" doesn't
 * land on it by mistake. The whole pad is compact so all four rows fit above the
 * pinned Save bar without scrolling on a 720×1280 phone.
 */
export const Keypad = memo(function Keypad({ onKey, onDelete, onClear, decimal = true, unitLabel = "" }: { onKey: (k: string) => void; onDelete: () => void; onClear?: () => void; decimal?: boolean; unitLabel?: string }) {
  void unitLabel;
  const keys: string[] = ["1", "2", "3", "4", "5", "6", "7", "8", "9", decimal ? "." : "00", "0", "del"];
  return (
    <View style={styles.keypad} accessibilityLabel="Number keypad">
      {keys.map((k) =>
        k === "del" ? (
          <KeyButton key={k} label="Backspace — delete last digit, hold to clear" icon="backspace" fn onPress={onDelete} onLongPress={onClear} />
        ) : (
          <KeyButton key={k} label={k === "." ? "Decimal point" : k === "00" ? "Double zero" : k} char={k} onPress={() => onKey(k)} />
        ),
      )}
    </View>
  );
});

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * One keypad key with a clearly VISIBLE pressed state: a digit cap fills with the
 * brand teal and its glyph flips to white while held, plus a small scale-down — so
 * a tap is unmistakable on screen (not just a faint tint). The highlight is BRIEF:
 * it snaps on instantly on press-in and eases back out in ~120ms, so a key never
 * sits lit far longer than the tap it confirms. The backspace key is set apart with
 * a SUBTLE grey pressed tint (never red) so delete never reads as a warning.
 */
function KeyButton({ label, char, icon, fn = false, onPress, onLongPress }: { label: string; char?: string; icon?: IconName; fn?: boolean; onPress: () => void; onLongPress?: () => void }) {
  const p = useSharedValue(0);
  // Commit the keystroke the instant the finger goes DOWN (press-in), not on release, so the
  // value on the hero card updates in the SAME frame as this key's pressed-fill paints —
  // the two are visibly in sync even when a frame is captured mid-press. A screen-reader
  // activation fires onPress without a preceding onPressIn, so we fall back to it there.
  const fired = useRef(false);
  // A FUNCTION key (backspace) is set apart: a bordered surface cap at rest that takes a quiet
  // grey tint when pressed (palette.border), vs a digit's flat-fill → teal. So delete never looks
  // like another number AND never flashes an alarming red that reads as a destructive action.
  const restBg = fn ? palette.surface : palette.surfaceAlt;
  const pressBg = fn ? palette.border : palette.primary;
  const cap = useAnimatedStyle(() => ({
    // A clear scale-down on press (0.94) so a tap is unmistakable even in a still frame.
    transform: [{ scale: 1 - p.value * 0.06 }],
    backgroundColor: interpolateColor(p.value, [0, 1], [restBg, pressBg]),
  }));
  // Digit glyphs flip ink→white on the teal fill; the backspace glyph stays ink the whole time
  // (its cap only takes a light grey tint, so a white glyph would vanish).
  const glyph = useAnimatedStyle(() => ({ color: interpolateColor(p.value, [0, 1], [palette.ink, palette.onPrimary]) }));
  const iconRest = useAnimatedStyle(() => ({ opacity: 1 - p.value }));
  const iconPress = useAnimatedStyle(() => ({ opacity: p.value }));
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      // Asymmetric hitSlop: generous HORIZONTAL slop (6) so a tap that lands in the gap between
      // columns still registers (fixes a tester's "112" coming through as "11" — a digit tap missed
      // the key), but only 2 VERTICALLY so the touch areas of stacked keys never overlap (an earlier
      // symmetric slop made a "1" land as "4"). The row gap is larger than 2, so no vertical overlap.
      hitSlop={{ top: 2, bottom: 2, left: 6, right: 6 }}
      // A quick Android ripple on top of the fill so the tap reads as a touch, not a selection.
      android_ripple={{ color: fn ? palette.inkMuted + "22" : palette.onPrimary + "33", borderless: false, radius: 48 }}
      // Snap to the full pressed state INSTANTLY (no ramp) so even a single captured frame mid-tap
      // shows the fill + scale-down, then ease it back out fast (~80ms) so the key confirms the tap
      // and never lingers lit long enough to read as "selected".
      onPressIn={() => { p.value = 1; fired.current = true; feedback("pop", "light"); onPress(); }}
      onPressOut={() => { p.value = withTiming(0, { duration: 80 }); }}
      onPress={() => { if (!fired.current) { feedback("pop", "light"); onPress(); } fired.current = false; }}
      onLongPress={onLongPress ? () => { feedback("pop", "warning"); onLongPress(); } : undefined}
      delayLongPress={350}
      style={[styles.key, fn && styles.keyFn, cap]}
    >
      {char != null ? (
        <Animated.Text style={[styles.keyText, glyph]}>{char}</Animated.Text>
      ) : (
        <View style={styles.keyIconWrap}>
          <Animated.View style={[StyleSheet.absoluteFill, styles.keyIconCenter, iconRest]}>
            <Icon name={icon!} size={24} color={palette.inkSoft} />
          </Animated.View>
          {/* Backspace keeps an ink glyph while pressed (light grey cap); only digit keys flip to white. */}
          <Animated.View style={[StyleSheet.absoluteFill, styles.keyIconCenter, iconPress]}>
            <Icon name={icon!} size={24} color={fn ? palette.inkSoft : palette.onPrimary} />
          </Animated.View>
        </View>
      )}
    </AnimatedPressable>
  );
}

/** Append a keypad char to a value string, keeping it a valid single-decimal number. */
export function applyKey(current: string, k: string): string {
  if (k === ".") return current.includes(".") ? current : current === "" ? "0." : current + ".";
  // "00" is a shortcut for two zeros — never a leading entry (so no "00" / "007").
  if (k === "00") return current === "" || current === "0" ? current : applyKey(applyKey(current, "0"), "0");
  if (current === "0") return k; // no leading zeros
  if (current.replace(".", "").length >= 6) return current; // sane cap
  return current + k;
}

// ── Context chips ───────────────────────────────────────────────────────────────

// Short chip labels so more tags fit before the row needs to scroll (the full
// "Before meal"/"After meal" wording is kept everywhere else — hero, rows, toasts).
const CTX_CHIP_LABEL: Record<Context, string> = {
  fasting: "Fasting",
  pre_meal: "Before",
  post_meal: "After",
  bedtime: "Bedtime",
  random: "Random",
};

export function ContextPicker({ value, onChange, auto = false }: { value: Context; onChange: (c: Context) => void; auto?: boolean }) {
  // One horizontally-scrolling row — all five tags stay on a single line on a 360dp phone
  // instead of wrapping onto two rows (which read as a layout break). Two touches keep it from
  // looking cropped/broken: (1) a soft right-edge fade that clearly signals "more to the side",
  // and (2) auto-scrolling the selected chip into view (the context is pre-selected by time of
  // day) so the user never lands on a half-cut chip at the edge.
  const ref = useRef<React.ElementRef<typeof ScrollView>>(null);
  const xs = useRef<Record<string, number>>({});
  useEffect(() => {
    const x = xs.current[value];
    if (x != null && ref.current) ref.current.scrollTo({ x: Math.max(0, x - 16), animated: true });
  }, [value]);
  return (
    <View style={styles.ctxWrap}>
      <ScrollView
        ref={ref}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.ctxRow}
      >
        {CONTEXTS.map((c) => {
          const on = c === value;
          return (
            <Tappable
              key={c}
              label={CONTEXT_LABEL[c]}
              role="button"
              accessibilityState={{ selected: on }}
              sound="pop"
              onPress={() => onChange(c)}
              onLayout={(e) => { xs.current[c] = e.nativeEvent.layout.x; }}
              style={[styles.ctxChip, on && { backgroundColor: palette.primary, borderColor: palette.primary }]}
            >
              <Text style={[type.label, { color: on ? palette.onPrimary : palette.inkSoft }]}>{CTX_CHIP_LABEL[c]}</Text>
              {on && auto ? (
                <View style={styles.autoTag}><Text style={[type.caption, styles.autoTagText]}>auto</Text></View>
              ) : null}
            </Tappable>
          );
        })}
      </ScrollView>
      <LinearGradient
        pointerEvents="none"
        colors={[`${palette.bg}00`, palette.bg]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.ctxFade}
      />
    </View>
  );
}

// ── Date/time editor (no native picker — reliable + testable) ────────────────────

export function DateTimeField({ ts, onChange }: { ts: number; onChange: (ts: number) => void }) {
  const step = (ms: number) => () => {
    feedback("pop", "light");
    onChange(ts + ms);
  };
  const future = ts > nowTs() + 60_000;
  return (
    <View style={{ gap: space.sm }}>
      <View style={styles.dtRow}>
        <IconButton icon="chevronLeft" label="Previous day" onPress={step(-MS_DAY)} size={40} />
        <View style={styles.dtLabel}>
          <Icon name="calendar" size={16} color={palette.inkMuted} />
          <Text style={type.bodyStrong} numberOfLines={1}>{formatDate(ts)}</Text>
        </View>
        <IconButton icon="chevronRight" label="Next day" onPress={step(MS_DAY)} size={40} />
      </View>
      <View style={styles.dtRow}>
        <IconButton icon="chevronLeft" label="15 minutes earlier" onPress={step(-15 * 60_000)} size={40} />
        <View style={styles.dtLabel}>
          <Icon name="clock" size={16} color={palette.inkMuted} />
          <Text style={[type.bodyStrong, { fontVariant: ["tabular-nums"] }]}>{timeLabel(ts)}</Text>
        </View>
        <IconButton icon="chevronRight" label="15 minutes later" onPress={step(15 * 60_000)} size={40} />
      </View>
      {future ? <Text style={[type.caption, { color: palette.warning, textAlign: "center" }]}>That's in the future — tap “Now” to reset.</Text> : null}
      <Tappable label="Set to now" sound="pop" onPress={() => { feedback("pop", "light"); onChange(nowTs()); }} style={styles.nowChip}>
        <Text style={[type.label, { color: palette.primary }]}>Set to now</Text>
      </Tappable>
    </View>
  );
}

const styles = StyleSheet.create({
  backRow: { flexDirection: "row", alignItems: "center", gap: space.sm, marginBottom: space.xs },
  keypad: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: space.sm },
  // Taller keys (56dp, comfortably above the 48dp min) so the four rows read as a generous, easy-to-hit
  // pad rather than a cramped grid — the Snap/Pick CTAs collapse while the keypad is open to make room.
  key: { width: "31.5%", height: 56, borderRadius: radius.md, backgroundColor: palette.surfaceAlt, alignItems: "center", justifyContent: "center" },
  // The backspace/function key: a hairline-bordered surface cap so it reads as "not a digit".
  keyFn: { borderWidth: 1, borderColor: palette.border },
  keyIconWrap: { width: 24, height: 24 },
  keyIconCenter: { alignItems: "center", justifyContent: "center" },
  keyText: { fontFamily: type.hero.fontFamily, fontSize: 24, color: palette.ink, fontVariant: ["tabular-nums"] },
  ctxWrap: { position: "relative" },
  ctxRow: { flexDirection: "row", gap: space.sm, paddingRight: space.xl },
  // Soft right-edge fade over the scroll row so a chip at the edge reads as "scroll for more",
  // not cropped/broken. Sits on the screen background, so it fades to palette.bg.
  ctxFade: { position: "absolute", right: 0, top: 0, bottom: 0, width: 56 },
  ctxChip: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, justifyContent: "center" },
  autoTag: { backgroundColor: palette.onPrimary + "33", borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 1 },
  autoTagText: { color: palette.onPrimary, fontSize: 10, lineHeight: 14 },
  dtRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
  dtLabel: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm },
  nowChip: { alignSelf: "center", minHeight: 44, paddingHorizontal: 18, borderRadius: radius.pill, backgroundColor: palette.primarySoft, alignItems: "center", justifyContent: "center" },
});
