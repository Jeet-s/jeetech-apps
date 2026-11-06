/**
 * App glue between the UI and the pure core reducers: the record→analyse flow,
 * AI enrichment/retry, and local reminders. Screens call these; the heavy
 * domain logic stays in src/core (pure, tested), monetisation/analytics/notify
 * stay in src/modules.
 */
import { appStore, todayKey } from "../core/data";
import {
  attachAiToReport,
  canStartTake,
  completeLesson,
  completePlanItem,
  recordAndAnalyse,
  type AppState,
} from "../core/state";
import { computeMetrics, isAudible } from "../core/metrics";
import { getPack } from "../core/content";
import { streakAtRisk } from "../core/progress";
import type { TakeMode } from "../core/types";
import { coachTake, type CoachResult } from "./coach";
import { wordsFromTranscript } from "./speech";
import { analytics } from "../modules/analytics";
import { review } from "../modules/review";
import { notify } from "../modules/notify";

/** Everything the recorder needs to know about the take being made. */
export interface RecordRequest {
  mode: TakeMode;
  packId: string;
  promptId: string;
  promptText: string;
  /** Human scenario label used for AI context and the recorder header. */
  scenario: string;
  retakeOf?: string;
  title?: string;
  eventId?: string;
  itemId?: string;
  lessonId?: string;
  finalRun?: boolean;
  /** Open the recorder straight into the typed/paste flow (imported talk). */
  startTyped?: boolean;
  /** The AI rewrite to pre-load into a "try again with the rewrite" retake, so
   * the compose box is never empty and the user can tweak then re-deliver it. */
  rewriteText?: string;
  /** Free practice: record + see deterministic feedback without spending a daily
   * take or saving a report (used once the free allowance is gone, so the drill
   * loop never dead-ends). No AI, no streak, no persistence. */
  practice?: boolean;
}

export interface AnalyseOutcome {
  reportId?: string;
  error?: "no_allowance" | "silent" | "too_short";
  /** AI daily limit reached — offer Pro. */
  quota: boolean;
  /** AI unreachable — the report stands on deterministic tips; offer Retry. */
  offline: boolean;
}

const setSelection = (s: AppState, req: RecordRequest): AppState => ({
  ...s,
  selection: { packId: req.packId, promptId: req.promptId },
});

/**
 * Transcribe → compute metrics → best-effort AI → build the report in one core
 * transition. A silent or too-short take fails and never costs the allowance.
 */
export async function analyseTake(req: RecordRequest, transcript: string, durationMs: number, typed = false): Promise<AnalyseOutcome> {
  const today = todayKey();
  if (!canStartTake(appStore.get(), today, req.mode, req.retakeOf)) return { error: "no_allowance", quota: false, offline: false };

  const words = wordsFromTranscript(transcript, durationMs);
  let coach: CoachResult = { ai: null, quota: false, offline: false };
  if (isAudible(words)) {
    coach = await coachTake({ transcript, promptText: req.promptText, scenario: req.scenario, metrics: computeMetrics(words) });
  }

  const before = setSelection(appStore.get(), req);
  const res = recordAndAnalyse(
    before,
    { mode: req.mode, retakeOf: req.retakeOf, words, durationMs, ai: coach.ai, promptText: req.promptText, typed },
    today,
    Date.now(),
  );
  appStore.set(res.state);

  if (res.error) return { error: res.error, quota: coach.quota, offline: coach.offline };
  if (!res.reportId) {
    const take = res.takeId ? res.state.takes.find((t) => t.id === res.takeId) : undefined;
    return { error: take?.failReason === "too_short" ? "too_short" : "silent", quota: coach.quota, offline: coach.offline };
  }

  const report = res.state.reports.find((r) => r.id === res.reportId);
  const score = report?.overallScore ?? 0;
  if (req.eventId && req.itemId) appStore.set((s) => completePlanItem(s, req.eventId!, req.itemId!, req.finalRun ? score : null, today));
  if (req.lessonId) appStore.set((s) => completeLesson(s, req.lessonId!, score));

  analytics.track("core_action", { feature: "take" });
  review.actionCompleted(); // Play in-app review decides if/when to show (never in QA)
  return { reportId: res.reportId, quota: coach.quota, offline: coach.offline };
}

/** Re-run the AI for a report whose AI was offline at record time. */
export async function retryAi(reportId: string, req: { promptText: string; scenario: string }): Promise<CoachResult> {
  const state = appStore.get();
  const report = state.reports.find((r) => r.id === reportId);
  const transcript = report ? transcriptText(state, report.takeId) : "";
  const take = report ? state.takes.find((t) => t.id === report.takeId) : undefined;
  if (!report || !transcript) return { ai: null, quota: false, offline: true };
  const coach = await coachTake({
    transcript,
    promptText: req.promptText,
    scenario: req.scenario,
    metrics: computeMetrics(wordsFromTranscript(transcript, take?.durationMs || 45000)),
  });
  if (coach.ai) appStore.set((s) => attachAiToReport(s, reportId, coach.ai!));
  return coach;
}

/** The joined word text of a take's transcript. */
export function transcriptText(s: AppState, takeId: string): string {
  const tr = s.transcripts.find((t) => t.takeId === takeId);
  return tr ? tr.words.map((w) => w.text).join(" ") : "";
}

/** A friendly scenario label for a pack id (library or custom). */
export function scenarioLabel(s: AppState, packId: string): string {
  if (packId.startsWith("custom_")) return s.customPacks.find((c) => c.id === packId)?.name ?? "Custom topic";
  return getPack(packId)?.name ?? "Impromptu";
}

// --- Reminders (local notifications) ---
const parseHHMM = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return { hour: h || 0, minute: m || 0 };
};

/**
 * Reschedule every local reminder from settings. Call after a reminder changes
 * and on launch (granted users only). Daily practice nudges + an evening
 * streak-at-risk nudge + per-event countdowns.
 */
export async function syncReminders(app: AppState): Promise<void> {
  if (!(await notify.granted())) return;
  const { settings, streak } = app;
  const today = todayKey();

  for (let i = 0; i < 4; i++) await notify.cancel(`reminder_${i}`);
  settings.reminderTimes.slice(0, 4).forEach((t, i) => {
    const { hour, minute } = parseHHMM(t);
    void notify.daily(`reminder_${i}`, { hour, minute }, {
      title: "Time for today's drill",
      body: "One 60-second take keeps your streak alive.",
    });
  });

  // Trial-end reminder: a day before billing starts, so a free trial never
  // turns into a surprise charge (transparent billing — a best-in-category must).
  const ent = app.entitlement;
  if (ent.status === "trial" && ent.trialEndsAt) {
    const { year, month, day } = splitDate(ent.trialEndsAt);
    const when = new Date(year, month - 1, day - 1, 10, 0, 0);
    if (when.getTime() > Date.now()) {
      void notify.at("trial_end", when, {
        title: "Your Podium free trial ends tomorrow",
        body: "Billing starts soon — keep Pro, or cancel anytime in Google Play.",
      });
    } else {
      void notify.cancel("trial_end");
    }
  } else {
    void notify.cancel("trial_end");
  }

  if (settings.streakAtRiskNudge && streakAtRisk(streak, today)) {
    void notify.daily("streak_risk", { hour: 20, minute: 0 }, {
      title: `Keep your ${streak.currentCount}-day streak 🔥`,
      body: "A quick take tonight keeps it going.",
    });
  } else {
    void notify.cancel("streak_risk");
  }

  for (const e of app.events.filter((ev) => !ev.archived && ev.date >= today)) {
    const { year, month, day } = splitDate(e.date);
    void notify.at(`event_${e.id}`, new Date(year, month - 1, day, 9, 0, 0), {
      title: `${e.title} is here`,
      body: "Today's rehearsal is ready — give it a run.",
    });
  }

  // A warm comeback nudge if they drift away.
  void notify.comeback({ days: 3, title: "Your coach misses you", body: "Two minutes of practice keeps you sharp." });
}

const splitDate = (d: string) => {
  const [year, month, day] = d.split("-").map(Number);
  return { year, month, day };
};

/** Ask for notification permission (after opt-in) then schedule. Returns granted. */
export async function enableReminders(app: AppState): Promise<boolean> {
  const ok = await notify.ask("Get a gentle daily nudge to practise.");
  if (ok) await syncReminders(app);
  return ok;
}
