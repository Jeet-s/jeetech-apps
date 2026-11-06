/**
 * Repeat-after-me scoring — pure, on-device. Compares the recognised (or typed)
 * transcript against the target phrase word by word so the UI can highlight the
 * missed words and show a Bangla tip. No audio here; the transcript is produced
 * by expo-speech-recognition (or the typed fallback) in the UI layer.
 */
export interface WordScore {
  word: string; // normalized (lowercase, punctuation-stripped) form used for matching
  surface: string; // the target word AS WRITTEN (original case + punctuation) — rendered on the result card
  ok: boolean;
}

export interface SpeakResult {
  score: number; // 0..100
  words: WordScore[]; // one per target word, in order
  missed: string[]; // target words not matched
  passed: boolean; // score high enough to count as "said it"
  band: ScoreBand; // great / ok / retry — drives result-card copy + colour
  celebrate: boolean; // only true in the "great" band — never praise a low score (QA trust fix)
  tipBn: string | null; // Bangla tip for the first missed word, if any
  weakestIndex: number; // index into `words` of the word to highlight (first missed), or -1 when perfect
  // ALWAYS-ON coaching (QA feature_tour: a perfect take showed "no highlighted words and no Bangla
  // tip"). Even on a 100 we point at ONE sound to keep polishing, so the result card is never a bare
  // score — a highlighted focus word plus a Bangla pronunciation line on every take.
  focusIndex: number; // word to emphasise: the first missed word, else the trickiest word to keep practising (-1 only if empty)
  focusTone: "error" | "practice"; // "error" = a missed word (amber); "practice" = perfect take, a sound to polish (calm)
  coachTipBn: string; // a Bangla pronunciation line, ALWAYS present (a fix for a miss, or a "polish this" nudge on a win)
}

// A "said it" (progression) threshold, and the celebration band. These are kept DISTINCT so the
// result card can never show praise beside a low number (QA design review: "a correct sentence
// scored 38/100 beside 'দারুণ বলেছেন! 🎉'"). Celebration/green only above GREAT_SCORE.
export const PASS_SCORE = 60; // counts as "said it" → advances the flow
export const GREAT_SCORE = 80; // green + celebration copy
export const OK_SCORE = 50; // amber "almost — try again" band floor

export type ScoreBand = "great" | "ok" | "retry";

/** Which result band a 0..100 score falls in — the single source of truth for copy + colour. */
export function scoreBand(score: number): ScoreBand {
  if (score >= GREAT_SCORE) return "great";
  if (score >= OK_SCORE) return "ok";
  return "retry";
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9ঀ-৿\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const tokens = (s: string) => (normalize(s) ? normalize(s).split(" ") : []);

/**
 * Split the TARGET into its written words (keeping original case + punctuation) paired with the
 * normalized form used for matching, so the result card can show the real sentence — "My name is
 * Rahul." — instead of a lowercased echo (QA: "the card repeats the transcript, once in lowercase").
 * Surface tokens whose normalized form is empty (stray punctuation) are dropped so the two stay 1:1.
 */
const surfaceTokens = (s: string): { surface: string; norm: string }[] =>
  s
    .trim()
    .split(/\s+/)
    .map((surface) => ({ surface, norm: normalize(surface) }))
    .filter((t) => t.norm.length > 0);

/**
 * Greedy left-to-right alignment: each target word is "ok" if it appears, in
 * order, somewhere in the remaining recognised words. This tolerates extra
 * words and small reorderings the way a forgiving tutor would.
 */
export function scoreSpeaking(target: string, recognized: string): SpeakResult {
  const tgt = surfaceTokens(target);
  const rec = tokens(recognized);
  const words: WordScore[] = [];
  const missed: string[] = [];
  let cursor = 0;
  let weakestIndex = -1;
  for (const [i, w] of tgt.entries()) {
    const at = rec.indexOf(w.norm, cursor);
    if (at >= 0) {
      words.push({ word: w.norm, surface: w.surface, ok: true });
      cursor = at + 1;
    } else {
      words.push({ word: w.norm, surface: w.surface, ok: false });
      missed.push(w.norm);
      if (weakestIndex < 0) weakestIndex = i; // the first missed word is the one to coach
    }
  }
  const score = tgt.length ? Math.round((words.filter((w) => w.ok).length / tgt.length) * 100) : 0;
  const band = scoreBand(score);
  // On a perfect take there is no missed word, so point the learner at the trickiest sound in the
  // phrase to keep polishing — the result card then always has a highlighted word + a Bangla line.
  const focusIndex = weakestIndex >= 0 ? weakestIndex : trickiestIndex(words);
  const focusTone: "error" | "practice" = weakestIndex >= 0 ? "error" : "practice";
  const coachTipBn = missed.length
    ? tipFor(missed[0])
    : focusIndex >= 0
      ? polishTipFor(words[focusIndex].surface)
      : "দারুণ বলেছেন!";
  return {
    score,
    words,
    missed,
    passed: score >= PASS_SCORE,
    band,
    celebrate: band === "great",
    tipBn: missed.length ? tipFor(missed[0]) : null,
    weakestIndex,
    focusIndex,
    focusTone,
    coachTipBn,
  };
}

/** The trickiest word in a phrase to keep practising — the longest word, nudged up for hard sounds. */
function trickiestIndex(words: WordScore[]): number {
  if (!words.length) return -1;
  let best = 0;
  let bestScore = -1;
  words.forEach((w, i) => {
    const n = w.word;
    let s = n.length;
    if (/th/.test(n)) s += 10;
    if (/v/.test(n)) s += 8;
    if (/^w/.test(n)) s += 6;
    if (/z/.test(n)) s += 6;
    if (/ee|ea/.test(n)) s += 5;
    if (s > bestScore) {
      bestScore = s;
      best = i;
    }
  });
  return best;
}

/** An encouraging Bangla line for a well-said word — praise plus one gentle "polish this sound" hint. */
export function polishTipFor(surface: string): string {
  const w = surface.replace(/[^A-Za-z']/g, "");
  if (/th/i.test(w)) return `দারুণ! "${w}"-এ জিভের ডগা দাঁতের মাঝে রাখলে 'th' আরও স্পষ্ট হবে।`;
  if (/v/i.test(w)) return `দারুণ! "${w}"-এ উপরের দাঁত নিচের ঠোঁটে ছুঁইয়ে 'v' আরও পরিষ্কার হবে।`;
  if (/^w/i.test(w)) return `দারুণ! "${w}"-এ ঠোঁট গোল করে 'w' বললে আরও নিখুঁত শোনাবে।`;
  if (/z/i.test(w)) return `দারুণ! "${w}"-এ গলায় সামান্য কাঁপুনি দিয়ে 'z' বলুন।`;
  return `দারুণ বলেছেন! "${w}" শব্দটা আরেকবার আস্তে বলে মিলিয়ে নিন — নিখুঁত হচ্ছে।`;
}

/** A short Bangla pronunciation tip for a tricky word (falls back to a generic nudge). */
export function tipFor(word: string): string {
  const w = word.toLowerCase();
  if (/th/.test(w)) return `"${word}" — জিভের ডগা দাঁতের মাঝে রেখে বলুন (th)।`;
  if (/^v/.test(w) || /v/.test(w)) return `"${word}" — উপরের দাঁত নিচের ঠোঁটে ছুঁইয়ে 'v' বলুন।`;
  if (/^w/.test(w)) return `"${word}" — ঠোঁট গোল করে 'w' বলুন।`;
  if (/z/.test(w)) return `"${word}" — গলায় কাঁপুনি দিয়ে 'z' বলুন।`;
  if (/ee|ea/.test(w)) return `"${word}" — স্বরটা একটু টেনে লম্বা করে বলুন।`;
  return `"${word}" শব্দটা আবার আস্তে করে বলার চেষ্টা করুন।`;
}
