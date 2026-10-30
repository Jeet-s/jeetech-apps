/**
 * Progress insights and weak-spot drills: construct averages, the weakest
 * construct, the estimated-score trend, a first-vs-latest before/after, the next
 * suggested drill, and milestone badges. All derived from scored attempts.
 */
import {
  CONSTRUCTS,
  CONSTRUCTS_FOR,
  TREND_MIN_ATTEMPTS,
  allocId,
  scoredAttempts,
  type Attempt,
  type BandUpState,
  type Construct,
  type DateKey,
  type Drill,
  type TaskType,
} from "./model";
import { pickQuestions, questionsByTask, type Question } from "./questions";

export interface ConstructStat {
  construct: Construct;
  avg: number; // mean 1-6 across scored attempts that scored it
  count: number;
}

/** Average of each construct across scored attempts (only constructs with data). */
export function constructStats(s: BandUpState): ConstructStat[] {
  const sums: Record<string, { sum: number; count: number }> = {};
  for (const a of scoredAttempts(s)) {
    for (const c of CONSTRUCTS) {
      const v = a.constructs[c];
      if (typeof v === "number") {
        sums[c] = sums[c] || { sum: 0, count: 0 };
        sums[c].sum += v;
        sums[c].count += 1;
      }
    }
  }
  return CONSTRUCTS.filter((c) => sums[c]?.count).map((c) => ({
    construct: c,
    avg: sums[c].sum / sums[c].count,
    count: sums[c].count,
  }));
}

/** The construct with the lowest average (the thing to fix next), or null. */
export function weakestConstruct(s: BandUpState): Construct | null {
  const stats = constructStats(s);
  if (!stats.length) return null;
  return stats.reduce((lo, c) => (c.avg < lo.avg ? c : lo)).construct;
}

export interface TrendPoint {
  date: DateKey;
  score30: number;
  attemptId: string;
}

/** Estimated score over time (oldest first). Shown after >= 2 scored attempts. */
export function scoreTrend(s: BandUpState): TrendPoint[] {
  return scoredAttempts(s)
    .filter((a) => typeof a.score30 === "number")
    .map((a) => ({ date: a.startedAt, score30: a.score30 as number, attemptId: a.id }));
}

export const hasTrend = (s: BandUpState): boolean => scoreTrend(s).length >= TREND_MIN_ATTEMPTS;

export interface BeforeAfter {
  taskType: TaskType;
  first: number; // score30 of first scored attempt of this task
  latest: number; // score30 of latest
  delta: number;
}

/** First vs latest scored attempt on the same task type (null if < 2). */
export function beforeAfter(s: BandUpState, taskType: TaskType): BeforeAfter | null {
  const scored = scoredAttempts(s).filter((a) => a.taskType === taskType && typeof a.score30 === "number");
  if (scored.length < 2) return null;
  const first = scored[0].score30 as number;
  const latest = scored[scored.length - 1].score30 as number;
  return { taskType, first, latest, delta: latest - first };
}

/** Which task type best trains a construct. repeat_accuracy → Repeat, else Interview. */
export function taskForConstruct(construct: Construct): TaskType {
  return construct === "repeat_accuracy" ? "repeat" : "interview";
}

/** Questions for a weak-spot drill (deterministic, never empty). */
export function drillQuestions(construct: Construct, count: number, seed: number): Question[] {
  return pickQuestions(questionsByTask(taskForConstruct(construct)), count, seed);
}

/**
 * Suggest the next drill. With enough data, it targets the weakest construct;
 * with fewer than 3 scored attempts it falls back to a fluency starter drill so
 * a brand-new user is never stuck.
 */
export function suggestDrillConstruct(s: BandUpState): Construct {
  return scoredAttempts(s).length >= 3 ? weakestConstruct(s) ?? "fluency" : "fluency";
}

/** Start a drill of `count` targeted items. */
export function startDrill(
  s: BandUpState,
  construct: Construct,
  today: DateKey,
  count = 3,
  seed = 1,
): { state: BandUpState; id: string } {
  const { id, next } = allocId(s, "d");
  const questionIds = drillQuestions(construct, count, seed).map((q) => q.id);
  const drill: Drill = { id, construct, questionIds, startedAt: today, completedAt: null };
  return { state: { ...s, drills: [...s.drills, drill], nextId: next }, id };
}

export function completeDrill(s: BandUpState, id: string, today: DateKey): BandUpState {
  return { ...s, drills: s.drills.map((d) => (d.id === id && !d.completedAt ? { ...d, completedAt: today } : d)) };
}

export const completedDrills = (s: BandUpState): Drill[] => s.drills.filter((d) => d.completedAt);

// ---- Milestone badges -----------------------------------------------------
export type BadgeId = "first_attempt" | "ten_attempts" | "streak_7" | "first_mock" | "band_up";

/** Display order + copy for the milestone badges (shared by Progress and the
 *  attempt celebration so a newly-earned badge reads the same everywhere). */
export const BADGE_ORDER: BadgeId[] = ["first_attempt", "ten_attempts", "streak_7", "first_mock", "band_up"];
export const BADGE_LABEL: Record<BadgeId, string> = {
  first_attempt: "First answer",
  ten_attempts: "10 answers",
  streak_7: "7-day streak",
  first_mock: "First mock",
  band_up: "Band up!",
};
export const BADGE_HINT: Record<BadgeId, string> = {
  first_attempt: "Speak your first answer",
  ten_attempts: "Record 10 answers",
  streak_7: "Practise 7 days in a row",
  first_mock: "Finish a full mock test",
  band_up: "Beat your first score",
};

export function earnedBadges(s: BandUpState): BadgeId[] {
  const out: BadgeId[] = [];
  const scored = scoredAttempts(s);
  if (s.attempts.length >= 1) out.push("first_attempt");
  if (s.attempts.length >= 10) out.push("ten_attempts");
  if (s.profile.streakCount >= 7) out.push("streak_7");
  if (s.mocks.some((m) => m.completedAt)) out.push("first_mock");
  if (scored.length >= 2) {
    const first = scored[0].score30 ?? 0;
    const best = Math.max(...scored.map((a) => a.score30 ?? 0));
    if (best > first) out.push("band_up");
  }
  return out;
}

/** Validate the construct values on an attempt are all within the 1-6 band and
 *  only use constructs that belong to that task type (used by invariants). */
export function attemptConstructsValid(a: Attempt): boolean {
  const allowed = new Set(CONSTRUCTS_FOR[a.taskType]);
  return Object.entries(a.constructs).every(([k, v]) => allowed.has(k as Construct) && typeof v === "number" && v >= 1 && v <= 6);
}
