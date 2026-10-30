import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Linking, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn, FadeInDown, FadeInUp, LinearTransition, ZoomIn } from "react-native-reanimated";
import {
  Button, Card, Confetti, HeroCard, Icon, IconButton, ProgressBar, ProgressRing, Screen, SectionHeader, Segmented, Sheet,
  Tappable, TextField, feedback, gradient, palette, radius, space, toast, tones, type,
} from "../ui";
import { useBannerHeight } from "../modules/layout";
import { useSugar, sugarStore } from "../core/data";
import { useSettings } from "../modules/store";
import { analytics } from "../modules/analytics";
import { notify } from "../modules/notify";
import { remindersFor } from "../core/reminders";
import { scheduleReminder } from "./RemindersScreen";
import {
  activeProfile, autoContext, autoSlot, liveReadings, liveMeals, SLOT_LABEL, CONTEXT_LABEL, type Context,
} from "../core/model";
import {
  addReading, classify, validateReading, latestReading, classifyReading, deleteReading, restoreReading,
  LOW_SAFETY_NOTE, HIGH_SAFETY_NOTE, VERY_HIGH_MGDL,
} from "../core/readings";
import { linkReading, sameMealCandidate, repeatMeal, mealReadings } from "../core/meals";
import { timeInRange, mealLabel, loggingStreak, insightsReady } from "../core/insights";
import { aiRemainingAt } from "../core/pro";
import { formatValue, parseValue, valueWarning, UNIT_LABEL } from "../core/units";
import { setUnit } from "../core/profiles";
import { Keypad, applyKey, ContextPicker, DateTimeField, nowTs, formatDate, formatDateTime, levelTone, levelColor, levelIcon } from "./shared";

const LINK_WINDOW = 4 * 3_600_000;
/** Days-logged counts worth a quiet celebration (streak feature only; respects the user's toggle). */
const STREAK_MILESTONES = [3, 7, 14, 30, 60, 90, 180, 365];

/**
 * Reminders the user asked for in onboarding are offered quietly — NEVER stacked
 * over the first save. If notifications are already granted we just schedule them
 * silently in the background; otherwise we surface a small inline card on the Log
 * screen (no dialog, no scrim), and only AFTER the second reading so the first
 * save ends on a single, calm confirmation. One offer per session.
 */
let remindersHandled = false;
/** Schedule silently if already granted; returns true if an in-app ask is still needed. */
async function tryScheduleOrAsk(state: ReturnType<typeof useSugar>): Promise<boolean> {
  const rems = remindersFor(state).filter((r) => r.enabled);
  if (!rems.length) return false;
  if (await notify.granted()) {
    for (const r of rems) await scheduleReminder(r);
    return false;
  }
  return true;
}

/** Home: big keypad glucose logging in ~5 seconds, same-meal-as-yesterday, today's log. */
export function LogScreen({ bottomInset, onPro, onLogMeal }: { bottomInset: number; onPro: (from: string) => void; onLogMeal: (snap?: boolean) => void }) {
  void onPro;
  const data = useSugar();
  const settings = useSettings();
  const insets = useSafeAreaInsets();
  const banner = useBannerHeight();
  const { width: screenW } = useWindowDimensions();
  const profile = activeProfile(data);
  const unit = profile.unit;

  const [raw, setRaw] = useState(""); // what the user typed, in their unit
  const [ctx, setCtx] = useState<Context>(() => autoContext(nowTs()));
  const [ctxTouched, setCtxTouched] = useState(false);
  const [ts, setTs] = useState(() => nowTs());
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [whenOpen, setWhenOpen] = useState(false);
  const [celebrate, setCelebrate] = useState(0);
  const [saveTick, setSaveTick] = useState(0);
  // Drives the Save button's satisfying commit moment: idle → spinner ("Saving…") → check
  // ("Saved") → idle, so the core action is unmistakably confirmed right where the finger is.
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const saveTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [showRemindCard, setShowRemindCard] = useState(false);
  // A persistent "Reminders are off" banner: the user set a reminder in onboarding (or Reminders) but
  // the OS notification permission is off (e.g. they tapped "Don't allow"), so the promised nudge would
  // silently never fire. We detect that (reminders enabled AND permission not granted) and surface a
  // banner with a one-tap re-ask + a fall-back to the system Settings — never leave the promise broken.
  const [remindersBlocked, setRemindersBlocked] = useState(false);
  // True a short beat after the LAST keystroke: the "Min 20 mg/dL" range notice waits for the user to
  // STOP typing (and for ≥2 digits) so a mid-typed "1" never flashes what reads like an error.
  const [typingSettled, setTypingSettled] = useState(false);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The numeric keypad is COLLAPSED on open so the first screen is calm and reads as two clear,
  // distinct jobs — the glucose hero card (tap to log a number) and the "Snap your plate" card —
  // instead of a keypad that takes over the whole screen. Tapping the hero expands it; it also
  // counts as expanded the instant a digit is entered, and collapses again right after a save.
  const [padOpen, setPadOpen] = useState(false);
  // Measured height of the pinned Save bar so the scroll content reserves exactly enough room
  // below it — the keypad card and its hint line can never be clipped behind the bar, on any
  // phone size or button scale. Seeded with a safe estimate for the first frame.
  const [saveBarH, setSaveBarH] = useState(84);
  // Transient "Saved" hero state so the core action ends on a clear, visible result
  // (value + status) anchored to the hero card — not a badge over the keypad. Clears a moment later.
  const [saved, setSaved] = useState<null | { value: string; label: string; tone: ReturnType<typeof levelTone> }>(null);
  // A LASTING save confirmation + next step: after a reading is saved we show a persistent,
  // range-coloured "Logged 95 mg/dL · in range" card (it does not auto-dismiss, so the payoff is
  // unmistakable in a still frame) until the user starts a new reading or dismisses it.
  const [justSaved, setJustSaved] = useState<null | { valueLabel: string; rangeLabel: string; color: string }>(null);
  // A calm, DISMISSIBLE wellness note shown after saving a reading that is low (at/under the user's
  // low threshold) or very high. No dosing or treatment advice — it points to the user's own care plan.
  // It stays until dismissed or a new reading is started, so a hypoglycaemic reading never passes with
  // just a bare "Low" badge (a trust + Play Health requirement).
  const [safety, setSafety] = useState<null | { note: string; tone: "danger" | "warning" }>(null);
  // The unit chip opens a small sheet that shows a live mg/dL ⇄ mmol/L conversion and lets the user
  // pick — clearer than a pill that silently flips the unit with one tap.
  const [unitSheet, setUnitSheet] = useState(false);

  // The keypad block (time + context + keys + Save bar) is shown only when the user has chosen to
  // enter a number — tapping the hero, or the moment a digit lands. Otherwise the home stays calm.
  const padExpanded = padOpen || !!raw;
  // Opening the keypad to log another reading dismisses the previous "Logged …" confirmation, so the
  // follow-up card never lingers above a fresh entry.
  const openPad = () => { feedback("pop", "light"); setJustSaved(null); setSafety(null); setPadOpen(true); };
  // The calm "just saved" home: the lasting confirmation card is up and the user hasn't started a new
  // reading. In this state we show ONE meal entry point (the follow-up card's "Add a meal") and hide
  // the standalone "Snap your plate" card + the "Log a meal" link, so a meal action isn't offered
  // three times over on the screen people repeat every day.
  const postSave = !!justSaved && !raw;

  // Keep context following the clock until the user picks one.
  const effectiveCtx = ctxTouched ? ctx : autoContext(ts);
  const typedMgdl = raw ? parseValue(raw, unit) : null;
  // Only classify once the value is plausible — avoids a "Low" flag flashing on a
  // partial entry like "1" or "11" (below ~1.1 mmol / 20 mg/dL is mid-typing).
  const typedPlausible = typedMgdl != null && typedMgdl >= 20;
  const liveLevel = typedPlausible ? classify(typedMgdl as number, effectiveCtx, profile) : null;

  // Derived from the (possibly large) dataset — memoised on `data` so typing a
  // digit re-renders the keypad WITHOUT re-scanning every reading each keystroke
  // (keeps soak jank + GC churn down).
  const latest = useMemo(() => latestReading(data), [data]);
  const today = Math.floor(nowTs() / 86_400_000);
  const todays = useMemo(
    () => liveReadings(data).filter((r) => Math.floor(r.ts / 86_400_000) === today).reverse(),
    [data, today],
  );
  const todayCount = todays.length;
  const tirToday = useMemo(() => timeInRange(data, nowTs(), 1), [data]);

  const slot = autoSlot(nowTs());
  const sameMeal = useMemo(() => sameMealCandidate(data, slot, nowTs()), [data, slot]);

  // Progress toward the first personal food insight (rice-vs-roti etc. needs ≥3 meals each with an
  // after-reading). New users would otherwise wait days with nothing to return for — this card shows
  // how close they are and the one action that advances it, so there's a reason to come back.
  const insight = useMemo(() => insightsReady(data, 3), [data]);
  const everLogged = useMemo(() => liveReadings(data).length > 0, [data]);
  // The weekly return-hook card is hidden right after a save (the follow-up card already owns that
  // moment) so the just-saved screen stays to one clear next step.
  const showWeekly = !raw && everLogged && !insight.ready && !justSaved;

  // Each keystroke restarts the "settled" timer, so the range notice only appears once the user pauses.
  const bumpTyping = () => {
    setTypingSettled(false);
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => setTypingSettled(true), 850);
  };
  const setKey = (k: string) => { if (justSaved) setJustSaved(null); if (safety) setSafety(null); setRaw((r) => applyKey(r, k)); bumpTyping(); };
  const del = () => { setRaw((r) => r.slice(0, -1)); bumpTyping(); };

  const commit = (mgdl: number, force: boolean) => {
    // Captured BEFORE the save so the very first reading gets a (restrained) welcome celebration.
    const firstEver = liveReadings(data).length === 0;
    const res = addReading(data, { valueMgdl: mgdl, ts, context: effectiveCtx, note: note.trim() }, nowTs(), force);
    if (res.error || !res.id) {
      feedback("error", "error");
      return;
    }
    const savedId = res.id; // narrowed here; keep it for the undo closure below
    // Attach to a recent meal still missing an after-reading (F3).
    let next = res.state;
    const meal = liveMeals(next)
      .filter((m) => Math.abs(ts - m.ts) <= LINK_WINDOW && liveReadings(next).filter((r) => r.mealId === m.id).length < 2)
      .sort((a, b) => a.ts - b.ts)
      .pop();
    if (meal) next = linkReading(next, res.id, meal.id, nowTs());
    sugarStore.set(next);
    analytics.track("core_action", { feature: "glucose_logged" });
    analytics.track("glucose_logged");
    const lvl = classify(mgdl, effectiveCtx, profile);
    // Quiet celebration on a genuine milestone: a meal's before+after loop closing,
    // or a new logging-streak marker (only if the user keeps the streak on). Otherwise a calm confirm.
    const loopClosed = meal ? (() => { const mr = mealReadings(next, meal.id); return !!(mr.before && mr.after); })() : false;
    const firstToday = todayCount === 0;
    const newStreak = loggingStreak(next, nowTs());
    const streakMilestone = firstToday && STREAK_MILESTONES.includes(newStreak);
    const milestone = loopClosed
      ? "Meal loop complete — before & after linked"
      : streakMilestone
        ? `${newStreak}-day logging streak`
        : null;
    const savedLabel = `${formatValue(mgdl, unit)} ${UNIT_LABEL[unit]}`;
    const undo = { label: "Undo", onPress: () => { sugarStore.set((s) => deleteReading(s, savedId, nowTs())); feedback("pop", "warning"); } };
    feedback("success", "success");
    // Confetti is reserved for genuinely positive milestones in a MEDICAL context — the very first
    // reading or a logging-streak marker — and ONLY when that reading is in range. A burst over a high
    // or (especially) a low reading is off-tone and alarming, so an out-of-range value always gets the
    // calm check + wellness note instead, never celebration. A routine meal loop closing is confirmed
    // in the toast, not with confetti. Respects reduced-motion and never covers the meal CTAs below.
    if ((firstEver || streakMilestone) && lvl.level === "in_range") setCelebrate((n) => n + 1);
    if (milestone) {
      toast(`Saved ${savedLabel} · ${milestone}`, undo);
    } else {
      // Name the reading back to the user WITH its range ("Saved 118 mg/dL · in range") so the
      // confirmation is concrete and unmistakable, plus the meal link when one was attached.
      const linkedMsg = meal ? ` · linked to ${mealLabel(meal)}` : "";
      toast(`Saved ${savedLabel} · ${lvl.label.toLowerCase()}${linkedMsg}`, undo);
    }
    setSaved({ value: formatValue(mgdl, unit), label: lvl.label, tone: levelTone(lvl.level) });
    setJustSaved({ valueLabel: savedLabel, rangeLabel: lvl.label, color: levelColor(lvl.level) });
    // A low (at/under the user's low threshold) or very-high reading gets a calm, dismissible wellness
    // card after saving — never dosing advice, never hidden behind a bare badge.
    setSafety(lvl.unsafeLow ? { note: LOW_SAFETY_NOTE, tone: "danger" } : mgdl >= VERY_HIGH_MGDL ? { note: HIGH_SAFETY_NOTE, tone: "warning" } : null);
    setSaveTick((n) => n + 1); // drives the transient "Saved" hero + check-pop animation
    // No stock Alert for a low/high reading — the inline styled warning under the
    // keypad already covers it, and a calm "Saved" confirmation should stand alone.
    setRaw("");
    setNote("");
    setShowNote(false);
    setCtxTouched(false);
    setTs(nowTs());
    setPadOpen(false); // collapse back to the calm home so the "Saved · add your meal" payoff is front and centre
    // Reminders are offered quietly, never stacked over this save: schedule silently
    // if already granted, otherwise surface a small inline card — and only from the
    // SECOND reading on, so the first save ends on one clean confirmation.
    if (!remindersHandled) {
      const total = liveReadings(next).length;
      void (async () => {
        const needAsk = await tryScheduleOrAsk(next);
        if (!needAsk) { remindersHandled = true; return; } // granted & scheduled, or nothing to ask
        if (total >= 2) { remindersHandled = true; setShowRemindCard(true); }
      })();
    }
  };

  // The happy path ends on an IMMEDIATE, satisfying moment: the reading is committed the instant Save
  // is pressed (no artificial delay that felt like lag), firing a success haptic and flipping the button
  // to a green "✓ Saved" at the finger, while the keypad collapses to reveal the lasting, range-coloured
  // "Logged 95 mg/dL · in range" card + the hero's check — so the save never passes without a clear result.
  const runSave = (mgdl: number) => {
    if (saveState !== "idle") return;
    setSaveState("saved");
    commit(mgdl, false);
    saveTimers.current.push(setTimeout(() => setSaveState("idle"), 1200));
  };

  const save = () => {
    if (!raw || saveState !== "idle") return;
    const mgdl = parseValue(raw, unit);
    if (mgdl == null) { feedback("error", "error"); return; } // incomplete number — wait for more input
    if (validateReading({ valueMgdl: mgdl, ts })) {
      const warn = valueWarning(mgdl, unit);
      feedback("pop", "warning");
      Alert.alert(
        "Check this value",
        warn === "wrong_unit"
          ? `That looks unusual for ${UNIT_LABEL[unit]}. Save it anyway?`
          : `${raw} ${UNIT_LABEL[unit]} is outside the usual range. Save it anyway?`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Save anyway", onPress: () => commit(mgdl, true) },
        ],
      );
      return;
    }
    const warn = valueWarning(mgdl, unit);
    if (warn) {
      feedback("pop", "warning");
      Alert.alert(
        "Check this value",
        warn === "wrong_unit" ? `Did you mean ${UNIT_LABEL[unit === "mgdl" ? "mmol" : "mgdl"]}? Save ${raw} ${UNIT_LABEL[unit]} anyway?` : `Save ${raw} ${UNIT_LABEL[unit]} anyway?`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Save anyway", onPress: () => commit(mgdl, true) },
        ],
      );
      return;
    }
    runSave(mgdl);
  };

  // Clear any pending save-transition / typing-settle timers on unmount.
  useEffect(() => () => { saveTimers.current.forEach(clearTimeout); if (settleTimer.current) clearTimeout(settleTimer.current); }, []);

  // Watch for the "reminders promised but notifications denied" state so the Log banner can offer to
  // turn them back on. Re-checked whenever the data (and thus the enabled reminders) changes.
  useEffect(() => {
    let alive = true;
    const enabled = remindersFor(data).some((r) => r.enabled);
    if (!enabled) { setRemindersBlocked(false); return; }
    void notify.granted().then((g) => { if (alive) setRemindersBlocked(!g); });
    return () => { alive = false; };
  }, [data]);

  // Re-ask for notification permission from the banner; if the user has permanently denied it (the ask
  // returns false without a dialog), fall back to opening the system Settings so they can flip it on.
  const enableRemindersFromBanner = async () => {
    const ok = await notify.ask("Reminders stay on your device — a gentle nudge to check your glucose.");
    if (ok) {
      for (const r of remindersFor(data).filter((r) => r.enabled)) await scheduleReminder(r);
      setRemindersBlocked(false);
      feedback("success", "success");
      toast("Reminders on");
    } else {
      toast("Turn on notifications for Sugar Plate in Settings");
      Linking.openSettings().catch(() => {});
    }
  };

  const enableReminders = async () => {
    setShowRemindCard(false);
    const rems = remindersFor(data).filter((r) => r.enabled);
    const ok = await notify.ask("Reminders stay on your device.");
    if (ok) {
      for (const r of rems) await scheduleReminder(r);
      toast("Reminders on");
    } else {
      toast("No problem — turn them on anytime in Reminders");
    }
  };

  const pickUnit = (u: typeof unit) => {
    if (u === unit) { setUnitSheet(false); return; }
    feedback("pop", "select");
    sugarStore.set(setUnit(data, u));
    analytics.track("unit_toggled");
    setRaw(""); // avoid reinterpreting the half-typed number in a new unit
    setUnitSheet(false);
  };

  const repeatSame = () => {
    if (!sameMeal) return;
    const res = repeatMeal(data, sameMeal.id, nowTs());
    if (!res.id) return;
    sugarStore.set(res.state);
    feedback("success", "success");
    analytics.track("core_action", { feature: "meal_repeat" });
    analytics.track("meal_repeat_used");
    toast(`Logged ${SLOT_LABEL[slot].toLowerCase()}: ${mealLabel(sameMeal)}`);
  };

  const display = raw || (latest ? formatValue(latest.valueMgdl, unit) : "—");
  const showSaved = !!saved && !raw;
  // The hero carries a status pill only once there's something to say (typing, just-saved, or a
  // previous reading). On first run it is omitted so the card reads as a clean invitation. When a
  // pill is present its slot keeps the height steady across the typing ↔ saved ↔ latest states.
  // The pill shows ONE meaningful status — the live classification once the value is complete
  // (In range / High / Low), the saved result, or the latest reading's level. While the value is
  // still incomplete it shows nothing (the single typing hint lives under the keypad instead, so
  // the message is never duplicated). Its height is always reserved so the card never jumps.
  const latestLevel = latest ? classifyReading(latest, profile) : null;
  const heroStatus: { label: string; tone: ReturnType<typeof levelTone> } | undefined = raw
    ? liveLevel
      ? { label: liveLevel.label, tone: levelTone(liveLevel.level) }
      : undefined
    : showSaved
      ? { label: "Saved", tone: saved!.tone }
      : latestLevel
        ? { label: latestLevel.label, tone: levelTone(latestLevel.level) }
        : undefined;

  // Time-in-range % only means something with a few readings — until then the ring shows
  // today's reading count (never a misleading "100% in range" from a single reading).
  const tirReady = tirToday.total >= 3;
  const ringValue = tirReady ? tirToday.pctInRange / 100 : Math.min(todayCount, 3) / 3;
  const ringLabel = tirReady ? `${tirToday.pctInRange}%` : String(todayCount);
  const ringSub = tirReady ? "in range" : todayCount === 1 ? "reading" : "today";

  // Mounted idle; only rebuilds when a milestone fires, so the keypad's per-tap
  // re-renders never touch the Skia canvas (avoids soak-ANR from redrawing it).
  // Constrained to a top band over the hero (height 320, origin near the hero) and a smaller count,
  // so the burst stays on the hero and never rains over the "Snap your plate" / "Log meal" CTAs
  // below. Confetti disables itself entirely under OS reduce-motion.
  const confetti = useMemo(
    () => <Confetti trigger={celebrate} count={26} origin={{ x: screenW / 2, y: 150 }} style={styles.confettiBand} />,
    [celebrate, screenW],
  );

  // Hold the transient "Saved" hero state briefly, then fall back to the normal
  // latest-reading view (which now shows the reading we just logged).
  useEffect(() => {
    if (!saveTick) return;
    const t = setTimeout(() => setSaved(null), 1800);
    return () => clearTimeout(t);
  }, [saveTick]);

  // The valid input window shown as a calm hint under the keypad.
  const rangeHint = unit === "mmol" ? "Range 1.1–33.3 mmol/L" : "Range 20–600 mg/dL";
  const rangeOnly = rangeHint.replace("Range ", "");
  const minLabel = unit === "mmol" ? "Min 1.1 mmol/L" : "Min 20 mg/dL";
  const maxLabel = unit === "mmol" ? "Max 33.3 mmol/L" : "Max 600 mg/dL";
  // Something is typed but it's still under the minimum (e.g. "9").
  const belowRange = !!raw && !typedPlausible;
  // How many DIGITS have been entered (ignoring a decimal point). A sub-minimum value only shows the
  // range NOTICE once there are ≥2 digits AND the user has stopped typing — so a mid-typed single "1"
  // reads as a calm "keep going" hint, never a red-flag error the moment the first key lands.
  const digitCount = raw.replace(/[^0-9]/g, "").length;
  const showMinNotice = belowRange && digitCount >= 2 && typingSettled;
  // Above the saveable ceiling (e.g. a typo like "7000") — we tint the figure amber as a warning.
  const aboveRange = typedMgdl != null && typedMgdl > 600;
  // Free AI photo-analysis count remaining today, shown on the "Snap your plate" card so the quota is
  // honest BEFORE the user taps (reviewers flagged the hidden free-photo quota).
  const aiLeft = aiRemainingAt(data, settings.pro, nowTs());

  // The Save button reads its state plainly: the exact value once it's ready ("Save 147 mg/dL"), and
  // while it waits it simply says "Save" in a soft, clearly-inactive state — the valid window lives in
  // the helper line under the keypad, not baked into the CTA (a disabled "Enter 20–600 mg/dL" read as a
  // confusing instruction, not a button). The waiting fill is a soft on-brand green, not a dead grey block.
  const saveLabel = typedPlausible ? `Save ${raw} ${UNIT_LABEL[unit]}` : "Save";

  // Functional store update + stable identity so memoising the Today list below doesn't re-create it
  // (and re-run its layout animations) on every keypad tap.
  const removeReading = useCallback((id: string) => {
    sugarStore.set((s) => deleteReading(s, id, nowTs()));
    feedback("pop", "warning");
    toast("Reading deleted", { label: "Undo", onPress: () => sugarStore.set((s) => restoreReading(s, id, nowTs())) });
  }, []);

  // Today's readings as a memoised subtree: typing a digit changes `raw` and re-renders LogScreen, but
  // this list only depends on the data — keeping it out of the per-keystroke render path cuts soak jank.
  const todayList = useMemo(
    () => (
      <View style={{ gap: space.sm }}>
        {todays.map((r) => {
          const lvl = classifyReading(r, profile);
          const c = levelColor(lvl.level);
          return (
            <Animated.View key={r.id} layout={LinearTransition.duration(180)}>
              <Card padded={false} style={styles.readingCard} accent={c}>
                <View style={[styles.levelDot, { backgroundColor: c + "22" }]}>
                  <Icon name={levelIcon(lvl)} size={18} color={c} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={type.bodyStrong}>{CONTEXT_LABEL[r.context]} · {lvl.label}</Text>
                  <Text style={type.caption} numberOfLines={1}>
                    {timeOnly(r.ts)}{r.note ? ` · ${r.note}` : ""}{r.mealId ? " · linked" : ""}
                  </Text>
                </View>
                <Text style={[type.number, { fontSize: 22, color: palette.ink }]}>{formatValue(r.valueMgdl, unit)}</Text>
                {/* A quiet, small delete — grey, not a red danger beacon beside the value — so it never
                    invites an accidental tap. The toast still offers a 10-second Undo. */}
                <IconButton icon="trash" label="Delete reading" size={32} onPress={() => removeReading(r.id)} />
              </Card>
            </Animated.View>
          );
        })}
      </View>
    ),
    [todays, profile, unit, removeReading],
  );

  return (
    <>
      <Screen
        title="Log"
        subtitle={formatDate(nowTs())}
        // Reserve room for the pinned Save bar only while the keypad is open, plus a generous extra
        // (space.xl) so the keypad card's "Add a note" row always clears the bar — it is never clipped
        // behind it at rest on any phone size or button scale.
        bottomInset={bottomInset + (padExpanded ? saveBarH + space.xl : space.md)}
        right={
          <Tappable label={`Units: ${UNIT_LABEL[unit]}. Tap to change and see the conversion`} role="button" sound="pop" onPress={() => { feedback("pop", "light"); setUnitSheet(true); }} style={styles.unitChip}>
            <Text style={[type.label, { color: palette.inkSoft, fontSize: 11 }]}>UNITS</Text>
            <Text style={[type.bodyStrong, { color: palette.primary }]}>{UNIT_LABEL[unit]}</Text>
            <Icon name="chevronRight" size={14} color={palette.primary} />
          </Tappable>
        }
      >
        {(() => {
          // The glucose hero IS the entry card. Collapsed (the default home), it invites a tap that
          // opens the keypad — so the two jobs read as two distinct cards (this teal hero to log a
          // number, the white "Snap your plate" card to log food) rather than one screen taken over
          // by a keypad. Expanded, it shows the number being typed with its live range.
          const card = (
            <HeroCard
              style={styles.hero}
              overline={raw ? "New reading" : showSaved ? "Saved" : latest ? "Latest reading" : "Your glucose"}
              value={raw ? `${display}` : showSaved ? saved!.value : latest ? display : "—"}
              animateValue
              // While typing, the figure reads as a live measurement: a smaller unit suffix and a
              // blinking caret. Only an unusually HIGH value (e.g. a "7000" typo) tints amber — a value
              // still climbing past the minimum (a mid-typed "1"→"11"→"118") is a normal in-progress
              // entry, so tinting it amber / flagging "too low" there read as an alarming false error.
              valueColor={raw && aboveRange ? palette.warning : undefined}
              // Keep the unit label on the figure both while typing AND right after a save — the saved
              // hero used to drop it, so "110 mg/dL" briefly became a bare "110" (reviewer: "the unit
              // disappears after save"). The latest-reading figure carries it in its caption instead.
              valueSuffix={raw || showSaved ? UNIT_LABEL[unit] : undefined}
              valueCaret={!!raw}
              captionLines={1}
              caption={
                raw
                  ? aboveRange
                    ? `Unusually high · max ${unit === "mmol" ? "33.3" : "600"}`
                    : // A still-incomplete value (e.g. a mid-typed "1") is NOT out of range — showing
                      // "Keep typing · 20–600" there read as a warning. Keep the hero calm with just the
                      // meal context; the valid window lives once, neutrally, under the keypad instead.
                      CONTEXT_LABEL[effectiveCtx]
                  : showSaved
                    ? `${saved!.label} · just now`
                    : !padExpanded
                      ? latest ? "Tap to log another reading" : "Tap to log your first reading"
                      : latest
                        ? `${CONTEXT_LABEL[latest.context]} · ${formatDateTime(latest.ts)}`
                        : "Type your reading, e.g. 112"
              }
              status={heroStatus}
              reserveStatus
              right={
                // ONE visual per state, never duplicating the "Snap your plate" card below: the saved
                // check right after a save, a live range disc while a valid value is being typed (the
                // colour the Save button also takes), a clear "+" add disc while collapsed (so the tap
                // target is unmistakable), and the day's progress ring once the keypad is open.
                showSaved ? (
                  <SavedCheck key={saveTick} />
                ) : liveLevel ? (
                  <RangeDisc key={liveLevel.level} level={liveLevel} />
                ) : !padExpanded ? (
                  <AddDisc />
                ) : latest ? (
                  <ProgressRing
                    value={ringValue}
                    size={88}
                    stroke={10}
                    color={gradient.onHero}
                    track={gradient.pill}
                    labelColor={gradient.onHero}
                    label={ringLabel}
                    sublabel={ringSub}
                  />
                ) : null
              }
            />
          );
          return padExpanded ? (
            card
          ) : (
            // The whole glucose card is the tap target. It now responds unmistakably: a clear press
            // scale (~0.97) plus a brightening overlay that fades in across the gradient (an Android
            // ripple sits behind the gradient and barely shows, so the overlay IS the visible pressed
            // state here) — fixing the "card shifts ~1px, no pressed state" finding.
            <Tappable
              label={latest ? "Log another glucose reading. Opens the keypad" : "Log your first glucose reading. Opens the keypad"}
              role="button"
              sound="pop"
              scale={0.97}
              pressOverlay="rgba(255,255,255,0.22)"
              overlayRadius={radius.xl}
              ripple="rgba(255,255,255,0.18)"
              onPress={openPad}
            >
              {card}
            </Tappable>
          );
        })()}

        {/* Lasting save confirmation + next step — stays on screen (does not auto-dismiss) so the
            core-action payoff is always visible. It fades in in place (opacity only, no downward
            slide) directly under the fixed-height hero, so the content below never lurches. ONE clear
            next action: "Add a meal" opens the meal sheet (where Snap / dish search / same-as-
            yesterday all live), so the plate action isn't repeated three times on this screen. */}
        {postSave ? (
          <Animated.View entering={FadeIn.duration(200)}>
            {/* The saved VALUE + range already lives once on the hero above (and in the toast + today's
                row) — so this follow-up card no longer repeats "Logged 110 · in range". It carries ONE
                job: the next action. A subtle success check ties it to the save that just happened. */}
            <Card style={styles.nextStepCard} accent={justSaved!.color}>
              <View style={styles.nextStepRow}>
                <Animated.View entering={ZoomIn.springify().damping(12).stiffness(170)} style={[styles.nextStepCheck, { backgroundColor: justSaved!.color + "22" }]}>
                  <Icon name="check" size={22} color={justSaved!.color} />
                </Animated.View>
                <View style={{ flex: 1 }}>
                  <Text style={type.bodyStrong} numberOfLines={1}>Saved — what did you eat?</Text>
                  <Text style={[type.caption, { fontSize: 14, color: palette.inkSoft }]} numberOfLines={2}>Add your meal to see its carbs and glycemic impact.</Text>
                </View>
                <IconButton icon="close" label="Dismiss" size={36} onPress={() => setJustSaved(null)} />
              </View>
              <Button label="Add a meal" size="sm" icon="meal" onPress={() => { setJustSaved(null); onLogMeal(false); }} />
            </Card>
          </Animated.View>
        ) : null}

        {/* Wellness safety note for a low / very-high reading — a calm, dismissible card (no dosing or
            treatment advice, points to the user's own care plan). It stays until the user dismisses it
            or starts a new reading, so a hypoglycaemic reading is never confirmed with just a badge. */}
        {safety ? (
          <Animated.View entering={FadeIn.duration(200)}>
            <Card style={{ ...styles.safetyCard, borderColor: tones[safety.tone].fg, backgroundColor: tones[safety.tone].bg }}>
              <View style={styles.safetyRow}>
                <Icon name="info" size={20} color={tones[safety.tone].fg} />
                <Text style={[type.bodyStrong, { flex: 1, color: tones[safety.tone].fg }]}>
                  {safety.tone === "danger" ? "Low reading" : "High reading"}
                </Text>
                <IconButton icon="close" label="Dismiss safety note" size={36} onPress={() => setSafety(null)} />
              </View>
              <Text style={[type.caption, { color: palette.ink }]}>{safety.note}</Text>
            </Card>
          </Animated.View>
        ) : null}

        {/* Reminders promised but notifications are off (e.g. the user tapped "Don't allow"): a calm,
            persistent banner so the broken promise is never silent. One tap re-asks; a hard denial
            falls back to opening the system Settings. */}
        {remindersBlocked ? (
          <Card style={styles.remindCard}>
            <View style={styles.remindRow}>
              <View style={styles.remindIconWarn}><Icon name="bell" size={18} color={palette.warning} /></View>
              <View style={{ flex: 1 }}>
                <Text style={type.bodyStrong}>Reminders are off</Text>
                <Text style={[type.caption, { color: palette.inkSoft }]} numberOfLines={3}>
                  You set a reminder, but notifications are turned off for Sugar Plate — so it can't nudge you. Turn them on to get your check-in.
                </Text>
              </View>
            </View>
            <View style={styles.remindActions}>
              <Button label="Turn on" size="sm" icon="bell" onPress={enableRemindersFromBanner} />
              <Button label="Not now" size="sm" variant="ghost" onPress={() => setRemindersBlocked(false)} />
            </View>
          </Card>
        ) : null}

        {/* Two EQUAL-WEIGHT ways to log food, so the offline dish picker (the main value for the target
            audience, and a must for low-data users / home cooks) stands next to the photo hero instead
            of being buried in a faint text link. Hidden in the just-saved state (the follow-up card
            offers the one meal action) and while the keypad is open (so the keys get the room). */}
        {!postSave && !padExpanded ? (
          <View style={styles.mealRow}>
            <Tappable
              label="Snap your plate — estimate carbs and glycemic impact from a photo"
              role="button"
              sound="pop"
              onPress={() => onLogMeal(true)}
              style={[styles.mealCta, styles.mealCtaPrimary]}
            >
              <View style={styles.snapIcon}><Icon name="camera" size={22} color={palette.onPrimary} /></View>
              <Text style={[type.bodyStrong, styles.mealCtaTitle]} numberOfLines={1}>Snap your plate</Text>
              <Text style={[type.caption, styles.mealCtaSub]} numberOfLines={1}>Carbs from a photo</Text>
              {/* Honest free-quota count right on the camera card (free users get 3 AI analyses a day). */}
              <Text style={[type.caption, { color: settings.pro ? palette.primary : aiLeft > 0 ? palette.primary : palette.inkMuted }]} numberOfLines={1}>
                {settings.pro ? "Unlimited with Pro" : `${aiLeft}/3 free today`}
              </Text>
            </Tappable>
            <Tappable
              label="Pick a dish — choose from the offline food list, no photo needed"
              role="button"
              sound="pop"
              onPress={() => onLogMeal(false)}
              style={styles.mealCta}
            >
              <View style={styles.mealCtaIcon}><Icon name="meal" size={22} color={palette.primary} /></View>
              <Text style={[type.bodyStrong, styles.mealCtaTitle]} numberOfLines={1}>Pick a dish</Text>
              <Text style={[type.caption, styles.mealCtaSub]} numberOfLines={2}>Offline food list</Text>
            </Tappable>
          </View>
        ) : null}

        {/* The keypad is the fast manual path — revealed only once the user taps the hero to log a
            number, so it never takes over the first screen. A compact time + context row sits above it.
            It fades+slides in (~160ms) so the tap visibly EXPANDS the card into the entry state instead
            of the keys snapping in with no in-between frame. (No `key` → not a remounting container.) */}
        {padExpanded ? (
        <Animated.View entering={FadeInDown.duration(160)} style={styles.entryGroup}>
          <View style={styles.metaRow}>
            <Tappable label={`Time: ${formatDateTime(ts)}. Tap to change`} role="button" sound="pop" onPress={() => setWhenOpen(true)} style={styles.whenChip}>
              <Icon name="clock" size={16} color={palette.inkSoft} />
              <Text style={type.label} numberOfLines={1}>{formatDateTime(ts)}</Text>
            </Tappable>
          </View>
          <ContextPicker value={effectiveCtx} auto={!ctxTouched} onChange={(c) => { setCtx(c); setCtxTouched(true); }} />

          {/* The note field sits ABOVE the keypad, so the sticky Save bar can never cover it (it used
              to live under the keys, where the pinned bar clipped it). Collapsed it's a compact row;
              tapping it reveals the field without pushing the keypad off-screen. */}
          {showNote ? (
            <TextField label="Note (optional)" placeholder="e.g. before a walk, felt dizzy" value={note} onChangeText={setNote} maxLength={1000} multiline />
          ) : (
            <Tappable label="Add a note" sound="pop" onPress={() => setShowNote(true)} style={styles.addNoteRow}>
              <Icon name="edit" size={16} color={palette.inkSoft} />
              <Text style={type.label}>Add a note</Text>
            </Tappable>
          )}

          <Card padded={false} style={styles.keypadCard}>
            <Keypad onKey={setKey} onDelete={del} onClear={() => setRaw("")} decimal={unit === "mmol"} unitLabel={UNIT_LABEL[unit]} />
          {/* Always-reserved status slot: the card height never changes between the empty,
              mid-typing and complete states (fixes the first-digit jump). A low/high note
              appears ONLY once a complete value is entered — never beside "Keep typing" — and
              its text uses the tone's AA-contrast ink on the card surface (no orange-on-pink). */}
          <View style={styles.statusSlot}>
            {!raw ? (
              <Text style={[type.caption, { color: palette.inkMuted, flex: 1 }]}>Type your reading, e.g. 112 — {rangeHint}.</Text>
            ) : belowRange ? (
              showMinNotice ? (
                // Only once the user has entered ≥2 digits AND paused do we name the floor ("Min 20
                // mg/dL") — so it reads as helpful guidance on a finished-looking entry, not an error
                // flashed under a half-typed number.
                <>
                  <Icon name="info" size={16} color={palette.inkSoft} />
                  <Text style={[type.caption, { color: palette.inkSoft, flex: 1 }]}>{minLabel} — enter a value in {rangeOnly}.</Text>
                </>
              ) : (
                // Mid-typing (a single digit, or still tapping): a calm, NEUTRAL grey nudge — never a
                // warning. Just the valid window so the goal is clear.
                <Text style={[type.caption, { color: palette.inkMuted, flex: 1 }]}>Keep going — a reading is {rangeOnly}.</Text>
              )
            ) : aboveRange ? (
              // Over the ceiling: name it, same calm treatment as the floor.
              <>
                <Icon name="info" size={16} color={palette.warning} />
                <Text style={[type.caption, { color: palette.warning, flex: 1 }]}>{maxLabel} — enter a value in {rangeOnly}.</Text>
              </>
            ) : !liveLevel ? (
              // A single, NEUTRAL hint while the value is still incomplete — never "Keep typing…"
              // (which also repeated the hero pill). Just the valid window so the goal is clear.
              <Text style={[type.caption, { color: palette.inkMuted, flex: 1 }]}>{rangeHint}</Text>
            ) : (
              <>
                <Icon name={liveLevel.unsafeLow ? "info" : levelIcon(liveLevel)} size={16} color={tones[levelTone(liveLevel.level)].fg} />
                <Text style={[type.caption, { color: tones[levelTone(liveLevel.level)].fg, flex: 1 }]} numberOfLines={2}>
                  {liveLevel.unsafeLow
                    ? "Low reading — follow your care plan. Wellness info only, not medical advice."
                    : `Looks ${liveLevel.label.toLowerCase()} for ${CONTEXT_LABEL[effectiveCtx].toLowerCase()}`}
                </Text>
              </>
            )}
          </View>
          </Card>
        </Animated.View>
        ) : null}

        {sameMeal ? (
          <Button label={`Same ${SLOT_LABEL[slot].toLowerCase()} as before`} variant="ghost" icon="history" onPress={repeatSame} />
        ) : null}

        {/* Deferred reminder offer: a quiet inline card (no dialog, no scrim), shown only
            from the second reading on. Dismissable; the first save stays uncluttered. */}
        {showRemindCard && !remindersBlocked ? (
          <Animated.View entering={FadeIn.duration(220)}>
            <Card style={styles.remindCard}>
              <View style={styles.remindRow}>
                <View style={styles.remindIcon}><Icon name="bell" size={18} color={palette.primary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={type.bodyStrong}>Turn on your reminder?</Text>
                  <Text style={[type.caption, { color: palette.inkSoft }]}>You asked for a 7:00 fasting nudge in setup. Allow on-device notifications anytime.</Text>
                </View>
              </View>
              <View style={styles.remindActions}>
                <Button label="Turn on" size="sm" icon="bell" onPress={enableReminders} />
                <Button label="Not now" size="sm" variant="ghost" onPress={() => setShowRemindCard(false)} />
              </View>
            </Card>
          </Animated.View>
        ) : null}

        {/* Your plate this week — a gentle return hook that shows how close the user is to their first
            personal insight (rice vs roti, best/worst plates) and the single action that advances it. */}
        {showWeekly ? (
          <Card style={styles.weeklyCard} accent={palette.primary}>
            <View style={styles.weeklyRow}>
              <View style={styles.weeklyIcon}><Icon name="insights" size={18} color={palette.primary} /></View>
              <View style={{ flex: 1 }}>
                <Text style={type.bodyStrong}>Your plate this week</Text>
                <Text style={[type.caption, { color: palette.inkSoft }]} numberOfLines={2}>
                  {insight.have} of {insight.need + insight.have} linked meals toward your first insight — e.g. fasting after rice vs roti dinners.
                </Text>
              </View>
            </View>
            <ProgressBar value={insight.have / (insight.have + insight.need)} tone="primary" />
            <Button label="Link a meal to a reading" size="sm" variant="secondary" icon="meal" onPress={() => onLogMeal(false)} />
          </Card>
        ) : null}

        <SectionHeader title={`Today · ${todayCount} reading${todayCount === 1 ? "" : "s"}`} />
        {todays.length === 0 ? (
          // The empty card only EXPLAINS the two paths (tap the glucose card to log a number, or use the
          // Snap card above for food) — it no longer repeats a second "Snap your plate" button, so the
          // action appears once on the screen.
          <Card>
            <View style={styles.emptyToday}>
              <Icon name="plus" size={22} color={palette.primary} />
              <Text style={[type.body, { color: palette.inkSoft, flex: 1 }]}>Your readings for today appear here. Tap the glucose card above to log a number in about 5 seconds, or snap a photo of your plate to see its carbs and glycemic impact.</Text>
            </View>
          </Card>
        ) : (
          todayList
        )}
      </Screen>

      {/* Pinned Save bar: present only while the keypad is open (disabled until the value is
          plausible, so the layout never jumps and the keypad helper text is never clipped). Sits
          just above the tab bar so Save is always reachable, even on a small phone. When the keypad
          is collapsed there is no Save bar, keeping the home calm. */}
      {padExpanded ? (
      <Animated.View
        entering={FadeInUp.duration(160)}
        style={[styles.saveBar, { bottom: bottomInset + insets.bottom + banner }]}
        onLayout={(e) => setSaveBarH(Math.round(e.nativeEvent.layout.height))}
      >
        <View style={styles.saveBarInner}>
          <Button
            // The save moment reads right on the button: "Saving…" spinner → solid green "✓ Saved"
            // → back to idle. And the instant the value is valid the button leaves its grey disabled
            // state for a SOLID range colour (green in range, amber high, red low) — matching the
            // hero disc + pill — so it is unmistakable both that Save is now active and what the
            // reading's range is. Grey only while the value is still incomplete.
            label={saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : saveLabel}
            size="lg"
            loading={saveState === "saving"}
            // No check icon until the value is valid — a checkmark on a disabled "Enter 2–3 digits"
            // CTA reads as success. Neutral (icon-less) while incomplete, check once it's ready to save.
            icon={saveState === "saved" ? "check" : saveState === "idle" && typedPlausible ? "check" : undefined}
            tone={saveState === "saved" ? "success" : saveState === "idle" && liveLevel ? levelTone(liveLevel.level) : undefined}
            disabled={saveState === "idle" ? !typedPlausible : saveState === "saving"}
            // While it waits for a real value, paint a soft on-brand green with a readable label — reads
            // as "ready and waiting", not a flat grey block that looks broken.
            disabledFill={palette.primarySoft}
            disabledFg={palette.inkSoft}
            onPress={save}
          />
        </View>
      </Animated.View>
      ) : null}

      <Sheet visible={whenOpen} title="When was this reading?" onClose={() => setWhenOpen(false)}>
        <DateTimeField ts={ts} onChange={setTs} />
        <Button label="Done" size="lg" onPress={() => setWhenOpen(false)} />
      </Sheet>

      {/* Units sheet: pick mg/dL or mmol/L and see the same reading in both at once, so the choice is
          concrete (not a silent one-tap flip). The example follows what's typed, else the latest reading. */}
      <Sheet visible={unitSheet} title="Display units" onClose={() => setUnitSheet(false)}>
        <Text style={type.caption}>Choose how your readings show. You can change this anytime — your saved data never changes, only the display.</Text>
        <Segmented
          options={[{ value: "mgdl" as typeof unit, label: "mg/dL" }, { value: "mmol" as typeof unit, label: "mmol/L" }]}
          value={unit}
          onChange={pickUnit}
        />
        {(() => {
          const sampleMgdl = typedPlausible ? (typedMgdl as number) : latest ? latest.valueMgdl : 112;
          return (
            <Card style={styles.unitConvert}>
              <Text style={type.label}>SAME READING, BOTH UNITS</Text>
              <View style={styles.unitConvertRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[type.number, { color: palette.ink }]}>{formatValue(sampleMgdl, "mgdl")}</Text>
                  <Text style={type.caption}>mg/dL</Text>
                </View>
                <Icon name="link" size={18} color={palette.inkMuted} />
                <View style={{ flex: 1, alignItems: "flex-end" }}>
                  <Text style={[type.number, { color: palette.ink }]}>{formatValue(sampleMgdl, "mmol")}</Text>
                  <Text style={type.caption}>mmol/L</Text>
                </View>
              </View>
            </Card>
          );
        })()}
      </Sheet>

      {confetti}
    </>
  );
}

function timeOnly(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

/** Live range disc on the hero while a valid value is being typed: a bold, range-coloured circle
 *  (the same colour the Save button takes) with the level's arrow/check — so "in range / high / low"
 *  is unmistakable at a glance, matched to the status pill and the Save button. */
function RangeDisc({ level }: { level: ReturnType<typeof classify> }) {
  const c = levelColor(level.level);
  return (
    <Animated.View entering={ZoomIn.springify().damping(13).stiffness(170)} style={[styles.rangeDisc, { backgroundColor: c }]} accessibilityLabel={`Looks ${level.label}`}>
      <Icon name={level.unsafeLow ? "arrowDown" : levelIcon(level)} size={30} color={palette.onPrimary} />
      <Text style={[type.label, { color: palette.onPrimary, marginTop: 2 }]} numberOfLines={1}>{level.label}</Text>
    </Animated.View>
  );
}

/** The collapsed hero's add affordance: a soft "+" disc that makes it unmistakable the whole glucose
 *  card is tappable to open the keypad — the clear primary action on the calm home screen. */
function AddDisc() {
  return (
    <View style={styles.addDisc} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Icon name="plus" size={38} color={gradient.onHero} />
    </View>
  );
}

/** The single, calm save confirmation on the hero card: a check that pops in (keyed on each save). */
function SavedCheck() {
  return (
    <Animated.View entering={ZoomIn.springify().damping(12).stiffness(160)} style={styles.savedCheck} accessibilityLabel="Saved">
      <Icon name="check" size={40} color={gradient.onHero} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  unitChip: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 44, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: palette.primarySoft },
  // Compact hero so the keypad's four rows clear the pinned Save bar without scrolling. A fixed min
  // height keeps the card the SAME size across empty → typing → saved → latest, so saving never
  // collapses it into a jarring empty gap (the right-hand disc/ring is ~88–92dp tall either way).
  // overflow:hidden clips the saved-check / confetti burst to the rounded card so the check circle is
  // never drawn past the card edge mid-animation.
  hero: { padding: space.lg, gap: space.md, minHeight: 168, justifyContent: "center", overflow: "hidden" },
  // The time + context + keypad are grouped with tight internal spacing so the whole
  // "add a reading" block stays compact and the keypad's four rows clear the Save bar.
  entryGroup: { gap: space.sm },
  metaRow: { flexDirection: "row", justifyContent: "flex-start" },
  whenChip: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, alignSelf: "flex-start" },
  // Tighter than a default Card so the four keypad rows + the range hint clear the pinned Save bar
  // without scrolling on a 720×1280 phone — the hint is never left clipped under the bar.
  keypadCard: { padding: space.md, paddingBottom: space.sm, gap: space.xs },
  statusSlot: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.xs, paddingVertical: space.xs, marginTop: space.xs, minHeight: 36 },
  nextStepCard: { gap: space.md },
  nextStepRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  nextStepCheck: { width: 36, height: 36, borderRadius: 18, backgroundColor: palette.successSoft, alignItems: "center", justifyContent: "center" },
  // Low/very-high wellness note card: a tinted surface with a tone-coloured hairline so it reads as a
  // calm advisory, never an alarm. Dismissible (close button in the header row).
  safetyCard: { gap: space.sm, borderWidth: 1 },
  safetyRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  // Two equal-weight food CTAs so the offline dish picker sits beside the photo hero.
  mealRow: { flexDirection: "row", gap: space.md },
  mealCta: { flex: 1, minHeight: 92, gap: 4, paddingVertical: space.md, paddingHorizontal: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, justifyContent: "center" },
  mealCtaPrimary: { borderColor: palette.primarySoft },
  mealCtaIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: palette.primarySoft, alignItems: "center", justifyContent: "center" },
  mealCtaTitle: { marginTop: 2 },
  mealCtaSub: { color: palette.inkSoft },
  unitConvert: { gap: space.sm },
  unitConvertRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  saveBar: { position: "absolute", left: 0, right: 0, paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.md, backgroundColor: palette.bg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border },
  saveBarInner: { width: "100%", maxWidth: 640, alignSelf: "center" },
  // The note affordance now sits above the keypad, in a bordered surface row so it reads as its own control.
  addNoteRow: { flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start", minHeight: 44, paddingHorizontal: space.md, paddingVertical: space.xs, borderRadius: radius.pill, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
  snapIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: palette.primary, alignItems: "center", justifyContent: "center" },
  weeklyCard: { gap: space.sm },
  weeklyRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  weeklyIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: palette.primarySoft, alignItems: "center", justifyContent: "center" },
  remindCard: { gap: space.md },
  remindRow: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  remindIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: palette.primarySoft, alignItems: "center", justifyContent: "center" },
  remindIconWarn: { width: 36, height: 36, borderRadius: 10, backgroundColor: palette.warningSoft, alignItems: "center", justifyContent: "center" },
  remindActions: { flexDirection: "row", gap: space.sm },
  savedCheck: { width: 92, height: 92, borderRadius: 46, backgroundColor: gradient.pill, alignItems: "center", justifyContent: "center" },
  addDisc: { width: 88, height: 88, borderRadius: 44, backgroundColor: gradient.pill, alignItems: "center", justifyContent: "center" },
  rangeDisc: { width: 88, height: 88, borderRadius: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  // Caps the confetti canvas to a top band over the hero, so the burst never covers the CTAs below.
  confettiBand: { height: 320 },
  emptyToday: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  readingCard: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.sm, paddingHorizontal: space.md, minHeight: 64 },
  levelDot: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
});
