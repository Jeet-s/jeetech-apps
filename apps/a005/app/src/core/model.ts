/**
 * Core domain model for Band Up — the speaking-test coach. Pure TypeScript:
 * every rule takes its inputs explicitly (including `today`), returns new state,
 * and never mutates. All numbers are estimates; the UI always labels scores
 * "Estimated" and the app is independent of any test owner.
 */
import { addDays, daysBetween, type DateKey } from "./dates";

export type { DateKey };

export type TaskType = "repeat" | "interview";
export type AttemptMode = "practice" | "drill" | "mock";
export type AttemptStatus = "recorded" | "queued" | "scored" | "failed";

/** The five rubric constructs scored on a 1-6 scale (estimated). */
export type Construct =
  | "fluency"
  | "intelligibility"
  | "repeat_accuracy"
  | "language_use"
  | "organization";

export const CONSTRUCTS: readonly Construct[] = [
  "fluency",
  "intelligibility",
  "repeat_accuracy",
  "language_use",
  "organization",
];

/** Which constructs each task type is scored on. */
export const CONSTRUCTS_FOR: Record<TaskType, readonly Construct[]> = {
  repeat: ["fluency", "intelligibility", "repeat_accuracy"],
  interview: ["fluency", "intelligibility", "language_use", "organization"],
};

export const CONSTRUCT_LABEL: Record<Construct, string> = {
  fluency: "Fluency",
  intelligibility: "Intelligibility",
  repeat_accuracy: "Repeat accuracy",
  language_use: "Language use",
  organization: "Organization",
};

// ---- Limits & rules -------------------------------------------------------
export const FREE_LIFETIME_SCORES = 3; // first 3 AI scores are free, lifetime
export const FREE_DAILY_SCORES = 2; // then this many per day
export const PRO_DAILY_SCORES = 150; // subscriber daily quota
export const SILENCE_TOLERANCE_S = 5; // recording survives pauses under this
export const MIN_SPEECH_S = 5; // less speech than this => "too short", retry
export const INTERVIEW_WINDOW_S = 45; // Interview response window, no prep time
export const MOCK_REPEAT_ITEMS = 7; // full mock: 7 Listen & Repeat
export const MOCK_INTERVIEW_ITEMS = 4; // + 4 Interview
export const MOCK_TOTAL_ITEMS = MOCK_REPEAT_ITEMS + MOCK_INTERVIEW_ITEMS;
export const PLAYBACK_SPEEDS = [0.75, 1, 1.5, 2] as const;
export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number];
export const SCORE_MIN = 0;
export const SCORE_MAX = 30;
export const BAND_MIN = 1;
export const BAND_MAX = 6;
export const MAX_PHRASE_LEN = 280;
export const TREND_MIN_ATTEMPTS = 2; // trend chart appears after this many scores

export interface Attempt {
  id: string;
  questionId: string;
  taskType: TaskType;
  mode: AttemptMode;
  startedAt: DateKey;
  durationS: number;
  speechS: number;
  pauseCount: number;
  transcript: string;
  status: AttemptStatus;
  /** Scores present only when status === "scored". */
  score30: number | null;
  band6: number | null;
  constructs: Partial<Record<Construct, number>>;
  strengths: string[];
  weaknesses: string[];
  improvedAnswer: string | null;
  /** Interview only: 0-1 relevance to the question. */
  relevance: number | null;
  /** On-device, always available (even without AI credits). */
  pacingWpm: number;
  mockId: string | null;
  /** True when the score came from the on-device fallback estimator (no AI /
   *  offline / proxy error) rather than full AI scoring — so the result screen
   *  can label it honestly and offer to upgrade it with an AI score. */
  estimated?: boolean;
}

export interface Drill {
  id: string;
  construct: Construct;
  questionIds: string[];
  startedAt: DateKey;
  completedAt: DateKey | null;
}

export interface MockSession {
  id: string;
  startedAt: DateKey;
  questionIds: string[]; // length MOCK_TOTAL_ITEMS, 7 repeat then 4 interview
  attemptIds: string[]; // filled as items are answered
  completedAt: DateKey | null;
  sectionScore30: number | null;
}

export interface SavedPhrase {
  id: string;
  text: string;
  category: string;
  createdAt: DateKey;
}

export interface Profile {
  testDate: DateKey | null;
  targetScore: number | null; // 0-30
  playbackSpeed: PlaybackSpeed;
  captions: boolean; // show the Repeat sentence text while listening (off = listen-first)
  // credits
  freeScoredUsed: number; // toward FREE_LIFETIME_SCORES (lifetime)
  creditsDate: DateKey | null; // the day dayUsed/dayBonus count for
  dayUsed: number; // AI scores used today
  dayBonus: number; // extra credits earned today via rewarded ad
  // streak
  streakCount: number;
  lastActiveDate: DateKey | null;
  freezeAvailable: boolean; // one freeze protects a single missed day
}

export interface BandUpState {
  attempts: Attempt[];
  drills: Drill[];
  mocks: MockSession[];
  phrases: SavedPhrase[];
  profile: Profile;
  nextId: number;
  contentVersion: number;
}

export const emptyProfile = (): Profile => ({
  testDate: null,
  targetScore: null,
  playbackSpeed: 1,
  // Listen-first by default: the Repeat sentence stays hidden while the user
  // listens (the task tests hearing, not reading). They can reveal it per-item
  // with "Show text", or turn this on to always show it.
  captions: false,
  freeScoredUsed: 0,
  creditsDate: null,
  dayUsed: 0,
  dayBonus: 0,
  streakCount: 0,
  lastActiveDate: null,
  freezeAvailable: true,
});

export const DATA_VERSION = 1;

/** Coerce any older/partial persisted blob into the current shape. Defensive:
 *  missing arrays/fields fall back to empties so a corrupt load never crashes.
 *  Pure (no storage import) so validate.ts/sim.ts can test it directly. */
export function migrate(old: unknown, _fromVersion: number): BandUpState {
  const base = emptyState();
  if (!old || typeof old !== "object") return base;
  const o = old as Partial<BandUpState>;
  const profile: Profile = { ...emptyProfile(), ...(o.profile ?? {}) };
  return {
    ...base,
    attempts: Array.isArray(o.attempts) ? o.attempts : [],
    drills: Array.isArray(o.drills) ? o.drills : [],
    mocks: Array.isArray(o.mocks) ? o.mocks : [],
    phrases: Array.isArray(o.phrases) ? o.phrases : [],
    profile,
    nextId: typeof o.nextId === "number" && o.nextId > 0 ? o.nextId : base.nextId,
    contentVersion: typeof o.contentVersion === "number" ? o.contentVersion : base.contentVersion,
  };
}

export const emptyState = (): BandUpState => ({
  attempts: [],
  drills: [],
  mocks: [],
  phrases: [],
  profile: emptyProfile(),
  nextId: 1,
  contentVersion: 1,
});

/** Allocate the next id and bump the counter (returned as a tuple). */
export function allocId(s: BandUpState, prefix: string): { id: string; next: number } {
  return { id: `${prefix}${s.nextId}`, next: s.nextId + 1 };
}

// ---- Profile reducers -----------------------------------------------------

export function setTestDate(s: BandUpState, date: DateKey | null): BandUpState {
  return { ...s, profile: { ...s.profile, testDate: date } };
}

/** Target score must be a whole number within 0-30 (null clears it). */
export function setTargetScore(s: BandUpState, target: number | null): BandUpState {
  if (target === null) return { ...s, profile: { ...s.profile, targetScore: null } };
  const clamped = Math.max(SCORE_MIN, Math.min(SCORE_MAX, Math.round(target)));
  return { ...s, profile: { ...s.profile, targetScore: clamped } };
}

export function setPlaybackSpeed(s: BandUpState, speed: number): BandUpState {
  const ok = (PLAYBACK_SPEEDS as readonly number[]).includes(speed) ? (speed as PlaybackSpeed) : 1;
  return { ...s, profile: { ...s.profile, playbackSpeed: ok } };
}

export function setCaptions(s: BandUpState, on: boolean): BandUpState {
  return { ...s, profile: { ...s.profile, captions: on } };
}

/** Days until the test (null if no date, negative if the date has passed). */
export function daysUntilTest(s: BandUpState, today: DateKey): number | null {
  if (!s.profile.testDate) return null;
  return daysBetween(today, s.profile.testDate);
}

export const attemptById = (s: BandUpState, id: string): Attempt | undefined =>
  s.attempts.find((a) => a.id === id);

/** Scored attempts, oldest first. */
export const scoredAttempts = (s: BandUpState): Attempt[] =>
  s.attempts.filter((a) => a.status === "scored");

export { addDays };
