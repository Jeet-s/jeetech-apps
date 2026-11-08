/**
 * Streak with recovery + one free weekly freeze (a retention hook with a safety
 * net, unlike competitors that punish a single missed day). All local-day based
 * with a grace so timezone travel can't break a streak. Pure, date-driven.
 */
import type { DateKey, Streak } from "./types";
import { addDays, daysBetween } from "./dates";

export const WEEKLY_FREEZES = 1; // free streak-freeze per week
export const RECOVERY_HOURS = 24; // a missed day can be recovered within 24h

export function emptyStreak(): Streak {
  return { current: 0, best: 0, freezesLeft: WEEKLY_FREEZES };
}

/** Monday of the week containing `day`. */
export function weekStart(day: DateKey): DateKey {
  const [y, m, d] = day.split("-").map(Number);
  const dow = new Date(y, m - 1, d, 12).getDay(); // 0=Sun
  const back = (dow + 6) % 7; // days since Monday
  return addDays(day, -back);
}

/** Refill the weekly freeze if we've crossed into a new week. */
export function refillFreezes(s: Streak, today: DateKey): Streak {
  const wk = weekStart(today);
  if (s.freezeWeek === wk) return s;
  return { ...s, freezesLeft: WEEKLY_FREEZES, freezeWeek: wk };
}

/**
 * Record a day of activity (a completed session or a clean scored attempt).
 * Consecutive day → +1; same day → unchanged; a one-day gap auto-spends a freeze
 * if available (keeps the streak); a bigger gap resets to 1 but leaves a 24h
 * recovery window open.
 */
export function recordActivity(streak: Streak, today: DateKey): Streak {
  let s = refillFreezes(streak, today);
  if (s.lastActiveDate === today) return s; // already counted today
  if (!s.lastActiveDate) {
    const current = 1;
    return { ...s, current, best: Math.max(s.best, current), lastActiveDate: today, recoverableUntil: undefined };
  }
  const gap = daysBetween(s.lastActiveDate, today);
  if (gap === 1) {
    const current = s.current + 1;
    return { ...s, current, best: Math.max(s.best, current), lastActiveDate: today, recoverableUntil: undefined };
  }
  if (gap === 2 && s.freezesLeft > 0) {
    // One missed day, but a freeze covers it — streak continues.
    const current = s.current + 1;
    return {
      ...s,
      current,
      best: Math.max(s.best, current),
      freezesLeft: s.freezesLeft - 1,
      lastActiveDate: today,
      recoverableUntil: undefined,
    };
  }
  // Longer gap (or no freeze): streak resets, but recovery stays open for 24h.
  const current = 1;
  return { ...s, current, best: Math.max(s.best, current), lastActiveDate: today, recoverableUntil: addDays(today, 1) };
}

/** Is the streak at risk (active yesterday, nothing yet today)? */
export function atRisk(s: Streak, today: DateKey): boolean {
  return !!s.lastActiveDate && daysBetween(s.lastActiveDate, today) === 1 && s.current > 0;
}

/** Can a just-missed streak still be recovered with a quick drill? */
export function canRecover(s: Streak, today: DateKey): boolean {
  return !!s.recoverableUntil && today <= s.recoverableUntil && s.current <= 1;
}
