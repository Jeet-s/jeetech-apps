/**
 * Quiz checking — pure. Instant right/wrong with a Bangla reason. Order-the-words
 * accepts the tokens joined in the right order; everything else is an exact
 * option match (case/space-insensitive).
 */
import type { QuizItem } from "./types";

export interface QuizAnswer {
  correct: boolean;
  explanationBn: string;
  answer: string; // the right answer, to show after a wrong guess
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

export function checkAnswer(item: QuizItem, given: string): QuizAnswer {
  const correct = norm(given) === norm(item.answer);
  return { correct, explanationBn: item.explanationBn, answer: item.answer };
}

export interface QuizOutcome {
  total: number;
  correct: number;
  score: number; // 0..100
  passed: boolean;
}

export const QUIZ_PASS = 60;

/** Summarise a finished quiz from the per-question correctness flags. */
export function gradeQuiz(results: boolean[]): QuizOutcome {
  const total = results.length;
  const correct = results.filter(Boolean).length;
  const score = total ? Math.round((correct / total) * 100) : 0;
  return { total, correct, score, passed: score >= QUIZ_PASS };
}
