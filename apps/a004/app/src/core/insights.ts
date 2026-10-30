/**
 * Analytics over the user's own log — all free. Averages by category, time in
 * range, A1C estimate (works from the first reading, formula shown), ranked
 * best/worst meals and descriptive comparisons like "rice vs roti dinners".
 * Wording is descriptive ("in your log"), never causal or medical.
 */
import {
  type AppState,
  type Context,
  type Meal,
  type Reading,
  CONTEXTS,
  activeProfile,
  liveMeals,
  liveReadings,
} from "./model";
import { classify } from "./readings";
import { MS_DAY, dayKey, daySpan, addDays, startOfDay } from "./dates";

export const WINDOWS = [7, 30, 90] as const;
export type Window = (typeof WINDOWS)[number];

function windowStart(now: number, days: number): number {
  return now - days * MS_DAY;
}

export function readingsInWindow(s: AppState, now: number, days: number, context?: Context): Reading[] {
  const from = windowStart(now, days);
  return liveReadings(s).filter((r) => r.ts >= from && r.ts <= now && (!context || r.context === context));
}

export function mean(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export interface Avg {
  avgMgdl: number | null;
  n: number;
}

export function averageMgdl(readings: Reading[]): Avg {
  const vals = readings.map((r) => r.valueMgdl);
  return { avgMgdl: mean(vals), n: vals.length };
}

/** Average by each context over a window (fasting / pre / post / …). */
export function averagesByContext(s: AppState, now: number, days: number): Record<Context, Avg> {
  const out = {} as Record<Context, Avg>;
  for (const c of CONTEXTS) out[c] = averageMgdl(readingsInWindow(s, now, days, c));
  return out;
}

export function overallAverage(s: AppState, now: number, days: number): Avg {
  return averageMgdl(readingsInWindow(s, now, days));
}

// ── Time in range ────────────────────────────────────────────────────────────────

export interface Tir {
  inRange: number;
  high: number;
  low: number;
  total: number;
  pctInRange: number;
  pctHigh: number;
  pctLow: number;
}

/** Each reading is scored against its own context target range. */
export function timeInRange(s: AppState, now: number, days: number): Tir {
  const profile = activeProfile(s);
  const readings = readingsInWindow(s, now, days);
  let inRange = 0;
  let high = 0;
  let low = 0;
  for (const r of readings) {
    const level = classify(r.valueMgdl, r.context, profile).level;
    if (level === "in_range") inRange++;
    else if (level === "high") high++;
    else low++;
  }
  const total = readings.length;
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  return { inRange, high, low, total, pctInRange: pct(inRange), pctHigh: pct(high), pctLow: pct(low) };
}

// ── A1C estimate ──────────────────────────────────────────────────────────────────

export const A1C_FORMULA = "A1C % = (average mg/dL + 46.7) / 28.7";

export interface A1cEstimate {
  a1c: number | null; // %
  avgMgdl: number | null;
  n: number;
  days: number;
  formula: string;
  /** Plain-language confidence note stating sample size. */
  confidence: string;
}

/** eAG → A1C estimate. Works from the first reading; confidence states N/D. */
export function estimateA1C(readings: Reading[]): A1cEstimate {
  const { avgMgdl, n } = averageMgdl(readings);
  const days = daySpan(readings.map((r) => r.ts));
  const a1c = avgMgdl === null ? null : Math.round(((avgMgdl + 46.7) / 28.7) * 10) / 10;
  const confidence =
    n === 0
      ? "No readings yet — log a few to see an estimate."
      : `Estimate based on ${n} reading${n === 1 ? "" : "s"} over ${days} day${days === 1 ? "" : "s"}. ${n < 14 ? "More readings over more days make this more reliable." : "This is a wellness estimate, not a lab A1C."}`;
  return { a1c, avgMgdl, n, days, formula: A1C_FORMULA, confidence };
}

/** A1C over a fixed window from `now` (for the Insights card). */
export function a1cForWindow(s: AppState, now: number, days = 90): A1cEstimate {
  return estimateA1C(readingsInWindow(s, now, days));
}

// ── Best / worst meals ─────────────────────────────────────────────────────────────

export interface MealRank {
  mealId: string;
  label: string;
  slot: Meal["slot"];
  postMgdl: number;
  delta: number | null;
  ts: number;
}

export function mealLabel(meal: Meal): string {
  const names = meal.items.map((i) => i.name);
  if (!names.length) return "Meal";
  return names.length <= 2 ? names.join(", ") : `${names[0]}, ${names[1]} +${names.length - 2}`;
}

/**
 * Meals ranked by their linked after-meal reading (lower = steadier = better).
 * Only meals that actually have an after reading are included; the sample size
 * is the returned array length. Descriptive, not a recommendation.
 */
export function rankedMeals(s: AppState): MealRank[] {
  // Group the (already profile-filtered, soft-delete-filtered) readings by their meal ONCE, so this
  // is O(readings + meals) instead of O(meals × readings): mealReadings(s, id) re-scans + re-sorts
  // every reading per meal, which on a few hundred logged entries turned the Insights screen into a
  // main-thread hog (the soak-test ANR). The before/after/delta logic mirrors mealReadings exactly.
  const byMeal = new Map<string, Reading[]>();
  for (const r of liveReadings(s)) {
    if (r.mealId == null) continue;
    (byMeal.get(r.mealId) ?? byMeal.set(r.mealId, []).get(r.mealId)!).push(r);
  }
  const ranked: MealRank[] = [];
  for (const meal of liveMeals(s)) {
    const linked = byMeal.get(meal.id);
    if (!linked || linked.length === 0) continue;
    // liveReadings already yields oldest→newest, so the group is sorted; a single reading only
    // counts as an "after" when it falls at/after the meal (same rule as mealReadings).
    let after: Reading | null;
    let delta: number | null = null;
    if (linked.length === 1) {
      after = linked[0].ts > meal.ts ? linked[0] : null;
    } else {
      const before = linked[0];
      after = linked[linked.length - 1];
      delta = after.valueMgdl - before.valueMgdl;
    }
    if (!after) continue;
    ranked.push({ mealId: meal.id, label: mealLabel(meal), slot: meal.slot, postMgdl: after.valueMgdl, delta, ts: meal.ts });
  }
  return ranked.sort((a, b) => a.postMgdl - b.postMgdl);
}

export function bestWorstMeals(s: AppState, count = 3): { best: MealRank[]; worst: MealRank[]; sample: number } {
  const ranked = rankedMeals(s);
  return {
    best: ranked.slice(0, count),
    worst: ranked.slice(-count).reverse(),
    sample: ranked.length,
  };
}

// ── Comparisons (e.g. rice vs roti dinners) ─────────────────────────────────────────

export interface Comparison {
  aLabel: string;
  bLabel: string;
  aAvg: number | null; // next-morning fasting avg after A dinners
  bAvg: number | null;
  aN: number;
  bN: number;
  minSample: number;
  enough: boolean;
  note: string;
}

const MIN_COMPARISON = 3;

function mealMatches(meal: Meal, term: string): boolean {
  const t = term.toLowerCase();
  return meal.items.some((i) => i.name.toLowerCase().includes(t));
}

/** Mean fasting value per calendar day, built from one pass over the readings (so callers that
 *  need the "morning after" for many meals don't re-scan every reading per meal — a soak-ANR source). */
function fastingMeanByDay(s: AppState): Map<string, number> {
  const sums = new Map<string, { total: number; n: number }>();
  for (const r of liveReadings(s)) {
    if (r.context !== "fasting") continue;
    const k = dayKey(r.ts);
    const acc = sums.get(k) ?? { total: 0, n: 0 };
    acc.total += r.valueMgdl;
    acc.n += 1;
    sums.set(k, acc);
  }
  const out = new Map<string, number>();
  for (const [k, { total, n }] of sums) out.set(k, total / n);
  return out;
}

/**
 * Compare two dinner staples by the next-morning fasting reading in the user's
 * own log. Needs ≥3 samples each; otherwise reports progress, not a conclusion.
 */
export function compareDinnerStaple(s: AppState, aTerm: string, bTerm: string, aLabel = aTerm, bLabel = bTerm): Comparison {
  const dinners = liveMeals(s).filter((m) => m.slot === "dinner");
  const fastingByDay = fastingMeanByDay(s);
  const aVals: number[] = [];
  const bVals: number[] = [];
  for (const meal of dinners) {
    const nextDay = addDays(dayKey(meal.ts), 1);
    const fasting = fastingByDay.get(nextDay) ?? null;
    if (fasting === null) continue;
    if (mealMatches(meal, aTerm)) aVals.push(fasting);
    if (mealMatches(meal, bTerm)) bVals.push(fasting);
  }
  const aAvg = mean(aVals);
  const bAvg = mean(bVals);
  const enough = aVals.length >= MIN_COMPARISON && bVals.length >= MIN_COMPARISON;
  const note = enough
    ? `In your log, mornings after ${aLabel} dinners averaged ${Math.round(aAvg!)} vs ${Math.round(bAvg!)} after ${bLabel} dinners (${aVals.length} vs ${bVals.length} days).`
    : `Log at least ${MIN_COMPARISON} dinners of each with a next-morning fasting reading. So far: ${aVals.length} ${aLabel}, ${bVals.length} ${bLabel}.`;
  return { aLabel, bLabel, aAvg, bAvg, aN: aVals.length, bN: bVals.length, minSample: MIN_COMPARISON, enough, note };
}

// ── Logging streak (optional, no loss-framing) ─────────────────────────────────────

/** Consecutive days with at least one reading, ending today or yesterday. */
export function loggingStreak(s: AppState, now: number): number {
  if (!s.streakEnabled) return 0;
  const days = new Set(liveReadings(s).map((r) => dayKey(r.ts)));
  let cursor = dayKey(now);
  if (!days.has(cursor)) cursor = addDays(cursor, -1); // today not logged yet → count up to yesterday
  let n = 0;
  while (days.has(cursor)) {
    n++;
    cursor = addDays(cursor, -1);
  }
  return n;
}

// ── Chart series ─────────────────────────────────────────────────────────────────

export interface DayPoint {
  day: string;
  avgMgdl: number | null;
  count: number;
}

/** Per-day average for the N days ending today (oldest first) — for bar/line charts. */
export function daySeries(s: AppState, now: number, days = 7): DayPoint[] {
  const buckets = new Map<string, number[]>();
  for (const r of readingsInWindow(s, now, days)) {
    const k = dayKey(r.ts);
    (buckets.get(k) ?? buckets.set(k, []).get(k)!).push(r.valueMgdl);
  }
  return Array.from({ length: days }, (_, i) => {
    const day = dayKey(startOfDay(now) - (days - 1 - i) * MS_DAY);
    const vals = buckets.get(day) ?? [];
    return { day, avgMgdl: mean(vals), count: vals.length };
  });
}

/** Whether there are enough linked meals to show personal food insights yet. */
export function insightsReady(s: AppState, minLinked = 3): { ready: boolean; have: number; need: number } {
  const have = rankedMeals(s).length;
  return { ready: have >= minLinked, have, need: Math.max(0, minLinked - have) };
}
