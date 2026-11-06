/**
 * Domain types for Podium (data model from the PRD). Pure data — no React, no
 * storage. Everything persisted lives under AppState (see state.ts).
 */
import type { DateKey } from "./dates";

export type TakeStatus = "recording" | "queued" | "analysing" | "done" | "failed";
export type TakeFailReason = "silent" | "too_short" | "language" | "error";
export type Difficulty = "easy" | "medium" | "hard";
export type Level = "beginner" | "intermediate" | "advanced";
export type PaceVerdict = "slow" | "good" | "fast";
export type Plan = "free" | "monthly" | "yearly" | "lifetime";
export type EntitlementStatus = "none" | "trial" | "active" | "expired";
export type EventType = "interview" | "viva" | "pitch" | "toast" | "presentation" | "meeting";

/** A single recognised word with its timing and classification. */
export interface Word {
  text: string;
  startMs: number;
  endMs: number;
  /** A filler ("um", discourse "like") — computed by src/core/fillers. */
  isFiller: boolean;
  /** A notable silent gap that precedes this word. */
  isPause: boolean;
  /** The user tapped "not a filler" (or "mark filler") on this word. */
  userCorrected: boolean;
}

export interface Transcript {
  id: string;
  takeId: string;
  words: Word[];
  language: string;
}

export interface WpmSegment {
  index: number;
  startMs: number;
  endMs: number;
  words: number;
  wpm: number;
  /** Flagged when the segment is implausibly fast or too short to trust. */
  suspect: boolean;
}

export interface PauseStats {
  count: number;
  longestMs: number;
  totalMs: number;
  perMin: number;
}

export interface StructureCheck {
  opening: boolean;
  point: boolean;
  close: boolean;
  /** 0..100 */
  score: number;
}

/** Qualitative part of a report — produced by the AI proxy, stored as plain data. */
export interface AiQualitative {
  tips: string[];
  rewriteText: string;
  rewriteDiff: DiffSpan[];
  openerSuggestion: string;
  closerSuggestion: string;
  clarityNote: string;
  confidenceNote: string;
  /** Did the take actually address the prompt? null when the AI didn't say
   * (offline / older report) — treated as on-topic so a blip never penalises. */
  onTopic: boolean | null;
  modelVersion: string;
}

export interface DiffSpan {
  kind: "same" | "added" | "removed";
  text: string;
}

export interface Report {
  id: string;
  takeId: string;
  overallScore: number; // 0..100
  /** Delta vs the user's rolling baseline; null until a baseline exists (3 takes). */
  vsBaselineDelta: number | null;
  isFirstBaseline: boolean;
  wpmOverall: number;
  wpmSegments: WpmSegment[];
  paceVerdict: PaceVerdict;
  fillersPerMin: number;
  fillerCounts: Record<string, number>;
  fillerTotal: number;
  pauseStats: PauseStats;
  clarity: number; // 0..100
  confidence: number; // 0..100
  structure: StructureCheck;
  /** Did the take answer the prompt? false → the report shows an off-topic
   * banner and caps the score; null when unknown (offline / older report). */
  onTopic?: boolean | null;
  tips: string[];
  rewriteText: string;
  rewriteDiff: DiffSpan[];
  /** Optional AI prose kept for re-viewing a report from history. */
  openerSuggestion?: string;
  closerSuggestion?: string;
  clarityNote?: string;
  confidenceNote?: string;
  modelVersion: string;
  createdAt: DateKey;
}

export interface Take {
  id: string;
  packId: string;
  promptId: string;
  mode: TakeMode;
  startedAt: DateKey;
  durationMs: number;
  audioPath: string;
  status: TakeStatus;
  failReason?: TakeFailReason;
  transcriptId?: string;
  reportId?: string;
  countedAgainstAllowance: boolean;
  /** Typed/pasted answer (no recording) — scored on its content, not a clock, so
   * its estimated duration never flags a full written answer as "too short". */
  typed?: boolean;
  /** The take this one is a "try again with the rewrite" of. */
  retakeOf?: string;
  /** The prompt text practised — kept so history shows it for any source
   * (library pack, lesson, event or custom scenario). */
  promptText?: string;
}

export type TakeMode = "standard" | "daily_drill" | "lesson" | "event_run" | "placement";

export interface PlanItem {
  id: string;
  day: DateKey;
  title: string;
  focus: string;
  minutes: number;
  done: boolean;
  isFinalRun: boolean;
}

export interface EventPlan {
  id: string;
  type: EventType;
  title: string;
  date: DateKey;
  planItems: PlanItem[];
  readiness: number; // 0..100
  archived: boolean;
}

export interface LessonProgress {
  lessonId: string;
  completed: boolean;
  bestScore: number | null;
}

export interface PromptState {
  /** Prompt ids the user has seen, skipped or flagged as irrelevant. */
  seen: string[];
  skipped: string[];
  flagged: string[];
}

export interface CustomPack {
  id: string;
  name: string;
  topic: string;
  promptTexts: string[];
  createdAt: DateKey;
}

export interface Streak {
  currentCount: number;
  longest: number;
  lastPracticeDate: DateKey | null;
  freezesAvailable: number;
  /** Week we last granted a freeze in (replenish one per week). */
  freezeWeek: string | null;
  repairAvailable: boolean;
  /** Month we last granted a repair in. */
  repairMonth: string | null;
}

export interface Baseline {
  rollingMean: number;
  rollingM2: number; // Welford's aggregate for variance
  sampleCount: number;
}

export type BaselineMetric = "overall" | "wpm" | "fillersPerMin" | "clarity" | "confidence";
export type BaselineSet = Record<BaselineMetric, Baseline>;

export interface Allowance {
  date: DateKey;
  freeTakesUsed: number;
  freeTakesLimit: number;
  bonusTakes: number;
}

export interface Entitlement {
  plan: Plan;
  status: EntitlementStatus;
  expiresAt: DateKey | null;
  trialEndsAt: DateKey | null;
  lastVerifiedAt: DateKey | null;
  source: "store" | "cache" | "none";
}

export interface PendingJob {
  id: string;
  type: "analyse" | "sync";
  takeId: string;
  attempts: number;
  nextRetryAt: number; // epoch ms
}

export interface Settings {
  reminderTimes: string[]; // "HH:MM"
  quietStart: string; // "HH:MM"
  quietEnd: string; // "HH:MM"
  language: string;
  playbackSpeed: number; // 0.75..1.5
  ignoreFillers: string[]; // personal "not a filler" list (lowercased lemmas)
  stutterFriendly: boolean;
  reduceMotion: boolean;
  streakAtRiskNudge: boolean;
  weeklySummary: boolean;
  goal: string | null;
  cloudBackupAudio: boolean;
}
