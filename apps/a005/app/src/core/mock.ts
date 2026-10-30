/**
 * Full mock speaking test: 7 Listen & Repeat items then 4 Interview questions,
 * no pauses, one section-score report. Free users get a preview of their first
 * mock; Pro unlocks all mocks. Recording works offline; scoring is queued and
 * the report fills in once scored. A half-finished mock can be resumed.
 */
import {
  MOCK_INTERVIEW_ITEMS,
  MOCK_REPEAT_ITEMS,
  MOCK_TOTAL_ITEMS,
  allocId,
  attemptById,
  type BandUpState,
  type DateKey,
  type MockSession,
} from "./model";
import { score30FromBand, bandFromConstructs } from "./scoring";
import { pickQuestions, questionsByTask } from "./questions";

/** Free users may run one mock (the first, as a preview); Pro unlocks all. */
export function canStartMock(s: BandUpState, pro: boolean): boolean {
  if (pro) return true;
  return s.mocks.length === 0;
}

/** An in-progress mock the user can resume (not yet completed), or null. */
export function resumableMock(s: BandUpState): MockSession | null {
  return s.mocks.find((m) => !m.completedAt) ?? null;
}

/** Build the fixed exam order: 7 repeat, then 4 interview (deterministic). */
export function mockQuestionIds(seed: number): string[] {
  const repeats = pickQuestions(questionsByTask("repeat"), MOCK_REPEAT_ITEMS, seed).map((q) => q.id);
  const interviews = pickQuestions(questionsByTask("interview"), MOCK_INTERVIEW_ITEMS, seed * 31 + 7).map((q) => q.id);
  return [...repeats, ...interviews];
}

export function startMock(s: BandUpState, pro: boolean, today: DateKey, seed = 1): { state: BandUpState; id?: string; error?: "locked" } {
  if (!canStartMock(s, pro)) return { state: s, error: "locked" };
  const existing = resumableMock(s);
  if (existing) return { state: s, id: existing.id }; // resume instead of duplicating
  const { id, next } = allocId(s, "m");
  const mock: MockSession = {
    id,
    startedAt: today,
    questionIds: mockQuestionIds(seed),
    attemptIds: [],
    completedAt: null,
    sectionScore30: null,
  };
  return { state: { ...s, mocks: [...s.mocks, mock], nextId: next }, id };
}

/** Link a just-recorded attempt to its mock (in exam order). */
export function attachMockAttempt(s: BandUpState, mockId: string, attemptId: string): BandUpState {
  return {
    ...s,
    mocks: s.mocks.map((m) =>
      m.id === mockId && !m.attemptIds.includes(attemptId) && m.attemptIds.length < MOCK_TOTAL_ITEMS
        ? { ...m, attemptIds: [...m.attemptIds, attemptId] }
        : m,
    ),
  };
}

export const nextMockItemIndex = (m: MockSession): number => m.attemptIds.length;
export const isMockRecordingDone = (m: MockSession): boolean => m.attemptIds.length >= MOCK_TOTAL_ITEMS;

/** Section score (0-30) from the mock's scored attempts; null if none scored yet. */
export function mockSectionScore(s: BandUpState, mockId: string): number | null {
  const m = s.mocks.find((x) => x.id === mockId);
  if (!m) return null;
  const bands = m.attemptIds
    .map((id) => attemptById(s, id))
    .filter((a): a is NonNullable<typeof a> => !!a && a.status === "scored")
    .map((a) => (typeof a.band6 === "number" ? a.band6 : bandFromConstructs(a.constructs)));
  if (!bands.length) return null;
  return score30FromBand(bands.reduce((x, y) => x + y, 0) / bands.length);
}

/** Finish the mock once all items are recorded; stamps the section score so far. */
export function finishMock(s: BandUpState, mockId: string, today: DateKey): BandUpState {
  return {
    ...s,
    mocks: s.mocks.map((m) =>
      m.id === mockId && !m.completedAt
        ? { ...m, completedAt: today, sectionScore30: mockSectionScore(s, mockId) }
        : m,
    ),
  };
}

export const completedMocks = (s: BandUpState): MockSession[] => s.mocks.filter((m) => m.completedAt);
