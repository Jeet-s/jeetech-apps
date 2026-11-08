/**
 * Sound mastery — the sound map that fills over time. Each sound keeps a smoothed
 * score, a trend (for the 30-day per-sound graph) and a "mastered" flag. Scores
 * move with an EMA so one lucky/unlucky attempt can't flip a sound.
 */
import type { DateKey, SoundMastery } from "./types";
import { SOUND_BY_ID } from "./sounds";

export const MASTERED_AT = 85; // smoothed score to count a sound "mastered"
export const MASTERED_STREAK = 3; // consecutive trend points ≥ MASTERED_AT
const EMA_ALPHA = 0.4; // weight of the newest attempt
const TREND_CAP = 60; // keep ~2 months of points

export function emptyMastery(soundId: string): SoundMastery {
  return { soundId, score: 50, trend: [], mastered: false };
}

export function getMastery(map: Record<string, SoundMastery>, soundId: string): SoundMastery {
  return map[soundId] ?? emptyMastery(soundId);
}

/** Fold one observed score for a sound into its mastery (pure, returns new map). */
export function recordSound(
  map: Record<string, SoundMastery>,
  soundId: string,
  observed: number,
  today: DateKey,
): Record<string, SoundMastery> {
  if (!SOUND_BY_ID[soundId]) return map;
  const prev = getMastery(map, soundId);
  const score = prev.trend.length ? Math.round(prev.score * (1 - EMA_ALPHA) + observed * EMA_ALPHA) : observed;
  const trend = [...prev.trend, { date: today, score }].slice(-TREND_CAP);
  const recent = trend.slice(-MASTERED_STREAK);
  const mastered = recent.length >= MASTERED_STREAK && recent.every((t) => t.score >= MASTERED_AT);
  return { ...map, [soundId]: { soundId, score, trend, lastPracticed: today, mastered } };
}

/** Fold a batch of (soundId, score) observations in order. */
export function recordSounds(
  map: Record<string, SoundMastery>,
  obs: { soundId: string; score: number }[],
  today: DateKey,
): Record<string, SoundMastery> {
  return obs.reduce((m, o) => recordSound(m, o.soundId, o.score, today), map);
}

export function masteredCount(map: Record<string, SoundMastery>): number {
  return Object.values(map).filter((m) => m.mastered).length;
}

/** Trend points within the last `days` days (for the per-sound 30-day graph). */
export function trendWindow(m: SoundMastery, today: DateKey, days = 30): { date: DateKey; score: number }[] {
  const [y, mo, d] = today.split("-").map(Number);
  const cutoff = new Date(y, mo - 1, d - days + 1, 12).getTime();
  return m.trend.filter((t) => {
    const [ty, tm, td] = t.date.split("-").map(Number);
    return new Date(ty, tm - 1, td, 12).getTime() >= cutoff;
  });
}

/** First-session vs now, per sound (for the before/after comparison). */
export function firstVsNow(m: SoundMastery): { first: number; now: number } | null {
  if (!m.trend.length) return null;
  return { first: m.trend[0].score, now: m.trend[m.trend.length - 1].score };
}
