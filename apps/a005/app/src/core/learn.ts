/**
 * Learn hub: answer templates, linking phrases, quick quizzes (all offline from
 * bundled content), plus the user's personal saved-phrase list.
 */
import { QUIZZES, TEMPLATES, type QuizContent, type TemplateContent } from "./content";
import { MAX_PHRASE_LEN, allocId, type BandUpState, type DateKey, type SavedPhrase } from "./model";

export { QUIZZES, TEMPLATES };
export type { QuizContent, TemplateContent };

export const templatesByCategory = (category: TemplateContent["category"]): TemplateContent[] =>
  TEMPLATES.filter((t) => t.category === category);

export type PhraseError = "empty" | "too_long" | "duplicate";

export function validatePhrase(s: BandUpState, raw: string): PhraseError | null {
  const text = raw.trim();
  if (!text) return "empty";
  if (text.length > MAX_PHRASE_LEN) return "too_long";
  if (s.phrases.some((p) => p.text.toLowerCase() === text.toLowerCase())) return "duplicate";
  return null;
}

/** Save a phrase to the personal list (trimmed, de-duplicated). */
export function savePhrase(
  s: BandUpState,
  raw: string,
  category: string,
  today: DateKey,
): { state: BandUpState; error: PhraseError | null; id?: string } {
  const error = validatePhrase(s, raw);
  if (error) return { state: s, error };
  const { id, next } = allocId(s, "p");
  const phrase: SavedPhrase = { id, text: raw.trim(), category: category || "general", createdAt: today };
  return { state: { ...s, phrases: [...s.phrases, phrase], nextId: next }, error: null, id };
}

export function deletePhrase(s: BandUpState, id: string): BandUpState {
  return { ...s, phrases: s.phrases.filter((p) => p.id !== id) };
}

/** Put a deleted phrase back at its old position (Undo). */
export function restorePhrase(s: BandUpState, phrase: SavedPhrase, index: number): BandUpState {
  if (s.phrases.some((p) => p.id === phrase.id)) return s;
  const phrases = [...s.phrases];
  phrases.splice(Math.max(0, Math.min(index, phrases.length)), 0, phrase);
  return { ...s, phrases };
}

/** Score a quiz answer against the bundled content. */
export function checkQuiz(quizId: string, choiceIndex: number): { correct: boolean; explain: string } | null {
  const q = QUIZZES.find((x) => x.id === quizId);
  if (!q) return null;
  return { correct: choiceIndex === q.answer, explain: q.explain };
}
