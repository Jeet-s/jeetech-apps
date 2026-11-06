/**
 * Skill badges & achievements — pure, derived from AppState. No React, no
 * storage. These power the Streak & Achievements screen (reached from Home and
 * Progress) and give the daily-drill loop a visible sense of progress, the way
 * Duolingo-style coaches do. Each badge is either earned or shows how close the
 * user is, so the screen is never empty.
 */
import type { AppState } from "./state";
import type { IconName } from "../ui/Icon";

export interface Achievement {
  id: string;
  title: string;
  desc: string;
  icon: IconName;
  earned: boolean;
  /** How close the user is (for locked badges) — current / target. */
  progress: { current: number; target: number };
}

const doneReports = (s: AppState) => s.reports;

/** Distinct scenario packs the user has actually recorded in. */
export function packsPractised(s: AppState): number {
  const done = s.takes.filter((t) => t.status === "done");
  return new Set(done.map((t) => t.packId)).size;
}

/** The best (highest) overall score across every report, 0 when none. */
export function bestScore(s: AppState): number {
  return doneReports(s).reduce((m, r) => Math.max(m, r.overallScore), 0);
}

/** Lessons the user has completed. */
const lessonsDone = (s: AppState) => s.lessons.filter((l) => l.completed).length;

const clamp = (n: number, target: number) => ({ current: Math.min(n, target), target });

/**
 * Every badge the app can award, in a stable order, each marked earned or with
 * its progress. Thresholds are deliberately reachable so the loop feels alive.
 */
export function computeAchievements(s: AppState): Achievement[] {
  const reports = doneReports(s);
  const takes = reports.length;
  const cleanTakes = reports.filter((r) => r.fillerTotal === 0).length;
  const sharpTakes = reports.filter((r) => r.overallScore >= 85).length;
  const structuredTakes = reports.filter((r) => r.structure.opening && r.structure.point && r.structure.close).length;
  const steadyTakes = reports.filter((r) => r.paceVerdict === "good").length;
  const packs = packsPractised(s);
  const lessons = lessonsDone(s);
  const best = bestScore(s);
  const cur = s.streak.currentCount;
  const long = s.streak.longest;

  const list: Achievement[] = [
    mk("first_take", "First take", "Record your first take", "mic", takes, 1),
    mk("getting_going", "Getting going", "Record 5 takes", "wave", takes, 5),
    mk("marathoner", "Marathoner", "Record 20 takes", "trophy", takes, 20),
    mk("streak_3", "3-day streak", "Practise 3 days in a row", "flame", long, 3),
    mk("streak_7", "7-day streak", "Practise 7 days in a row", "flame", long, 7),
    mk("filler_free", "Filler-free", "Finish a take with zero fillers", "checkCircle", cleanTakes, 1),
    mk("steady_pace", "Steady pace", "Land a take in the ideal pace range", "target", steadyTakes, 1),
    mk("well_built", "Well built", "Nail opening, point and close in one take", "book", structuredTakes, 1),
    mk("sharp", "Sharp", "Score 85 or higher", "star", best >= 85 ? 1 : 0, 1),
    mk("explorer", "Explorer", "Practise 5 different scenarios", "rocket", packs, 5),
    mk("student", "Student", "Complete a guided lesson", "grad", lessons, 1),
    mk("on_fire", "On fire", "Hold a 5-day streak right now", "flame", cur, 5),
    mk("perfectionist", "Perfectionist", "Get 3 takes scored 85+", "trophy", sharpTakes, 3),
  ];
  return list;
}

function mk(id: string, title: string, desc: string, icon: IconName, current: number, target: number): Achievement {
  return { id, title, desc, icon, earned: current >= target, progress: clamp(current, target) };
}

/** How many badges are earned / total — for the header summary. */
export function achievementSummary(s: AppState): { earned: number; total: number } {
  const all = computeAchievements(s);
  return { earned: all.filter((a) => a.earned).length, total: all.length };
}
