/**
 * AppState — the user's dynamic, persisted data — and the pure reducers that
 * compose every rule module (courses, streak, quota, mistakes, feedback…). No
 * React, no storage, no hidden clock: every reducer takes `today` and returns a
 * new state. data.ts wraps this in a persisted() store; sim.ts drives it.
 */
import { addDays, daysBetween, type DateKey } from "./dates";
import { completesCourse, markLessonDone, saveStep, type ProgressMap } from "./courses";
import { getLesson } from "./catalog";
import type { Feedback } from "./feedback";
import { consumeRun, emptyQuota, grantBonus } from "./quota";
import { newMistake, reviewMistake } from "./mistakes";
import { emptyStreak, recordActivity } from "./streak";
import type { PlacementResult } from "./placement";
import type {
  AISession,
  Badge,
  Certificate,
  ErrorReport,
  Favorite,
  Mistake,
  PackState,
  QuotaState,
  StreakState,
  UserProfile,
} from "./types";

export const PACK_IDS = ["c7", "c30", "all"] as const;
export type PackId = (typeof PACK_IDS)[number];

export interface AppState {
  profile: UserProfile;
  progress: ProgressMap;
  favorites: Favorite[];
  mistakes: Mistake[];
  aiSessions: AISession[];
  quota: QuotaState;
  streak: StreakState;
  errorReports: ErrorReport[];
  packs: Record<string, PackState>;
  badges: Badge[];
  certificates: Certificate[];
  lastRatingPromptAt: DateKey | null;
  firstPhraseSpoken: boolean;
  nextSessionId: number;
  nextMistakeId: number;
  nextReportId: number;
}

export const STATE_VERSION = 2;

export function emptyState(today: DateKey): AppState {
  return {
    profile: {
      goal: null,
      level: "A1",
      name: "",
      reminderTime: null,
      notificationsOn: false,
      slowAudio: false,
      placementDone: false,
      cloudBackupOn: false,
      createdAt: today,
    },
    progress: {},
    favorites: [],
    mistakes: [],
    aiSessions: [],
    quota: emptyQuota(today),
    streak: emptyStreak(),
    errorReports: [],
    packs: {},
    badges: [],
    certificates: [],
    lastRatingPromptAt: null,
    firstPhraseSpoken: false,
    nextSessionId: 1,
    nextMistakeId: 1,
    nextReportId: 1,
  };
}

/**
 * Migrate an older persisted shape forward (pure). Keeps whatever the user had
 * and fills any new fields from a fresh empty state so no progress, streak,
 * mistake or favorite is lost on an update. data.ts calls this from persist's
 * migrate hook with today's date as the seed.
 */
export function migrateState(old: unknown, seedDate: DateKey): AppState {
  const base = emptyState(seedDate);
  if (!old || typeof old !== "object") return base;
  const o = old as Partial<AppState>;
  return {
    ...base,
    ...o,
    profile: { ...base.profile, ...(o.profile ?? {}) },
    quota: { ...base.quota, ...(o.quota ?? {}) },
    streak: { ...base.streak, ...(o.streak ?? {}) },
    progress: o.progress ?? base.progress,
    favorites: o.favorites ?? base.favorites,
    mistakes: o.mistakes ?? base.mistakes,
    aiSessions: o.aiSessions ?? base.aiSessions,
    errorReports: o.errorReports ?? base.errorReports,
    packs: o.packs ?? base.packs,
    badges: o.badges ?? base.badges,
    certificates: o.certificates ?? base.certificates,
  };
}

const withBadge = (s: AppState, b: Badge): AppState =>
  s.badges.includes(b) ? s : { ...s, badges: [...s.badges, b] };

// ---------- Onboarding / profile ----------

export function applyPlacement(s: AppState, r: PlacementResult): AppState {
  return { ...s, profile: { ...s.profile, goal: r.goal, level: r.level, placementDone: true } };
}

export function setName(s: AppState, name: string): AppState {
  return { ...s, profile: { ...s.profile, name: name.trim().slice(0, 40) } };
}

export function setReminder(s: AppState, time: string): AppState {
  return { ...s, profile: { ...s.profile, reminderTime: time, notificationsOn: true } };
}

export function disableReminder(s: AppState): AppState {
  return { ...s, profile: { ...s.profile, notificationsOn: false } };
}

export function setSlowAudio(s: AppState, slow: boolean): AppState {
  return { ...s, profile: { ...s.profile, slowAudio: slow } };
}

/** Opt in / out of cloud backup. Off by default — progress stays local-first until the learner turns it on. */
export function setCloudBackup(s: AppState, on: boolean): AppState {
  return { ...s, profile: { ...s.profile, cloudBackupOn: on } };
}

/** Onboarding aha: the first phrase said aloud. */
export function markFirstPhrase(s: AppState, today: DateKey): AppState {
  if (s.firstPhraseSpoken) return s;
  return { ...s, firstPhraseSpoken: true, streak: recordActivity(s.streak, today) };
}

// ---------- Favorites ----------

export const isFavorite = (s: AppState, phraseId: string) =>
  s.favorites.some((f) => f.phraseId === phraseId);

export function toggleFavorite(s: AppState, phraseId: string, today: DateKey): AppState {
  if (isFavorite(s, phraseId)) return { ...s, favorites: s.favorites.filter((f) => f.phraseId !== phraseId) };
  return { ...s, favorites: [...s.favorites, { phraseId, createdAt: today }] };
}

// ---------- Report an error (dedupe by phrase; queues offline) ----------

export function reportError(
  s: AppState,
  phraseId: string,
  reason: ErrorReport["reason"],
  today: DateKey,
): AppState {
  if (s.errorReports.some((r) => r.phraseId === phraseId)) return s; // de-dup
  const report: ErrorReport = { id: `er${s.nextReportId}`, phraseId, reason, createdAt: today, synced: false };
  return { ...s, errorReports: [...s.errorReports, report], nextReportId: s.nextReportId + 1 };
}

export function markReportsSynced(s: AppState): AppState {
  if (s.errorReports.every((r) => r.synced)) return s;
  return { ...s, errorReports: s.errorReports.map((r) => ({ ...r, synced: true })) };
}

// ---------- Offline packs (download with resume) ----------

export function startDownload(s: AppState, pack: PackId): AppState {
  if (s.packs[pack] === "ready") return s;
  return { ...s, packs: { ...s.packs, [pack]: "downloading" } };
}

export function finishDownload(s: AppState, pack: PackId): AppState {
  return { ...s, packs: { ...s.packs, [pack]: "ready" } };
}

export const packState = (s: AppState, pack: PackId): PackState => s.packs[pack] ?? "idle";

// ---------- Lesson completion ----------

export interface LessonDone {
  state: AppState;
  completedCourse: string | null;
  newBadges: Badge[];
}

export function completeLesson(s: AppState, lessonId: string, quizScore: number, today: DateKey): LessonDone {
  const lesson = getLesson(lessonId);
  if (!lesson) return { state: s, completedCourse: null, newBadges: [] };

  const finishesCourse = completesCourse(s.progress, lessonId);
  let next: AppState = {
    ...s,
    progress: markLessonDone(s.progress, lessonId, quizScore, today),
    firstPhraseSpoken: true,
    streak: recordActivity(s.streak, today),
  };

  const before = next.badges.slice();
  let completedCourse: string | null = null;
  if (finishesCourse) {
    completedCourse = lesson.courseId;
    next = {
      ...next,
      certificates: next.certificates.some((c) => c.courseId === lesson.courseId)
        ? next.certificates
        : [...next.certificates, { courseId: lesson.courseId, name: next.profile.name || "Learner", date: today }],
    };
    next = withBadge(next, lesson.courseId === "c7" ? "course_7" : "course_30");
  }
  if (next.streak.current >= 7) next = withBadge(next, "streak_7");

  const newBadges = next.badges.filter((b) => !before.includes(b));
  return { state: next, completedCourse, newBadges };
}

// ---------- AI scenario session ----------

export interface AiSessionInput {
  scenarioId: string;
  feedback: Feedback;
  durationSec: number;
  today: DateKey;
  /** "ai" consumes a quota run and saves mistakes; "scripted" is the offline fallback. */
  source: "ai" | "scripted";
}

export interface AiSessionDone {
  state: AppState;
  session: AISession;
  savedMistakes: number;
  newBadges: Badge[];
}

export function completeAiSession(s: AppState, input: AiSessionInput): AiSessionDone {
  const { scenarioId, feedback, durationSec, today, source } = input;
  const session: AISession = {
    id: `s${s.nextSessionId}`,
    scenarioId,
    startedAt: today,
    durationSec: Math.max(0, Math.round(durationSec)),
    fluencyScore: feedback.fluency,
    clarity: feedback.clarity,
    grammar: feedback.grammar,
    pace: feedback.pace,
    practice: source !== "ai",
  };

  let mistakes = s.mistakes;
  let nextMistakeId = s.nextMistakeId;
  if (source === "ai") {
    for (const c of feedback.corrections) {
      mistakes = [...mistakes, newMistake(`m${nextMistakeId}`, session.id, c.original, c.corrected, c.explanationBn, today)];
      nextMistakeId++;
    }
  }

  let next: AppState = {
    ...s,
    aiSessions: [...s.aiSessions, session],
    mistakes,
    nextMistakeId,
    nextSessionId: s.nextSessionId + 1,
    quota: source === "ai" ? consumeRun(s.quota, today) : s.quota,
    streak: recordActivity(s.streak, today),
  };

  const before = next.badges.slice();
  next = withBadge(next, "first_ai");
  if (next.streak.current >= 7) next = withBadge(next, "streak_7");

  return {
    state: next,
    session,
    savedMistakes: source === "ai" ? feedback.corrections.length : 0,
    newBadges: next.badges.filter((b) => !before.includes(b)),
  };
}

export function grantRewardBonus(s: AppState, today: DateKey): AppState {
  return { ...s, quota: grantBonus(s.quota, today) };
}

// ---------- Mistake review ----------

export function applyReview(s: AppState, mistakeId: string, correct: boolean, today: DateKey): AppState {
  if (!s.mistakes.some((m) => m.id === mistakeId)) return s;
  return {
    ...s,
    mistakes: s.mistakes.map((m) => (m.id === mistakeId ? reviewMistake(m, correct, today) : m)),
    streak: recordActivity(s.streak, today),
  };
}

// ---------- Rating ----------

export function markRatingPrompted(s: AppState, today: DateKey): AppState {
  return { ...s, lastRatingPromptAt: today };
}

// ---------- Weekly fluency trend ----------

export interface TrendPoint {
  day: DateKey;
  score: number | null; // avg fluency that day, null if no session
}

/** Only real AI sessions carry a trustworthy fluency score; scripted/offline practice is excluded. */
export const scoredSessions = (s: AppState) => s.aiSessions.filter((x) => !x.practice);

/**
 * Average fluency per day for the 7 days ending today (oldest first). Scripted/offline
 * practice runs are NOT counted — their score is a word-count estimate, so including them
 * would make the trend meaningless (QA: "offline score is inflated and feeds the chart").
 */
export function fluencyTrend(s: AppState, today: DateKey): TrendPoint[] {
  const scored = scoredSessions(s);
  return Array.from({ length: 7 }, (_, i) => {
    const day = addDays(today, i - 6);
    const todays = scored.filter((x) => x.startedAt === day);
    const score = todays.length
      ? Math.round(todays.reduce((a, b) => a + b.fluencyScore, 0) / todays.length)
      : null;
    return { day, score };
  });
}

/** The trend chart needs at least 2 real (non-practice) AI sessions before it means anything. */
export const trendReady = (s: AppState) => scoredSessions(s).length >= 2;

// ---------- Streak-at-risk / comeback helpers ----------

export function daysSinceActive(s: AppState, today: DateKey): number | null {
  return s.streak.lastActiveDate ? daysBetween(s.streak.lastActiveDate, today) : null;
}
