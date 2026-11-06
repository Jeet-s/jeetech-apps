/**
 * Deterministic speech metrics. Every number here is computed from the word
 * timestamps and text — never from the LLM — so the same clip always scores the
 * same (fixing the "32 → 93 → 75" randomness competitors ship). The LLM only
 * supplies qualitative prose (tips, rewrite), merged in buildReport.
 */
import { detectFillers, PAUSE_MS, LONG_PAUSE_MS } from "./fillers";
import type {
  AiQualitative,
  Baseline,
  BaselineMetric,
  BaselineSet,
  PaceVerdict,
  PauseStats,
  Report,
  StructureCheck,
  Transcript,
  Word,
  WpmSegment,
} from "./types";
import type { DateKey } from "./dates";

export const MODEL_VERSION = "podium-metrics-1";
export const MIN_TAKE_MS = 5_000; // "keep going" below this
export const SILENCE_MIN_WORDS = 3; // fewer real words → "couldn't hear you"
/** A take needs this much CONTENT (spoken words) to score confidently; below it
 * the report is provisional. Judged by what was SAID, never a wall-clock. */
export const MIN_SCORED_WORDS = 20;
/** ...and enough TIME to actually read delivery (pace per segment, pauses). A
 * 20-word burst crammed into a few seconds is too rushed to score confidently —
 * it clears the word floor but implies an impossible pace — so it stays
 * provisional too. A full answer (≥20 words over ≥8s) is always fully scored,
 * however fast a real speaker is. */
export const MIN_CONFIDENT_MS = 8_000;
export const SEGMENT_MS = 15_000; // WPM window
export const MAX_PLAUSIBLE_WPM = 250; // segments above this are flagged
const MIN_SEGMENT_MS = 1_500; // too short to trust a WPM from
/** The live recorder shows "–" for pace until this much speech has elapsed — a
 * short window over-reads the pace (33 words in 9s implied ~220 wpm in QA), so a
 * verdict needs a warm-up before it can be trusted. */
export const LIVE_WPM_WARMUP_MS = 5_000;

/**
 * Live words-per-minute while recording, or null when it can't be shown yet:
 * before the warm-up window, with no words, or when the figure is implausibly
 * high (a brief burst). The recorder shows "–" for null. Pure, so it's unit
 * tested — a WPM is never surfaced under 5s or above the plausible ceiling.
 */
export function liveWpm(wordCount: number, elapsedMs: number): number | null {
  if (wordCount <= 0 || elapsedMs < LIVE_WPM_WARMUP_MS) return null;
  const wpm = Math.round((wordCount / elapsedMs) * 60_000);
  if (wpm <= 0 || wpm > MAX_PLAUSIBLE_WPM) return null;
  return wpm;
}
/** Off-topic takes are capped so a wrong-prompt answer can't pose as "Strong"
 * (QA: an answer about learning a language scored 84 against "Introduce
 * yourself"). The structure read and the overall score are both held down. */
export const OFFTOPIC_STRUCTURE_CAP = 34;
export const OFFTOPIC_OVERALL_CAP = 54;

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const round = (n: number) => Math.round(n);
/** Spoken words only — pause markers and empty tokens don't count. */
const spoken = (words: Word[]) => words.filter((w) => w.text.trim().length > 0);

export function durationMs(words: Word[]): number {
  const s = spoken(words);
  if (!s.length) return 0;
  return Math.max(0, s[s.length - 1].endMs - s[0].startMs);
}

/** Did we actually hear a usable take? (silent-audio guard, no allowance cost) */
export function isAudible(words: Word[]): boolean {
  return spoken(words).length >= SILENCE_MIN_WORDS && durationMs(words) >= 1_000;
}

export type ProvisionalReason = "none" | "thin" | "rushed";
/**
 * Is a take too thin or too rushed to score confidently? The report uses this to
 * show a warm "provisional" state instead of an inflated absolute number (QA: a
 * ~5s, ~20-word take presented as a confident "Strong 74" at an implied ~300 wpm).
 * Content- AND duration-aware, never a pure clock gate: a full answer scores fully
 * however fast a real speaker is.
 */
export function takeProvisional(spokenWordCount: number, durationMsValue: number): { provisional: boolean; reason: ProvisionalReason } {
  if (spokenWordCount <= 0) return { provisional: false, reason: "none" };
  if (spokenWordCount < MIN_SCORED_WORDS) return { provisional: true, reason: "thin" };
  if (durationMsValue > 0 && durationMsValue < MIN_CONFIDENT_MS) return { provisional: true, reason: "rushed" };
  return { provisional: false, reason: "none" };
}

/** Overall words-per-minute from timestamps. 0 for an empty/instant take. */
export function wpmOverall(words: Word[]): number {
  const dur = durationMs(words);
  if (dur <= 0) return 0;
  const raw = (spoken(words).length / dur) * 60_000;
  return round(Math.min(raw, MAX_PLAUSIBLE_WPM));
}

/** Per-segment WPM; segments too short or implausibly fast are marked suspect. */
export function wpmSegments(words: Word[]): WpmSegment[] {
  const s = spoken(words);
  if (!s.length) return [];
  const t0 = s[0].startMs;
  const total = s[s.length - 1].endMs - t0;
  const n = Math.max(1, Math.ceil(total / SEGMENT_MS));
  const segs: WpmSegment[] = [];
  for (let i = 0; i < n; i++) {
    const start = t0 + i * SEGMENT_MS;
    const end = i === n - 1 ? t0 + total : start + SEGMENT_MS;
    const inSeg = s.filter((w) => w.startMs >= start && w.startMs < end);
    const dur = Math.max(0, end - start);
    const raw = dur >= MIN_SEGMENT_MS ? (inSeg.length / dur) * 60_000 : 0;
    segs.push({
      index: i,
      startMs: Math.round(start - t0),
      endMs: Math.round(end - t0),
      words: inSeg.length,
      wpm: round(Math.min(raw, MAX_PLAUSIBLE_WPM)),
      suspect: dur < MIN_SEGMENT_MS || raw > MAX_PLAUSIBLE_WPM,
    });
  }
  return segs;
}

/** Silent gaps between words. */
export function pauseStats(words: Word[]): PauseStats {
  const s = spoken(words);
  const dur = durationMs(words);
  let count = 0, longest = 0, total = 0;
  for (let i = 1; i < s.length; i++) {
    const gap = s[i].startMs - s[i - 1].endMs;
    if (gap >= PAUSE_MS) {
      count++;
      total += gap;
      longest = Math.max(longest, gap);
    }
  }
  const mins = dur / 60_000;
  return { count, longestMs: longest, totalMs: total, perMin: mins > 0 ? round((count / mins) * 10) / 10 : 0 };
}

export function fillerCounts(words: Word[]): { counts: Record<string, number>; total: number } {
  const counts: Record<string, number> = {};
  let total = 0;
  for (const w of words) {
    if (!w.isFiller) continue;
    const key = w.text.toLowerCase().replace(/[^a-z']/g, "") || "…";
    counts[key] = (counts[key] ?? 0) + 1;
    total++;
  }
  return { counts, total };
}

/** One pace verdict for the whole take — can never contradict itself. */
export function paceVerdict(wpm: number): PaceVerdict {
  if (wpm > 0 && wpm < 110) return "slow";
  if (wpm > 165) return "fast";
  return "good";
}

/** Opening / point / close presence from how the words are distributed in time. */
export function analyzeStructure(words: Word[]): StructureCheck {
  const s = spoken(words);
  const dur = durationMs(words);
  if (s.length < SILENCE_MIN_WORDS || dur <= 0) return { opening: false, point: false, close: false, score: 0 };
  const t0 = s[0].startMs;
  const at = (w: Word) => (w.startMs - t0) / dur;
  const opening = s.some((w) => at(w) <= 0.2);
  const close = s.some((w) => at(w) >= 0.8);
  const point = s.filter((w) => at(w) > 0.2 && at(w) < 0.8).length >= 3;
  const score = round(((opening ? 1 : 0) + (point ? 1 : 0) + (close ? 1 : 0)) / 3 * 100);
  return { opening, point, close, score };
}

// --- Component scores (all 0..100, deterministic) ---
const paceScore = (wpm: number) => (wpm <= 0 ? 0 : clamp(100 - Math.abs(wpm - 140) * 1.1));
const fillerScore = (perMin: number) => clamp(100 - perMin * 10);
const pauseScore = (ps: PauseStats) => clamp(100 - Math.max(0, ps.perMin - 4) * 8 - (ps.longestMs >= LONG_PAUSE_MS * 2 ? 10 : 0));

/** Pace consistency across segments → steadier delivery scores higher. */
function consistencyScore(segs: WpmSegment[]): number {
  const good = segs.filter((s) => !s.suspect && s.wpm > 0);
  if (good.length < 2) return 70;
  const mean = good.reduce((a, s) => a + s.wpm, 0) / good.length;
  const variance = good.reduce((a, s) => a + (s.wpm - mean) ** 2, 0) / good.length;
  return clamp(100 - Math.sqrt(variance) * 0.8);
}

export interface Metrics {
  wpmOverall: number;
  wpmSegments: WpmSegment[];
  paceVerdict: PaceVerdict;
  fillerCounts: Record<string, number>;
  fillerTotal: number;
  fillersPerMin: number;
  pauseStats: PauseStats;
  clarity: number;
  confidence: number;
  structure: StructureCheck;
  overallScore: number;
}

/** All deterministic metrics for a transcript. Pure. */
export function computeMetrics(words: Word[]): Metrics {
  const dur = durationMs(words);
  const mins = dur / 60_000;
  const wpm = wpmOverall(words);
  const segs = wpmSegments(words);
  const { counts, total } = fillerCounts(words);
  const perMin = mins > 0 ? round((total / mins) * 10) / 10 : 0;
  const ps = pauseStats(words);
  const structure = analyzeStructure(words);

  const pace = paceScore(wpm);
  const fil = fillerScore(perMin);
  const pau = pauseScore(ps);
  const consistency = consistencyScore(segs);
  const clarity = round(clamp(fil * 0.6 + pace * 0.4));
  const confidence = round(clamp(consistency * 0.5 + pau * 0.3 + fil * 0.2));
  const overall = round(clamp(pace * 0.3 + fil * 0.3 + pau * 0.15 + structure.score * 0.15 + consistency * 0.1));

  return {
    wpmOverall: wpm,
    wpmSegments: segs,
    paceVerdict: paceVerdict(wpm),
    fillerCounts: counts,
    fillerTotal: total,
    fillersPerMin: perMin,
    pauseStats: ps,
    clarity,
    confidence,
    structure,
    overallScore: overall,
  };
}

/** Metrics must never contradict each other (QA: pace not both too fast & slow). */
export function metricContradictions(m: Metrics): string[] {
  const out: string[] = [];
  if (m.wpmOverall > 165 && m.paceVerdict !== "fast") out.push("fast wpm but verdict not fast");
  if (m.wpmOverall > 0 && m.wpmOverall < 110 && m.paceVerdict !== "slow") out.push("slow wpm but verdict not slow");
  if (m.wpmSegments.some((s) => s.wpm > MAX_PLAUSIBLE_WPM)) out.push("segment exceeds max plausible wpm");
  for (const v of [m.overallScore, m.clarity, m.confidence, m.structure.score]) {
    if (v < 0 || v > 100) out.push(`score out of range: ${v}`);
  }
  return out;
}

// --- Tips derived from metrics (used offline, or merged with AI tips) ---
export function deterministicTips(m: Metrics): string[] {
  const tips: string[] = [];
  if (m.paceVerdict === "fast") tips.push("You're racing a little — try a breath between sentences.");
  else if (m.paceVerdict === "slow") tips.push("Lift the pace slightly to keep energy up.");
  if (m.fillersPerMin >= 3) {
    const top = Object.entries(m.fillerCounts).sort((a, b) => b[1] - a[1])[0];
    tips.push(top ? `Swap "${top[0]}" for a short pause — ${top[1]} this take.` : "Replace fillers with a short pause.");
  }
  if (!m.structure.close) tips.push("Land a clear closing line so it ends with intent.");
  else if (!m.structure.opening) tips.push("Open with your key point in the first sentence.");
  if (!tips.length) tips.push("Strong, steady delivery — keep this rhythm.");
  return tips.slice(0, 3);
}

// --- Baselines (Welford online mean + variance) ---
export const emptyBaseline = (): Baseline => ({ rollingMean: 0, rollingM2: 0, sampleCount: 0 });
export const emptyBaselineSet = (): BaselineSet => ({
  overall: emptyBaseline(),
  wpm: emptyBaseline(),
  fillersPerMin: emptyBaseline(),
  clarity: emptyBaseline(),
  confidence: emptyBaseline(),
});

export function pushBaseline(b: Baseline, value: number): Baseline {
  const n = b.sampleCount + 1;
  const delta = value - b.rollingMean;
  const mean = b.rollingMean + delta / n;
  const m2 = b.rollingM2 + delta * (value - mean);
  return { rollingMean: mean, rollingM2: m2, sampleCount: n };
}

export const baselineStd = (b: Baseline) => (b.sampleCount > 1 ? Math.sqrt(b.rollingM2 / b.sampleCount) : 0);
export const BASELINE_READY = 3;
export const hasBaseline = (b: Baseline) => b.sampleCount >= BASELINE_READY;

export function updateBaselines(set: BaselineSet, m: Metrics): BaselineSet {
  return {
    overall: pushBaseline(set.overall, m.overallScore),
    wpm: pushBaseline(set.wpm, m.wpmOverall),
    fillersPerMin: pushBaseline(set.fillersPerMin, m.fillersPerMin),
    clarity: pushBaseline(set.clarity, m.clarity),
    confidence: pushBaseline(set.confidence, m.confidence),
  };
}

/** Re-analysing the same clip must not jump the score: keep it within tolerance. */
export const SCORE_TOLERANCE = 5;
export function reconcileScore(cached: number | null, fresh: number): number {
  if (cached == null) return fresh;
  return Math.abs(fresh - cached) <= SCORE_TOLERANCE ? cached : fresh;
}

/**
 * Assemble a full Report from a transcript. Metrics are deterministic;
 * `ai` is optional qualitative content — without it the report still stands
 * (tips derived from metrics, rewrite empty), so the app works offline.
 * `baselineBefore` is the baseline set BEFORE this take is folded in.
 */
export function buildReport(args: {
  id: string;
  transcript: Transcript;
  baselineBefore: BaselineSet;
  settings: { ignoreFillers: string[]; stutterFriendly: boolean };
  ai?: AiQualitative | null;
  createdAt: DateKey;
}): Report {
  const words = detectFillers(args.transcript.words, {
    ignore: args.settings.ignoreFillers,
    stutterFriendly: args.settings.stutterFriendly,
  });
  const m = computeMetrics(words);
  // Did the answer address the prompt? Only the AI knows (null = unknown/offline,
  // treated as on-topic so a connection blip never wrongly penalises a take).
  const onTopic = args.ai ? (typeof args.ai.onTopic === "boolean" ? args.ai.onTopic : null) : null;
  const offTopic = onTopic === false;
  // An off-topic take can't earn a confident structure or overall score.
  const structure = offTopic ? { ...m.structure, score: Math.min(m.structure.score, OFFTOPIC_STRUCTURE_CAP) } : m.structure;
  const overallScore = offTopic ? Math.min(m.overallScore, OFFTOPIC_OVERALL_CAP) : m.overallScore;
  const ready = hasBaseline(args.baselineBefore.overall);
  const vsBaselineDelta = ready ? round(overallScore - args.baselineBefore.overall.rollingMean) : null;
  const tips = args.ai?.tips?.length ? args.ai.tips.slice(0, 3) : deterministicTips(m);

  return {
    id: args.id,
    takeId: args.transcript.takeId,
    overallScore,
    onTopic,
    vsBaselineDelta,
    isFirstBaseline: !ready,
    wpmOverall: m.wpmOverall,
    wpmSegments: m.wpmSegments,
    paceVerdict: m.paceVerdict,
    fillersPerMin: m.fillersPerMin,
    fillerCounts: m.fillerCounts,
    fillerTotal: m.fillerTotal,
    pauseStats: m.pauseStats,
    clarity: m.clarity,
    confidence: m.confidence,
    structure,
    tips,
    rewriteText: args.ai?.rewriteText ?? "",
    rewriteDiff: args.ai?.rewriteDiff ?? [],
    openerSuggestion: args.ai?.openerSuggestion,
    closerSuggestion: args.ai?.closerSuggestion,
    clarityNote: args.ai?.clarityNote,
    confidenceNote: args.ai?.confidenceNote,
    modelVersion: args.ai?.modelVersion ?? MODEL_VERSION,
    createdAt: args.createdAt,
  };
}

/** Re-detect fillers after a user correction and recompute the numbers in place. */
export function recomputeReport(report: Report, transcript: Transcript, settings: { ignoreFillers: string[]; stutterFriendly: boolean }): Report {
  const words = transcript.words; // already carries userCorrected flags
  const detected = detectFillers(words, { ignore: settings.ignoreFillers, stutterFriendly: settings.stutterFriendly });
  const m = computeMetrics(detected);
  return {
    ...report,
    fillerCounts: m.fillerCounts,
    fillerTotal: m.fillerTotal,
    fillersPerMin: m.fillersPerMin,
    clarity: m.clarity,
    confidence: m.confidence,
    // overall is kept stable within tolerance so a single correction doesn't swing the grade
    overallScore: reconcileScore(report.overallScore, m.overallScore),
  };
}
