/**
 * Domain types for Accent Gym (Stage 1 — core logic). AI (phoneme scoring, fix
 * tips, sound check) is an EXTERNAL modality; the core only ever sees its output
 * as plain data (ScoreResult), so validate.ts and sim.ts can feed fixed samples.
 */
import type { DateKey } from "./dates";

/** Mother tongue (L1). "other" → a general plan. */
export type L1 = "hi" | "es" | "ar" | "other";

/** Target accent the user is scored against. */
export type Accent = "us" | "uk";

export type ThemePref = "system" | "light" | "dark";
export type LearnGoal = "work" | "exam" | "travel" | "confidence";

/** One phoneme's verdict inside a word. score 0..100. */
export interface PhonemeScore {
  /** Catalog sound id (IPA), e.g. "v", "θ", "ɪ". */
  ph: string;
  expectedIPA: string;
  heardIPA: string;
  score: number;
}

export interface WordScore {
  word: string;
  score: number;
  phonemes: PhonemeScore[];
}

/** The shape the AI scoring proxy returns (per recording). The core interprets it. */
export interface ScoreResult {
  /** 0..1 — how sure the model is it heard clear speech. Low → honesty state. */
  confidence: number;
  words: WordScore[];
}

/** A scored attempt, after the core has interpreted a ScoreResult. */
export interface Attempt {
  id: string;
  sentenceId?: string;
  customText?: string;
  accent: Accent;
  timestamp: number; // epoch ms (passed in explicitly)
  overallScore: number; // 0..100
  confidence: number; // 0..1
  lowConfidence: boolean; // true → don't trust the number, "try again"
  phonemeScores: PhonemeScore[];
  wordScores: WordScore[];
  recordingPath?: string; // local-only
  isDiagnostic?: boolean;
  isRetry?: boolean;
}

export interface SoundMastery {
  soundId: string;
  score: number; // 0..100 (latest smoothed mastery)
  trend: { date: DateKey; score: number }[];
  lastPracticed?: DateKey;
  mastered: boolean;
}

export type SRSSource = "miss" | "custom" | "drill";
export interface SRSItem {
  id: string;
  text: string;
  ease: number; // SM-2 ease factor
  interval: number; // days until next review
  dueAt: DateKey;
  source: SRSSource;
  lapses: number;
  soundTags: string[];
  addedAt: DateKey;
}

export interface Streak {
  current: number;
  best: number;
  freezesLeft: number;
  lastActiveDate?: DateKey;
  /** If a day was missed, it can be recovered until this day (inclusive). */
  recoverableUntil?: DateKey;
  /** Monday of the week the freezes were last refilled. */
  freezeWeek?: DateKey;
}

export interface DailyQuota {
  date: DateKey;
  scoredUsed: number;
  bonusFromAds: number;
}

export type Plan = "free" | "pro_monthly" | "pro_yearly" | "lifetime";
export type EntStatus = "none" | "trialing" | "active" | "expired" | "cancelled";

export interface Entitlement {
  plan: Plan;
  status: EntStatus;
  trialEndsAt?: number; // epoch ms
  nextBillingDate?: number; // epoch ms
  source?: "trial" | "purchase" | "restore";
  lastVerifiedAt?: number;
  grandfatheredPlan?: Plan;
}

export interface UserProfile {
  nativeLanguage: L1;
  targetAccent: Accent;
  goal?: LearnGoal;
  reminderTime?: string; // "HH:MM" local, undefined = off
  dailyMinutes: number;
  commentsOn: boolean; // per-word voice comments (off by default)
  ipaOn: boolean;
  theme: ThemePref;
  voiceDataOptIn: boolean;
  createdAt: DateKey;
  accountId?: string;
}

export interface Assessment {
  id: string;
  date: DateKey;
  topSounds: string[];
  clarityEstimate: string; // CEFR-style label (always "estimate")
  overall: number; // 0..100
}

export type { DateKey };
