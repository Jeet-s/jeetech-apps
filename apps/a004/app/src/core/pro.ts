/**
 * Pro gating + AI daily quota. The CORE JOB (logging, charts, averages, TIR,
 * A1C, reminders, CSV/PDF export, dish search, local backup, ranked insights)
 * is NEVER gated. Pro adds cloud sync, unlimited-ish AI coaching, AI narrative
 * summaries and advanced clinician reports. Quota is computed, never hidden.
 */
import { type AppState } from "./model";
import { dayKey } from "./dates";

export const FREE_AI_DAILY = 3;
export const PRO_AI_DAILY = 100;

/** Features that require Pro. Everything NOT listed here stays free forever. */
export type ProFeature =
  | "cloud_sync"
  | "ai_meal_coach"
  | "ai_weekly_narrative"
  | "ai_insight_narrative"
  | "advanced_report";

export const PRO_FEATURES: ProFeature[] = [
  "cloud_sync",
  "ai_meal_coach",
  "ai_weekly_narrative",
  "ai_insight_narrative",
  "advanced_report",
];

export function isProFeature(feature: ProFeature): boolean {
  return PRO_FEATURES.includes(feature);
}

export function aiDailyLimit(pro: boolean): number {
  return pro ? PRO_AI_DAILY : FREE_AI_DAILY;
}

/** Quota used today (resets when the day key rolls over). */
export function aiUsedToday(s: AppState, today: string): number {
  return s.quota.day === today ? s.quota.used : 0;
}

export function aiRemaining(s: AppState, pro: boolean, today: string): number {
  return Math.max(0, aiDailyLimit(pro) - aiUsedToday(s, today));
}

export function canUseAi(s: AppState, pro: boolean, today: string): boolean {
  return aiRemaining(s, pro, today) > 0;
}

/** Record one AI analysis against today's quota. */
export function consumeAi(s: AppState, today: string): AppState {
  const used = aiUsedToday(s, today) + 1;
  return { ...s, quota: { day: today, used } };
}

/** Convenience from an epoch `now`. */
export function aiRemainingAt(s: AppState, pro: boolean, now: number): number {
  return aiRemaining(s, pro, dayKey(now));
}
