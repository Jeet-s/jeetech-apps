/**
 * The app's data model (from the PRD). Static CONTENT (courses, lessons,
 * phrases, scenarios, quiz items, grammar, dictionary) lives in catalog.ts and
 * is bundled; the user's DYNAMIC data (progress, favorites, mistakes, sessions,
 * quota, streak, profile) lives in the persisted AppState (state.ts).
 */
import type { DateKey } from "./dates";

export type Level = "A1" | "A2" | "B1";
export type Goal = "job" | "study" | "daily";
export type Topic =
  | "daily"
  | "interview"
  | "travel"
  | "jobs"
  | "shopping"
  | "health"
  | "bank"
  | "phone";

/** CEFR levels in order — used for comparisons and placement. */
export const LEVELS: Level[] = ["A1", "A2", "B1"];

// ---------- Static content ----------

export interface Phrase {
  id: string;
  en: string;
  bn: string; // Bangla meaning
  romanBn: string; // Bangla-script pronunciation of the English
  topic: Topic;
  audioNormalUri: string;
  audioSlowUri: string; // 0.75x
  version: number;
  reviewedBy: string; // bilingual editor id — "" means unreviewed (blocks release)
}

export type QuizType = "listen_pick" | "translate" | "fill_gap" | "order_words";

export interface QuizItem {
  id: string;
  lessonId: string;
  type: QuizType;
  prompt: string; // English or Bangla depending on type
  options: string[]; // for order_words these are the shuffled tokens
  answer: string; // the correct option, or the space-joined correct order
  explanationBn: string; // why, in simple Bangla
}

export interface Lesson {
  id: string;
  courseId: string;
  day: number; // 1-based
  title_bn: string;
  title_en: string;
  scenarioId: string | null; // the AI role-play for this day (null = no AI day)
  phraseIds: string[];
  quizIds: string[];
  /** The phrase the learner repeats aloud (speak-and-get-feedback). Always present. */
  speakingPhraseId: string;
}

export interface Course {
  id: string;
  title_bn: string;
  title_en: string;
  days: number; // 7 or 30
  level: Level;
}

export interface Scenario {
  id: string;
  title_bn: string;
  title_en: string;
  level: Level;
  topic: Topic;
  systemPromptKey: string; // the ai.json feature + a short English scene description
  sceneBn: string; // Bangla description shown on the card
  scriptedFallbackId: string; // offline / quota-exhausted scripted role-play
  art?: string; // illustration id from src/art.ts
}

/** An offline scripted role-play used when AI is offline or the quota is spent. */
export interface ScriptedRolePlay {
  id: string;
  turns: { ai: string; hintBn: string; suggestions: string[] }[];
}

export interface GrammarCard {
  id: string;
  title_bn: string;
  title_en: string;
  bodyBn: string; // the rule in plain Bangla
  examples: { en: string; bn: string; audioUri: string }[]; // ≥3
  quiz: { prompt: string; options: string[]; answer: string; explanationBn: string };
}

export interface DictionaryWord {
  en: string;
  bn: string;
  romanBn: string;
  topic: Topic;
}

export interface PronDrill {
  id: string;
  sound: string; // e.g. "th", "v/w", "z"
  tipBn: string; // mouth-position tip in Bangla
  pairs: { a: string; b: string }[]; // minimal pairs
}

// ---------- Dynamic (persisted) ----------

export type LessonStatus = "available" | "in_progress" | "done";

export interface Progress {
  lessonId: string;
  status: LessonStatus;
  score: number; // 0..100 quiz score
  completedAt: DateKey | null;
  lastStep: number; // resume cursor
}

export interface Favorite {
  phraseId: string;
  createdAt: DateKey;
}

export interface Mistake {
  id: string;
  sessionId: string;
  original: string;
  corrected: string;
  explanationBn: string;
  dueAt: DateKey;
  interval: number; // days until next review
  correctCount: number;
  mastered: boolean;
}

export interface AISession {
  id: string;
  scenarioId: string;
  startedAt: DateKey;
  durationSec: number;
  fluencyScore: number; // 0..100
  clarity: number;
  grammar: number;
  pace: number;
  /** A scripted/offline practice run — its score is an estimate and is kept OUT of the fluency trend. */
  practice?: boolean;
}

export interface QuotaState {
  date: DateKey; // the day these counters belong to
  aiRunsUsed: number;
  bonusRuns: number; // from an opted-in rewarded video
}

export interface ErrorReport {
  id: string;
  phraseId: string;
  reason: "meaning" | "spelling" | "audio";
  createdAt: DateKey;
  synced: boolean;
}

export interface StreakState {
  current: number;
  longest: number;
  freezeAvailable: boolean;
  lastActiveDate: DateKey | null;
}

export interface UserProfile {
  goal: Goal | null;
  level: Level;
  name: string; // for the certificate, entered locally
  reminderTime: string | null; // "HH:MM", null = no reminder
  notificationsOn: boolean;
  slowAudio: boolean; // slow-speed toggle, persists
  placementDone: boolean;
  cloudBackupOn: boolean; // cloud sync is OFF until the learner opts in (progress is local-first)
  createdAt: DateKey;
}

export interface Certificate {
  courseId: string;
  name: string;
  date: DateKey;
}

export type Badge = "first_ai" | "streak_7" | "course_7" | "course_30";

export type PackState = "idle" | "downloading" | "ready";
