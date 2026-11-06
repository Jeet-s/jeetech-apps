/**
 * Course progression — pure. A day unlocks when the previous day is done; a
 * finished day can always be replayed; missed days are never punished (the next
 * step is simply the first unfinished day). Day N of the 30-day course finishing
 * yields a certificate.
 */
import { getCourse, getLesson, lessonsForCourse } from "./catalog";
import type { DateKey } from "./dates";
import type { Progress } from "./types";

export type DisplayStatus = "locked" | "available" | "in_progress" | "done";

export type ProgressMap = Record<string, Progress>;

export const isDone = (m: ProgressMap, lessonId: string) => m[lessonId]?.status === "done";

/** Status of a lesson for display (adds "locked" on top of the stored status). */
export function displayStatus(m: ProgressMap, lessonId: string): DisplayStatus {
  const lesson = getLesson(lessonId);
  if (!lesson) return "locked";
  const stored = m[lessonId]?.status;
  if (stored === "done") return "done";
  if (lesson.day === 1) return stored === "in_progress" ? "in_progress" : "available";
  const prev = lessonsForCourse(lesson.courseId).find((l) => l.day === lesson.day - 1);
  if (prev && !isDone(m, prev.id)) return "locked";
  return stored === "in_progress" ? "in_progress" : "available";
}

export const isUnlocked = (m: ProgressMap, lessonId: string) => displayStatus(m, lessonId) !== "locked";

/** Bangla reason a locked day can't be opened yet. */
export function lockReasonBn(m: ProgressMap, lessonId: string): string | null {
  const lesson = getLesson(lessonId);
  if (!lesson || displayStatus(m, lessonId) !== "locked") return null;
  return `আগে দিন ${lesson.day - 1} সম্পূর্ণ করুন।`;
}

export interface CourseProgress {
  courseId: string;
  total: number;
  done: number;
  pct: number; // 0..1
  currentDay: number; // the next step (1-based); equals total when finished
  nextLessonId: string | null; // null when the whole course is finished
  completed: boolean;
}

export function courseProgress(m: ProgressMap, courseId: string): CourseProgress {
  const lessons = lessonsForCourse(courseId);
  const total = lessons.length;
  const done = lessons.filter((l) => isDone(m, l.id)).length;
  const next = lessons.find((l) => !isDone(m, l.id)) ?? null;
  return {
    courseId,
    total,
    done,
    pct: total ? done / total : 0,
    currentDay: next ? next.day : total,
    nextLessonId: next?.id ?? null,
    completed: done === total && total > 0,
  };
}

/** Does finishing this lesson complete its whole course (→ certificate)? */
export function completesCourse(m: ProgressMap, lessonId: string): boolean {
  const lesson = getLesson(lessonId);
  if (!lesson) return false;
  const course = getCourse(lesson.courseId);
  if (!course) return false;
  const lessons = lessonsForCourse(lesson.courseId);
  // Every other lesson already done, and this is the last unfinished one.
  return lessons.every((l) => l.id === lessonId || isDone(m, l.id));
}

/** Mark a lesson done with its quiz score + completion date. */
export function markLessonDone(m: ProgressMap, lessonId: string, score: number, today: DateKey): ProgressMap {
  const prev = m[lessonId];
  return {
    ...m,
    [lessonId]: {
      lessonId,
      status: "done",
      score: Math.max(score, prev?.score ?? 0),
      completedAt: today,
      lastStep: 0,
    },
  };
}

/** Save a resume cursor without finishing the lesson. */
export function saveStep(m: ProgressMap, lessonId: string, step: number): ProgressMap {
  const prev = m[lessonId];
  if (prev?.status === "done") return m;
  return {
    ...m,
    [lessonId]: {
      lessonId,
      status: "in_progress",
      score: prev?.score ?? 0,
      completedAt: null,
      lastStep: step,
    },
  };
}
