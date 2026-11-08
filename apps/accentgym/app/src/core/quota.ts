/**
 * Daily scored-practice allowance — the honest free tier. Free: 5 scored
 * sentences/day FOREVER (never expires after day 2), +3 per opt-in rewarded ad.
 * Pro: effectively uncapped (a high daily ceiling so a maxed-out user can't cost
 * more than the plan). Resets at local midnight. Model listening / minimal-pair
 * listening / dashboard are NEVER gated here — only scoring counts.
 */
import type { DailyQuota, DateKey } from "./types";

export const FREE_DAILY = 5;
export const PRO_DAILY = 134; // tech-plan ceiling
export const REWARD_BONUS = 3; // +3 scored sentences per rewarded ad
export const MAX_BONUS = 9; // at most 3 rewarded top-ups a day

export function emptyQuota(today: DateKey): DailyQuota {
  return { date: today, scoredUsed: 0, bonusFromAds: 0 };
}

/** Roll the quota over to `today` if it belongs to a previous day. */
export function rollover(q: DailyQuota, today: DateKey): DailyQuota {
  return q.date === today ? q : emptyQuota(today);
}

export function dailyCap(pro: boolean): number {
  return pro ? PRO_DAILY : FREE_DAILY;
}

export function allowance(q: DailyQuota, today: DateKey, pro: boolean): number {
  const cur = rollover(q, today);
  return dailyCap(pro) + (pro ? 0 : cur.bonusFromAds);
}

export function remaining(q: DailyQuota, today: DateKey, pro: boolean): number {
  const cur = rollover(q, today);
  return Math.max(0, allowance(cur, today, pro) - cur.scoredUsed);
}

export function canScore(q: DailyQuota, today: DateKey, pro: boolean): boolean {
  return remaining(q, today, pro) > 0;
}

/** Consume one scored attempt. Caller must check canScore first; this is safe. */
export function useScore(q: DailyQuota, today: DateKey, pro: boolean): DailyQuota {
  const cur = rollover(q, today);
  if (allowance(cur, today, pro) - cur.scoredUsed <= 0) return cur; // never over-spend
  return { ...cur, scoredUsed: cur.scoredUsed + 1 };
}

/** Grant a rewarded-ad bonus (free tier only, capped). */
export function addBonus(q: DailyQuota, today: DateKey): DailyQuota {
  const cur = rollover(q, today);
  return { ...cur, bonusFromAds: Math.min(MAX_BONUS, cur.bonusFromAds + REWARD_BONUS) };
}
