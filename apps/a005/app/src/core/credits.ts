/**
 * AI-credit gating and the practice streak. Free users get 3 lifetime scored
 * attempts, then FREE_DAILY per day (extendable by one rewarded ad credit at a
 * time); subscribers get PRO_DAILY per day. Core practice (recording, playback,
 * pacing, samples, history) is NEVER gated — only the AI score is.
 */
import {
  FREE_DAILY_SCORES,
  FREE_LIFETIME_SCORES,
  PRO_DAILY_SCORES,
  addDays,
  type BandUpState,
  type DateKey,
  type Profile,
} from "./model";

/** Today's counters, with the daily bucket rolled over if the day changed. */
function todayCounters(p: Profile, today: DateKey): { dayUsed: number; dayBonus: number } {
  if (p.creditsDate === today) return { dayUsed: p.dayUsed, dayBonus: p.dayBonus };
  return { dayUsed: 0, dayBonus: 0 };
}

export interface CreditInfo {
  remaining: number; // AI scores available right now
  lifetimeRemaining: number; // of the first 3 free, how many are left
  dailyRemaining: number; // today's quota left (after lifetime free is used)
  pro: boolean;
}

export function creditInfo(s: BandUpState, today: DateKey, pro: boolean): CreditInfo {
  const p = s.profile;
  const { dayUsed, dayBonus } = todayCounters(p, today);
  if (pro) {
    const dailyRemaining = Math.max(0, PRO_DAILY_SCORES - dayUsed);
    return { remaining: dailyRemaining, lifetimeRemaining: 0, dailyRemaining, pro: true };
  }
  const lifetimeRemaining = Math.max(0, FREE_LIFETIME_SCORES - p.freeScoredUsed);
  const dailyRemaining = Math.max(0, FREE_DAILY_SCORES + dayBonus - dayUsed);
  // While free lifetime credits remain, those are what you spend; the daily
  // quota only starts mattering once the first 3 are gone.
  const remaining = lifetimeRemaining > 0 ? lifetimeRemaining : dailyRemaining;
  return { remaining, lifetimeRemaining, dailyRemaining, pro: false };
}

export function creditsRemaining(s: BandUpState, today: DateKey, pro: boolean): number {
  return creditInfo(s, today, pro).remaining;
}

export function canScore(s: BandUpState, today: DateKey, pro: boolean): boolean {
  return creditInfo(s, today, pro).remaining > 0;
}

/** Spend one AI credit. Call only after canScore() is true. Rolls the day and
 *  spends a lifetime-free credit first, otherwise a daily one. */
export function consumeCredit(s: BandUpState, today: DateKey, pro: boolean): BandUpState {
  const p = s.profile;
  const rolled = p.creditsDate === today ? p : { ...p, creditsDate: today, dayUsed: 0, dayBonus: 0 };
  if (!pro && rolled.freeScoredUsed < FREE_LIFETIME_SCORES) {
    return { ...s, profile: { ...rolled, freeScoredUsed: rolled.freeScoredUsed + 1 } };
  }
  return { ...s, profile: { ...rolled, creditsDate: today, dayUsed: rolled.dayUsed + 1 } };
}

/** A rewarded ad grants one extra credit for today (free users only). */
export function grantRewardCredit(s: BandUpState, today: DateKey): BandUpState {
  const p = s.profile;
  const rolled = p.creditsDate === today ? p : { ...p, creditsDate: today, dayUsed: 0, dayBonus: 0 };
  return { ...s, profile: { ...rolled, creditsDate: today, dayBonus: rolled.dayBonus + 1 } };
}

// ---- Streak (one freeze protects a single missed day) ---------------------

/** Record practice activity for `today` and update the streak. Idempotent for
 *  the same day. A one-day gap is saved once by the freeze; a bigger gap resets. */
export function recordActivity(s: BandUpState, today: DateKey): BandUpState {
  const p = s.profile;
  if (p.lastActiveDate === today) return s;
  let streakCount: number;
  let freezeAvailable: boolean;
  if (p.lastActiveDate === null) {
    streakCount = 1;
    freezeAvailable = true;
  } else if (p.lastActiveDate === addDays(today, -1)) {
    streakCount = p.streakCount + 1; // consecutive day
    freezeAvailable = true; // freeze replenishes on a clean streak
  } else if (p.lastActiveDate === addDays(today, -2) && p.freezeAvailable) {
    streakCount = p.streakCount + 1; // one missed day, saved by the freeze
    freezeAvailable = false;
  } else {
    streakCount = 1; // streak broken
    freezeAvailable = true;
  }
  return { ...s, profile: { ...p, streakCount, lastActiveDate: today, freezeAvailable } };
}

/** True if the user has already practised today (drives the home "done" state). */
export const practisedToday = (s: BandUpState, today: DateKey): boolean =>
  s.profile.lastActiveDate === today;
