/**
 * Insights — where did my time go? Free tier: distribution by colour/tag,
 * planned-vs-done, and the day-complete streak. Pro tier: advanced analytics
 * (trend line, overrun rate, weekday patterns) — gated via `advancedInsights`,
 * which returns null for free users (the core planner is never gated).
 */
import { type DateKey, WEEKDAY, addDays, diffDays, fmtDuration, toHHMM, weekdayIndex } from "./time";
import { type Block, type BlockDayState, COLOR_NAMES } from "./model";
import { duration } from "./blocks";

export interface Slice {
  key: string;
  label: string;
  minutes: number;
}

/** Blocks whose date falls within [from, to] inclusive. */
export function blocksInRange(state: BlockDayState, from: DateKey, to: DateKey): Block[] {
  return state.blocks.filter((b) => b.date >= from && b.date <= to);
}

const counted = (b: Block, basis: "planned" | "done"): boolean =>
  basis === "done" ? b.status === "done" : b.status !== "skipped";

const minutesOf = (b: Block, basis: "planned" | "done"): number =>
  basis === "done" && b.actualMin !== null ? b.actualMin : duration(b);

/** Minutes grouped by colour. `basis` picks planned (everything not skipped) or done. */
export function distributionByColor(blocks: Block[], basis: "planned" | "done" = "planned"): Slice[] {
  const map = new Map<string, number>();
  for (const b of blocks) {
    if (!counted(b, basis)) continue;
    map.set(b.color, (map.get(b.color) ?? 0) + minutesOf(b, basis));
  }
  return [...map.entries()]
    .map(([key, minutes]) => ({ key, label: COLOR_NAMES[key] ?? key, minutes }))
    .sort((a, b) => b.minutes - a.minutes);
}

/** Minutes grouped by tag (a block with N tags contributes to each). */
export function distributionByTag(blocks: Block[], basis: "planned" | "done" = "planned"): Slice[] {
  const map = new Map<string, number>();
  for (const b of blocks) {
    if (!counted(b, basis)) continue;
    const min = minutesOf(b, basis);
    const tags = b.tags.length ? b.tags : ["untagged"];
    for (const t of tags) map.set(t, (map.get(t) ?? 0) + min);
  }
  return [...map.entries()].map(([key, minutes]) => ({ key, label: key, minutes })).sort((a, b) => b.minutes - a.minutes);
}

export interface PlannedVsDone {
  planned: number;
  done: number;
  completion: number; // 0..1
}

export function plannedVsDone(blocks: Block[]): PlannedVsDone {
  let planned = 0;
  let done = 0;
  for (const b of blocks) {
    if (b.status === "skipped") continue;
    planned += duration(b);
    if (b.status === "done") done += b.actualMin ?? duration(b);
  }
  return { planned, done, completion: planned ? done / planned : 0 };
}

/** Days (ending today, or yesterday if today has nothing yet) with ≥1 completed block. */
export function dayStreak(state: BlockDayState, today: DateKey): number {
  const doneDays = new Set(state.blocks.filter((b) => b.status === "done").map((b) => b.date));
  let day = doneDays.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (doneDays.has(day)) {
    n++;
    day = addDays(day, -1);
  }
  return n;
}

/** Does `date` count toward the streak (≥1 done block)? */
export function dayComplete(state: BlockDayState, date: DateKey): boolean {
  return state.blocks.some((b) => b.date === date && b.status === "done");
}

export interface AdvancedInsights {
  rangeDays: number;
  /** Done minutes per day across the range, oldest → newest. */
  trend: { day: DateKey; minutes: number }[];
  /** Fraction of done blocks that ran longer than planned (0..1). */
  overrunRate: number;
  /** Average done minutes per weekday (index 0=Sun..6=Sat). */
  byWeekday: { weekday: string; minutes: number }[];
  totalDoneMin: number;
}

/**
 * Pro-only advanced analytics. Returns null for free users so callers open the
 * Pro sheet instead — the basic insights above stay free for everyone.
 */
export function advancedInsights(state: BlockDayState, today: DateKey, rangeDays: number, pro: boolean): AdvancedInsights | null {
  if (!pro) return null;
  const from = addDays(today, -(rangeDays - 1));
  const blocks = blocksInRange(state, from, today);
  const done = blocks.filter((b) => b.status === "done");

  const perDay = new Map<DateKey, number>();
  for (const b of done) perDay.set(b.date, (perDay.get(b.date) ?? 0) + (b.actualMin ?? duration(b)));
  const trend = Array.from({ length: rangeDays }, (_, i) => {
    const day = addDays(from, i);
    return { day, minutes: perDay.get(day) ?? 0 };
  });

  const overruns = done.filter((b) => (b.actualMin ?? duration(b)) > duration(b)).length;
  const overrunRate = done.length ? overruns / done.length : 0;

  const wdSum = new Array(7).fill(0);
  const wdCount = new Array(7).fill(0);
  for (const b of done) {
    const wd = weekdayIndex(b.date);
    wdSum[wd] += b.actualMin ?? duration(b);
    wdCount[wd] += 1;
  }
  const byWeekday = WEEKDAY.map((weekday, i) => ({ weekday, minutes: wdCount[i] ? Math.round(wdSum[i] / wdCount[i]) : 0 }));

  return {
    rangeDays,
    trend,
    overrunRate,
    byWeekday,
    totalDoneMin: done.reduce((s, b) => s + (b.actualMin ?? duration(b)), 0),
  };
}

const csvCell = (s: string): string => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/** CSV export: date, title, start, end, duration, color, tags, status. */
export function blocksToCSV(blocks: Block[]): string {
  const header = ["date", "title", "start", "end", "duration", "color", "tags", "status"];
  const rows = [...blocks]
    .sort((a, b) => (a.date === b.date ? a.start - b.start : a.date < b.date ? -1 : 1))
    .map((b) =>
      [
        b.date,
        b.title,
        toHHMM(b.start),
        toHHMM(b.end),
        fmtDuration(duration(b)),
        COLOR_NAMES[b.color] ?? b.color,
        b.tags.join(" "),
        b.status,
      ]
        .map((c) => csvCell(String(c)))
        .join(","),
    );
  return [header.join(","), ...rows].join("\n");
}

export { diffDays };
