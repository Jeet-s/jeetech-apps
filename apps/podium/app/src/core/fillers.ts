/**
 * Context-aware filler detection. Competitors are hammered for false fillers
 * ("like" as a verb, every "so" flagged). We classify each word from its
 * neighbours, honour a personal ignore list the user builds by tapping
 * "not a filler", and never flag stutter repeats when stutter-friendly mode is
 * on. Pure functions over a token stream — same input, same output.
 */
import type { Word } from "./types";

/** Always-filler discourse markers (standalone). */
export const HARD_FILLERS = new Set([
  "um", "umm", "uh", "uhh", "uhm", "er", "err", "erm", "ah", "ahh", "mmm", "hmm", "eh",
  "basically", "actually", "literally", "honestly", "seriously",
]);

/** Context-sensitive fillers — only a filler in a discourse-marker position. */
export const SOFT_FILLERS = new Set(["like", "so", "well", "right", "okay", "ok", "yeah", "anyway", "anyways"]);

/** Multi-word fillers, matched across adjacent tokens. */
export const PHRASE_FILLERS = [
  ["you", "know"],
  ["i", "mean"],
  ["kind", "of"],
  ["sort", "of"],
  ["and", "stuff"],
  ["or", "whatever"],
];

/** Words that, right before "like", mark it as a verb/preposition — not a filler. */
const LIKE_NOT_FILLER_PREV = new Set([
  "i", "you", "we", "they", "he", "she", "it", "who",
  "do", "does", "did", "don't", "really", "would", "to", "just",
  "feel", "feels", "felt", "look", "looks", "looked", "seem", "seems", "seemed",
  "run", "move", "moves", "fly", "flies", "shine", "shines", "something", "things",
]);

const norm = (s: string) => s.toLowerCase().replace(/[^a-z']/g, "");

/** The ~600ms silent gap before this word? Derived from timing. */
export const PAUSE_MS = 600;
export const LONG_PAUSE_MS = 1500;

/**
 * Decide whether token `i` is a filler, given its neighbours. Deterministic.
 * `ignore` holds user-whitelisted lemmas; stutter mode spares exact repeats.
 */
export function classifyFiller(
  tokens: string[],
  i: number,
  opts: { ignore?: Set<string>; stutterFriendly?: boolean } = {},
): boolean {
  const w = norm(tokens[i]);
  if (!w) return false;
  if (opts.ignore?.has(w)) return false;

  // Stutter repeats ("I-I-I", "the the") are never fillers in stutter mode.
  if (opts.stutterFriendly && i > 0 && norm(tokens[i - 1]) === w) return false;

  // Multi-word phrase fillers: flag the FIRST token of the phrase only.
  for (const phrase of PHRASE_FILLERS) {
    if (w === phrase[0] && phrase.every((p, k) => norm(tokens[i + k] ?? "") === p)) {
      if (opts.ignore?.has(phrase.join(" "))) return false;
      return true;
    }
    // A later token of a matched phrase is absorbed by the first.
    if (phrase.length > 1 && w === phrase[1] && norm(tokens[i - 1] ?? "") === phrase[0]) return false;
  }

  if (HARD_FILLERS.has(w)) return true;

  if (SOFT_FILLERS.has(w)) {
    const prev = norm(tokens[i - 1] ?? "");
    const next = norm(tokens[i + 1] ?? "");
    if (w === "like") {
      // Verb/preposition usage ("I like", "run like the wind") is not a filler.
      if (LIKE_NOT_FILLER_PREV.has(prev)) return false;
      // "like a/the/this" comparison is usually real; discourse "like," is not.
      if (["a", "an", "the", "this", "that", "those", "these"].includes(next) && prev && !isBoundary(prev)) return false;
      return true;
    }
    if (w === "so") {
      // "so happy", "so much", "so that" are intensifiers/conjunctions, not fillers.
      if (["happy", "much", "many", "that", "good", "big", "hard", "far", "long", "glad", "proud"].includes(next)) return false;
      // Discourse "so" sits at a boundary (start, or after a pause/sentence end).
      return i === 0 || isBoundary(prev);
    }
    // well / right / okay / yeah / anyway → filler only as a standalone opener.
    return i === 0 || isBoundary(prev) || isBoundary(next);
  }
  return false;
}

/** A sentence boundary token (end punctuation collapses to ""). */
const isBoundary = (t: string) => t === "";

/** Classify every word in a transcript; returns NEW Word objects (no mutation). */
export function detectFillers(
  words: Word[],
  opts: { ignore?: string[]; stutterFriendly?: boolean } = {},
): Word[] {
  const ignore = new Set((opts.ignore ?? []).map((s) => s.toLowerCase()));
  const tokens = words.map((w) => w.text);
  return words.map((w, i) => {
    const isPause = i > 0 && w.startMs - words[i - 1].endMs >= PAUSE_MS;
    const isFiller = w.userCorrected
      ? w.isFiller // user settled this one; respect it
      : classifyFiller(tokens, i, { ignore, stutterFriendly: opts.stutterFriendly });
    return { ...w, isFiller, isPause };
  });
}

/** Repeated adjacent content words (for the "repeated words" highlight). */
export function repeatedWordIndexes(words: Word[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < words.length; i++) {
    if (norm(words[i].text) && norm(words[i].text) === norm(words[i - 1].text)) out.push(i);
  }
  return out;
}

/** The lemma a "not a filler" tap should add to the personal ignore list. */
export const fillerLemma = (text: string) => norm(text);
