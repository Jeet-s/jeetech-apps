/**
 * The sound catalog: English phonemes Accent Gym coaches, each with a plain-
 * language tip, a mouth-position hint, example words, and per-L1 difficulty.
 * Mother-tongue trouble lists drive the sound check + sound plan. Minimal pairs
 * drive the listen/speak drills. All static, pure data — no scoring here.
 */
import type { L1 } from "./types";

export interface Sound {
  id: string; // IPA symbol, also the SoundMastery key
  name: string; // human label, e.g. "V sound"
  examples: string[]; // example words that contain it
  tip: string; // why it's hard + how to fix (short)
  mouthTip: string; // caption for the mouth-position animation
  /** 0..1 difficulty by mother tongue (higher = harder for that L1). */
  difficultyByL1: Record<L1, number>;
}

const d = (hi: number, es: number, ar: number, other = 0.3): Record<L1, number> => ({ hi, es, ar, other });

export const SOUNDS: Sound[] = [
  {
    id: "v",
    name: "V sound",
    examples: ["vest", "very", "van", "love"],
    tip: "Bite your lower lip gently and let it buzz — don't round your lips like a W.",
    mouthTip: "Top teeth touch the lower lip; voice on.",
    difficultyByL1: d(0.9, 0.7, 0.8),
  },
  {
    id: "w",
    name: "W sound",
    examples: ["west", "wine", "well", "away"],
    tip: "Round your lips into a tight circle — no teeth touch the lip (that would be a V).",
    mouthTip: "Lips round and push forward; no teeth.",
    difficultyByL1: d(0.8, 0.4, 0.5),
  },
  {
    id: "θ",
    name: "TH (think)",
    examples: ["think", "three", "bath", "month"],
    tip: "Put your tongue tip lightly between your teeth and blow — not a T or an S.",
    mouthTip: "Tongue tip between the teeth, air flows, no voice.",
    difficultyByL1: d(0.85, 0.6, 0.6),
  },
  {
    id: "ð",
    name: "TH (this)",
    examples: ["this", "that", "mother", "breathe"],
    tip: "Same as TH in 'think' but add voice — tongue between the teeth, buzzing.",
    mouthTip: "Tongue tip between the teeth, voice on.",
    difficultyByL1: d(0.8, 0.5, 0.55),
  },
  {
    id: "ɪ",
    name: "Short I (ship)",
    examples: ["ship", "sit", "bit", "this"],
    tip: "Relax and shorten the vowel — 'ship' not 'sheep'. Jaw barely moves.",
    mouthTip: "Jaw relaxed, tongue high but loose; short.",
    difficultyByL1: d(0.75, 0.9, 0.7),
  },
  {
    id: "iː",
    name: "Long E (sheep)",
    examples: ["sheep", "seat", "see", "machine"],
    tip: "Smile and stretch the vowel long — 'sheep' not 'ship'.",
    mouthTip: "Lips spread in a smile, tongue high, held long.",
    difficultyByL1: d(0.6, 0.8, 0.6),
  },
  {
    id: "p",
    name: "P sound",
    examples: ["pat", "pin", "spare", "cup"],
    tip: "Press both lips, then release a little puff of air.",
    mouthTip: "Lips together, release a puff of air.",
    difficultyByL1: d(0.3, 0.3, 0.9),
  },
  {
    id: "b",
    name: "B sound",
    examples: ["bat", "big", "about", "cab"],
    tip: "Press both lips and add voice — softer than P, no big puff.",
    mouthTip: "Lips together, voice on, gentle release.",
    difficultyByL1: d(0.3, 0.4, 0.5),
  },
  {
    id: "r",
    name: "R sound",
    examples: ["red", "car", "very", "around"],
    tip: "Curl the tongue back without touching the roof — don't tap or trill it.",
    mouthTip: "Tongue curls back, no tap, lips slightly round.",
    difficultyByL1: d(0.7, 0.85, 0.6),
  },
  {
    id: "l",
    name: "L sound",
    examples: ["light", "call", "late", "feel"],
    tip: "Tongue tip touches behind the top teeth, sides open.",
    mouthTip: "Tongue tip up behind the teeth; voice flows.",
    difficultyByL1: d(0.5, 0.4, 0.5),
  },
  {
    id: "s",
    name: "S sound",
    examples: ["see", "bus", "sun", "pass"],
    tip: "Thin stream of air over the tongue — don't add a vowel before it (not 'es-').",
    mouthTip: "Tongue near the ridge, thin hiss, no voice.",
    difficultyByL1: d(0.3, 0.7, 0.3),
  },
  {
    id: "z",
    name: "Z sound",
    examples: ["zoo", "buzz", "is", "easy"],
    tip: "Like S but add voice — buzz it. Many endings use Z, not S.",
    mouthTip: "Tongue near the ridge, buzz with voice.",
    difficultyByL1: d(0.5, 0.85, 0.6),
  },
  {
    id: "æ",
    name: "Short A (cat)",
    examples: ["cat", "bad", "map", "hand"],
    tip: "Open your mouth wide and drop the jaw — 'cat' not 'cot' or 'ket'.",
    mouthTip: "Jaw drops, mouth wide and open.",
    difficultyByL1: d(0.7, 0.75, 0.7),
  },
  {
    id: "ʃ",
    name: "SH sound",
    examples: ["ship", "wish", "she", "nation"],
    tip: "Pull the tongue back a little and round the lips — a soft 'shhh'.",
    mouthTip: "Tongue pulled back, lips rounded, soft hiss.",
    difficultyByL1: d(0.4, 0.8, 0.4),
  },
  {
    id: "ŋ",
    name: "NG sound",
    examples: ["sing", "long", "thing", "ring"],
    tip: "Keep the back of the tongue up and don't add a hard G at the end.",
    mouthTip: "Back of the tongue up, sound through the nose.",
    difficultyByL1: d(0.5, 0.6, 0.85),
  },
];

export const SOUND_BY_ID: Record<string, Sound> = Object.fromEntries(SOUNDS.map((s) => [s.id, s]));
export const ALL_SOUND_IDS = SOUNDS.map((s) => s.id);
export const isSoundId = (id: string): boolean => id in SOUND_BY_ID;

/**
 * Known trouble sounds per mother tongue, worst-first. Sound check seeds the plan
 * from these; "other" gets a general high-impact plan.
 */
export const L1_TROUBLE: Record<L1, string[]> = {
  hi: ["w", "v", "θ", "ð", "ɪ", "æ"],
  es: ["ɪ", "z", "v", "ʃ", "r", "s"],
  ar: ["p", "v", "ŋ", "ɪ", "θ", "æ"],
  other: ["θ", "ð", "ɪ", "v", "r", "æ"],
};

export const L1_NAME: Record<L1, string> = {
  hi: "Hindi",
  es: "Spanish",
  ar: "Arabic",
  other: "Other",
};

/** A sound a given L1 commonly confuses, used to say "this reveals your native language". */
export function revealsL1(soundId: string, l1: L1): boolean {
  if (l1 === "other") return false;
  return L1_TROUBLE[l1].slice(0, 4).includes(soundId);
}

// ── Minimal pairs ──────────────────────────────────────────────────────────
export type PairLevel = "word" | "sentence" | "twister";
export interface MinimalPair {
  soundId: string; // the sound being contrasted (the "correct" member)
  level: PairLevel;
  a: string; // target word/phrase (contains the sound)
  b: string; // confusable word/phrase (the common substitution)
}

export const MINIMAL_PAIRS: MinimalPair[] = [
  // v / w
  { soundId: "v", level: "word", a: "vest", b: "west" },
  { soundId: "v", level: "word", a: "vine", b: "wine" },
  { soundId: "v", level: "word", a: "veil", b: "whale" },
  { soundId: "v", level: "sentence", a: "I saw the vest.", b: "I saw the west." },
  { soundId: "v", level: "twister", a: "Very wavy waves move the vine.", b: "" },
  { soundId: "w", level: "word", a: "west", b: "vest" },
  { soundId: "w", level: "word", a: "wine", b: "vine" },
  { soundId: "w", level: "sentence", a: "We went this way.", b: "Ve vent this vay." },
  // th
  { soundId: "θ", level: "word", a: "think", b: "sink" },
  { soundId: "θ", level: "word", a: "thin", b: "sin" },
  { soundId: "θ", level: "word", a: "three", b: "tree" },
  { soundId: "θ", level: "sentence", a: "I think it is thin.", b: "I sink it is sin." },
  { soundId: "θ", level: "twister", a: "Three thin thinkers thought.", b: "" },
  { soundId: "ð", level: "word", a: "they", b: "day" },
  { soundId: "ð", level: "word", a: "then", b: "den" },
  { soundId: "ð", level: "sentence", a: "This is their mother.", b: "Dis is dare mudder." },
  // ɪ / iː
  { soundId: "ɪ", level: "word", a: "ship", b: "sheep" },
  { soundId: "ɪ", level: "word", a: "bit", b: "beat" },
  { soundId: "ɪ", level: "word", a: "sit", b: "seat" },
  { soundId: "ɪ", level: "sentence", a: "The ship is here.", b: "The sheep is here." },
  { soundId: "iː", level: "word", a: "sheep", b: "ship" },
  { soundId: "iː", level: "word", a: "seat", b: "sit" },
  { soundId: "iː", level: "sentence", a: "Take a seat, please.", b: "Take a sit, please." },
  // p / b
  { soundId: "p", level: "word", a: "pat", b: "bat" },
  { soundId: "p", level: "word", a: "pin", b: "bin" },
  { soundId: "p", level: "word", a: "pie", b: "buy" },
  { soundId: "p", level: "sentence", a: "Put the pin down.", b: "But the bin down." },
  { soundId: "p", level: "twister", a: "Peter packed a pepper pot.", b: "" },
  { soundId: "b", level: "word", a: "bat", b: "pat" },
  { soundId: "b", level: "word", a: "bin", b: "pin" },
  // r / l
  { soundId: "r", level: "word", a: "right", b: "light" },
  { soundId: "r", level: "word", a: "road", b: "load" },
  { soundId: "r", level: "sentence", a: "Turn right here.", b: "Turn light here." },
  { soundId: "l", level: "word", a: "light", b: "right" },
  { soundId: "l", level: "word", a: "load", b: "road" },
  // s / z
  { soundId: "z", level: "word", a: "zip", b: "sip" },
  { soundId: "z", level: "word", a: "buzz", b: "bus" },
  { soundId: "z", level: "sentence", a: "The bees buzz.", b: "The bees bus." },
  { soundId: "s", level: "word", a: "sip", b: "zip" },
  // æ
  { soundId: "æ", level: "word", a: "cat", b: "cut" },
  { soundId: "æ", level: "word", a: "bad", b: "bed" },
  { soundId: "æ", level: "sentence", a: "The cat sat.", b: "The cot sot." },
  // ʃ
  { soundId: "ʃ", level: "word", a: "ship", b: "chip" },
  { soundId: "ʃ", level: "word", a: "sheet", b: "seat" },
  // ŋ
  { soundId: "ŋ", level: "word", a: "sing", b: "sin" },
  { soundId: "ŋ", level: "word", a: "thing", b: "thin" },
];

export function pairsForSound(soundId: string): MinimalPair[] {
  return MINIMAL_PAIRS.filter((p) => p.soundId === soundId);
}
