/**
 * The single persisted app state and the pure reducers over it. Everything the
 * UI and the journey bots do goes through these functions — no React, no
 * storage, no hidden clock (today / nowMs are always passed in). Composites
 * (recordAndAnalyse, retakeWithRewrite…) model exactly what one user tap does.
 */
import {
  buildEventPlan,
  computeReadiness,
  getPrompt,
  LESSONS,
  PACKS,
  nextPrompt,
  promptsForPack,
  reflowPlan,
} from "./content";
import { detectFillers, fillerLemma } from "./fillers";
import {
  buildReport,
  computeMetrics,
  emptyBaselineSet,
  isAudible,
  MIN_TAKE_MS,
  OFFTOPIC_OVERALL_CAP,
  OFFTOPIC_STRUCTURE_CAP,
  pushBaseline,
  recomputeReport,
  type Metrics,
} from "./metrics";
import {
  addBonusTake,
  buyLifetime,
  cancelSubscription,
  canRecord,
  consumeTake,
  emptyAllowance,
  emptyStreak,
  freeEntitlement,
  isPro,
  refundTake,
  refreshStreakGrants,
  registerPractice,
  renewAllowance,
  repairStreak,
  startSubscription,
  verifyEntitlement,
  xpForScore,
} from "./progress";
import type {
  AiQualitative,
  Allowance,
  BaselineSet,
  CustomPack,
  Entitlement,
  EventPlan,
  EventType,
  LessonProgress,
  PendingJob,
  PromptState,
  Report,
  Settings,
  Streak,
  Take,
  TakeFailReason,
  TakeMode,
  Transcript,
  Word,
} from "./types";
import type { DateKey } from "./dates";

export const STATE_VERSION = 1;

export interface AppState {
  settings: Settings;
  allowance: Allowance;
  streak: Streak;
  xp: number;
  entitlement: Entitlement;
  baseline: BaselineSet;
  takes: Take[];
  transcripts: Transcript[];
  reports: Report[];
  events: EventPlan[];
  lessons: LessonProgress[];
  prompts: PromptState;
  customPacks: CustomPack[];
  queue: PendingJob[];
  placement: { level: "beginner" | "intermediate" | "advanced"; done: boolean } | null;
  selection: { packId: string; promptId: string };
  shuffleSeed: number;
  nextId: number;
}

export const defaultSettings = (): Settings => ({
  reminderTimes: [],
  quietStart: "22:00",
  quietEnd: "07:00",
  language: "en",
  playbackSpeed: 1,
  ignoreFillers: [],
  stutterFriendly: false,
  reduceMotion: false,
  streakAtRiskNudge: true,
  weeklySummary: false,
  goal: null,
  cloudBackupAudio: false,
});

export function emptyApp(today: DateKey): AppState {
  const firstPack = PACKS[0].id;
  const firstPrompt = promptsForPack(firstPack)[0]?.id ?? "";
  return {
    settings: defaultSettings(),
    allowance: emptyAllowance(today),
    streak: emptyStreak(),
    xp: 0,
    entitlement: freeEntitlement(),
    baseline: emptyBaselineSet(),
    takes: [],
    transcripts: [],
    reports: [],
    events: [],
    lessons: [],
    prompts: { seen: [], skipped: [], flagged: [] },
    customPacks: [],
    queue: [],
    placement: null,
    selection: { packId: firstPack, promptId: firstPrompt },
    shuffleSeed: 1,
    nextId: 1,
  };
}

// --- id helper ---
const mkId = (s: AppState, prefix: string): [string, number] => [`${prefix}${s.nextId}`, s.nextId + 1];

// --- derived ---
export const proNow = (s: AppState, today: DateKey) => isPro(s.entitlement, today);
/** Can the user start a counted take right now (after rolling the allowance)? */
export const canRecordNow = (s: AppState, today: DateKey) =>
  canRecord(renewAllowance(s.allowance, today, proNow(s, today)));
export const getReport = (s: AppState, id: string | undefined) => s.reports.find((r) => r.id === id);
export const getTranscript = (s: AppState, id: string | undefined) => s.transcripts.find((t) => t.id === id);
export const doneTakes = (s: AppState) => s.takes.filter((t) => t.status === "done");
export const latestReport = (s: AppState): Report | null => (s.reports.length ? s.reports[s.reports.length - 1] : null);

/** Has today's daily drill already been completed (a scored drill take today)? */
export const drillDoneToday = (s: AppState, today: DateKey): boolean =>
  s.takes.some((t) => t.mode === "daily_drill" && t.status === "done" && t.startedAt === today);

/** The scored report from today's completed drill (for the "review" link on Home). */
export const todaysDrillReportId = (s: AppState, today: DateKey): string | undefined =>
  s.takes.filter((t) => t.mode === "daily_drill" && t.status === "done" && t.startedAt === today).slice(-1)[0]?.reportId;

/**
 * The daily drill is always recordable once a day: a free, fully-scored take that
 * keeps the habit loop (drill → score → streak) alive even when the general free
 * allowance is spent. A second drill the same day falls back to the allowance.
 */
export const canRecordDrill = (s: AppState, today: DateKey): boolean =>
  canRecordNow(s, today) || !drillDoneToday(s, today);

/** Mode-aware "can I start this take right now?" used by the recorder and engine.
 * A retake-with-rewrite (retakeOf set) is a refinement of a take the user already
 * recorded — the signature "say it instead" loop — so it is ALWAYS available and
 * never blocked by the daily allowance (the expensive AI call is still gated by
 * the separate AI quota). This keeps the rewrite path from dead-ending once the
 * free takes are spent. */
export const canStartTake = (s: AppState, today: DateKey, mode: TakeMode, retakeOf?: string): boolean =>
  retakeOf ? true : mode === "daily_drill" ? canRecordDrill(s, today) : canRecordNow(s, today);

/** Resolve the text of the selected prompt (curated or custom). */
export function resolvePromptText(s: AppState, packId: string, promptId: string): string {
  if (packId.startsWith("custom_")) {
    const pack = s.customPacks.find((c) => c.id === packId);
    const idx = Number(promptId.split("_").pop());
    return pack?.promptTexts[idx] ?? "Speak on your topic for 60 seconds.";
  }
  return getPrompt(promptId)?.text ?? "Introduce yourself in 30–60 seconds.";
}

/** Rebuild the rolling baseline from every completed report (keeps sampleCount honest). */
export function rebuildBaseline(reports: Report[]): BaselineSet {
  let set = emptyBaselineSet();
  for (const r of reports) {
    set = {
      overall: pushBaseline(set.overall, r.overallScore),
      wpm: pushBaseline(set.wpm, r.wpmOverall),
      fillersPerMin: pushBaseline(set.fillersPerMin, r.fillersPerMin),
      clarity: pushBaseline(set.clarity, r.clarity),
      confidence: pushBaseline(set.confidence, r.confidence),
    };
  }
  return set;
}

// --- day boundary / launch ---
/** Roll the allowance, replenish grants, verify entitlement and reflow events. */
export function touchDay(s: AppState, today: DateKey): AppState {
  const pro = proNow(s, today);
  return {
    ...s,
    allowance: renewAllowance(s.allowance, today, pro),
    streak: refreshStreakGrants(s.streak, today),
    entitlement: verifyEntitlement(s.entitlement, today),
    events: s.events.map((e) => (e.archived ? e : reflowPlan(e, today))),
  };
}

// --- prompt selection ---
export function selectPack(s: AppState, packId: string): AppState {
  const promptId = packId.startsWith("custom_")
    ? `${packId}_0`
    : nextPrompt(packId, s.prompts.seen, s.shuffleSeed)?.id ?? promptsForPack(packId)[0]?.id ?? "";
  return { ...s, selection: { packId, promptId } };
}

export function selectPrompt(s: AppState, promptId: string): AppState {
  const p = getPrompt(promptId);
  if (!p) return s;
  return { ...s, selection: { packId: p.packId, promptId }, prompts: markSeen(s.prompts, promptId) };
}

const markSeen = (p: PromptState, id: string): PromptState =>
  p.seen.includes(id) ? p : { ...p, seen: [...p.seen, id] };

export function shufflePrompt(s: AppState): AppState {
  const seed = s.shuffleSeed + 1;
  const packId = s.selection.packId;
  if (packId.startsWith("custom_")) {
    const pack = s.customPacks.find((c) => c.id === packId);
    const n = pack?.promptTexts.length ?? 1;
    return { ...s, shuffleSeed: seed, selection: { packId, promptId: `${packId}_${seed % Math.max(1, n)}` } };
  }
  const next = nextPrompt(packId, s.prompts.seen, seed);
  return {
    ...s,
    shuffleSeed: seed,
    selection: { packId, promptId: next?.id ?? s.selection.promptId },
    prompts: markSeen(s.prompts, s.selection.promptId),
  };
}

export function skipPrompt(s: AppState): AppState {
  const id = s.selection.promptId;
  const prompts = { ...markSeen(s.prompts, id), skipped: s.prompts.skipped.includes(id) ? s.prompts.skipped : [...s.prompts.skipped, id] };
  return shufflePrompt({ ...s, prompts });
}

export function flagPrompt(s: AppState): AppState {
  const id = s.selection.promptId;
  const prompts = { ...markSeen(s.prompts, id), flagged: s.prompts.flagged.includes(id) ? s.prompts.flagged : [...s.prompts.flagged, id] };
  return shufflePrompt({ ...s, prompts });
}

/** Custom scenario from a typed topic (private). Prompts come from the AI later;
 * we seed a few sensible defaults so the pack is usable offline too. */
export function addCustomScenario(s: AppState, topic: string, today: DateKey, aiPrompts?: string[]): { state: AppState; id?: string } {
  const clean = topic.trim();
  if (!clean) return { state: s };
  const [id, nextId] = mkId(s, "custom_");
  const promptTexts =
    aiPrompts && aiPrompts.length
      ? aiPrompts.slice(0, 12)
      : [
          `Give a 60-second talk on: ${clean}.`,
          `Open strongly on: ${clean}.`,
          `Explain ${clean} simply, then land one point.`,
          `Handle a tough question about ${clean}.`,
        ];
  const pack: CustomPack = { id, name: clean.slice(0, 40), topic: clean, promptTexts, createdAt: today };
  const state = selectPack({ ...s, nextId, customPacks: [...s.customPacks, pack] }, id);
  return { state, id };
}

/** Remove a custom scenario pack (and reselect a safe default if it was selected). */
export function removeCustomPack(s: AppState, id: string): AppState {
  const customPacks = s.customPacks.filter((c) => c.id !== id);
  const next = { ...s, customPacks };
  return s.selection.packId === id ? selectPack(next, PACKS[0].id) : next;
}

// --- recording lifecycle ---
export type RecordError = "no_allowance";

/** Reserve a take and start recording. Blocks (no state change) when the free
 * allowance is used up — the UI then shows the reset time / Pro sheet. */
export function beginTake(s0: AppState, mode: TakeMode, today: DateKey, retakeOf?: string, promptText?: string, typed?: boolean): { state: AppState; takeId?: string; error?: RecordError } {
  const s = touchDay(s0, today);
  // Two kinds of take are free (never cost a general take, work even at 0
  // allowance), so the core loops never dead-end:
  //  • today's daily drill (QA: the drill never completed once free takes ran out)
  //  • a retake-with-rewrite — refining a take you already recorded is the
  //    signature "say it instead" loop and must always be available (QA: the
  //    rewrite path hit "Great work today!" / no free takes with no report).
  const freeDrill = mode === "daily_drill" && !drillDoneToday(s, today);
  const free = freeDrill || !!retakeOf;
  if (!free && !canRecord(s.allowance)) return { state: s, error: "no_allowance" };
  const [id, nextId] = mkId(s, "t");
  const counted = !free;
  const take: Take = {
    id,
    packId: s.selection.packId,
    promptId: s.selection.promptId,
    mode,
    startedAt: today,
    durationMs: 0,
    audioPath: `takes/${id}.m4a`,
    status: "recording",
    countedAgainstAllowance: counted,
    ...(typed ? { typed: true } : {}),
    ...(retakeOf ? { retakeOf } : {}),
    ...(promptText ? { promptText } : { promptText: resolvePromptText(s, s.selection.packId, s.selection.promptId) }),
  };
  return { state: { ...s, nextId, allowance: counted ? consumeTake(s.allowance) : s.allowance, takes: [...s.takes, take] }, takeId: id };
}

function patchTake(s: AppState, takeId: string, patch: Partial<Take>): AppState {
  return { ...s, takes: s.takes.map((t) => (t.id === takeId ? { ...t, ...patch } : t)) };
}

/** Mark a take failed (silent / too short / error) and refund the allowance. */
export function failTake(s: AppState, takeId: string, reason: TakeFailReason): AppState {
  const take = s.takes.find((t) => t.id === takeId);
  if (!take || take.status === "done") return s;
  const refunded = take.countedAgainstAllowance ? refundTake(s.allowance) : s.allowance;
  return patchTake({ ...s, allowance: refunded }, takeId, { status: "failed", failReason: reason, countedAgainstAllowance: false });
}

/** Stop recording. Too-short takes fail (no cost); otherwise move to analysing,
 * or queue for later when offline. */
export function finishRecording(s: AppState, takeId: string, durationMs: number, online: boolean, nowMs: number): AppState {
  const take = s.takes.find((t) => t.id === takeId);
  if (!take || take.status !== "recording") return s;
  if (durationMs < MIN_TAKE_MS) return failTake(patchTake(s, takeId, { durationMs }), takeId, "too_short");
  if (!online) {
    const [id, nextId] = mkId(s, "job_");
    const job: PendingJob = { id, type: "analyse", takeId, attempts: 0, nextRetryAt: nowMs };
    return { ...patchTake({ ...s, nextId }, takeId, { durationMs, status: "queued" }), queue: [...s.queue, job] };
  }
  return patchTake(s, takeId, { durationMs, status: "analysing" });
}

/** Attach the transcript + AI result, compute the report and roll progress.
 * Silent audio is caught here: the take fails and the allowance is refunded. */
export function attachAnalysis(
  s: AppState,
  takeId: string,
  input: { words: Word[]; language?: string; ai?: AiQualitative | null },
  today: DateKey,
): { state: AppState; reportId?: string } {
  const take = s.takes.find((t) => t.id === takeId);
  if (!take || take.status === "done" || take.status === "failed") return { state: s };
  if (!isAudible(input.words)) return { state: failTake(s, takeId, "silent") };

  const detected = detectFillers(input.words, { ignore: s.settings.ignoreFillers, stutterFriendly: s.settings.stutterFriendly });
  const [transcriptId, nid1] = mkId(s, "tr_");
  const transcript: Transcript = { id: transcriptId, takeId, words: detected, language: input.language ?? "en" };

  const s1 = { ...s, nextId: nid1 };
  const [reportId, nid2] = mkId(s1, "r");
  const report = buildReport({ id: reportId, transcript, baselineBefore: s1.baseline, settings: s1.settings, ai: input.ai ?? null, createdAt: today });

  const reports = [...s1.reports, report];
  const state: AppState = touchDay(
    {
      ...s1,
      nextId: nid2,
      transcripts: [...s1.transcripts, transcript],
      reports,
      baseline: rebuildBaseline(reports),
      xp: s1.xp + xpForScore(report.overallScore),
      streak: registerPractice(s1.streak, today),
      queue: s1.queue.filter((j) => j.takeId !== takeId),
    },
    today,
  );
  return { state: patchTake(state, takeId, { status: "done", transcriptId, reportId }), reportId };
}

/** One tap: record a take and get its report (or queue it if offline). */
export function recordAndAnalyse(
  s: AppState,
  input: { mode?: TakeMode; retakeOf?: string; words: Word[]; durationMs?: number; online?: boolean; ai?: AiQualitative | null; promptText?: string; typed?: boolean },
  today: DateKey,
  nowMs: number,
): { state: AppState; takeId?: string; reportId?: string; error?: RecordError } {
  const began = beginTake(s, input.mode ?? "standard", today, input.retakeOf, input.promptText, input.typed);
  if (began.error || !began.takeId) return began;
  const dur = input.durationMs ?? 45_000;
  const afterStop = finishRecording(began.state, began.takeId, dur, input.online ?? true, nowMs);
  const take = afterStop.takes.find((t) => t.id === began.takeId);
  if (!take || take.status !== "analysing") return { state: afterStop, takeId: began.takeId }; // failed or queued
  const res = attachAnalysis(afterStop, began.takeId, { words: input.words, ai: input.ai }, today);
  return { state: res.state, takeId: began.takeId, reportId: res.reportId };
}

/** "Try it again with the rewrite" — a fresh take linked to the original. */
export function retakeWithRewrite(
  s: AppState,
  originalTakeId: string,
  input: { words: Word[]; ai?: AiQualitative | null },
  today: DateKey,
  nowMs: number,
) {
  return recordAndAnalyse(s, { mode: "standard", retakeOf: originalTakeId, words: input.words, ai: input.ai }, today, nowMs);
}

// --- offline queue ---
export const MAX_ATTEMPTS = 6;
export const dueJobs = (s: AppState, nowMs: number) => s.queue.filter((j) => j.nextRetryAt <= nowMs);

/** Record a failed attempt with exponential backoff (gives up after MAX_ATTEMPTS). */
export function backoffJob(s: AppState, jobId: string, nowMs: number): AppState {
  return {
    ...s,
    queue: s.queue.flatMap((j) => {
      if (j.id !== jobId) return [j];
      const attempts = j.attempts + 1;
      if (attempts >= MAX_ATTEMPTS) return []; // give up; take stays queued for a manual retry
      return [{ ...j, attempts, nextRetryAt: nowMs + Math.min(2 ** attempts, 60) * 1000 }];
    }),
  };
}

/** Connectivity returned — analyse every queued take (the UI passes the AI
 * result per take; tests/bots pass a sample). */
export function completeQueuedTakes(s: AppState, input: { words: Word[]; ai?: AiQualitative | null }, today: DateKey): AppState {
  let state = s;
  for (const t of s.takes.filter((t) => t.status === "queued")) {
    state = attachAnalysis(state, t.id, { words: input.words, ai: input.ai }, today).state;
  }
  return state;
}

// --- filler correction ---
/** Tap "not a filler" (or "mark filler") on a word; updates the report and the
 * personal ignore list so future takes respect it. */
export function correctFiller(s: AppState, reportId: string, wordIndex: number, isFiller: boolean, _today: DateKey): AppState {
  const report = s.reports.find((r) => r.id === reportId);
  if (!report) return s;
  const transcript = s.transcripts.find((t) => t.id === report.takeId || t.takeId === report.takeId);
  if (!transcript || wordIndex < 0 || wordIndex >= transcript.words.length) return s;

  const word = transcript.words[wordIndex];
  const words = transcript.words.map((w, i) => (i === wordIndex ? { ...w, isFiller, userCorrected: true } : w));
  const newTranscript: Transcript = { ...transcript, words };

  const ignoreFillers =
    !isFiller && word
      ? Array.from(new Set([...s.settings.ignoreFillers, fillerLemma(word.text)])).filter(Boolean)
      : s.settings.ignoreFillers;
  const settings = { ...s.settings, ignoreFillers };

  const newReport = recomputeReport(report, newTranscript, settings);
  const reports = s.reports.map((r) => (r.id === reportId ? newReport : r));
  return {
    ...s,
    settings,
    transcripts: s.transcripts.map((t) => (t.id === newTranscript.id ? newTranscript : t)),
    reports,
    baseline: rebuildBaseline(reports),
  };
}

/** Attach (or refresh) the AI prose on an existing report — used when the AI
 * was offline at record time and the user retries once reconnected. Delivery
 * metrics are deterministic and untouched; only an off-topic verdict (new this
 * retry) caps the structure/overall score, so the baseline is rebuilt to match. */
export function attachAiToReport(s: AppState, reportId: string, ai: AiQualitative): AppState {
  const offTopic = ai.onTopic === false;
  const reports = s.reports.map((r) =>
    r.id === reportId
      ? {
          ...r,
          tips: ai.tips.length ? ai.tips.slice(0, 3) : r.tips,
          rewriteText: ai.rewriteText,
          rewriteDiff: ai.rewriteDiff,
          openerSuggestion: ai.openerSuggestion,
          closerSuggestion: ai.closerSuggestion,
          clarityNote: ai.clarityNote,
          confidenceNote: ai.confidenceNote,
          onTopic: ai.onTopic,
          structure: offTopic ? { ...r.structure, score: Math.min(r.structure.score, OFFTOPIC_STRUCTURE_CAP) } : r.structure,
          overallScore: offTopic ? Math.min(r.overallScore, OFFTOPIC_OVERALL_CAP) : r.overallScore,
          modelVersion: ai.modelVersion,
        }
      : r,
  );
  return { ...s, reports, baseline: rebuildBaseline(reports) };
}

// --- streak ---
export const useStreakFreezeNote = "freezes are spent automatically on a missed day";
export function repairCurrentStreak(s: AppState, today: DateKey, restoreTo: number): AppState {
  return { ...s, streak: repairStreak(s.streak, today, restoreTo) };
}

// --- events ---
export function createEvent(s: AppState, input: { type: EventType; title?: string; date: DateKey }, today: DateKey): { state: AppState; id?: string } {
  if (input.date < today) return { state: s };
  const [id, nextId] = mkId(s, "ev_");
  const plan = buildEventPlan({ id, type: input.type, title: input.title, date: input.date, today });
  return { state: { ...s, nextId, events: [...s.events, plan] }, id };
}

export function completePlanItem(s: AppState, eventId: string, itemId: string, finalRunScore: number | null, today: DateKey): AppState {
  return {
    ...s,
    events: s.events.map((e) => {
      if (e.id !== eventId) return e;
      const planItems = e.planItems.map((it) => (it.id === itemId ? { ...it, done: true } : it));
      const updated = { ...e, planItems };
      return { ...updated, readiness: computeReadiness(updated, finalRunScore) };
    }),
  };
}

/** Complete the whole event rehearsal (the final run-through). */
export function completeEventRun(s: AppState, eventId: string, score: number, today: DateKey): AppState {
  const ev = s.events.find((e) => e.id === eventId);
  const run = ev?.planItems.find((i) => i.isFinalRun);
  if (!ev || !run) return s;
  return completePlanItem(s, eventId, run.id, score, today);
}

export function archiveEvent(s: AppState, eventId: string): AppState {
  return { ...s, events: s.events.map((e) => (e.id === eventId ? { ...e, archived: true } : e)) };
}

// --- lessons / placement ---
export function completeLesson(s: AppState, lessonId: string, score: number): AppState {
  if (!LESSONS.some((l) => l.id === lessonId)) return s;
  const existing = s.lessons.find((l) => l.lessonId === lessonId);
  const bestScore = Math.max(existing?.bestScore ?? 0, score);
  const lesson: LessonProgress = { lessonId, completed: true, bestScore };
  return { ...s, lessons: existing ? s.lessons.map((l) => (l.lessonId === lessonId ? lesson : l)) : [...s.lessons, lesson] };
}

export function setPlacement(s: AppState, level: "beginner" | "intermediate" | "advanced"): AppState {
  return { ...s, placement: { level, done: true } };
}
export function skipPlacement(s: AppState): AppState {
  return { ...s, placement: { level: s.placement?.level ?? "beginner", done: true } };
}

// --- monetization ---
export function subscribe(s: AppState, plan: "monthly" | "yearly", today: DateKey, trialDays = 7): AppState {
  return touchDay({ ...s, entitlement: startSubscription(plan, today, trialDays) }, today);
}
export function buyProLifetime(s: AppState, today: DateKey): AppState {
  return touchDay({ ...s, entitlement: buyLifetime(today) }, today);
}
export function restorePurchases(s: AppState, today: DateKey): AppState {
  return touchDay({ ...s, entitlement: verifyEntitlement(s.entitlement, today) }, today);
}
export function cancelPlan(s: AppState, today: DateKey): AppState {
  return touchDay({ ...s, entitlement: cancelSubscription(s.entitlement, today) }, today);
}
export function grantBonusTake(s: AppState): AppState {
  return { ...s, allowance: addBonusTake(s.allowance) };
}

// --- settings ---
export function updateSettings(s: AppState, patch: Partial<Settings>): AppState {
  return { ...s, settings: { ...s.settings, ...patch } };
}

// --- deletion / privacy ---
export function deleteTake(s: AppState, takeId: string): AppState {
  const take = s.takes.find((t) => t.id === takeId);
  const reports = s.reports.filter((r) => r.takeId !== takeId);
  return {
    ...s,
    takes: s.takes.filter((t) => t.id !== takeId),
    transcripts: s.transcripts.filter((t) => t.takeId !== takeId),
    reports,
    queue: s.queue.filter((j) => j.takeId !== takeId),
    baseline: rebuildBaseline(reports),
  };
}

export function deleteAllRecordings(s: AppState): AppState {
  return { ...s, takes: [], transcripts: [], reports: [], queue: [], baseline: emptyBaselineSet() };
}

/** Full local wipe (in-app account deletion also calls the cloud module). */
export function deleteEverything(today: DateKey): AppState {
  return emptyApp(today);
}

// --- migration ---
export function migrate(old: unknown, _fromVersion: number, today: DateKey): AppState {
  const base = emptyApp(today);
  if (old && typeof old === "object") return { ...base, ...(old as object) } as AppState;
  return base;
}

/** The numbers used to update baselines, kept in sync with buildReport. */
export function reportMetrics(r: Report): Pick<Metrics, "overallScore" | "wpmOverall" | "fillersPerMin" | "clarity" | "confidence"> {
  return { overallScore: r.overallScore, wpmOverall: r.wpmOverall, fillersPerMin: r.fillersPerMin, clarity: r.clarity, confidence: r.confidence };
}

export { computeMetrics };
