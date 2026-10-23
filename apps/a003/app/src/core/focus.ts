/**
 * ADHD live-cue maths — pure, so the full-screen alarm scene, the Today banner,
 * validate.ts and sim.ts all read the SAME escalation ladder. Given where "now"
 * sits inside the active block, it reports how far along we are, how many minutes
 * are left, and a 0..1 "intensity" that ramps up over the final nudge window so
 * the UI can escalate colour / pulse / vibration smoothly into the transition.
 */
export type FocusPhase = "running" | "ramp" | "ending";

export interface FocusCue {
  phase: FocusPhase;
  /** Whole minutes until the block ends (never negative). */
  minutesLeft: number;
  /** Fraction of the block elapsed, clamped 0..1. */
  elapsed: number;
  /** Escalation 0..1 — 0 while there's plenty of time, 1 at/after the end. */
  intensity: number;
  /** The ramp step currently reached (e.g. 5 then 1 then 0), or null before the ramp. */
  nudgeAt: number | null;
}

/**
 * @param absStart block start in absolute cross-day minutes
 * @param absEnd   block end in absolute cross-day minutes (handles overnight)
 * @param nowAbs   now in the same absolute minutes
 * @param nudges   pre-end nudge offsets (minutes before end), e.g. [5, 1]
 */
export function focusCue(absStart: number, absEnd: number, nowAbs: number, nudges: number[]): FocusCue {
  const total = Math.max(1, absEnd - absStart);
  const left = Math.max(0, absEnd - nowAbs);
  const elapsed = Math.max(0, Math.min(1, (nowAbs - absStart) / total));
  const ladder = nudges.filter((n) => n > 0).slice().sort((a, b) => b - a); // high → low
  const rampStart = ladder.length ? ladder[0] : 5;
  const phase: FocusPhase = left <= 0 ? "ending" : left <= rampStart ? "ramp" : "running";
  const intensity = left <= 0 ? 1 : left >= rampStart ? 0 : 1 - left / rampStart;
  const nudgeAt = left <= 0 ? 0 : ladder.find((n) => left <= n) ?? null;
  return { phase, minutesLeft: Math.round(left), elapsed, intensity, nudgeAt };
}
