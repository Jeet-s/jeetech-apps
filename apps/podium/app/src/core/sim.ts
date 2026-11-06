/**
 * Journey-bot interface over Podium's REAL core logic (no UI). Actions are what
 * a tap offers in that state; goals are one per PRD user flow; invariants are
 * the data rules that must always hold. The fuzzer fires thousands of random
 * actions — every reducer here must be total (never throw) and keep the data
 * consistent, round-trip through serialize/deserialize, and never dead-end.
 */
import {
  AppState,
  addCustomScenario,
  canRecordNow,
  canStartTake,
  completeEventRun,
  completeQueuedTakes,
  createEvent,
  correctFiller,
  deleteAllRecordings,
  emptyApp,
  grantBonusTake,
  latestReport,
  proNow,
  recordAndAnalyse,
  repairCurrentStreak,
  selectPack,
  shufflePrompt,
  skipPrompt,
  subscribe,
  touchDay,
} from "./state";
import { FREE_DAILY, PRO_DAILY, takesRemaining } from "./progress";
import { hasBaseline } from "./metrics";
import { daysBetween, isValidDateKey, addDays, type DateKey } from "./dates";
import { SAMPLE_AI, SAMPLE_FILLERS, SAMPLE_GOOD, SAMPLE_SILENT } from "./samples";
import { PACKS } from "./content";

export interface Goal<S> {
  id: string;
  name: string;
  done(state: S): boolean;
}

export interface AppSim<S, A> {
  init(): S;
  actions(state: S): A[];
  apply(state: S, action: A): S;
  goals: Goal<S>[];
  invariants(state: S): string[];
  serialize(state: S): string;
  deserialize(raw: string): S;
}

interface SimState {
  app: AppState;
  today: DateKey;
  nowMs: number;
}

type Action =
  | { t: "record_good" }
  | { t: "record_drill" }
  | { t: "record_fillers" }
  | { t: "record_silent" }
  | { t: "record_offline" }
  | { t: "process_queue" }
  | { t: "retake_rewrite" }
  | { t: "correct_filler" }
  | { t: "shuffle" }
  | { t: "skip" }
  | { t: "choose_viva" }
  | { t: "custom_topic" }
  | { t: "subscribe" }
  | { t: "bonus_take" }
  | { t: "repair_streak" }
  | { t: "create_event" }
  | { t: "event_run" }
  | { t: "delete_all" }
  | { t: "next_day" };

const START: DateKey = "2026-03-02";
const findFillerIndex = (app: AppState): { reportId: string; index: number } | null => {
  for (const r of app.reports) {
    const tr = app.transcripts.find((t) => t.takeId === r.takeId);
    const idx = tr?.words.findIndex((w) => w.isFiller && !w.userCorrected) ?? -1;
    if (tr && idx >= 0) return { reportId: r.id, index: idx };
  }
  return null;
};

export const sim: AppSim<SimState, Action> = {
  init: () => ({ app: emptyApp(START), today: START, nowMs: 0 }),

  actions: (s) => {
    const { app, today } = s;
    const acts: Action[] = [{ t: "next_day" }];
    // The daily drill is always offered — it's a free scored take once a day even
    // when the general allowance is spent (the habit loop never dead-ends).
    if (canStartTake(app, today, "daily_drill")) acts.push({ t: "record_drill" });
    if (canRecordNow(app, today)) {
      acts.push({ t: "record_good" }, { t: "record_fillers" }, { t: "record_silent" }, { t: "record_offline" });
    }
    // Retake-with-rewrite refines a take you already recorded — it's free and
    // always available (never blocked by the allowance), so the rewrite loop
    // never dead-ends even once the free takes are spent.
    if (latestReport(app)) acts.push({ t: "retake_rewrite" });
    if (app.takes.some((t) => t.status === "queued")) acts.push({ t: "process_queue" });
    acts.push({ t: "shuffle" }, { t: "skip" }, { t: "choose_viva" }, { t: "custom_topic" });
    if (findFillerIndex(app)) acts.push({ t: "correct_filler" });
    acts.push({ t: "bonus_take" });
    // Paywall only after a first report (value-first rule).
    if (app.reports.length > 0 && !proNow(app, today)) acts.push({ t: "subscribe" });
    acts.push({ t: "create_event" });
    if (app.events.some((e) => !e.archived)) acts.push({ t: "event_run" });
    // Repair is only offered on a real, stale-broken streak (as in the UI).
    if (app.streak.repairAvailable && app.streak.lastPracticeDate && daysBetween(app.streak.lastPracticeDate, today) >= 2) {
      acts.push({ t: "repair_streak" });
    }
    if (app.takes.length) acts.push({ t: "delete_all" });
    return acts;
  },

  apply: (s, a) => {
    const { app, today, nowMs } = s;
    switch (a.t) {
      case "record_good":
        return { ...s, app: recordAndAnalyse(app, { words: SAMPLE_GOOD, ai: SAMPLE_AI }, today, nowMs).state };
      case "record_drill":
        return { ...s, app: recordAndAnalyse(app, { mode: "daily_drill", words: SAMPLE_GOOD, ai: SAMPLE_AI }, today, nowMs).state };
      case "record_fillers":
        return { ...s, app: recordAndAnalyse(app, { words: SAMPLE_FILLERS, ai: SAMPLE_AI }, today, nowMs).state };
      case "record_silent":
        return { ...s, app: recordAndAnalyse(app, { words: SAMPLE_SILENT }, today, nowMs).state };
      case "record_offline":
        return { ...s, app: recordAndAnalyse(app, { words: SAMPLE_GOOD, ai: SAMPLE_AI, online: false }, today, nowMs).state };
      case "process_queue":
        return { ...s, app: completeQueuedTakes(app, { words: SAMPLE_GOOD, ai: SAMPLE_AI }, today) };
      case "retake_rewrite": {
        const orig = latestReport(app);
        if (!orig) return s;
        return { ...s, app: recordAndAnalyse(app, { words: SAMPLE_GOOD, ai: SAMPLE_AI, retakeOf: orig.takeId }, today, nowMs).state };
      }
      case "correct_filler": {
        const target = findFillerIndex(app);
        if (!target) return s;
        return { ...s, app: correctFiller(app, target.reportId, target.index, false, today) };
      }
      case "shuffle":
        return { ...s, app: shufflePrompt(app) };
      case "skip":
        return { ...s, app: skipPrompt(app) };
      case "choose_viva":
        return { ...s, app: selectPack(app, "viva") };
      case "custom_topic":
        return { ...s, app: addCustomScenario(app, "My conference keynote", today).state };
      case "subscribe":
        return { ...s, app: subscribe(app, "monthly", today) };
      case "bonus_take":
        return { ...s, app: grantBonusTake(app) };
      case "repair_streak":
        return { ...s, app: repairCurrentStreak(app, today, app.streak.longest) };
      case "create_event":
        return { ...s, app: createEvent(app, { type: "interview", date: addDays(today, 5) }, today).state };
      case "event_run": {
        const ev = app.events.find((e) => !e.archived);
        if (!ev) return s;
        return { ...s, app: completeEventRun(app, ev.id, 80, today) };
      }
      case "delete_all":
        return { ...s, app: deleteAllRecordings(app) };
      case "next_day": {
        const next = addDays(today, 1);
        return { app: touchDay(app, next), today: next, nowMs: nowMs + 86_400_000 };
      }
    }
  },

  goals: [
    // F1 — first take to aha: a scored report exists.
    { id: "first_report", name: "Get a first scored report (no login/paywall)", done: (s) => s.app.reports.length > 0 },
    // F2 — daily drill & streak: practise two consecutive days.
    { id: "two_day_streak", name: "Build a two-day streak", done: (s) => s.app.streak.currentCount >= 2 },
    // F2b — the daily drill always completes (free scored take, even at 0 allowance).
    { id: "daily_drill", name: "Complete the daily drill (free scored take)", done: (s) => s.app.takes.some((t) => t.mode === "daily_drill" && t.status === "done") },
    // F3 — scenario practice & rewrite loop: a retake linked to a prior take.
    { id: "rewrite_retake", name: "Try again with the rewrite", done: (s) => s.app.takes.some((t) => !!t.retakeOf && t.status === "done") },
    // F4 — convert transparently: become Pro (only offered after a report).
    { id: "go_pro", name: "Upgrade to Pro", done: (s) => proNow(s.app, s.today) },
    // F6 — event prep: finish an event run-through.
    { id: "event_run", name: "Complete an event rehearsal", done: (s) => s.app.events.some((e) => e.readiness > 0) },
    // Trust: a usable baseline after three takes.
    { id: "baseline", name: "Reach a personal baseline", done: (s) => hasBaseline(s.app.baseline.overall) },
  ],

  invariants: (s) => {
    const { app, today } = s;
    const out: string[] = [];
    const pro = proNow(app, today);

    // Allowance
    const a = app.allowance;
    if (!isValidDateKey(a.date) || a.date > today) out.push(`allowance date invalid ${a.date}`);
    if (a.freeTakesUsed < 0) out.push("negative freeTakesUsed");
    if (takesRemaining(a) < 0) out.push("negative remaining takes");
    if (a.date === today && a.freeTakesLimit !== (pro ? PRO_DAILY : FREE_DAILY)) out.push(`limit ${a.freeTakesLimit} != tier`);

    // Streak
    const st = app.streak;
    if (st.currentCount < 0) out.push("negative streak");
    if (st.longest < st.currentCount) out.push("longest < current streak");
    if (st.freezesAvailable < 0 || st.freezesAvailable > 2) out.push(`freezes out of range ${st.freezesAvailable}`);
    if (st.lastPracticeDate && st.lastPracticeDate > today) out.push("streak practiced in the future");

    // Takes / reports / transcripts
    const ids = new Set<string>();
    for (const t of app.takes) {
      if (ids.has(t.id)) out.push(`duplicate take id ${t.id}`);
      ids.add(t.id);
      if (!["recording", "queued", "analysing", "done", "failed"].includes(t.status)) out.push(`bad status ${t.status}`);
      if (t.startedAt > today) out.push(`take in the future ${t.id}`);
      if (t.status === "done" && !app.reports.some((r) => r.id === t.reportId)) out.push(`done take ${t.id} has no report`);
      if (t.status === "failed" && t.countedAgainstAllowance) out.push(`failed take ${t.id} still counted`);
    }
    for (const r of app.reports) {
      if (r.overallScore < 0 || r.overallScore > 100) out.push(`report score out of range ${r.overallScore}`);
      if (r.wpmOverall < 0 || r.wpmOverall > 250) out.push(`report wpm out of range ${r.wpmOverall}`);
      if (r.fillersPerMin < 0) out.push("negative fillersPerMin");
      if (r.wpmSegments.some((seg) => seg.wpm > 250)) out.push("segment wpm > 250");
    }
    // Baseline reflects completed reports exactly.
    if (app.baseline.overall.sampleCount !== app.reports.length) out.push(`baseline count ${app.baseline.overall.sampleCount} != reports ${app.reports.length}`);

    // Entitlement
    if (!pro && app.entitlement.plan === "lifetime") out.push("lifetime but not pro");

    // Events
    for (const e of app.events) {
      if (e.readiness < 0 || e.readiness > 100) out.push(`event readiness out of range ${e.readiness}`);
      if (!isValidDateKey(e.date)) out.push(`event bad date ${e.date}`);
    }

    // Queue
    for (const j of app.queue) {
      if (j.attempts < 0 || j.attempts > 6) out.push(`job attempts out of range ${j.attempts}`);
      if (!app.takes.some((t) => t.id === j.takeId)) out.push(`job references missing take ${j.takeId}`);
    }

    if (app.xp < 0) out.push("negative xp");
    // Monotonic ids
    for (const t of app.takes) {
      const n = Number(t.id.replace(/\D/g, ""));
      if (n >= app.nextId) out.push(`id ${t.id} >= nextId ${app.nextId}`);
    }
    return out;
  },

  serialize: (s) => JSON.stringify(s),
  deserialize: (raw) => JSON.parse(raw) as SimState,
};

export const SIM_PACKS = PACKS; // referenced so a pack-less build fails fast
