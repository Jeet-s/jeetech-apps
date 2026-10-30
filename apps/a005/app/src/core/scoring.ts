/**
 * Scoring + recording rules. The AI proxy returns a transcript, rubric scores
 * and an improved answer as plain JSON (ScorePayload); this module validates
 * that payload, maps the 1-6 band to the 0-30 estimate, computes the on-device
 * pacing report (always free), and applies results to an attempt. Keeping AI
 * output as plain data lets validate.ts and sim.ts drive it with fixed samples.
 */
import {
  allocId,
  BAND_MAX,
  BAND_MIN,
  CONSTRUCTS_FOR,
  INTERVIEW_WINDOW_S,
  MIN_SPEECH_S,
  SCORE_MAX,
  SCORE_MIN,
  SILENCE_TOLERANCE_S,
  attemptById,
  type Attempt,
  type AttemptMode,
  type BandUpState,
  type Construct,
  type DateKey,
  type TaskType,
} from "./model";

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** 1-6 band → 0-30 estimated section score. */
export function score30FromBand(band6: number): number {
  return clamp(Math.round((band6 / BAND_MAX) * SCORE_MAX), SCORE_MIN, SCORE_MAX);
}

/** Honest estimate range shown with every score (±2 on the 0-30 scale). */
export function scoreRange(score30: number): [number, number] {
  return [clamp(score30 - 2, SCORE_MIN, SCORE_MAX), clamp(score30 + 2, SCORE_MIN, SCORE_MAX)];
}

/** Average of the present construct values → an overall band (1-6). */
export function bandFromConstructs(constructs: Partial<Record<Construct, number>>): number {
  const vals = Object.values(constructs).filter((v): v is number => typeof v === "number");
  if (!vals.length) return BAND_MIN;
  return clamp(vals.reduce((a, b) => a + b, 0) / vals.length, BAND_MIN, BAND_MAX);
}

// ---- On-device pacing (always available, even with no AI credits) ----------
export type PacingLabel = "slow" | "good" | "fast";
export interface Pacing {
  wpm: number;
  words: number;
  durationS: number;
  pauseCount: number;
  label: PacingLabel;
}

export function pacingReport(input: { transcript: string; durationS: number; pauseCount: number }): Pacing {
  const words = input.transcript.trim().split(/\s+/).filter(Boolean).length;
  const wpm = input.durationS > 0 ? Math.round(words / (input.durationS / 60)) : 0;
  const label: PacingLabel = wpm < 100 ? "slow" : wpm > 160 ? "fast" : "good";
  return { wpm, words, durationS: input.durationS, pauseCount: input.pauseCount, label };
}

// ---- Recorder decision logic (pure) ---------------------------------------

/** Window for an item: 45s Interview, or the passed Repeat window. */
export function recordingWindowS(taskType: TaskType, repeatWindowS?: number): number {
  return taskType === "interview" ? INTERVIEW_WINDOW_S : Math.max(1, repeatWindowS ?? 15);
}

/** Should recording auto-stop now? Only after >= 5s continuous silence, or when
 *  the window is reached — never at the first pause. */
export function shouldAutoStop(input: { elapsedS: number; trailingSilenceS: number; windowS: number }): boolean {
  if (input.elapsedS >= input.windowS) return true;
  return input.trailingSilenceS >= SILENCE_TOLERANCE_S;
}

/** A pause this long is tolerated (does not end the recording). */
export const isTolerableSilence = (silenceS: number): boolean => silenceS < SILENCE_TOLERANCE_S;

/** Under 5s of actual speech → "too short": prompt a retry, never score it. */
export const isTooShort = (speechS: number): boolean => speechS < MIN_SPEECH_S;

// ---- Creating an attempt from a finished recording ------------------------

export interface RecordInput {
  questionId: string;
  taskType: TaskType;
  mode: AttemptMode;
  durationS: number;
  speechS: number;
  pauseCount: number;
  transcript: string;
  mockId?: string | null;
}

export type RecordError = "too_short";

/** Save a finished recording as a `recorded` attempt (no score yet). Rejects a
 *  too-short answer so it is never scored as a truncated attempt. */
export function recordAttempt(
  s: BandUpState,
  input: RecordInput,
  startedAt: DateKey,
): { state: BandUpState; error: RecordError | null; id?: string } {
  if (isTooShort(input.speechS)) return { state: s, error: "too_short" };
  const { id, next } = allocId(s, "a");
  const pacing = pacingReport({ transcript: input.transcript, durationS: input.durationS, pauseCount: input.pauseCount });
  const attempt: Attempt = {
    id,
    questionId: input.questionId,
    taskType: input.taskType,
    mode: input.mode,
    startedAt,
    durationS: input.durationS,
    speechS: input.speechS,
    pauseCount: input.pauseCount,
    transcript: input.transcript,
    status: "recorded",
    score30: null,
    band6: null,
    constructs: {},
    strengths: [],
    weaknesses: [],
    improvedAnswer: null,
    relevance: null,
    pacingWpm: pacing.wpm,
    mockId: input.mockId ?? null,
  };
  return { state: { ...s, attempts: [...s.attempts, attempt], nextId: next }, error: null, id };
}

// ---- AI result payload ----------------------------------------------------

/** Exactly what ai.run(...) must return (parsed) for a scored attempt. */
export interface ScorePayload {
  transcript: string;
  band6: number; // 1-6
  constructs: Partial<Record<Construct, number>>; // each 1-6
  strengths: string[]; // >= 2
  weaknesses: string[]; // >= 2
  improvedAnswer: string;
  relevance?: number; // interview only, 0-1
}

export type PayloadError =
  | "bad_transcript"
  | "bad_band"
  | "bad_constructs"
  | "too_few_strengths"
  | "too_few_weaknesses"
  | "bad_improved"
  | "bad_relevance";

/** Validate an AI payload before trusting it (the result screen depends on it). */
export function validateScorePayload(p: unknown, taskType?: TaskType): PayloadError | null {
  if (!p || typeof p !== "object") return "bad_transcript";
  const x = p as Record<string, unknown>;
  if (typeof x.transcript !== "string" || !x.transcript.trim()) return "bad_transcript";
  if (typeof x.band6 !== "number" || !Number.isFinite(x.band6) || x.band6 < BAND_MIN || x.band6 > BAND_MAX)
    return "bad_band";
  const c = x.constructs;
  if (!c || typeof c !== "object") return "bad_constructs";
  const entries = Object.entries(c as Record<string, unknown>).filter(([, v]) => typeof v === "number");
  if (!entries.length) return "bad_constructs";
  for (const [, v] of entries) if ((v as number) < BAND_MIN || (v as number) > BAND_MAX) return "bad_constructs";
  const strengths = Array.isArray(x.strengths) ? x.strengths.filter((t) => typeof t === "string" && t.trim()) : [];
  if (strengths.length < 2) return "too_few_strengths";
  const weaknesses = Array.isArray(x.weaknesses) ? x.weaknesses.filter((t) => typeof t === "string" && t.trim()) : [];
  if (weaknesses.length < 2) return "too_few_weaknesses";
  if (typeof x.improvedAnswer !== "string" || !x.improvedAnswer.trim()) return "bad_improved";
  if (taskType === "interview") {
    if (x.relevance !== undefined && (typeof x.relevance !== "number" || x.relevance < 0 || x.relevance > 1))
      return "bad_relevance";
  }
  return null;
}

/** Keep only the rubric constructs valid for this task type. */
function constructsForTask(constructs: Partial<Record<Construct, number>>, taskType: TaskType): Partial<Record<Construct, number>> {
  const allowed = CONSTRUCTS_FOR[taskType];
  const out: Partial<Record<Construct, number>> = {};
  for (const k of allowed) if (typeof constructs[k] === "number") out[k] = clamp(constructs[k] as number, BAND_MIN, BAND_MAX);
  return out;
}

/** Apply a validated AI payload to a recorded/queued attempt → `scored`. Pass
 *  `estimated` when the payload came from the on-device fallback (not AI) so the
 *  result screen can label it honestly. */
export function applyScore(
  s: BandUpState,
  attemptId: string,
  payload: ScorePayload,
  estimated = false,
): { state: BandUpState; error: PayloadError | "not_found" | null } {
  const a = attemptById(s, attemptId);
  if (!a) return { state: s, error: "not_found" };
  const err = validateScorePayload(payload, a.taskType);
  if (err) return { state: s, error: err };
  const constructs = constructsForTask(payload.constructs, a.taskType);
  const band6 = clamp(payload.band6, BAND_MIN, BAND_MAX);
  const updated: Attempt = {
    ...a,
    transcript: payload.transcript,
    status: "scored",
    band6,
    score30: score30FromBand(band6),
    constructs,
    strengths: payload.strengths.filter((t) => t.trim()),
    weaknesses: payload.weaknesses.filter((t) => t.trim()),
    improvedAnswer: payload.improvedAnswer,
    relevance: a.taskType === "interview" && typeof payload.relevance === "number" ? clamp(payload.relevance, 0, 1) : null,
    estimated,
  };
  return { state: { ...s, attempts: s.attempts.map((x) => (x.id === attemptId ? updated : x)) }, error: null };
}

// ---- On-device fallback estimator -----------------------------------------
// A full AI score can fail (no connection, proxy error, a malformed payload).
// Rather than dead-ending the user on a "couldn't score" card, we always have a
// transparent, deterministic estimate computed on the device from the transcript
// alone, so every answer yields a real result (score ring, rubric, strengths,
// an improved version). It is clearly labelled a basic estimate and the user can
// upgrade it with AI scoring. Pure + deterministic so validate.ts/sim can use it.

const COUNT_WORDS = (s: string): string[] => s.trim().toLowerCase().replace(/[^\p{L}\p{N}\s']/gu, " ").split(/\s+/).filter(Boolean);
const CONNECTIVES = ["because", "so", "however", "also", "then", "for", "example", "since", "therefore", "first", "finally", "although", "but", "and"];

/** Longest-common-subsequence word overlap ratio of target words matched (0..1). */
function overlapRatio(target: string, spoken: string): number {
  const a = COUNT_WORDS(target);
  const b = new Set(COUNT_WORDS(spoken));
  if (!a.length) return 0;
  let m = 0;
  for (const w of a) if (b.has(w)) m++;
  return clamp(m / a.length, 0, 1);
}

/** Map a 0..1 quality signal onto the 1-6 band scale. */
const toBand = (q: number): number => clamp(1 + q * 5, BAND_MIN, BAND_MAX);

export interface LocalScoreInput {
  taskType: TaskType;
  transcript: string;
  durationS: number;
  target?: string | null; // repeat: the target sentence
  question?: string | null; // interview: the prompt, for a light relevance check
}

/**
 * Produce a transparent on-device ScorePayload from the transcript alone.
 * Repeat leans on word-accuracy against the target; Interview uses pacing,
 * length, lexical variety and connective use. Always returns a payload that
 * passes validateScorePayload (≥2 strengths/weaknesses, an improved answer).
 */
export function localScorePayload(input: LocalScoreInput): ScorePayload {
  // The fallback must never itself emit an invalid payload (validateScorePayload
  // requires a non-empty transcript), even on the defensive empty-input path —
  // the real flow already blocks scoring under 3 words.
  const safeTranscript = input.transcript.trim() || "(no words captured)";
  const words = COUNT_WORDS(input.transcript);
  const wordN = words.length;
  const uniq = new Set(words).size;
  const variety = wordN ? uniq / wordN : 0;
  const wpm = input.durationS > 0 ? Math.round(wordN / (input.durationS / 60)) : 0;
  // Fluency: best around a natural 110–150 wpm; thin on either side.
  const paceQ = wpm === 0 ? 0.5 : wpm < 90 ? 0.45 : wpm > 170 ? 0.5 : 0.85;
  const connectives = words.filter((w) => CONNECTIVES.includes(w)).length;

  if (input.taskType === "repeat") {
    const acc = overlapRatio(input.target ?? "", input.transcript);
    const constructs = {
      repeat_accuracy: toBand(acc),
      intelligibility: toBand(clamp(acc * 0.6 + 0.3, 0, 1)),
      fluency: toBand(clamp(paceQ * 0.6 + (wordN >= 4 ? 0.3 : 0.1), 0, 1)),
    };
    const band6 = bandFromConstructs(constructs);
    const pct = Math.round(acc * 100);
    const strengths = [
      acc >= 0.6 ? `Matched about ${pct}% of the target words` : "You gave the sentence a go — a great first rep",
      wordN >= 4 ? "Kept a steady, answerable length" : "Short and clear to build on",
    ];
    const weaknesses = [
      acc >= 0.9 ? "Polish your rhythm so it flows like one phrase" : "A few words differed — hear it again and match them closely",
      "Record once more to raise your repeat accuracy",
    ];
    return {
      transcript: safeTranscript,
      band6: Math.round(band6 * 10) / 10,
      constructs,
      strengths,
      weaknesses,
      improvedAnswer: (input.target ?? "").trim() || safeTranscript,
    };
  }

  // Interview
  const lengthQ = clamp(wordN / 45, 0, 1); // ~45 words is a solid 45s answer
  const rel = input.question ? overlapRatio(input.question, input.transcript) : 0.5;
  const constructs = {
    fluency: toBand(clamp(paceQ * 0.6 + lengthQ * 0.4, 0, 1)),
    intelligibility: toBand(clamp(0.4 + lengthQ * 0.4, 0, 1)),
    language_use: toBand(clamp(variety * 0.7 + 0.2, 0, 1)),
    organization: toBand(clamp((connectives ? 0.5 : 0.25) + lengthQ * 0.4, 0, 1)),
  };
  const band6 = bandFromConstructs(constructs);
  const strengths = [
    wordN >= 30 ? "Developed your answer with enough to say" : "Made your point without rambling",
    connectives ? "Linked ideas with connecting words" : "Clear, direct phrasing",
  ];
  const weaknesses = [
    wordN < 35 ? "Add a reason and an example to fill the 45 seconds" : "Tighten the opening so your main point lands first",
    connectives ? "Vary your vocabulary for a higher language-use band" : "Use connectives (because, for example) to organise it",
  ];
  return {
    transcript: safeTranscript,
    band6: Math.round(band6 * 10) / 10,
    constructs,
    strengths,
    weaknesses,
    improvedAnswer: improveInterview(input.transcript),
    relevance: clamp(rel, 0, 1),
  };
}

/** A light PREP-structured rewrite of the user's own answer, used by the
 *  on-device estimator. Deterministic; keeps the user's words and adds a clear
 *  opener/closer so the "levelled up" card shows a real, speakable improvement. */
function improveInterview(transcript: string): string {
  const t = transcript.trim().replace(/\s+/g, " ");
  if (!t) return "In my view, this matters to me. The main reason is my own experience, and that is why I feel this way.";
  const sentences = t.split(/(?<=[.!?])\s+/).filter(Boolean);
  const first = sentences[0]?.replace(/[.!?]+$/, "") ?? t.replace(/[.!?]+$/, "");
  const rest = sentences.slice(1).join(" ").trim();
  const opener = /^(i |my |in my|to me)/i.test(first) ? first : `In my view, ${first.charAt(0).toLowerCase()}${first.slice(1)}`;
  const middle = rest ? `The main reason is that ${rest.replace(/[.!?]+$/, "")}.` : "The main reason is my own experience with this.";
  return `${opener}. ${middle} For example, it has made a real difference to me. Overall, that is why I hold this view.`;
}

/** Mark an attempt as queued for scoring when the device is offline. */
export function queueAttempt(s: BandUpState, attemptId: string): BandUpState {
  return { ...s, attempts: s.attempts.map((a) => (a.id === attemptId && a.status === "recorded" ? { ...a, status: "queued" } : a)) };
}

/** Attempts waiting to be scored (uploaded when back online). */
export const queuedAttempts = (s: BandUpState): Attempt[] => s.attempts.filter((a) => a.status === "queued");

export function markFailed(s: BandUpState, attemptId: string): BandUpState {
  return { ...s, attempts: s.attempts.map((a) => (a.id === attemptId ? { ...a, status: "failed" } : a)) };
}
