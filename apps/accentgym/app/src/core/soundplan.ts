/**
 * Mother-tongue sound check + sound plan — the headline "how we win" over
 * BoldVoice. From the first ≤3 diagnostic attempts we name the 3 worst sounds
 * (flagging which ones reveal the user's native language) and build an ordered
 * sound plan. The plan reorders as mastery changes (weakest first).
 */
import type { Attempt, L1, SoundMastery } from "./types";
import { L1_TROUBLE, SOUND_BY_ID, isSoundId, revealsL1 } from "./sounds";

export interface SoundReportItem {
  soundId: string;
  name: string;
  score: number;
  observed: boolean;
  examples: string[];
  revealsNativeLanguage: boolean;
}

export interface SoundReport {
  items: SoundReportItem[]; // exactly 3 (padded from the L1 list if diagnostics were thin)
  language: L1;
}

/** Aggregate every phoneme across the diagnostic attempts → average per sound. */
export function aggregateSounds(attempts: Attempt[]): Map<string, number> {
  const by = new Map<string, { sum: number; count: number }>();
  for (const a of attempts) {
    if (a.lowConfidence) continue;
    for (const p of a.phonemeScores) {
      if (!isSoundId(p.ph)) continue;
      const e = by.get(p.ph) ?? { sum: 0, count: 0 };
      e.sum += p.score;
      e.count += 1;
      by.set(p.ph, e);
    }
  }
  const avg = new Map<string, number>();
  for (const [id, e] of by) avg.set(id, Math.round(e.sum / e.count));
  return avg;
}

/** The three worst sounds, worst-first. Falls back to the L1 trouble list. */
export function worstSounds(attempts: Attempt[], l1: L1, n = 3): string[] {
  const avg = aggregateSounds(attempts);
  const ranked = [...avg.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id);
  const out: string[] = [];
  for (const id of ranked) {
    if (out.length >= n) break;
    out.push(id);
  }
  // Pad from the L1 trouble list if fewer than n sounds were heard.
  for (const id of L1_TROUBLE[l1]) {
    if (out.length >= n) break;
    if (!out.includes(id)) out.push(id);
  }
  return out.slice(0, n);
}

export function buildReport(attempts: Attempt[], l1: L1): SoundReport {
  const avg = aggregateSounds(attempts);
  const ids = worstSounds(attempts, l1, 3);
  const items = ids.map((soundId) => {
    const s = SOUND_BY_ID[soundId];
    return {
      soundId,
      name: s?.name ?? soundId,
      score: avg.get(soundId) ?? 55,
      observed: avg.has(soundId),
      examples: s?.examples.slice(0, 3) ?? [],
      revealsNativeLanguage: revealsL1(soundId, l1),
    };
  });
  return { items, language: l1 };
}

/**
 * Build the initial sound plan: the worst diagnostic sounds first, then the
 * rest of the L1 trouble list, deduped. "other" → general plan.
 */
export function buildPlan(attempts: Attempt[], l1: L1, size = 6): string[] {
  const plan: string[] = [...worstSounds(attempts, l1, 3)];
  for (const id of L1_TROUBLE[l1]) {
    if (plan.length >= size) break;
    if (!plan.includes(id)) plan.push(id);
  }
  return plan.slice(0, size);
}

/** Reorder an existing plan weakest-first using current mastery (stable for ties). */
export function reorderPlan(plan: string[], mastery: Record<string, SoundMastery>): string[] {
  return plan
    .map((id, i) => ({ id, i, score: mastery[id]?.score ?? 50 }))
    .sort((a, b) => a.score - b.score || a.i - b.i)
    .map((x) => x.id);
}
