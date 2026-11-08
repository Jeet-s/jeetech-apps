/**
 * Placement / re-test. A CEFR-style clarity estimate (always LABELLED an
 * estimate, never a verdict — no medical/therapy claim) and a 2-week re-test
 * that's comparable to the first so improvement is honest and visible.
 */
import type { Assessment, Attempt, DateKey, L1 } from "./types";
import { daysBetween } from "./dates";
import { worstSounds } from "./soundplan";

export const RETEST_DAYS = 14;
export const ESTIMATE_DISCLAIMER = "Estimate only — a practice guide, not an official test or therapy.";

export interface ClarityBand {
  label: string; // e.g. "B1 · Clear enough"
  min: number;
}

const BANDS: ClarityBand[] = [
  { label: "C1 · Very clear", min: 90 },
  { label: "B2 · Clear", min: 78 },
  { label: "B1 · Mostly clear", min: 65 },
  { label: "A2 · Developing", min: 50 },
  { label: "A1 · Early", min: 0 },
];

export function clarityLabel(overall: number): string {
  return (BANDS.find((b) => overall >= b.min) ?? BANDS[BANDS.length - 1]).label;
}

/** Average overall across confident attempts (the comparable clarity signal). */
export function clarityScore(attempts: Attempt[]): number {
  const conf = attempts.filter((a) => !a.lowConfidence);
  if (!conf.length) return 0;
  return Math.round(conf.reduce((s, a) => s + a.overallScore, 0) / conf.length);
}

export function buildAssessment(id: string, attempts: Attempt[], l1: L1, date: DateKey): Assessment {
  const overall = clarityScore(attempts);
  return { id, date, overall, clarityEstimate: clarityLabel(overall), topSounds: worstSounds(attempts, l1, 3) };
}

/** Is a re-test due (>= 14 days since the last assessment)? */
export function retestDue(assessments: Assessment[], today: DateKey): boolean {
  if (!assessments.length) return false; // the first assessment is the diagnostic
  const last = assessments[assessments.length - 1];
  return daysBetween(last.date, today) >= RETEST_DAYS;
}

/** First vs latest assessment, for the before/after comparison. */
export function firstVsLatest(assessments: Assessment[]): { first: Assessment; latest: Assessment } | null {
  if (assessments.length < 2) return null;
  return { first: assessments[0], latest: assessments[assessments.length - 1] };
}
