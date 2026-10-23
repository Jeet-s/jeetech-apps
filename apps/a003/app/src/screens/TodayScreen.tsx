import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown, runOnJS, useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Button,
  Card,
  Confetti,
  EmptyState,
  Fab,
  Icon,
  IconButton,
  ProgressRing,
  Screen,
  Sheet,
  Tappable,
  feedback,
  fonts,
  isDark,
  palette,
  radius,
  shadowStrong,
  space,
  toast,
  type,
} from "../ui";
import { useBannerHeight } from "../modules/layout";
import { art } from "../art";
import {
  type Block,
  type BlockDayState,
} from "../core/model";
import { absEnd, absStart, activeBlock, appendLog, blocksForDay, completeBlock, duration, findFreeSlot, moveBlock, nextBlock, shiftFollowing, skipBlock, snoozeBlock } from "../core/blocks";
import { focusCue } from "../core/focus";
import { dayStreak, plannedVsDone } from "../core/stats";
import { DAY, type DateKey, addDays, dateKey, dayNumber, fmtDuration, snap, toHHMM } from "../core/time";
import { type History, canRedo, canUndo, initHistory, record, redo, undo } from "../core/undo";
import { blockDayStore, useBlockDay, useBlockDaySettings } from "../core/data";
import { useSettings } from "../modules/store";
import { analytics } from "../modules/analytics";
import { notify } from "../modules/notify";
import { type Ops, longDate, nowMinutes, shortDate, weekdayName } from "./helpers";
import { ActivityLogSheet, AiPlanSheet, ApplyTemplateSheet, BlockActionsSheet, BlockEditorSheet, DayMenuSheet } from "./BlockSheets";
import { FocusAlert } from "./FocusAlert";

const HOUR_H = 60;
const GUTTER = 52;
const MIN_BLOCK = 30;
const MIN_DUR = 5;

// Toned-down brand gradient for the COMPACT day-summary strip — softer than the
// full HeroCard gradient so the timeline (not the summary) reads as the hero.
const SUMMARY_GRADIENT = (isDark ? ["#2E6BE0", "#1C3A72"] : ["#4F8DFF", "#2E66D6"]) as [string, string];

type SheetKind = null | "add" | "edit" | "actions" | "apply" | "ai" | "menu" | "log" | "late" | "help";

export function TodayScreen({ bottomInset, onPro, demo }: { bottomInset: number; onPro: (from: string) => void; demo?: SheetKind }) {
  const data = useBlockDay();
  const settings = useBlockDaySettings();
  const app = useSettings();
  const insets = useSafeAreaInsets();
  const banner = useBannerHeight();
  const realToday = dateKey(new Date());
  const [date, setDate] = useState<DateKey>(realToday);
  const [now, setNow] = useState(nowMinutes());
  const [sheet, setSheet] = useState<SheetKind>(demo ?? null);
  const [selected, setSelected] = useState<Block | null>(null);
  const [addInitial, setAddInitial] = useState<{ start: number; end: number } | null>(null);
  const [focusOpen, setFocusOpen] = useState(false);
  const [dragLabel, setDragLabel] = useState<{ title: string; color: string } | null>(null);

  const hist = useRef<History<BlockDayState>>(initHistory(data));
  useEffect(() => {
    const id = setInterval(() => setNow(nowMinutes()), 30_000);
    return () => clearInterval(id);
  }, []);
  // Reschedule reminders when the plan or settings change — DEBOUNCED. During a
  // long session (or an automated soak) the plan can mutate dozens of times a
  // second; firing notify.sync (cancel-all + reschedule, a native round-trip)
  // on every keystroke floods the OS notification service and can wedge the app
  // (ANR). Coalescing to the last change after a short quiet period keeps the JS
  // thread free while still landing an accurate schedule.
  useEffect(() => {
    if (demo) return;
    const id = setTimeout(() => notify.sync(data.blocks, settings), 400);
    return () => clearTimeout(id);
  }, [data, settings, demo]);
  // Screenshot mode: pre-select a block so the actions sheet shows real content.
  useEffect(() => {
    if (demo === "actions" && !selected) {
      const forDay = blocksForDay(data, date);
      // Prefer an actionable block so the sheet shows Start / shift (matches the caption).
      setSelected(forDay.find((b) => b.status === "active") ?? forDay.find((b) => b.status === "planned") ?? forDay[0] ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo]);

  const commit = useCallback(
    (next: BlockDayState, msg?: string, action?: { label: string; onPress: () => void }) => {
      hist.current = record(hist.current, next);
      blockDayStore.set(next);
      if (msg) toast(msg, action);
    },
    [],
  );
  const doUndo = () => {
    if (!canUndo(hist.current)) { feedback("pop", "warning"); return toast("Nothing left to undo"); }
    hist.current = undo(hist.current);
    blockDayStore.set(hist.current.present);
    feedback("pop", "light");
    toast("Undone");
  };
  const doRedo = () => {
    if (!canRedo(hist.current)) { feedback("pop", "warning"); return toast("Nothing to redo"); }
    hist.current = redo(hist.current);
    blockDayStore.set(hist.current.present);
    feedback("pop", "light");
    toast("Redone");
  };

  const ops: Ops = { state: data, settings, today: date, pro: !!app.pro, commit, onPro };

  const isToday = date === realToday;
  // Memoised so its reference is stable across renders — the timeline gesture is
  // rebuilt from this (via blockGeom); recomputing it every render would rebuild
  // the gesture recognisers mid-interaction and make taps feel dropped.
  const dayBlocks = useMemo(() => blocksForDay(data, date), [data, date]);
  const active = isToday ? activeBlock(data, date, now) : null;
  const next = isToday ? nextBlock(data, date, now) : null;
  const streak = dayStreak(data, realToday);
  const pvd = plannedVsDone(dayBlocks);
  const doneCount = dayBlocks.filter((b) => b.status === "done").length;
  const liveCount = dayBlocks.filter((b) => b.status !== "skipped").length;
  const absNow = dayNumber(date) * DAY + now;

  // ── Insertion confirmation: flag a block the instant it appears on this day so
  // the timeline gives it a brief slide-in + highlight pop (a clear "it landed
  // here" beat after Add). Cheap: one id diff per plan change on Today only.
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const prevIds = useRef<{ date: DateKey; ids: Set<string> }>({ date, ids: new Set(dayBlocks.map((b) => b.id)) });
  useEffect(() => {
    const ids = dayBlocks.map((b) => b.id);
    // Only treat an id as "just added" when it appears while staying on the same
    // day — switching dates swaps the whole set and must not trigger the pop.
    const sameDay = prevIds.current.date === date;
    const added = sameDay ? ids.find((id) => !prevIds.current.ids.has(id)) : undefined;
    prevIds.current = { date, ids: new Set(ids) };
    if (!added) return;
    setJustAdded(added);
    const t = setTimeout(() => setJustAdded(null), 1500);
    return () => clearTimeout(t);
  }, [dayBlocks, date]);

  // ── Milestone: finishing the whole day's plan earns a celebration ──
  const [celebrate, setCelebrate] = useState(0);
  const dayDone = liveCount >= 2 && doneCount === liveCount;
  const prev = useRef({ date, done: dayDone });
  useEffect(() => {
    if (isToday && prev.current.date === date && dayDone && !prev.current.done) {
      setCelebrate((c) => c + 1);
      feedback("unlock", "success");
      toast("Day complete — every block done! 🎉");
    }
    prev.current = { date, done: dayDone };
  }, [dayDone, date, isToday]);

  // ── ADHD live cues: pre-transition ramp + optional full-screen alarm ──
  const cue = active ? focusCue(absStart(active), absEnd(active), absNow, settings.preEndNudgesMin) : null;
  const autoShownFor = useRef<string | null>(null);
  useEffect(() => {
    if (demo) return;
    // Auto-surface the full-screen alarm once, when the active block enters its
    // final nudge window (the transition ramp). Opt-out via Settings → Focus cues.
    if (!active || !cue) return;
    if (settings.focusCues && settings.fullScreenAlarm && cue.phase !== "running" && autoShownFor.current !== active.id) {
      autoShownFor.current = active.id;
      setFocusOpen(true);
    }
    if (cue.phase === "running") autoShownFor.current = autoShownFor.current === active.id ? autoShownFor.current : null;
  }, [active?.id, cue?.phase, settings.focusCues, settings.fullScreenAlarm, demo]);

  // Keep an ongoing "Active block" notice in the shade when the user opted in.
  const notifKey = active ? `${active.id}:${cue?.minutesLeft ?? 0}` : "none";
  useEffect(() => {
    if (demo) return;
    if (active && settings.notifPersistentBanner && settings.remindersEnabled) {
      void notify.showActiveBlock(active.title, cue?.minutesLeft ?? duration(active), active.id);
    } else {
      void notify.clearActiveBlock();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifKey, settings.notifPersistentBanner, settings.remindersEnabled, demo]);

  // ── Focus-scene actions (keep the plan intact) ──
  const openFocus = () => {
    if (!active) return toast("No block is running right now");
    feedback("tap", "light");
    setFocusOpen(true);
  };
  const focusDone = () => {
    if (!active) return setFocusOpen(false);
    commit(completeBlock(data, active.id, date), "Block done ✓");
    feedback("unlock", "success");
    setFocusOpen(false);
  };
  const focusSkip = () => {
    if (!active) return setFocusOpen(false);
    commit(skipBlock(data, active.id, date), "Block skipped");
    feedback("pop", "warning");
    setFocusOpen(false);
  };
  const focusSnooze = () => {
    if (!active) return;
    const r = snoozeBlock(data, active.id, 10, date);
    if (r.error) { feedback("error", "error"); return toast("Not enough room — next block is too close"); }
    commit(r.state, "+10 minutes");
    feedback("pop", "light");
  };

  // ── Rubber-band "Running late?" — shift everything still to come later (or
  // earlier when you're ahead) in ONE tap, without touching blocks already
  // underway or done. This is the HOW-WE-WIN move: recover a slipping day with
  // no drag, no modal maths, plan integrity preserved (no overlaps). ──
  const lateFrom = isToday ? now : settings.workStart;
  const upcoming = dayBlocks.filter((b) => b.start >= lateFrom && b.status !== "done" && b.status !== "skipped");
  const shiftRestOfDay = (delta: number) => {
    const r = shiftFollowing(blockDayStore.get(), date, lateFrom, delta, date);
    if (r.moved === 0) { feedback("pop", "warning"); setSheet(null); return toast("Nothing left to shift today"); }
    if (r.error) {
      feedback("error", "error");
      return toast(r.error === "overlap" ? "No room to shift that far — a later block is in the way" : "Can’t shift that far");
    }
    feedback("success", "success");
    analytics.track("rubber_band_shift");
    const word = delta > 0 ? "later" : "earlier";
    commit(r.state, `Shifted ${r.moved} block${r.moved === 1 ? "" : "s"} ${fmtDuration(Math.abs(delta))} ${word}`, { label: "Undo", onPress: doUndo });
    setSheet(null);
  };

  const openAdd = (start: number, end: number) => {
    setAddInitial({ start, end });
    setSelected(null);
    setSheet("add");
  };
  const quickAdd = (min: number) => {
    const dur = settings.defaultDurationMin;
    const desired = Math.max(0, Math.min(DAY - MIN_DUR, snap(min, settings.snapIntervalMin)));
    // Open on the first FREE slot from here, so the prominent Add button always
    // succeeds on the first tap — a day full of routine blocks never traps a
    // first-time user behind a silent "overlaps another block" error. Read the
    // live store (not a captured render) so a gesture built earlier stays correct.
    const free = findFreeSlot(blockDayStore.get().blocks, date, desired, dur);
    const s = free != null && free < DAY - MIN_DUR ? free : desired;
    openAdd(s, s + dur);
  };
  // Stable so the memoised TimelineBlock below isn't invalidated every render —
  // during a long session only the blocks that actually change should re-render.
  const openBlock = useCallback((b: Block) => {
    feedback("tap", "light");
    setSelected(b);
    setSheet("actions");
  }, []);
  // Open a block's actions by id (used from the timeline tap worklet, which only
  // carries the id). Reads the live store so it's correct regardless of when the
  // gesture was built. Idempotent with the block's own onPress if both fire.
  const openBlockById = useCallback((id: string) => {
    const b = blockDayStore.get().blocks.find((x) => x.id === id);
    if (b) openBlock(b);
  }, [openBlock]);

  // Drag-and-drop reschedule: drop a block at `newStart` (snapped). If that lands
  // on another block we gap-fill into the nearest open slot instead of rejecting,
  // so a drag always lands somewhere sensible (a HOW-WE-WIN differentiator).
  const commitMove = useCallback(
    (id: string, newStart: number) => {
      const state = blockDayStore.get();
      const block = state.blocks.find((b) => b.id === id);
      if (!block) return;
      const dur = block.end - block.start;
      const clamped = Math.max(0, Math.min(DAY - MIN_DUR, newStart));
      // A long-press that didn't actually move the block → treat it as "open" so
      // the gesture doubles as a shortcut into the block's actions (edit, dupe…).
      if (clamped === block.start) { feedback("tap", "light"); setSelected(block); setSheet("actions"); return; }
      let r = moveBlock(state, id, clamped, settings.snapIntervalMin, date);
      if (r.error === "overlap") {
        const free = findFreeSlot(state.blocks.filter((b) => b.id !== id), date, clamped, dur);
        if (free == null) { feedback("error", "error"); return toast("No open gap there — try another spot"); }
        r = moveBlock(state, id, free, settings.snapIntervalMin, date);
      }
      if (r.error) { feedback("error", "error"); return toast("Couldn’t move that block"); }
      feedback("success", "success");
      const moved = r.state.blocks.find((b) => b.id === id);
      commit(appendLog(r.state, "update", `Moved “${block.title}”`, date), moved ? `Moved to ${toHHMM(moved.start)}` : "Block moved");
    },
    [date, settings.snapIntervalMin, commit],
  );

  // ── Timeline geometry ──
  const earliest = dayBlocks.length ? Math.min(...dayBlocks.map((b) => b.start)) : settings.workStart;
  const latest = dayBlocks.length ? Math.max(...dayBlocks.map((b) => b.end)) : settings.workEnd;
  const startHour = Math.max(0, Math.floor(Math.min(earliest, settings.workStart, isToday ? now : earliest) / 60));
  const endHour = Math.min(28, Math.max(startHour + 4, Math.ceil(Math.max(latest, settings.workEnd, isToday ? now + 60 : latest) / 60) + 1));
  const timelineH = (endHour - startHour) * HOUR_H;
  const yFor = (min: number) => (min / 60 - startHour) * HOUR_H;
  const snapStep = settings.snapIntervalMin;

  // Pixel bounds of every block, so the gesture worklets can tell a touch on a
  // block (→ drag to move / tap to open) from a touch on empty time (→ create).
  const blockGeom = useMemo(
    () =>
      dayBlocks.map((b) => {
        const top = yFor(b.start);
        // Hit-test against the VISUAL height (short blocks are padded to MIN_BLOCK)
        // so a tap anywhere on the rendered block is recognised as "on a block".
        const height = Math.max(MIN_BLOCK, yFor(b.end) - top);
        return { id: b.id, title: b.title, color: b.color, top, bottom: top + height, height };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dayBlocks, startHour],
  );

  // ── Drag / tap: create on empty time, move an existing block, open on tap ──
  // NOTE: these gesture callbacks run on the UI thread as worklets, so they must
  // stay self-contained — only pure arithmetic over captured constants (HOUR_H,
  // startHour, snapStep) and the plain `blockGeom` array. Calling a JS-thread
  // helper like yFor() here crashes the worklet runtime, so the y↔minute maths is
  // inlined (yFor is monotonic, hence yFor(min(a,b)) === min(yFor(a),yFor(b))).
  const ghost = useSharedValue({ top: 0, height: 0, on: 0 });
  const moveGhost = useSharedValue({ top: 0, height: 0, on: 0 });
  const drag = useSharedValue({ y: 0, top: 0, id: "", moving: 0 });
  const gesture = useMemo(() => {
    const pan = Gesture.Pan()
      .activateAfterLongPress(180)
      .onStart((e) => {
        // Long-press that begins on a block → pick it up to reschedule.
        let hit = -1;
        for (let i = 0; i < blockGeom.length; i++) {
          if (e.y >= blockGeom[i].top && e.y <= blockGeom[i].bottom) { hit = i; break; }
        }
        if (hit >= 0) {
          const g = blockGeom[hit];
          drag.value = { y: e.y, top: g.top, id: g.id, moving: 1 };
          moveGhost.value = { top: g.top, height: g.height, on: 1 };
          runOnJS(setDragLabel)({ title: g.title, color: g.color });
          return;
        }
        drag.value = { y: 0, top: 0, id: "", moving: 0 };
        const m = Math.round(((e.y / HOUR_H + startHour) * 60) / snapStep) * snapStep;
        ghost.value = { top: (m / 60 - startHour) * HOUR_H, height: HOUR_H, on: 1 };
      })
      .onUpdate((e) => {
        if (drag.value.moving) {
          moveGhost.value = { top: drag.value.top + (e.y - drag.value.y), height: moveGhost.value.height, on: 1 };
          return;
        }
        const top0 = ghost.value.top;
        const m1 = Math.round(((e.y / HOUR_H + startHour) * 60) / snapStep) * snapStep;
        const y1 = (m1 / 60 - startHour) * HOUR_H;
        ghost.value = { top: Math.min(top0, y1), height: Math.max(HOUR_H * 0.4, Math.abs(y1 - top0)), on: 1 };
      })
      .onEnd(() => {
        if (drag.value.moving) {
          const startMin = Math.round((moveGhost.value.top / HOUR_H + startHour) * 60 / snapStep) * snapStep;
          const id = drag.value.id;
          moveGhost.value = { top: 0, height: 0, on: 0 };
          drag.value = { y: 0, top: 0, id: "", moving: 0 };
          runOnJS(setDragLabel)(null);
          runOnJS(commitMove)(id, Math.max(0, startMin));
          return;
        }
        const startMin = Math.round((ghost.value.top / HOUR_H + startHour) * 60 / snapStep) * snapStep;
        const endMin = Math.round(((ghost.value.top + ghost.value.height) / HOUR_H + startHour) * 60 / snapStep) * snapStep;
        ghost.value = { top: 0, height: 0, on: 0 };
        runOnJS(openAdd)(Math.max(0, startMin), Math.max(startMin + MIN_DUR, endMin));
      });
    // A tap ON a block opens that block's actions; a tap on EMPTY time creates.
    // Driving both from the gesture (not the block's own Pressable) means block
    // taps work regardless of how the touch system arbitrates the two.
    const tap = Gesture.Tap().maxDuration(250).onEnd((e) => {
      for (let i = 0; i < blockGeom.length; i++) {
        if (e.y >= blockGeom[i].top && e.y <= blockGeom[i].bottom) { runOnJS(openBlockById)(blockGeom[i].id); return; }
      }
      runOnJS(quickAdd)((e.y / HOUR_H + startHour) * 60);
    });
    return Gesture.Exclusive(pan, tap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startHour, endHour, snapStep, settings.defaultDurationMin, blockGeom, commitMove, openBlockById]);

  const ghostStyle = useAnimatedStyle(() => ({ top: ghost.value.top, height: ghost.value.height, opacity: ghost.value.on }));
  const moveGhostStyle = useAnimatedStyle(() => ({ top: moveGhost.value.top, height: moveGhost.value.height, opacity: moveGhost.value.on }));

  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);

  // Memoise the Skia progress ring so it only redraws when completion actually
  // changes — not on every unrelated state write during a long/soak session.
  // Compact (52dp) so the day-summary strip stays short and the timeline is hero.
  const summaryRing = useMemo(
    () => <ProgressRing value={pvd.completion} size={52} stroke={6} color="#fff" track="rgba(255,255,255,0.24)" labelColor="#fff" label={`${Math.round(pvd.completion * 100)}%`} />,
    [pvd.completion],
  );

  return (
    <>
      <Screen
        title={isToday ? "Today" : weekdayName(date)}
        subtitle={longDate(date)}
        bottomInset={bottomInset + 76}
        right={
          <View style={styles.headerActions}>
            {canUndo(hist.current) ? <IconButton icon="undo" label="Undo" size={40} onPress={doUndo} /> : null}
            {canRedo(hist.current) ? <IconButton icon="redo" label="Redo" size={40} onPress={doRedo} /> : null}
            <IconButton icon="more" label="Day options" size={40} onPress={() => { feedback("tap", "light"); setSheet("menu"); }} />
          </View>
        }
      >
        {/* Compact day summary — date nav + a small progress ring, done count and
            streak in one short strip, so the timeline sits high and reads as the
            hero (toned-down gradient keeps the brand without dominating). */}
        <LinearGradient colors={SUMMARY_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.summary}>
          <View style={styles.summaryNav}>
            <Tappable label="Previous day" sound="pop" onPress={() => setDate((d) => addDays(d, -1))} style={styles.navBtn}>
              <Icon name="chevronLeft" size={20} color="#fff" />
            </Tappable>
            <Tappable label="Jump to today" sound="pop" onPress={() => setDate(realToday)} style={styles.summaryDate}>
              <Text style={[type.bodyStrong, { color: "#fff" }]} numberOfLines={1}>{isToday ? "Today" : weekdayName(date)}</Text>
              <Text style={[type.caption, { color: "rgba(255,255,255,0.82)" }]} numberOfLines={1}>{shortDate(date)}{isToday ? "" : " · tap for today"}</Text>
            </Tappable>
            <Tappable label="Next day" sound="pop" onPress={() => setDate((d) => addDays(d, 1))} style={styles.navBtn}>
              <Icon name="chevronRight" size={20} color="#fff" />
            </Tappable>
          </View>
          <View style={styles.summaryStats}>
            {summaryRing}
            <View style={{ flex: 1 }} accessible accessibilityLabel={dayBlocks.length ? `${doneCount} of ${liveCount} blocks done, ${fmtDuration(pvd.planned)} planned` : "No blocks planned yet"}>
              <Text style={[type.heading, { color: "#fff" }]} numberOfLines={1}>{dayBlocks.length ? `${doneCount}/${liveCount} done` : "Plan your day"}</Text>
              <Text style={[type.caption, { color: "rgba(255,255,255,0.82)" }]} numberOfLines={1}>{dayBlocks.length ? `${fmtDuration(pvd.planned)} planned` : "Tap the + button or drag the timeline"}</Text>
            </View>
            {streak > 0 ? (
              <View style={styles.streakChip} accessible accessibilityLabel={`${streak} day streak`}>
                <Icon name="flame" size={14} color="#FFD36A" />
                <Text style={[type.label, { color: "#fff" }]}>{streak}</Text>
              </View>
            ) : null}
          </View>
        </LinearGradient>

        {/* Always-visible Active Block banner → one tap into the full-screen focus cue */}
        {active && cue ? (
          <Tappable label={`Focus mode for ${active.title}`} sound="tap" onPress={openFocus}>
            <Card style={{ ...styles.activeBanner, borderLeftColor: active.color, backgroundColor: cue.phase === "ending" ? palette.dangerSoft : cue.phase === "ramp" ? palette.warningSoft : `${active.color}12` }}>
              <View style={[styles.activePulse, { backgroundColor: active.color }]} />
              <View style={{ flex: 1 }}>
                <Text style={type.bodyStrong} numberOfLines={1}>{active.title}</Text>
                <Text style={type.caption}>{cue.minutesLeft > 0 ? `${fmtDuration(cue.minutesLeft)} left` : "Wrapping up"}{next ? ` · next ${next.title}` : ""}</Text>
              </View>
              <View style={styles.focusCta}>
                <Icon name="flame" size={16} color={palette.primary} />
                <Text style={[type.label, { color: palette.primary }]}>Focus</Text>
              </View>
            </Card>
          </Tappable>
        ) : null}

        {/* Running late? — the one-tap rubber-band shift gets a prominent card at
            the exact moment it matters: when the active block is in its final
            stretch and the day is most likely to slip. Otherwise it stays one tap
            away in a block's actions, so the timeline sits high on screen. */}
        {isToday && upcoming.length > 0 && active && cue && cue.phase !== "running" ? (
          <Tappable label={`Running late? Shift ${upcoming.length} upcoming block${upcoming.length === 1 ? "" : "s"}`} sound="tap" onPress={() => { feedback("tap", "light"); setSheet("late"); }}>
            <Card padded={false} style={styles.lateCard}>
              <View style={styles.lateIcon}><Icon name="shift" size={20} color={palette.warning} /></View>
              <View style={{ flex: 1 }}>
                <Text style={type.bodyStrong}>Running late?</Text>
                <Text style={type.caption} numberOfLines={1}>Shift the rest of your day in one tap — no drag</Text>
              </View>
              <View style={styles.latePill}><Text style={[type.label, { color: palette.warning }]}>Shift</Text></View>
            </Card>
          </Tappable>
        ) : null}

        {dayBlocks.length === 0 ? (
          <Card>
            <EmptyState
              art={art.empty_day_timeline}
              title="Your day is a blank canvas"
              body="Drag on the timeline below — or tap + — to create your first block. Or drop in a ready-made routine."
              action={
                <View style={{ gap: space.md, alignSelf: "stretch" }}>
                  <View style={styles.tour}>
                    <TourRow icon="plus" title="Drag to create" body="Pull down the timeline to block out time — stretch to resize." />
                    <TourRow icon="shift" title="Running late? Shift in one tap" body="Slide your whole remaining day later without redrawing it." />
                    <TourRow icon="flame" title="Stay on track" body="A live Active Block banner counts you down to the next switch." />
                  </View>
                  <Button label="Add a block" icon="plus" onPress={() => quickAdd(settings.workStart)} />
                  <Button label="Apply a routine" icon="layers" variant="secondary" onPress={() => setSheet("apply")} />
                </View>
              }
            />
          </Card>
        ) : (
          <Text style={[type.overline, styles.timelineLabel]}>Timeline</Text>
        )}

        {/* Timeline */}
        <Card padded={false} style={styles.timelineCard}>
          <GestureDetector gesture={gesture}>
            <View style={{ height: timelineH }}>
              {hours.map((h) => (
                <View key={h} style={[styles.hourRow, { top: (h - startHour) * HOUR_H }]}>
                  <Text style={styles.hourLabel}>{String(h % 24).padStart(2, "0")}:00</Text>
                  <View style={styles.hourLine} />
                </View>
              ))}
              {isToday && now >= startHour * 60 && now <= endHour * 60 ? (
                <View style={[styles.nowLine, { top: yFor(now) }]} pointerEvents="none">
                  <View style={styles.nowPill}><Text style={styles.nowPillText}>{toHHMM(now)}</Text></View>
                  <View style={styles.nowDot} />
                  <View style={styles.nowRule} />
                </View>
              ) : null}
              <Animated.View pointerEvents="none" style={[styles.ghost, ghostStyle]} />
              {/* Floating copy of the block being dragged to a new time */}
              <Animated.View pointerEvents="none" style={[styles.moveGhost, moveGhostStyle]}>
                {dragLabel ? (
                  <View style={[styles.moveGhostInner, { backgroundColor: `${dragLabel.color}2E`, borderLeftColor: dragLabel.color }]}>
                    <Text style={[type.bodyStrong, { color: palette.ink }]} numberOfLines={1}>{dragLabel.title}</Text>
                    <Icon name="shift" size={16} color={dragLabel.color} />
                  </View>
                ) : null}
              </Animated.View>
              {dayBlocks.map((b) => (
                <TimelineBlock
                  key={b.id}
                  block={b}
                  top={yFor(b.start)}
                  height={Math.max(MIN_BLOCK, yFor(b.end) - yFor(b.start))}
                  progress={isToday && b.status === "active" ? Math.max(0, Math.min(1, (now - b.start) / Math.max(1, b.end - b.start))) : null}
                  highlight={b.id === justAdded}
                  onOpen={openBlock}
                />
              ))}
            </View>
          </GestureDetector>
        </Card>
      </Screen>

      {/* Primary create actions, consolidated into one speed-dial so the Today
          chrome stays clean (New block is the core action; routines + AI plan
          sit one tap away). Undo/Redo/Day options live in the top app bar. */}
      <Fab
        bottom={bottomInset + banner + insets.bottom}
        label="Create"
        actions={[
          { icon: "plus", label: "New block", onPress: () => quickAdd(isToday ? now : settings.workStart) },
          { icon: "layers", label: "Apply routine", onPress: () => setSheet("apply") },
          { icon: "sparkle", label: "AI plan", tint: palette.accent, onPress: () => setSheet("ai") },
        ]}
      />

      <Confetti trigger={celebrate} />


      <BlockEditorSheet visible={sheet === "add"} mode="add" date={date} initial={addInitial} ops={ops} onClose={() => setSheet(null)} />
      <BlockEditorSheet visible={sheet === "edit"} mode="edit" block={selected} date={date} ops={ops} onClose={() => setSheet(null)} />
      <BlockActionsSheet visible={sheet === "actions"} block={selected} ops={ops} onEdit={() => setSheet("edit")} onClose={() => setSheet(null)} />
      <ApplyTemplateSheet visible={sheet === "apply"} ops={ops} onClose={() => setSheet(null)} />
      <AiPlanSheet visible={sheet === "ai"} ops={ops} onClose={() => setSheet(null)} />
      <DayMenuSheet visible={sheet === "menu"} ops={ops} onClose={() => setSheet(null)} onLog={() => setSheet("log")} onHelp={() => setSheet("help")} />
      <ActivityLogSheet visible={sheet === "log"} log={data.log} onClose={() => setSheet(null)} />
      <RunningLateSheet visible={sheet === "late"} count={upcoming.length} active={active} next={next} onShift={shiftRestOfDay} onClose={() => setSheet(null)} />
      <HelpSheet visible={sheet === "help"} onClose={() => setSheet(null)} />

      <FocusAlert
        visible={focusOpen}
        block={active}
        next={next}
        settings={settings}
        onDone={focusDone}
        onSnooze={focusSnooze}
        onSkip={focusSkip}
        onClose={() => setFocusOpen(false)}
      />
    </>
  );
}

/** The quick tour, on demand from the Day overflow menu (coach marks, not clutter). */
function HelpSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Sheet visible={visible} title="How BlockDay works" onClose={onClose}>
      <View style={styles.tour}>
        <TourRow icon="plus" title="Drag to create" body="Pull down the timeline to block out time — stretch to resize, or tap + for a new block." />
        <TourRow icon="shift" title="Long-press to move" body="Hold a block, then drag it to a new time. Gaps fill automatically — no overlaps." />
        <TourRow icon="flame" title="Running late? Shift the day" body="Slide everything still to come later (or earlier) in one tap, plan intact." />
        <TourRow icon="lock" title="Offline · no account" body="Everything works offline and stays on your phone — no sign-in needed." />
      </View>
      <Button label="Got it" onPress={onClose} />
    </Sheet>
  );
}

function TourRow({ icon, title, body }: { icon: import("../ui").IconName; title: string; body: string }) {
  return (
    <View style={styles.tourRow}>
      <View style={styles.tourIcon}><Icon name={icon} size={18} color={palette.primary} /></View>
      <View style={{ flex: 1 }}>
        <Text style={type.bodyStrong}>{title}</Text>
        <Text style={type.caption}>{body}</Text>
      </View>
    </View>
  );
}

/**
 * "Running late?" — a true one-tap rubber-band shift of everything still to come.
 * Later / earlier by a quick amount; the plan slides as one and never overlaps.
 */
function RunningLateSheet({ visible, count, active, next, onShift, onClose }: { visible: boolean; count: number; active: Block | null; next: Block | null; onShift: (delta: number) => void; onClose: () => void }) {
  const fromLabel = active ? `everything after “${active.title}”` : next ? `“${next.title}” and everything after` : "the rest of your day";
  return (
    <Sheet visible={visible} title="Running late?" onClose={onClose}>
      <Text style={[type.body, { color: palette.inkSoft }]}>
        Slide {fromLabel} — {count} block{count === 1 ? "" : "s"} — in one tap. Blocks already underway or done stay put, and nothing ever overlaps.
      </Text>
      <Text style={[type.label, { marginTop: space.xs }]}>Push later</Text>
      <View style={styles.lateGrid}>
        <Button label="+15 min" size="sm" icon="shift" onPress={() => onShift(15)} style={{ flex: 1 }} />
        <Button label="+30 min" size="sm" icon="shift" onPress={() => onShift(30)} style={{ flex: 1 }} />
        <Button label="+1 hr" size="sm" icon="shift" onPress={() => onShift(60)} style={{ flex: 1 }} />
      </View>
      <Text style={type.label}>Ahead of plan? Pull earlier</Text>
      <View style={styles.lateGrid}>
        <Button label="−15 min" size="sm" variant="secondary" onPress={() => onShift(-15)} style={{ flex: 1 }} />
        <Button label="−30 min" size="sm" variant="secondary" onPress={() => onShift(-30)} style={{ flex: 1 }} />
      </View>
    </Sheet>
  );
}

const TimelineBlock = memo(function TimelineBlock({ block, top, height, progress, highlight, onOpen }: { block: Block; top: number; height: number; progress: number | null; highlight?: boolean; onOpen: (b: Block) => void }) {
  const done = block.status === "done";
  const skipped = block.status === "skipped";
  const activeNow = block.status === "active";
  const tall = height >= 48;
  // A just-added block gives a quick scale pop + fading ring so the insertion is
  // unmistakable — paired with the slide-in entrance and the success haptic.
  const pop = useSharedValue(0);
  useEffect(() => {
    if (!highlight) return;
    pop.value = withSequence(withTiming(1, { duration: 180 }), withTiming(0, { duration: 1100 }));
  }, [highlight, pop]);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + pop.value * 0.04 }] }));
  const ringStyle = useAnimatedStyle(() => ({ opacity: pop.value }));
  const showGrip = tall && !done && !skipped;
  return (
    <Animated.View entering={FadeInDown.springify().damping(15).stiffness(170).mass(0.8)} style={[styles.blockWrap, { top, height }, popStyle]}>
      <Animated.View pointerEvents="none" style={[styles.insertRing, { borderColor: block.color }, ringStyle]} />
      <Tappable
        label={`${block.title}, ${toHHMM(block.start)} to ${toHHMM(block.end)}, ${block.status}${progress != null ? `, ${Math.round(progress * 100)} percent elapsed` : ""}`}
        onPress={() => onOpen(block)}
        scale={0.99}
        sound={null}
        style={[
          styles.block,
          { backgroundColor: `${block.color}1F`, borderColor: `${block.color}40`, borderLeftColor: block.color },
          activeNow && { backgroundColor: `${block.color}2E`, borderWidth: 2, borderColor: block.color, borderLeftWidth: 6 },
          (done || skipped) && { opacity: 0.55, backgroundColor: `${block.color}14` },
        ]}
      >
        <View style={{ flex: 1 }}>
          <Text style={[type.bodyStrong, { color: palette.ink }, (done || skipped) && styles.strike]} numberOfLines={1}>
            {block.title}
          </Text>
          {tall ? (
            <Text style={[type.caption, { color: palette.inkSoft }]} numberOfLines={1}>
              {toHHMM(block.start)} – {toHHMM(block.end)} · {fmtDuration(duration(block))}
            </Text>
          ) : null}
        </View>
        {block.remindersMin.length && tall ? <Icon name="bell" size={14} color={block.color} /> : null}
        <StatusDot status={block.status} color={block.color} />
        {showGrip ? (
          <View style={styles.grip} pointerEvents="none">
            {[0, 1, 2].map((r) => (
              <View key={r} style={styles.gripRow}>
                <View style={[styles.gripDot, { backgroundColor: `${block.color}99` }]} />
                <View style={[styles.gripDot, { backgroundColor: `${block.color}99` }]} />
              </View>
            ))}
          </View>
        ) : null}
        {progress != null ? (
          <View pointerEvents="none" style={[styles.progressTrack, { backgroundColor: `${block.color}2E` }]}>
            <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: block.color }]} />
          </View>
        ) : null}
      </Tappable>
    </Animated.View>
  );
});

function StatusDot({ status, color }: { status: Block["status"]; color: string }) {
  if (status === "done") return <View style={[styles.dot, { backgroundColor: palette.success }]}><Icon name="check" size={14} color="#fff" /></View>;
  if (status === "active") return <View style={[styles.dot, { backgroundColor: color }]}><Icon name="play" size={12} color="#fff" /></View>;
  if (status === "skipped") return <View style={[styles.dotOutline]}><Icon name="skip" size={14} color={palette.inkMuted} /></View>;
  return <View style={[styles.dotOutline, { borderColor: color }]} />;
}

const styles = StyleSheet.create({
  headerActions: { flexDirection: "row", alignItems: "center", gap: space.xs },
  summary: { borderRadius: radius.lg, padding: space.md, gap: space.sm, ...shadowStrong, shadowColor: SUMMARY_GRADIENT[1], shadowOpacity: 0.3 },
  summaryNav: { flexDirection: "row", alignItems: "center" },
  navBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.16)", alignItems: "center", justifyContent: "center" },
  summaryDate: { flex: 1, alignItems: "center" },
  summaryStats: { flexDirection: "row", alignItems: "center", gap: space.md },
  streakChip: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(255,255,255,0.18)", borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  timelineLabel: { marginTop: space.xs, marginBottom: -space.xs },
  activeBanner: { flexDirection: "row", alignItems: "center", gap: space.md, borderLeftWidth: 4 },
  lateCard: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, borderWidth: 1, borderColor: palette.border },
  lateIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: palette.warningSoft, alignItems: "center", justifyContent: "center" },
  latePill: { backgroundColor: palette.warningSoft, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999 },
  lateGrid: { flexDirection: "row", gap: space.sm },
  tour: { gap: space.md, alignSelf: "stretch", backgroundColor: palette.surfaceAlt, borderRadius: radius.lg, padding: space.md },
  tourRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  tourIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: palette.primarySoft, alignItems: "center", justifyContent: "center" },
  activePulse: { width: 10, height: 10, borderRadius: 5 },
  focusCta: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: palette.primarySoft, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  timelineCard: { padding: space.sm, overflow: "hidden" },
  hourRow: { position: "absolute", left: 0, right: 0, height: HOUR_H, flexDirection: "row", alignItems: "flex-start" },
  hourLabel: { width: GUTTER, ...type.caption, color: palette.inkMuted, marginTop: -7, textAlign: "right", paddingRight: space.sm },
  hourLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: palette.border, marginTop: 0 },
  nowLine: { position: "absolute", left: 0, right: space.sm, flexDirection: "row", alignItems: "center", zIndex: 4 },
  nowPill: { backgroundColor: palette.danger, borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 2, marginRight: 4 },
  nowPillText: { fontFamily: fonts.semibold, fontSize: 11, lineHeight: 14, color: "#fff", fontVariant: ["tabular-nums"] },
  nowDot: { width: 9, height: 9, borderRadius: 4.5, backgroundColor: palette.danger },
  nowRule: { flex: 1, height: 2, borderRadius: 1, backgroundColor: palette.danger },
  ghost: { position: "absolute", left: GUTTER, right: space.sm, borderRadius: radius.md, backgroundColor: `${palette.primary}33`, borderWidth: 1.5, borderColor: palette.primary },
  moveGhost: { position: "absolute", left: GUTTER, right: space.sm },
  moveGhostInner: { flex: 1, flexDirection: "row", alignItems: "center", gap: space.sm, borderRadius: radius.md, borderLeftWidth: 4, paddingHorizontal: space.md, paddingVertical: 6, ...shadowStrong },
  blockWrap: { position: "absolute", left: GUTTER, right: space.sm },
  insertRing: { position: "absolute", top: -2, left: -2, right: -2, bottom: -2, borderRadius: radius.md + 2, borderWidth: 2, zIndex: 2 },
  block: { flex: 1, flexDirection: "row", alignItems: "center", gap: space.sm, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderLeftWidth: 6, paddingHorizontal: space.md, paddingVertical: 6, overflow: "hidden" },
  grip: { gap: 2, paddingLeft: 2, justifyContent: "center" },
  gripRow: { flexDirection: "row", gap: 2 },
  gripDot: { width: 3, height: 3, borderRadius: 1.5 },
  progressTrack: { position: "absolute", left: 0, right: 0, bottom: 0, height: 4 },
  progressFill: { height: 4, borderTopRightRadius: 2, borderBottomRightRadius: 2 },
  strike: { textDecorationLine: "line-through", color: palette.inkSoft },
  dot: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  dotOutline: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: palette.inkMuted, alignItems: "center", justifyContent: "center" },
});
