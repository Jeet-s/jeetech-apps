/**
 * The ~10-minute adaptive daily plan and exam countdown. The plan adapts to the
 * days left before the test and the user's weakest construct, and reflects
 * whether today is already done.
 */
import { daysUntilTest, type BandUpState, type Construct, type DateKey } from "./model";
import { CONSTRUCT_LABEL } from "./model";
import { suggestDrillConstruct, taskForConstruct } from "./insights";
import { practisedToday } from "./credits";
import { questionById, type Question } from "./questions";

export type PlanItemKind = "repeat" | "interview" | "drill" | "mock" | "review";

export interface PlanItem {
  kind: PlanItemKind;
  title: string;
  subtitle: string;
  construct?: Construct;
  minutes: number;
}

export interface DailyPlan {
  items: PlanItem[];
  totalMinutes: number;
  completedToday: boolean;
  daysLeft: number | null;
  weakest: Construct | null;
}

/** Build today's plan. Close to the exam (<= 7 days) it adds a mock; otherwise it
 *  focuses on the weakest construct plus mixed practice. */
export function dailyPlan(s: BandUpState, today: DateKey, pro: boolean): DailyPlan {
  const daysLeft = daysUntilTest(s, today);
  const weak = suggestDrillConstruct(s);
  const items: PlanItem[] = [];

  items.push({ kind: "repeat", title: "Warm up: Listen & Repeat", subtitle: "3 quick items", minutes: 3 });
  items.push({
    kind: "drill",
    title: `Fix this next: ${CONSTRUCT_LABEL[weak]}`,
    subtitle: `3 ${taskForConstruct(weak) === "repeat" ? "Repeat" : "Interview"} items`,
    construct: weak,
    minutes: 4,
  });
  items.push({ kind: "interview", title: "Take an Interview", subtitle: "One 45-second answer", minutes: 2 });

  if (daysLeft !== null && daysLeft <= 7 && daysLeft >= 0) {
    items.push({ kind: "mock", title: "Exam-week mock", subtitle: pro ? "Full section" : "Mock preview", minutes: 12 });
  } else if (s.attempts.some((a) => a.status === "scored")) {
    items.push({ kind: "review", title: "Review your last answer", subtitle: "See Yours / Improved / Sample", minutes: 2 });
  }

  const totalMinutes = items.reduce((sum, it) => sum + it.minutes, 0);
  return { items, totalMinutes, completedToday: practisedToday(s, today), daysLeft, weakest: weak };
}

/** A warm, specific countdown line for the home header. */
export function countdownLabel(daysLeft: number | null): string {
  if (daysLeft === null) return "No test date set";
  if (daysLeft < 0) return "Test date passed";
  if (daysLeft === 0) return "Test is today — you've got this";
  if (daysLeft === 1) return "1 day to go";
  return `${daysLeft} days to go`;
}

/** Resolve a question id to its full record (null-safe helper for the UI). */
export const resolveQuestion = (id: string): Question | undefined => questionById(id);
