/**
 * Pure text helpers for the report UI. Kept in src/core (not a screen) so they're
 * deterministic and covered by validate.ts.
 */

/** Does the text already end on a complete sentence (terminal punctuation,
 * optionally followed by a closing quote/bracket)? */
const ENDS_CLEAN = /[.!?]["'”’)\]]*$/;
/** Each sentence terminator run, so we can find the LAST complete sentence. */
const SENTENCE_END = /[.!?]["'”’)\]]*/g;

/**
 * Cap a rewrite at a sentence boundary so a response truncated by the model's
 * token limit never shows a dangling fragment (QA: the rewrite ended mid-sentence
 * on "When I moved to a new city, I", which read as broken). If the text already
 * ends cleanly it's returned trimmed; if it ends mid-sentence we cut back to the
 * last complete sentence; and when there's no complete sentence at all we keep the
 * fragment but mark it with an ellipsis so it reads as intentionally shortened.
 */
export function trimToSentence(text: string): string {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  if (ENDS_CLEAN.test(t)) return t;
  let lastEnd = -1;
  let m: RegExpExecArray | null;
  SENTENCE_END.lastIndex = 0;
  while ((m = SENTENCE_END.exec(t))) lastEnd = m.index + m[0].length;
  if (lastEnd > 0 && lastEnd < t.length) return t.slice(0, lastEnd).trim();
  // A single incomplete sentence — keep it, but flag it as cut (never a bare dangle).
  return `${t.replace(/[,;:\-–—\s]+$/, "")}…`;
}
