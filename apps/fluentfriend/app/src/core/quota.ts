/**
 * Daily AI speaking quota — pure. Free users get FREE_AI_RUNS a day, Pro
 * subscribers PRO_AI_RUNS; an opted-in rewarded video adds bonus runs. Counters
 * reset at the learner's local midnight (keyed by date). When the quota is
 * spent — or the learner is offline — the UI falls back to the scripted
 * role-play, which is always allowed.
 */
import type { DateKey } from "./dates";
import type { QuotaState } from "./types";

export const FREE_AI_RUNS = 8;
export const PRO_AI_RUNS = 53;
export const REWARD_BONUS_RUNS = 3; // one opted-in rewarded video

export const emptyQuota = (today: DateKey): QuotaState => ({
  date: today,
  aiRunsUsed: 0,
  bonusRuns: 0,
});

export const dailyLimit = (pro: boolean) => (pro ? PRO_AI_RUNS : FREE_AI_RUNS);

/** Roll the counters over if the stored date is not today. */
export function rolledOver(q: QuotaState, today: DateKey): QuotaState {
  return q.date === today ? q : emptyQuota(today);
}

export function remaining(q: QuotaState, today: DateKey, pro: boolean): number {
  const cur = rolledOver(q, today);
  return Math.max(0, dailyLimit(pro) + cur.bonusRuns - cur.aiRunsUsed);
}

export const canUseAi = (q: QuotaState, today: DateKey, pro: boolean) => remaining(q, today, pro) > 0;

/** Consume one AI run (call only when canUseAi). Never goes above the cap. */
export function consumeRun(q: QuotaState, today: DateKey): QuotaState {
  const cur = rolledOver(q, today);
  return { ...cur, aiRunsUsed: cur.aiRunsUsed + 1 };
}

/** Grant bonus runs after an opted-in rewarded video. */
export function grantBonus(q: QuotaState, today: DateKey, runs = REWARD_BONUS_RUNS): QuotaState {
  const cur = rolledOver(q, today);
  return { ...cur, bonusRuns: cur.bonusRuns + runs };
}
