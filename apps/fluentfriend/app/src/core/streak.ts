/**
 * Streak with one freeze — pure. A day counts when the learner completes any
 * core action (finishes a lesson day, a quiz, an AI session or a review). The
 * streak ticks over at local midnight:
 *  - same day again → no change;
 *  - the next day → +1;
 *  - exactly one day skipped, freeze available → freeze is spent, streak holds
 *    and extends (the skipped day is forgiven);
 *  - a bigger gap, or no freeze → streak resets to 1.
 * The freeze refills whenever the learner is on a fresh (non-forgiven) run.
 */
import { addDays, type DateKey } from "./dates";
import type { StreakState } from "./types";

export const emptyStreak = (): StreakState => ({
  current: 0,
  longest: 0,
  freezeAvailable: true,
  lastActiveDate: null,
});

export function recordActivity(s: StreakState, today: DateKey): StreakState {
  const last = s.lastActiveDate;
  if (last === today) return s; // already counted today

  let current: number;
  let freezeAvailable = s.freezeAvailable;

  if (last === null) {
    current = 1;
    freezeAvailable = true;
  } else if (today === addDays(last, 1)) {
    current = s.current + 1; // consecutive
    freezeAvailable = true; // a clean run refills the freeze
  } else if (today === addDays(last, 2) && s.freezeAvailable) {
    current = s.current + 1; // one skipped day forgiven
    freezeAvailable = false; // freeze spent
  } else {
    current = 1; // gap too big (or no freeze) → restart
    freezeAvailable = true;
  }

  return {
    current,
    longest: Math.max(s.longest, current),
    freezeAvailable,
    lastActiveDate: today,
  };
}

/** Is today's streak still alive (done today or yesterday, or a forgivable gap)? */
export function streakAtRisk(s: StreakState, today: DateKey): boolean {
  if (s.current === 0 || !s.lastActiveDate) return false;
  return s.lastActiveDate === addDays(today, -1); // yesterday was the last active day
}
