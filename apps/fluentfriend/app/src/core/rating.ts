/**
 * Store-rating prompt eligibility — pure. Ask ONLY after a win (a completed day
 * or a good AI session), never in an ad flow, never after a failure, never on
 * the first session, and at most once per 30 days. The actual Play in-app review
 * card is shown by src/modules/review.ts; this just decides if it's allowed.
 */
import { daysBetween, type DateKey } from "./dates";

export const RATING_COOLDOWN_DAYS = 30;
export const GOOD_SESSION_SCORE = 70;

export interface RatingContext {
  kind: "day_complete" | "ai_session";
  /** For an AI session, its fluency score. */
  score?: number;
  /** Whether this is the user's very first session of that kind. */
  isFirst: boolean;
  lastPromptedAt: DateKey | null;
  today: DateKey;
}

export function canPromptRating(ctx: RatingContext): boolean {
  if (ctx.isFirst) return false; // never on the first session
  if (ctx.kind === "ai_session" && (ctx.score ?? 0) < GOOD_SESSION_SCORE) return false;
  if (ctx.lastPromptedAt && daysBetween(ctx.lastPromptedAt, ctx.today) < RATING_COOLDOWN_DAYS) return false;
  return true;
}
