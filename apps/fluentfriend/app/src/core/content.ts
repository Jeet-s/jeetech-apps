/**
 * Content-quality gates — the "zero known wrong meanings" release checklist and
 * the structural invariants every lesson/phrase must satisfy. Pure functions
 * over the bundled catalog so validate.ts can assert the content is release-ready.
 */
import { DICTIONARY, DRILLS, GRAMMAR, LESSONS, PHRASES, QUIZ_ITEMS, SCENARIOS, SCRIPTED, getPhrase, getReviewer } from "./catalog";
import type { Level } from "./types";

/**
 * Minimum shipped-content counts. The release is BLOCKED if the catalog drops
 * below these floors (QA design review: "the seed content looks thin next to the
 * PRD promises") — they can only grow. These track the real, bilingual-reviewed
 * library that ships offline, not an aspirational marketing number.
 */
export const CONTENT_FLOORS = {
  phrases: 300,
  dictionary: 340,
  scenarios: 25,
  grammar: 40,
  drills: 8,
} as const;

export interface ContentAudit {
  phrases: number;
  dictionary: number;
  lessons: number;
  scenarios: number;
  grammar: number;
  /** Phrases missing a bilingual-editor review (must be empty to release). */
  unreviewed: string[];
  /** Structural problems (missing audio, empty translation, bad references, thin content). */
  problems: string[];
}

export function auditContent(): ContentAudit {
  const problems: string[] = [];
  const unreviewed: string[] = [];

  for (const p of PHRASES) {
    // "Reviewed" means the id resolves to a real reviewer record (name + credential + date),
    // not just any non-empty placeholder string — a traceable "zero wrong meanings" sign-off.
    if (!p.reviewedBy || !getReviewer(p.reviewedBy)) unreviewed.push(p.id);
    if (!p.en.trim() || !p.bn.trim() || !p.romanBn.trim()) problems.push(`${p.id} has empty text`);
    if (!p.audioNormalUri || !p.audioSlowUri) problems.push(`${p.id} missing dual-speed audio`);
    if (p.audioNormalUri === p.audioSlowUri) problems.push(`${p.id} normal and slow audio are the same`);
  }

  for (const l of LESSONS) {
    if (!l.phraseIds.length) problems.push(`${l.id} has no phrases`);
    if (!l.quizIds.length) problems.push(`${l.id} has no quiz`);
    if (!l.speakingPhraseId) problems.push(`${l.id} has no speaking exercise`);
    if (!getPhrase(l.speakingPhraseId)) problems.push(`${l.id} speaking phrase missing`);
    for (const pid of l.phraseIds) if (!getPhrase(pid)) problems.push(`${l.id} references missing phrase ${pid}`);
    if (l.scenarioId && !SCENARIOS.some((s) => s.id === l.scenarioId)) problems.push(`${l.id} bad scenario ${l.scenarioId}`);
  }

  for (const q of QUIZ_ITEMS) {
    if (!q.options.includes(q.answer) && q.type !== "order_words") problems.push(`${q.id} answer not in options`);
    if (!q.explanationBn.trim()) problems.push(`${q.id} missing Bangla explanation`);
  }

  for (const s of SCENARIOS) {
    const fb = SCRIPTED[s.scriptedFallbackId];
    if (!fb) problems.push(`${s.id} missing scripted fallback`);
    else {
      // Every offline role-play must be a real, multi-turn exchange with reply chips — not a stub.
      if (fb.turns.length < 3) problems.push(`${s.id} scripted fallback too short`);
      for (const t of fb.turns) {
        if (!t.ai.trim() || !t.hintBn.trim()) problems.push(`${s.id} scripted turn missing text`);
        if (!t.suggestions.length) problems.push(`${s.id} scripted turn missing suggestions`);
      }
    }
  }

  for (const g of GRAMMAR) {
    if (g.examples.length < 3) problems.push(`${g.id} has fewer than 3 examples`);
    if (!g.quiz.options.includes(g.quiz.answer)) problems.push(`${g.id} mini-quiz answer not in options`);
  }

  // Content-depth floors — fail the release if the catalog is thinner than we promise.
  if (PHRASES.length < CONTENT_FLOORS.phrases) problems.push(`only ${PHRASES.length} phrases (need ${CONTENT_FLOORS.phrases})`);
  if (DICTIONARY.length < CONTENT_FLOORS.dictionary) problems.push(`only ${DICTIONARY.length} dictionary words (need ${CONTENT_FLOORS.dictionary})`);
  if (SCENARIOS.length < CONTENT_FLOORS.scenarios) problems.push(`only ${SCENARIOS.length} scenarios (need ${CONTENT_FLOORS.scenarios})`);
  if (GRAMMAR.length < CONTENT_FLOORS.grammar) problems.push(`only ${GRAMMAR.length} grammar cards (need ${CONTENT_FLOORS.grammar})`);
  if (DRILLS.length < CONTENT_FLOORS.drills) problems.push(`only ${DRILLS.length} drills (need ${CONTENT_FLOORS.drills})`);

  return {
    phrases: PHRASES.length,
    dictionary: DICTIONARY.length,
    lessons: LESSONS.length,
    scenarios: SCENARIOS.length,
    grammar: GRAMMAR.length,
    unreviewed,
    problems,
  };
}

/** True when nothing is unreviewed and there are no structural problems. */
export function releaseReady(): boolean {
  const a = auditContent();
  return a.unreviewed.length === 0 && a.problems.length === 0;
}

export function scenarioLevelCounts(): Record<Level, number> {
  const counts: Record<Level, number> = { A1: 0, A2: 0, B1: 0 };
  for (const s of SCENARIOS) counts[s.level]++;
  return counts;
}
