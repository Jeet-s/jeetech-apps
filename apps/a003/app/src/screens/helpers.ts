/**
 * UI-only helpers for the BlockDay screens (formatting, option lists, live clock
 * math). All domain rules live in src/core — these just present it.
 */
import { useEffect, useState } from "react";
import { Keyboard } from "react-native";
import { DAY, type DateKey, fmtDuration, toHHMM } from "../core/time";
import { type Block, type BlockDayState, type BlockDaySettings } from "../core/model";

/**
 * True while the soft keyboard is on screen. Used by the editor sheets to keep
 * exactly ONE primary action visible: the big bottom CTA when the keyboard is
 * down, and the compact header action (which sits above the keyboard) when it's
 * up — so the confirm button is never obscured and never duplicated.
 */
export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () => setVisible(true));
    const hide = Keyboard.addListener("keyboardDidHide", () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return visible;
}

/**
 * Shared handle passed to the timeline sheets. `commit` records an undo snapshot,
 * writes the plan to the store and optionally shows a toast — every mutation goes
 * through it so Undo/Redo and reminders stay in sync.
 */
export interface Ops {
  state: BlockDayState;
  settings: BlockDaySettings;
  today: DateKey;
  pro: boolean;
  commit: (next: BlockDayState, toastMsg?: string, action?: { label: string; onPress: () => void }) => void;
  onPro: (from: string) => void;
}

/** "09:00" (24h, locale-free so the timeline never shifts). */
export const fmtClock = (min: number): string => toHHMM(min);

/** "09:00 – 10:30" for a block. */
export const timeRange = (b: Pick<Block, "start" | "end">): string => `${toHHMM(b.start)} – ${toHHMM(b.end)}`;

/** Minutes from midnight for the current local time. */
export function nowMinutes(d: Date = new Date()): number {
  return d.getHours() * 60 + d.getMinutes();
}

/** "At start · 5m before" or "No reminder". */
export function reminderSummary(remindersMin: number[]): string {
  if (!remindersMin.length) return "No reminder";
  return remindersMin
    .slice()
    .sort((a, b) => a - b)
    .map((r) => (r === 0 ? "At start" : `${fmtDuration(r)} before`))
    .join(" · ");
}

export const REMINDER_OPTIONS = [0, 5, 10, 15, 30, 60] as const;
export const reminderOptionLabel = (r: number): string => (r === 0 ? "At start" : fmtDuration(r));

export const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120] as const;

/** Humanised time-left, e.g. "1h 12m left" / "Ends now". */
export function timeLeft(absEndMin: number, absNowMin: number): string {
  const left = absEndMin - absNowMin;
  if (left <= 0) return "Ends now";
  return `${fmtDuration(left)} left`;
}

/** Full weekday + date for a DateKey (e.g. "Tuesday, 21 October"). */
export function longDate(date: DateKey): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
}
export function weekdayName(date: DateKey): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "long" });
}
export function shortDate(date: DateKey): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export { DAY };
