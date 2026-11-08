/**
 * Scoring — the honesty core. The AI proxy returns a ScoreResult (confidence +
 * per-word, per-phoneme scores); this module INTERPRETS it into an Attempt and
 * enforces the trust rules the PRD sells against ELSA/BoldVoice:
 *   • every word and phoneme is scored (never "2 words"),
 *   • low-confidence audio shows "try again", never a fake 90–100%,
 *   • the same ScoreResult always interprets to the same number (±0).
 *
 * mockScore() is a DETERMINISTIC stand-in for the AI output so validate.ts and
 * sim.ts can drive the full loop with fixed sample data (no network). Real AI
 * output flows through the exact same interpret() path.
 */
import type { Accent, Attempt, PhonemeScore, ScoreResult, WordScore } from "./types";
import { isSoundId } from "./sounds";

export const LOW_CONFIDENCE_BELOW = 0.5;
export const GOOD_SCORE = 85; // green / "good"
export const CLOSE_SCORE = 70; // amber / "close" — below this a word is flagged & saved to SRS
export const OFF_SCORE = 50; // red / clearly wrong

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export type SoundStatus = "good" | "close" | "off";
export function statusFor(score: number): SoundStatus {
  if (score >= GOOD_SCORE) return "good";
  if (score >= OFF_SCORE) return "close";
  return "off";
}

/** A transcript cannot establish an acoustic error. Only describe an AI contrast
 * when the returned symbols actually differ; low scores alone are not evidence. */
export function hasEstimatedContrast(p: PhonemeScore): boolean {
  const ipa = (s: string) => s.trim().replace(/^\/+|\/+$/g, "").normalize("NFC");
  return !!ipa(p.expectedIPA) && !!ipa(p.heardIPA) && ipa(p.expectedIPA) !== ipa(p.heardIPA);
}

/** Prefer an explicit contrast for coaching, otherwise offer a neutral guide. */
export function coachingPhoneme(word: WordScore): PhonemeScore | undefined {
  const ranked = [...word.phonemes].sort((a, b) => a.score - b.score);
  return ranked.find(p => isSoundId(p.ph) && hasEstimatedContrast(p))
    ?? ranked.find(hasEstimatedContrast)
    ?? ranked.find(p => isSoundId(p.ph)) ?? ranked[0];
}

/** Phoneme-weighted mean of every phoneme in the sentence (0..100). */
export function overallFrom(words: WordScore[]): number {
  const phs = words.flatMap((w) => w.phonemes);
  if (!phs.length) return 0;
  return Math.round(phs.reduce((s, p) => s + p.score, 0) / phs.length);
}

export interface InterpretMeta {
  accent: Accent;
  timestamp: number;
  sentenceId?: string;
  customText?: string;
  recordingPath?: string;
  isDiagnostic?: boolean;
  isRetry?: boolean;
}

/** Turn a (real or mock) ScoreResult into a stored Attempt. Pure + deterministic. */
export function interpret(id: string, raw: ScoreResult, meta: InterpretMeta): Attempt {
  const words = raw.words.map((w) => ({
    ...w,
    score: w.phonemes.length ? Math.round(w.phonemes.reduce((s, p) => s + p.score, 0) / w.phonemes.length) : w.score,
  }));
  const confidence = clamp01(raw.confidence);
  return {
    id,
    accent: meta.accent,
    timestamp: meta.timestamp,
    sentenceId: meta.sentenceId,
    customText: meta.customText,
    recordingPath: meta.recordingPath,
    isDiagnostic: meta.isDiagnostic,
    isRetry: meta.isRetry,
    overallScore: overallFrom(words),
    confidence,
    lowConfidence: confidence < LOW_CONFIDENCE_BELOW,
    phonemeScores: words.flatMap((w) => w.phonemes),
    wordScores: words,
  };
}

/** Catalog sounds in the sentence that were flagged (avg < CLOSE), worst-first. */
export function flaggedSounds(a: Attempt): { soundId: string; score: number; count: number }[] {
  const by = new Map<string, { sum: number; count: number }>();
  for (const p of a.phonemeScores) {
    if (!isSoundId(p.ph)) continue;
    const e = by.get(p.ph) ?? { sum: 0, count: 0 };
    e.sum += p.score;
    e.count += 1;
    by.set(p.ph, e);
  }
  return [...by.entries()]
    .map(([soundId, e]) => ({ soundId, score: Math.round(e.sum / e.count), count: e.count }))
    .filter((s) => s.score < CLOSE_SCORE)
    .sort((x, y) => x.score - y.score);
}

/** Average score for one catalog sound across an attempt (null if absent). */
export function soundScore(a: Attempt, soundId: string): number | null {
  const ps = a.phonemeScores.filter((p) => p.ph === soundId);
  if (!ps.length) return null;
  return Math.round(ps.reduce((s, p) => s + p.score, 0) / ps.length);
}

/** Words that should be auto-saved to the SRS set (score < CLOSE), deduped. */
export function missedWords(a: Attempt): { word: string; soundTags: string[] }[] {
  if (a.lowConfidence) return [];
  const seen = new Set<string>();
  const out: { word: string; soundTags: string[] }[] = [];
  for (const w of a.wordScores) {
    const key = w.word.toLowerCase();
    if (w.score >= CLOSE_SCORE || seen.has(key)) continue;
    seen.add(key);
    out.push({ word: w.word, soundTags: w.phonemes.map((p) => p.ph).filter(isSoundId) });
  }
  return out;
}

/** Did the target sound rise by a meaningful margin between two attempts? */
export function improvedOn(prev: Attempt, next: Attempt, soundId: string, margin = 3): boolean {
  const a = soundScore(prev, soundId);
  const b = soundScore(next, soundId);
  return a !== null && b !== null && b - a >= margin;
}

/** A clean success (counts toward streak / review prompt): confident and good. */
export function isCleanSuccess(a: Attempt): boolean {
  return !a.lowConfidence && a.overallScore >= CLOSE_SCORE;
}

// ── Deterministic mock AI output (tests + sim + AI-less fallback samples) ─────
export type SpeechQuality = "model" | "native" | "good" | "improving" | "weak" | "poor" | "mumble" | "silent";

const BASE: Record<SpeechQuality, { base: number; conf: number; troublePenalty: number }> = {
  model: { base: 95, conf: 0.97, troublePenalty: 0 },
  native: { base: 92, conf: 0.95, troublePenalty: 0 },
  good: { base: 83, conf: 0.92, troublePenalty: 4 },
  improving: { base: 77, conf: 0.9, troublePenalty: 6 },
  weak: { base: 60, conf: 0.85, troublePenalty: 18 },
  poor: { base: 36, conf: 0.84, troublePenalty: 8 },
  mumble: { base: 44, conf: 0.32, troublePenalty: 6 },
  silent: { base: 4, conf: 0.07, troublePenalty: 0 },
};

function words(text: string): string[] {
  return text
    .split(/\s+/)
    .map((w) => w.replace(/[^A-Za-z'’]/g, ""))
    .filter(Boolean);
}

/** Stable per-phoneme jitter in [-3, 3] — no RNG, so repeats are identical. */
function jitter(ph: string, idx: number): number {
  const code = ph.charCodeAt(0) || 1;
  return ((code * 7 + idx * 13) % 7) - 3;
}

/**
 * Build a plausible, fully-deterministic ScoreResult for a sentence. Every word
 * gets a score; the sentence's trouble soundTags are distributed across words so
 * flagged sounds are realistic. Same inputs → byte-identical output.
 */
export function mockScore(
  input: { text: string; soundTags: string[] },
  accent: Accent,
  quality: SpeechQuality,
): ScoreResult {
  const ws = words(input.text);
  const cfg = BASE[quality];
  const tags = input.soundTags.length ? input.soundTags : ["·"];
  const wordScores: WordScore[] = ws.map((word, wi) => {
    // Attach the round-robin trouble sound for this word, plus a generic phoneme.
    const tag = tags[wi % tags.length];
    const phoneIds = [tag, "·"];
    const phonemes: PhonemeScore[] = phoneIds.map((ph, pi) => {
      const trouble = isSoundId(ph);
      let s = cfg.base + jitter(ph + word, wi + pi) - (trouble ? cfg.troublePenalty : 0);
      s = Math.max(0, Math.min(100, Math.round(s)));
      return { ph, expectedIPA: ph, heardIPA: trouble && quality === "poor" ? altIPA(ph) : ph, score: s };
    });
    const score = Math.round(phonemes.reduce((a, p) => a + p.score, 0) / phonemes.length);
    return { word, score, phonemes };
  });
  return { confidence: cfg.conf, words: wordScores };
}

/** A believable "heard" substitution for a flagged sound (display only). */
function altIPA(ph: string): string {
  const subs: Record<string, string> = { v: "w", w: "v", θ: "t", ð: "d", ɪ: "iː", iː: "ɪ", p: "b", b: "p", z: "s", r: "l" };
  return subs[ph] ?? ph;
}

/** Validate proxy data before it can change progress; missing phonemes are never invented. */
export function parseScoreResult(json: unknown): ScoreResult | null {
  if (!json || typeof json !== "object") return null;
  const j = json as { confidence?: unknown; words?: unknown };
  if (typeof j.confidence !== "number" || !Number.isFinite(j.confidence) || j.confidence < 0 || j.confidence > 1 || !Array.isArray(j.words) || !j.words.length) return null;
  const words: WordScore[] = [];
  for (const value of j.words) {
    if (!value || typeof value !== "object") return null;
    const w = value as Record<string, unknown>;
    if (typeof w.word !== "string" || !w.word.trim() || !Array.isArray(w.phonemes) || !w.phonemes.length) return null;
    const phonemes: PhonemeScore[] = [];
    for (const value of w.phonemes) {
      if (!value || typeof value !== "object") return null;
      const p = value as Record<string, unknown>;
      if (typeof p.ph !== "string" || !p.ph.trim() || typeof p.expectedIPA !== "string" || !p.expectedIPA.trim() || typeof p.heardIPA !== "string" || typeof p.score !== "number" || !Number.isFinite(p.score) || p.score < 0 || p.score > 100) return null;
      phonemes.push({ ph: p.ph.replace(/^\/+|\/+$/g, ""), expectedIPA: p.expectedIPA.replace(/^\/+|\/+$/g, ""), heardIPA: p.heardIPA.replace(/^\/+|\/+$/g, ""), score: p.score });
    }
    words.push({ word: w.word, score: Math.round(phonemes.reduce((n, p) => n + p.score, 0) / phonemes.length), phonemes });
  }
  return { confidence: j.confidence, words };
}
