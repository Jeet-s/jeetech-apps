/**
 * The question bank built from bundled content + pure helpers over it:
 * difficulty, topic/task selectors, deterministic random picks, the per-item
 * recording window, and the on-device word-level repeat-accuracy diff.
 */
import {
  CONTENT_VERSION,
  INTERVIEW_ITEMS,
  REPEAT_ITEMS,
  TEMPLATES,
  type RawInterview,
  type RawRepeat,
  type Topic,
} from "./content";
import { INTERVIEW_WINDOW_S, type TaskType } from "./model";

export type Difficulty = 1 | 2 | 3; // easy / medium / hard
export const DIFFICULTY_LABEL: Record<Difficulty, string> = { 1: "Easy", 2: "Medium", 3: "Hard" };

export interface Question {
  id: string;
  taskType: TaskType;
  topic: Topic;
  difficulty: Difficulty;
  promptText: string; // what the user hears / is asked
  targetSentence: string | null; // repeat only: the exact sentence to say back
  sampleAnswer: string;
  whyScoresHigh: string;
  packId: string;
}

export const wordCount = (s: string): number => s.trim().split(/\s+/).filter(Boolean).length;

/** Repeat difficulty scales with sentence length; Interview with question length. */
function difficultyForRepeat(text: string): Difficulty {
  const n = wordCount(text);
  return n <= 7 ? 1 : n <= 12 ? 2 : 3;
}
function difficultyForInterview(q: string): Difficulty {
  const n = wordCount(q);
  return n <= 9 ? 1 : n <= 13 ? 2 : 3;
}

/** A sample answer that models the PREP template, woven around the question. */
function sampleForInterview(raw: RawInterview): string {
  return (
    `In my opinion, this really depends on the person, but I have a clear view. ` +
    `The main reason is that it affects our daily lives in a practical way. ` +
    `For example, in my own experience with ${raw.topic.toLowerCase()}, a small, thoughtful choice made a real difference. ` +
    `On the other hand, I understand why some people feel differently. ` +
    `For these reasons, that is what I believe.`
  );
}
function whyForInterview(): string {
  return "Clear opinion up front, one strong reason, a specific personal example, a brief counter-point, and a confident close — organised, fluent, and fully on topic.";
}

function buildRepeat(): Question[] {
  return REPEAT_ITEMS.map((r: RawRepeat, i) => ({
    id: `qr${i + 1}`,
    taskType: "repeat" as const,
    topic: r.topic,
    difficulty: difficultyForRepeat(r.text),
    promptText: r.text,
    targetSentence: r.text,
    sampleAnswer: r.text,
    whyScoresHigh: "Every word matches the target, the pace is steady, and the stress falls on the key words.",
    packId: "core",
  }));
}

function buildInterview(): Question[] {
  return INTERVIEW_ITEMS.map((r: RawInterview, i) => ({
    id: `qi${i + 1}`,
    taskType: "interview" as const,
    topic: r.topic,
    difficulty: difficultyForInterview(r.q),
    promptText: r.q,
    targetSentence: null,
    sampleAnswer: sampleForInterview(r),
    whyScoresHigh: whyForInterview(),
    packId: "core",
  }));
}

/** The full bundled bank (100+ per task type). */
export const QUESTIONS: Question[] = [...buildRepeat(), ...buildInterview()];
export const QUESTION_BANK_VERSION = CONTENT_VERSION;

const BY_ID = new Map(QUESTIONS.map((q) => [q.id, q]));
export const questionById = (id: string): Question | undefined => BY_ID.get(id);

export const repeatQuestions = (): Question[] => QUESTIONS.filter((q) => q.taskType === "repeat");
export const interviewQuestions = (): Question[] => QUESTIONS.filter((q) => q.taskType === "interview");

export function questionsByTask(task: TaskType): Question[] {
  return QUESTIONS.filter((q) => q.taskType === task);
}

export function filterQuestions(opts: { task?: TaskType; topic?: Topic; difficulty?: Difficulty } = {}): Question[] {
  return QUESTIONS.filter(
    (q) =>
      (opts.task === undefined || q.taskType === opts.task) &&
      (opts.topic === undefined || q.topic === opts.topic) &&
      (opts.difficulty === undefined || q.difficulty === opts.difficulty),
  );
}

export function topicsForTask(task: TaskType): Topic[] {
  const seen = new Set<Topic>();
  for (const q of QUESTIONS) if (q.taskType === task) seen.add(q.topic);
  return [...seen];
}

/** Deterministic pick (seeded) so sim/tests are reproducible and never empty. */
export function pickQuestions(pool: Question[], count: number, seed: number): Question[] {
  if (!pool.length) return [];
  const out: Question[] = [];
  const used = new Set<number>();
  let x = (seed >>> 0) || 1;
  const n = Math.min(count, pool.length);
  while (out.length < n) {
    x = (x * 1664525 + 1013904223) >>> 0;
    const idx = x % pool.length;
    if (used.has(idx)) continue;
    used.add(idx);
    out.push(pool[idx]);
  }
  return out;
}

export function randomQuestion(task: TaskType, seed: number): Question {
  const pool = questionsByTask(task);
  return pickQuestions(pool, 1, seed)[0];
}

/** Response window in seconds. Interview is a fixed 45s; Repeat scales with the
 *  sentence (no prep time), with a sensible floor and cap. */
export function responseWindowS(q: Question): number {
  if (q.taskType === "interview") return INTERVIEW_WINDOW_S;
  // A relaxed Listen & Repeat window so a short sentence never feels rushed: at
  // least 15s (the old 13s read as a sprint once you've heard the item), scaling
  // with sentence length, capped at 25s.
  const words = wordCount(q.targetSentence ?? q.promptText);
  return Math.max(15, Math.min(25, Math.round(words * 1.5) + 8));
}

// ---- Word-level repeat-accuracy diff (on-device, free) --------------------

export type DiffOp = "match" | "wrong" | "missing" | "extra";
export interface DiffToken {
  op: DiffOp;
  target?: string; // word from the target sentence
  said?: string; // word the user actually said
}
export interface RepeatDiff {
  tokens: DiffToken[];
  accuracy: number; // 0..1, matched target words / target words
  matched: number;
  total: number;
}

const normalizeWords = (s: string): string[] =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .split(/\s+/)
    .filter(Boolean);

/** Longest-common-subsequence diff of target vs spoken words. */
export function repeatDiff(target: string, spoken: string): RepeatDiff {
  const a = normalizeWords(target);
  const b = normalizeWords(spoken);
  const n = a.length;
  const m = b.length;
  // LCS table
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const tokens: DiffToken[] = [];
  let i = 0;
  let j = 0;
  let matched = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      tokens.push({ op: "match", target: a[i], said: b[j] });
      matched++;
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      tokens.push({ op: "missing", target: a[i] });
      i++;
    } else {
      tokens.push({ op: "extra", said: b[j] });
      j++;
    }
  }
  while (i < n) tokens.push({ op: "missing", target: a[i++] });
  while (j < m) tokens.push({ op: "extra", said: b[j++] });
  return { tokens, matched, total: n, accuracy: n ? matched / n : 0 };
}

export { TEMPLATES };
