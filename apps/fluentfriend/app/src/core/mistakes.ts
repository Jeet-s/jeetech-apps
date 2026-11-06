/**
 * My Mistakes + spaced repetition — pure. AI-found corrections become review
 * items on an expanding interval (SM-2 lite). A new item is due the SAME day it
 * is saved (so it shows up in My Mistakes right away); a correct review pushes it
 * to the next interval (1 → 3 → 7 days); a wrong one sends it back to the start.
 * An item is mastered after 3 correct reviews. Reviews are capped at REVIEW_CAP/day.
 */
import { addDays, type DateKey } from "./dates";
import type { Mistake } from "./types";

export const INTERVALS = [1, 3, 7] as const; // days after each successful review
export const MASTER_AT = 3;
export const REVIEW_CAP = 10;

export function newMistake(
  id: string,
  sessionId: string,
  original: string,
  corrected: string,
  explanationBn: string,
  today: DateKey,
): Mistake {
  return {
    id,
    sessionId,
    original,
    corrected,
    explanationBn,
    dueAt: today, // first review is available the same day the mistake is saved
    interval: INTERVALS[0],
    correctCount: 0,
    mastered: false,
  };
}

/** Items due for review today (not mastered, due on/before today), capped. */
export function dueMistakes(mistakes: Mistake[], today: DateKey, cap = REVIEW_CAP): Mistake[] {
  return mistakes.filter((m) => !m.mastered && m.dueAt <= today).slice(0, cap);
}

/** Apply a review result to one item. */
export function reviewMistake(m: Mistake, correct: boolean, today: DateKey): Mistake {
  if (!correct) {
    return { ...m, correctCount: 0, interval: INTERVALS[0], dueAt: addDays(today, INTERVALS[0]), mastered: false };
  }
  const correctCount = m.correctCount + 1;
  const mastered = correctCount >= MASTER_AT;
  const interval = INTERVALS[Math.min(correctCount, INTERVALS.length - 1)];
  return {
    ...m,
    correctCount,
    mastered,
    interval,
    dueAt: mastered ? m.dueAt : addDays(today, interval),
  };
}

export const masteredCount = (mistakes: Mistake[]) => mistakes.filter((m) => m.mastered).length;
