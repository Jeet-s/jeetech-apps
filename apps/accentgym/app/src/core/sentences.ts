/**
 * Practice content: diagnostic sentences (chosen to expose each L1's trouble
 * sounds) and themed packs tagged by sound. Pure data + small selectors. IPA is
 * accent-dependent, so it lives in accent.ts, not here.
 */
import type { Accent, L1 } from "./types";
import { L1_TROUBLE } from "./sounds";

export type Pack = "starter" | "ielts" | "workplace";

export interface Sentence {
  id: string;
  text: string;
  soundTags: string[]; // catalog sound ids the sentence exercises
  level: 1 | 2 | 3;
  pack: Pack;
  free: boolean; // available on the free tier
}

/** Diagnostic sentences by L1 — each hits that L1's top trouble sounds. */
export const DIAGNOSTICS: Record<L1, Sentence[]> = {
  hi: [
    { id: "dx_hi_1", text: "We have very warm weather.", soundTags: ["w", "v", "æ"], level: 1, pack: "starter", free: true },
    { id: "dx_hi_2", text: "I think this is the third month.", soundTags: ["θ", "ð", "ɪ"], level: 1, pack: "starter", free: true },
    { id: "dx_hi_3", text: "The ship sailed with the sheep.", soundTags: ["ɪ", "iː", "ʃ"], level: 1, pack: "starter", free: true },
  ],
  es: [
    { id: "dx_es_1", text: "She sees the ship and the sheep.", soundTags: ["ɪ", "iː", "ʃ"], level: 1, pack: "starter", free: true },
    { id: "dx_es_2", text: "The bees buzz in the vineyard.", soundTags: ["z", "v", "s"], level: 1, pack: "starter", free: true },
    { id: "dx_es_3", text: "Please start the red car.", soundTags: ["r", "s", "ɪ"], level: 1, pack: "starter", free: true },
  ],
  ar: [
    { id: "dx_ar_1", text: "Pack a big purple bag.", soundTags: ["p", "b", "æ"], level: 1, pack: "starter", free: true },
    { id: "dx_ar_2", text: "I think the van is very long.", soundTags: ["θ", "v", "ŋ"], level: 1, pack: "starter", free: true },
    { id: "dx_ar_3", text: "This ship is sitting still.", soundTags: ["ð", "ɪ", "ʃ"], level: 1, pack: "starter", free: true },
  ],
  other: [
    { id: "dx_ot_1", text: "I think this is the right way.", soundTags: ["θ", "ð", "ɪ", "r"], level: 1, pack: "starter", free: true },
    { id: "dx_ot_2", text: "The cat has a very bad habit.", soundTags: ["æ", "v", "b"], level: 1, pack: "starter", free: true },
    { id: "dx_ot_3", text: "She sees three sheep.", soundTags: ["ʃ", "s", "θ", "iː"], level: 1, pack: "starter", free: true },
  ],
};

export const SENTENCES: Sentence[] = [
  // Starter / free
  { id: "s_start_1", text: "I would like a cup of water, please.", soundTags: ["w", "l", "p"], level: 1, pack: "starter", free: true },
  { id: "s_start_2", text: "The weather is very warm today.", soundTags: ["w", "v", "ð"], level: 1, pack: "starter", free: true },
  { id: "s_start_3", text: "Three thin threads were there.", soundTags: ["θ", "ð", "r"], level: 2, pack: "starter", free: true },
  { id: "s_start_4", text: "She shares the ship with her sheep.", soundTags: ["ʃ", "ɪ", "iː", "r"], level: 2, pack: "starter", free: true },
  { id: "s_start_5", text: "That black cat sat on a mat.", soundTags: ["ð", "æ"], level: 1, pack: "starter", free: true },
  { id: "s_start_6", text: "Please pass the big red box.", soundTags: ["p", "b", "s", "r"], level: 1, pack: "starter", free: true },
  // IELTS / exam
  { id: "s_ielts_1", text: "In my view, the main advantage is clear.", soundTags: ["v", "ð", "ɪ"], level: 2, pack: "ielts", free: true },
  { id: "s_ielts_2", text: "I strongly believe this matters a lot.", soundTags: ["r", "ð", "l", "æ"], level: 2, pack: "ielts", free: false },
  { id: "s_ielts_3", text: "The research shows three key themes.", soundTags: ["r", "ʃ", "θ", "iː"], level: 3, pack: "ielts", free: false },
  { id: "s_ielts_4", text: "Overall, the results are very positive.", soundTags: ["r", "v", "z", "ɪ"], level: 3, pack: "ielts", free: false },
  // Workplace
  { id: "s_work_1", text: "Thanks, I will send the file this week.", soundTags: ["θ", "w", "ɪ", "iː"], level: 1, pack: "workplace", free: true },
  { id: "s_work_2", text: "Let us review the plan before the vote.", soundTags: ["r", "v", "p", "b"], level: 2, pack: "workplace", free: false },
  { id: "s_work_3", text: "Could you please repeat the question?", soundTags: ["p", "r", "ʃ", "w"], level: 2, pack: "workplace", free: false },
];

export const ALL_SENTENCES: Sentence[] = [
  ...SENTENCES,
  ...(["hi", "es", "ar", "other"] as L1[]).flatMap((l) => DIAGNOSTICS[l]),
];

export const SENTENCE_BY_ID: Record<string, Sentence> = Object.fromEntries(ALL_SENTENCES.map((s) => [s.id, s]));

export function diagnosticsFor(l1: L1): Sentence[] {
  return DIAGNOSTICS[l1];
}

/** Practice sentences available to the user, free-gated and weak-sound-first. */
export function practiceFor(opts: { pro: boolean; weakSounds?: string[]; pack?: Pack }): Sentence[] {
  const { pro, weakSounds = [], pack } = opts;
  let pool = SENTENCES.filter((s) => (pro || s.free) && (!pack || s.pack === pack));
  if (weakSounds.length) {
    const weight = (s: Sentence) => s.soundTags.filter((t) => weakSounds.includes(t)).length;
    pool = [...pool].sort((a, b) => weight(b) - weight(a));
  }
  return pool;
}

/** A sensible "sentence of the day" that targets the user's weakest sound. */
export function sentenceForSound(soundId: string, pro: boolean): Sentence | undefined {
  const pool = SENTENCES.filter((s) => (pro || s.free) && s.soundTags.includes(soundId));
  return pool[0] ?? SENTENCES.find((s) => s.free);
}

/** General-plan seed (for "other" or before a diagnostic). */
export const GENERAL_PLAN = L1_TROUBLE.other.slice(0, 6);
