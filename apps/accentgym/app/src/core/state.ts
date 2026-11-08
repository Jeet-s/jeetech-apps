/**
 * AppState + high-level reducers — the one object the app persists and the UI
 * (Stage 2) and journey bots (sim.ts) drive. Every reducer is pure, takes the
 * current day / epoch explicitly, never mutates, and never throws. This is where
 * the sub-domains (scoring, mastery, SRS, streak, quota, entitlement, sound check,
 * session, assessment) compose into the real product loop.
 */
import type {
  Accent,
  Assessment,
  Attempt,
  DailyQuota,
  Entitlement,
  L1,
  SRSItem,
  SoundMastery,
  Streak,
  UserProfile,
} from "./types";
import type { DateKey } from "./dates";
import { noonMs } from "./dates";
import { defaultProfile, setAccent, setLanguage, splitIntoSentences, validateCustomText } from "./profile";
import { GENERAL_PLAN } from "./sentences";
import { buildPlan, buildReport, reorderPlan, type SoundReport } from "./soundplan";
import { isSoundId } from "./sounds";
import type { ScoreResult } from "./types";
import { CLOSE_SCORE, type InterpretMeta, interpret, isCleanSuccess, missedWords } from "./scoring";
import { recordSounds } from "./mastery";
import { autoSaveMisses, addItem, removeItem as removeSrsItem, review as reviewSrs } from "./srs";
import { emptyStreak, recordActivity } from "./streak";
import { addBonus, canScore, emptyQuota, rollover, useScore } from "./quota";
import {
  cancel as cancelEnt,
  freeEntitlement,
  grandfather as grandfatherEnt,
  isPro as entIsPro,
  purchase as purchaseEnt,
  restore as restoreEnt,
  startTrial,
  tick as tickEnt,
} from "./entitlement";
import { buildAssessment } from "./assessment";
import {
  type DailySession,
  type SessionProgress,
  advance,
  buildDailySession,
  isComplete,
  startProgress,
} from "./session";

export const DIAGNOSTIC_COUNT = 3;

export interface AppState {
  profile: UserProfile;
  onboarded: boolean;
  attempts: Attempt[]; // practice + custom (newest last)
  diagnostics: Attempt[]; // the first ≤3 diagnostic attempts
  reportShown: boolean;
  plan: string[]; // sound plan (ordered weakest-first)
  mastery: Record<string, SoundMastery>;
  srs: SRSItem[];
  streak: Streak;
  quota: DailyQuota;
  entitlement: Entitlement;
  assessments: Assessment[];
  sessionProgress?: SessionProgress;
  guidedPractice?: { text: string; date: DateKey };
  /** Auto-save missed words (<70%) to the personal set (user can toggle off). */
  saveMissesOn: boolean;
  nextAttemptId: number;
  nextSrsId: number;
  nextAssessmentId: number;
}

export function emptyState(today: DateKey): AppState {
  return {
    profile: defaultProfile(today),
    onboarded: false,
    attempts: [],
    diagnostics: [],
    reportShown: false,
    plan: [...GENERAL_PLAN],
    mastery: {},
    srs: [],
    streak: emptyStreak(),
    quota: emptyQuota(today),
    entitlement: freeEntitlement(),
    assessments: [],
    saveMissesOn: true,
    nextAttemptId: 1,
    nextSrsId: 1,
    nextAssessmentId: 1,
  };
}

export function pro(s: AppState, now: number): boolean {
  return entIsPro(s.entitlement, now);
}

// ── Onboarding / profile ─────────────────────────────────────────────────────

/** Pick a mother tongue and seed an L1-specific plan (keeps mastery/order). */
export function chooseLanguage(s: AppState, l1: L1): AppState {
  const plan = reorderPlan(buildPlan(s.diagnostics, l1), s.mastery);
  return { ...s, profile: setLanguage(s.profile, l1), plan };
}

export function chooseAccent(s: AppState, accent: Accent): AppState {
  return { ...s, profile: setAccent(s.profile, accent) };
}

export function finishOnboarding(s: AppState): AppState {
  return { ...s, onboarded: true };
}

// ── Scoring pipeline (shared by diagnostics, practice, custom) ────────────────

/** Per-catalog-sound average across an attempt (confident only). */
function soundObservations(a: Attempt): { soundId: string; score: number }[] {
  if (a.lowConfidence) return [];
  const by = new Map<string, { sum: number; count: number }>();
  for (const p of a.phonemeScores) {
    if (!isSoundId(p.ph)) continue;
    const e = by.get(p.ph) ?? { sum: 0, count: 0 };
    e.sum += p.score;
    e.count += 1;
    by.set(p.ph, e);
  }
  return [...by.entries()].map(([soundId, e]) => ({ soundId, score: Math.round(e.sum / e.count) }));
}

function foldAttempt(s: AppState, a: Attempt, today: DateKey, countStreak: boolean): AppState {
  const mastery = recordSounds(s.mastery, soundObservations(a), today);
  const plan = reorderPlan(s.plan, mastery);
  // Auto-save missed words to the personal set (user can toggle off).
  const save = autoSaveMisses(s.srs, missedWords(a), today, (i) => `w${s.nextSrsId + i}`, s.saveMissesOn);
  const streak = countStreak && isCleanSuccess(a) ? recordActivity(s.streak, today) : s.streak;
  return {
    ...s,
    mastery,
    plan,
    srs: save.items,
    nextSrsId: s.nextSrsId + save.addedIds.length,
    streak,
  };
}

export type RecordOutcome = { state: AppState; attempt?: Attempt; blocked?: "quota" };

/** Record a diagnostic attempt (free, no quota, no streak until the report). */
export function recordDiagnostic(s: AppState, raw: ScoreResult, meta: Omit<InterpretMeta, "isDiagnostic">, today: DateKey): RecordOutcome {
  if (s.diagnostics.length >= DIAGNOSTIC_COUNT) return { state: s }; // already done
  const id = `d${s.nextAttemptId}`;
  const attempt = interpret(id, raw, { ...meta, isDiagnostic: true });
  if (attempt.lowConfidence) return { state: s, attempt };
  const folded = foldAttempt(s, attempt, today, false);
  return {
    state: { ...folded, diagnostics: [...s.diagnostics, attempt], nextAttemptId: s.nextAttemptId + 1 },
    attempt,
  };
}

export function diagnosticsDone(s: AppState): boolean {
  return s.diagnostics.length >= DIAGNOSTIC_COUNT;
}

export function soundReport(s: AppState): SoundReport | null {
  if (!diagnosticsDone(s)) return null;
  return buildReport(s.diagnostics, s.profile.nativeLanguage);
}

/** Finalise the first report: build the plan from the diagnostic + record the
 *  baseline assessment, and mark the report as seen. */
export function completeDiagnosis(s: AppState, today: DateKey): AppState {
  if (!diagnosticsDone(s)) return s;
  const l1 = s.profile.nativeLanguage;
  const plan = reorderPlan(buildPlan(s.diagnostics, l1), s.mastery);
  const alreadyBaselined = s.assessments.length > 0;
  const assessments = alreadyBaselined
    ? s.assessments
    : [buildAssessment(`as${s.nextAssessmentId}`, s.diagnostics, l1, today)];
  return {
    ...s,
    plan,
    reportShown: true,
    assessments,
    nextAssessmentId: alreadyBaselined ? s.nextAssessmentId : s.nextAssessmentId + 1,
  };
}

/** Record a scored practice attempt (quota-gated for free users). */
export function recordPractice(s: AppState, raw: ScoreResult, meta: InterpretMeta, today: DateKey, now: number): RecordOutcome {
  const isPro = pro(s, now);
  const q = rollover(s.quota, today);
  if (!canScore(q, today, isPro)) return { state: { ...s, quota: q }, blocked: "quota" };
  const id = `a${s.nextAttemptId}`;
  const attempt = interpret(id, raw, meta);
  if (attempt.lowConfidence) return { state: s, attempt };
  const folded = foldAttempt(s, attempt, today, true);
  return {
    state: {
      ...folded,
      attempts: [...s.attempts, attempt],
      quota: useScore(q, today, isPro),
      nextAttemptId: s.nextAttemptId + 1,
    },
    attempt,
  };
}

/** Type-any-text: validate, (optionally split), score, and save to the set. */
export function recordCustom(s: AppState, text: string, raw: ScoreResult, today: DateKey, now: number, recordingPath?: string): RecordOutcome & { error?: string } {
  const err = validateCustomText(text);
  if (err) return { state: s, error: err };
  const first = splitIntoSentences(text)[0] ?? text.trim();
  const isPro = pro(s, now);
  const q = rollover(s.quota, today);
  if (!canScore(q, today, isPro)) return { state: { ...s, quota: q }, blocked: "quota" };
  const id = `a${s.nextAttemptId}`;
  const attempt = interpret(id, raw, { accent: s.profile.targetAccent, timestamp: now, customText: first, recordingPath });
  if (attempt.lowConfidence) return { state: saveCustomText(s, text, today), attempt };
  let folded = foldAttempt(s, attempt, today, true);
  // Always save the typed phrase itself to the personal set.
  const saved = addItem(folded.srs, { id: `w${folded.nextSrsId}`, text: first, source: "custom" }, today);
  folded = { ...folded, srs: saved.items, nextSrsId: folded.nextSrsId + (saved.added ? 1 : 0) };
  return {
    state: {
      ...folded,
      attempts: [...s.attempts, attempt],
      quota: useScore(q, today, isPro),
      nextAttemptId: s.nextAttemptId + 1,
    },
    attempt,
  };
}

/** Save custom text before any network or scoring step, including offline. */
export function saveCustomText(s: AppState, text: string, today: DateKey): AppState {
  if (validateCustomText(text)) return s;
  const saved = addItem(s.srs, { id: `w${s.nextSrsId}`, text, source: "custom" }, today);
  return saved.added ? { ...s, srs: saved.items, nextSrsId: s.nextSrsId + 1 } : s;
}

/** Unscored listen/read practice is activity, never evidence of sound mastery. */
export function completeGuidedPractice(s: AppState, text: string, today: DateKey): AppState {
  if (validateCustomText(text)) return s;
  return { ...s, guidedPractice: { text: text.trim(), date: today }, streak: recordActivity(s.streak, today) };
}

/** Version 1 had no guided-practice record; retain all existing progress. */
export function migrateState(old: unknown, today: DateKey): AppState {
  if (!old || typeof old !== "object" || !("profile" in old) || !("attempts" in old)) return emptyState(today);
  return { ...emptyState(today), ...old } as AppState;
}

// ── Drills, SRS review, sessions ──────────────────────────────────────────────

/** Complete a minimal-pair / speak drill for a sound (updates the sound map). */
export function completeDrill(s: AppState, soundId: string, correctRatio: number, today: DateKey): AppState {
  if (!isSoundId(soundId)) return s;
  const score = Math.max(0, Math.min(100, Math.round(correctRatio * 100)));
  const mastery = recordSounds(s.mastery, [{ soundId, score }], today);
  const plan = reorderPlan(s.plan, mastery);
  const streak = score >= CLOSE_SCORE ? recordActivity(s.streak, today) : s.streak;
  return { ...s, mastery, plan, streak };
}

export function reviewItem(s: AppState, id: string, correct: boolean, today: DateKey): AppState {
  return { ...s, srs: reviewSrs(s.srs, id, correct, today) };
}

/** Remove a saved word/phrase from the personal practice set. */
export function removeReviewItem(s: AppState, id: string): AppState {
  return { ...s, srs: removeSrsItem(s.srs, id) };
}

export function toggleAutoSaveMisses(s: AppState, on: boolean): AppState {
  return { ...s, saveMissesOn: on };
}

export function todaysSession(s: AppState, today: DateKey, now: number): DailySession {
  return buildDailySession({
    srs: s.srs,
    plan: s.plan,
    mastery: s.mastery,
    pro: pro(s, now),
    minutes: s.profile.dailyMinutes,
    today,
  });
}

/** Advance the resume pointer by one session item (survives app kill). */
export function advanceSession(s: AppState, today: DateKey, now: number): AppState {
  const session = todaysSession(s, today, now);
  const prog: SessionProgress = s.sessionProgress && s.sessionProgress.date === today ? s.sessionProgress : startProgress(session);
  return { ...s, sessionProgress: advance(prog) };
}

/** Finish the daily session: counts streak activity and clears the pointer. */
export function completeSession(s: AppState, today: DateKey, now: number): AppState {
  const session = todaysSession(s, today, now);
  const done: SessionProgress = { date: today, index: session.items.length, total: session.items.length };
  const streak = recordActivity(s.streak, today);
  return { ...s, sessionProgress: done, streak };
}

export function sessionComplete(s: AppState, today: DateKey, now: number): boolean {
  return isComplete(s.sessionProgress, todaysSession(s, today, now));
}

// ── Monetization / account ────────────────────────────────────────────────────

export function watchRewarded(s: AppState, today: DateKey): AppState {
  return { ...s, quota: addBonus(s.quota, today) };
}

export function beginTrial(s: AppState, plan: "pro_monthly" | "pro_yearly", now: number): AppState {
  return { ...s, entitlement: startTrial(s.entitlement, plan, now) };
}
export function buy(s: AppState, plan: Entitlement["plan"], now: number): AppState {
  return { ...s, entitlement: purchaseEnt(s.entitlement, plan, now) };
}
export function cancelPlan(s: AppState): AppState {
  return { ...s, entitlement: cancelEnt(s.entitlement) };
}
export function grandfather(s: AppState): AppState {
  return { ...s, entitlement: grandfatherEnt(s.entitlement) };
}

/** Link an email account (guest-to-account) without losing anything. */
export function linkAccount(s: AppState, accountId: string): AppState {
  return { ...s, profile: { ...s.profile, accountId } };
}

/** Restore Pro + the backed-up progress from an account snapshot. */
export function restoreFromBackup(s: AppState, snapshot: AppState, now: number): AppState {
  return { ...snapshot, entitlement: restoreEnt(snapshot.entitlement, now) };
}

/** Advance the billing/trial clock (call on app open with the real `now`). */
export function tick(s: AppState, today: DateKey, now: number): AppState {
  const entitlement = tickEnt(s.entitlement, now);
  const quota = rollover(s.quota, today);
  return entitlement === s.entitlement && quota === s.quota ? s : { ...s, entitlement, quota };
}

export const nowFromToday = (today: DateKey): number => noonMs(today);

/** Preserve both phones' practice when signing into an existing backup. */
export function mergeBackup(local: AppState, remote: AppState): AppState {
  const byAttempt = new Map<string, Attempt>();
  for (const a of [...remote.attempts, ...local.attempts]) byAttempt.set(JSON.stringify([a.timestamp, a.sentenceId, a.customText, a.wordScores]), a);
  const attempts = [...byAttempt.values()].sort((a, b) => a.timestamp - b.timestamp).map((a, i) => ({ ...a, id: `a${i + 1}` }));
  const byWord = new Map<string, SRSItem>();
  for (const item of [...remote.srs, ...local.srs]) {
    const key = item.text.trim().toLowerCase().replace(/\s+/g, " ");
    const previous = byWord.get(key);
    if (!previous || item.interval > previous.interval) byWord.set(key, item);
  }
  const srs = [...byWord.values()].map((item, i) => ({ ...item, id: `w${i + 1}` }));
  const mastery = { ...remote.mastery };
  for (const [id, m] of Object.entries(local.mastery)) if (!mastery[id] || (m.lastPracticed ?? "") > (mastery[id].lastPracticed ?? "")) mastery[id] = m;
  const diagnostics = remote.diagnostics.length >= local.diagnostics.length ? remote.diagnostics : local.diagnostics;
  const assessmentMap = new Map([...remote.assessments, ...local.assessments].map(a => [JSON.stringify([a.date, a.overall, a.topSounds]), a]));
  const assessments = [...assessmentMap.values()].sort((a, b) => a.date.localeCompare(b.date)).map((a, i) => ({ ...a, id: `as${i + 1}` }));
  const currentStreak = (local.streak.lastActiveDate ?? "") > (remote.streak.lastActiveDate ?? "") ? local.streak : remote.streak;
  const streak = { ...currentStreak, best: Math.max(local.streak.best, remote.streak.best) };
  const guidedPractice = (local.guidedPractice?.date ?? "") > (remote.guidedPractice?.date ?? "") ? local.guidedPractice : remote.guidedPractice;
  return { ...remote, guidedPractice, diagnostics, assessments, streak, reportShown: remote.reportShown || local.reportShown, nextAssessmentId: assessments.length + 1, attempts, srs, mastery, plan: reorderPlan([...new Set([...remote.plan, ...local.plan])], mastery), nextAttemptId: Math.max(local.nextAttemptId, remote.nextAttemptId, attempts.length + 1), nextSrsId: srs.length + 1 };
}
