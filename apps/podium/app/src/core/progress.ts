/**
 * Streaks, the daily free allowance, XP and entitlement — pure, timezone-safe.
 * These encode the competitor fixes: a streak that survives a missed day with a
 * free weekly freeze (never breaks silently), an allowance that renews at local
 * midnight and is never spent by a silent/failed take, and an entitlement that
 * keeps Pro working offline for a 7-day grace window.
 */
import {
  addDays,
  daysBetween,
  monthKey,
  weekKey,
  type DateKey,
} from "./dates";
import type { Allowance, Entitlement, Streak } from "./types";

// --- Allowance ---
export const FREE_DAILY = 3;
export const PRO_DAILY = 48;
export const MAX_BONUS = 3;

export const emptyAllowance = (today: DateKey): Allowance => ({
  date: today,
  freeTakesUsed: 0,
  freeTakesLimit: FREE_DAILY,
  bonusTakes: 0,
});

/** Roll the allowance over to `today` if the stored day has passed. */
export function renewAllowance(a: Allowance, today: DateKey, pro: boolean): Allowance {
  const limit = pro ? PRO_DAILY : FREE_DAILY;
  if (a.date !== today) return { date: today, freeTakesUsed: 0, freeTakesLimit: limit, bonusTakes: 0 };
  return a.freeTakesLimit === limit ? a : { ...a, freeTakesLimit: limit };
}

export const takesRemaining = (a: Allowance) => Math.max(0, a.freeTakesLimit + a.bonusTakes - a.freeTakesUsed);
export const canRecord = (a: Allowance) => takesRemaining(a) > 0;

/** Reserve a take (called when a counted take starts). */
export function consumeTake(a: Allowance): Allowance {
  return { ...a, freeTakesUsed: a.freeTakesUsed + 1 };
}
/** Give it back (silent/too-short/failed take — never costs the user). */
export function refundTake(a: Allowance): Allowance {
  return { ...a, freeTakesUsed: Math.max(0, a.freeTakesUsed - 1) };
}
/** A rewarded-ad bonus take (capped). */
export function addBonusTake(a: Allowance): Allowance {
  return { ...a, bonusTakes: Math.min(MAX_BONUS, a.bonusTakes + 1) };
}

// --- Streak ---
export const WEEKLY_FREEZE = 1;

export const emptyStreak = (): Streak => ({
  currentCount: 0,
  longest: 0,
  lastPracticeDate: null,
  freezesAvailable: WEEKLY_FREEZE,
  freezeWeek: null,
  repairAvailable: true,
  repairMonth: null,
});

/** Replenish the weekly freeze and monthly repair when a new week/month opens. */
export function refreshStreakGrants(s: Streak, today: DateKey): Streak {
  let next = s;
  const wk = weekKey(today);
  if (s.freezeWeek !== wk) next = { ...next, freezesAvailable: Math.min(WEEKLY_FREEZE, next.freezesAvailable + WEEKLY_FREEZE), freezeWeek: wk };
  const mo = monthKey(today);
  if (s.repairMonth !== mo) next = { ...next, repairAvailable: true, repairMonth: mo };
  return next;
}

/**
 * Register a practice on `today`. Increments on consecutive days; a single
 * missed day auto-consumes a freeze (streak continues); a bigger gap resets.
 * Practising twice in one day is a no-op for the count.
 */
export function registerPractice(streak: Streak, today: DateKey): Streak {
  const s = refreshStreakGrants(streak, today);
  const last = s.lastPracticeDate;
  if (!last) {
    return bump(s, 1, today);
  }
  const gap = daysBetween(last, today);
  if (gap <= 0) return s; // same day (or clock skew) — no change
  if (gap === 1) return bump(s, s.currentCount + 1, today);
  if (gap === 2 && s.freezesAvailable > 0) {
    // Missed exactly one day → spend a freeze and keep going.
    return { ...bump(s, s.currentCount + 1, today), freezesAvailable: s.freezesAvailable - 1 };
  }
  return bump(s, 1, today); // streak broke → start fresh
}

function bump(s: Streak, count: number, today: DateKey): Streak {
  return { ...s, currentCount: count, longest: Math.max(s.longest, count), lastPracticeDate: today };
}

/** Is the streak at risk tonight? (practised yesterday, not yet today) */
export function streakAtRisk(s: Streak, today: DateKey): boolean {
  return !!s.lastPracticeDate && daysBetween(s.lastPracticeDate, today) === 1 && s.currentCount > 0;
}

/** One free repair per month: restore a streak that just broke. Sets the last
 * practice date to yesterday so practising today continues the restored run. */
export function repairStreak(streak: Streak, today: DateKey, restoreTo: number): Streak {
  const s = refreshStreakGrants(streak, today);
  if (!s.repairAvailable) return s;
  const count = Math.max(s.currentCount, restoreTo);
  const lastPracticeDate = s.lastPracticeDate && s.lastPracticeDate >= today ? s.lastPracticeDate : addDays(today, -1);
  return { ...s, currentCount: count, longest: Math.max(s.longest, count), lastPracticeDate, repairAvailable: false, repairMonth: monthKey(today) };
}

// --- XP ---
export const XP_PER_TAKE = 20;
export const XP_WEEKLY_GOAL = 100;
export function xpForScore(score: number): number {
  return XP_PER_TAKE + Math.round(score / 10); // a better take earns a little more
}

// --- Entitlement ---
export const OFFLINE_GRACE_DAYS = 7;

export const freeEntitlement = (): Entitlement => ({
  plan: "free",
  status: "none",
  expiresAt: null,
  trialEndsAt: null,
  lastVerifiedAt: null,
  source: "none",
});

/**
 * Is the user Pro right now? Lifetime is forever; subscriptions/trials are Pro
 * until they expire, with a 7-day offline grace from the last verification so a
 * flaky connection never locks a paying user out.
 */
export function isPro(e: Entitlement, today: DateKey): boolean {
  if (e.plan === "lifetime") return true;
  if (e.status === "active" || e.status === "trial") {
    const end = e.status === "trial" ? e.trialEndsAt : e.expiresAt;
    if (!end) return true;
    if (today <= end) return true;
    // Past expiry but inside the offline grace window → still Pro.
    if (e.lastVerifiedAt && daysBetween(e.lastVerifiedAt, today) <= OFFLINE_GRACE_DAYS) return true;
  }
  return false;
}

export function startSubscription(plan: "monthly" | "yearly", today: DateKey, trialDays: number): Entitlement {
  const period = plan === "monthly" ? 30 : 365;
  const trialEndsAt = trialDays > 0 ? addDays(today, trialDays) : null;
  return {
    plan,
    status: trialDays > 0 ? "trial" : "active",
    trialEndsAt,
    expiresAt: addDays(today, trialDays + period),
    lastVerifiedAt: today,
    source: "store",
  };
}

export function buyLifetime(today: DateKey): Entitlement {
  return { plan: "lifetime", status: "active", expiresAt: null, trialEndsAt: null, lastVerifiedAt: today, source: "store" };
}

/** A fresh verification at launch/restore — refreshes the offline grace clock. */
export function verifyEntitlement(e: Entitlement, today: DateKey): Entitlement {
  return isPro(e, today) ? { ...e, lastVerifiedAt: today } : e;
}

/** Store-reported cancellation: Pro runs until the period ends, then lapses. */
export function cancelSubscription(e: Entitlement, today: DateKey): Entitlement {
  if (e.plan === "lifetime") return e;
  if (e.expiresAt && today > e.expiresAt) return freeEntitlement();
  return { ...e, status: "active", lastVerifiedAt: today };
}

/** Trial-end reminder points (hours before the first charge). */
export const TRIAL_REMINDER_HOURS = [48, 24];
