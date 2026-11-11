/**
 * Journey-bot simulation over Accent Gym's REAL core logic (src/core/state.ts).
 * Actions mirror what the UI offers in each state (including inputs the UI
 * allows that should be handled gracefully). Goals = one per PRD user flow
 * (F1–F7). Invariants = the data rules that must always hold. serialize/
 * deserialize = exactly what the app persists, plus the sim's model of the
 * cloud backup (so reinstall → restore can be exercised).
 */
import {
  type AppState,
  beginTrial,
  buy,
  completeDiagnosis,
  completeDrill,
  completeGuidedPractice,
  completeSession,
  diagnosticsDone,
  emptyState,
  finishOnboarding,
  linkAccount,
  pro,
  recordCustom,
  recordDiagnostic,
  recordPractice,
  restoreFromBackup,
  watchRewarded,
} from "./state";
import type { Accent, L1 } from "./types";
import { addDays, noonMs } from "./dates";
import { PRO_DAILY, MAX_BONUS } from "./quota";
import { WEEKLY_FREEZES } from "./streak";
import { MASTERED_AT } from "./mastery";
import { MIN_EASE } from "./srs";
import { isSoundId } from "./sounds";
import { DIAGNOSTICS, SENTENCE_BY_ID } from "./sentences";
import { mockScore, soundScore, type SpeechQuality } from "./scoring";

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
  today: string;
  improved: boolean; // a target sound rose on a retry (F2 success)
  setup?: { nativeLanguage: L1; targetAccent: Accent }; // unsaved setup choices
  cloud?: { accountId: string; snapshot: AppState };
}

type Action =
  | { t: "set_language"; l1: L1 }
  | { t: "set_accent"; accent: Accent }
  | { t: "finish_setup" }
  | { t: "skip_setup" }
  | { t: "record_diagnostic" }
  | { t: "view_report" }
  | { t: "record_practice" }
  | { t: "guided_practice" }
  | { t: "retry_better" }
  | { t: "drill_pass"; soundId: string }
  | { t: "drill_fail"; soundId: string }
  | { t: "add_custom" }
  | { t: "complete_session" }
  | { t: "start_trial" }
  | { t: "buy_lifetime" }
  | { t: "login" }
  | { t: "watch_rewarded" }
  | { t: "reinstall" }
  | { t: "restore" }
  | { t: "next_day" };

const START = "2026-01-05";
const PRACTICE_ID = "s_start_1"; // a free practice sentence used by the bots
const DIAG_QUALITY: SpeechQuality[] = ["weak", "poor", "weak"];

const now = (today: string) => noonMs(today);
const sentence = (id: string) => SENTENCE_BY_ID[id];

/** The last confident practice attempt on PRACTICE_ID (for the retry comparison). */
function lastPractice(app: AppState) {
  for (let i = app.attempts.length - 1; i >= 0; i--) {
    const a = app.attempts[i];
    if (a.sentenceId === PRACTICE_ID && !a.isRetry) return a;
  }
  return undefined;
}

function backup(s: SimState): SimState {
  // Auto-backup to the "cloud" whenever signed in (mirrors syncStore).
  if (!s.app.profile.accountId) return s;
  return { ...s, cloud: { accountId: s.app.profile.accountId, snapshot: s.app } };
}

export const sim: AppSim<SimState, Action> = {
  init: () => ({ app: emptyState(START), today: START, improved: false }),

  actions: (s) => {
    const app = s.app;
    const t = s.today;
    const isPro = pro(app, now(t));
    const A: Action[] = [];

    if (!app.onboarded) {
      const choices = s.setup ?? app.profile;
      for (const l1 of ["hi", "es", "ar", "other"] as const) {
        if (l1 !== choices.nativeLanguage) A.push({ t: "set_language", l1 });
      }
      A.push({ t: "set_accent", accent: choices.targetAccent === "us" ? "uk" : "us" });
      A.push({ t: "finish_setup" }, { t: "skip_setup" });
      return A;
    }
    if (app.diagnostics.length < 3) A.push({ t: "record_diagnostic" });
    if (diagnosticsDone(app) && !app.reportShown) A.push({ t: "view_report" });

    A.push({ t: "record_practice" }, { t: "guided_practice" });
    if (lastPractice(app)) A.push({ t: "retry_better" });

    if (app.plan.length) {
      A.push({ t: "drill_pass", soundId: app.plan[0] }, { t: "drill_fail", soundId: app.plan[0] });
    }
    A.push({ t: "add_custom" }, { t: "complete_session" });

    if (!isPro) A.push({ t: "start_trial" }, { t: "watch_rewarded" });
    if (app.entitlement.plan !== "lifetime") A.push({ t: "buy_lifetime" });
    if (!app.profile.accountId) A.push({ t: "login" });
    if (app.profile.accountId && s.cloud) A.push({ t: "reinstall" });
    if (s.cloud && s.app.entitlement.source !== "restore") A.push({ t: "restore" });

    A.push({ t: "next_day" });
    return A;
  },

  apply: (s, a) => {
    const t = s.today;
    const n = now(t);
    switch (a.t) {
      case "set_language":
        return { ...s, setup: { targetAccent: (s.setup ?? s.app.profile).targetAccent, nativeLanguage: a.l1 } };

      case "set_accent":
        return { ...s, setup: { nativeLanguage: (s.setup ?? s.app.profile).nativeLanguage, targetAccent: a.accent } };

      case "finish_setup":
      case "skip_setup": {
        const { setup, ...rest } = s;
        return backup({ ...rest, app: finishOnboarding(s.app, a.t === "finish_setup" ? setup ?? s.app.profile : undefined) });
      }

      case "record_diagnostic": {
        const idx = s.app.diagnostics.length;
        const dx = DIAGNOSTICS[s.app.profile.nativeLanguage][idx];
        if (!dx) return s;
        const raw = mockScore(dx, s.app.profile.targetAccent, DIAG_QUALITY[idx % DIAG_QUALITY.length]);
        const out = recordDiagnostic(s.app, raw, { accent: s.app.profile.targetAccent, timestamp: n, sentenceId: dx.id }, t);
        return backup({ ...s, app: out.state });
      }

      case "view_report":
        return backup({ ...s, app: completeDiagnosis(s.app, t) });

      case "guided_practice":
        return backup({ ...s, app: completeGuidedPractice(s.app, sentence(PRACTICE_ID).text, t) });

      case "record_practice": {
        const sent = sentence(PRACTICE_ID);
        const raw = mockScore(sent, s.app.profile.targetAccent, "weak");
        const out = recordPractice(s.app, raw, { accent: s.app.profile.targetAccent, timestamp: n, sentenceId: sent.id }, t, n);
        return backup({ ...s, app: out.state });
      }

      case "retry_better": {
        const prev = lastPractice(s.app);
        const sent = sentence(PRACTICE_ID);
        const raw = mockScore(sent, s.app.profile.targetAccent, "good");
        const out = recordPractice(
          s.app,
          raw,
          { accent: s.app.profile.targetAccent, timestamp: n, sentenceId: sent.id, isRetry: true },
          t,
          n,
        );
        let improved = s.improved;
        if (prev && out.attempt) {
          const target = sent.soundTags[0];
          const before = soundScore(prev, target);
          const after = soundScore(out.attempt, target);
          if (before !== null && after !== null && after - before >= 3) improved = true;
        }
        return backup({ ...s, app: out.state, improved });
      }

      case "drill_pass":
        return backup({ ...s, app: completeDrill(s.app, a.soundId, 0.95, t) });
      case "drill_fail":
        return backup({ ...s, app: completeDrill(s.app, a.soundId, 0.3, t) });

      case "add_custom": {
        const raw = mockScore({ text: "The quick brown fox", soundTags: ["r", "w"] }, s.app.profile.targetAccent, "good");
        const out = recordCustom(s.app, "The quick brown fox.", raw, t, n);
        return backup({ ...s, app: out.state });
      }

      case "complete_session":
        return backup({ ...s, app: completeSession(s.app, t, n) });

      case "start_trial":
        return backup({ ...s, app: beginTrial(s.app, "pro_monthly", n) });
      case "buy_lifetime":
        return backup({ ...s, app: buy(s.app, "lifetime", n) });
      case "watch_rewarded":
        return backup({ ...s, app: watchRewarded(s.app, t) });

      case "login":
        return backup({ ...s, app: linkAccount(s.app, "demo@accentgym.app") });

      case "reinstall":
        // Local wiped; the cloud snapshot (server) survives in SimState.
        return { ...s, app: emptyState(t), improved: false };
      case "restore":
        return s.cloud ? { ...s, app: restoreFromBackup(s.app, s.cloud.snapshot, n) } : s;

      case "next_day":
        return { ...s, today: addDays(s.today, 1) };
    }
  },

  goals: [
    { id: "quick_setup", name: "Finish or skip setup without recording, signing in or buying", done: s => s.app.onboarded },
    { id: "offline_practice", name: "Complete listen-and-say practice without microphone or AI", done: s => !!s.app.guidedPractice },
    {
      id: "sound_report",
      name: "F1 · Reach the first sound report (no account, ≤3 diagnostics)",
      done: (s) => s.app.reportShown && (s.app.assessments.length > 0),
    },
    {
      id: "fix_a_sound",
      name: "F2 · Practice a sentence and raise the flagged sound on retry",
      done: (s) => s.improved,
    },
    {
      id: "minimal_pair_drill",
      name: "F3 · Master a trouble sound via a drill (mastery rises)",
      done: (s) => Object.values(s.app.mastery).some((m) => m.score >= 70),
    },
    {
      id: "type_any_text",
      name: "F4 · Type any text, score it, and save it to the set",
      done: (s) => s.app.srs.some((i) => i.source === "custom"),
    },
    {
      id: "trial_no_card",
      name: "F5 · Start the no-card trial and get Pro",
      done: (s) => pro(s.app, now(s.today)) && s.app.entitlement.status === "trialing",
    },
    {
      id: "reinstall_restore",
      name: "F6 · Reinstall and restore Pro + progress",
      done: (s) => s.app.entitlement.source === "restore" && pro(s.app, now(s.today)),
    },
    {
      id: "daily_session_streak",
      name: "F7 · Complete a daily session and increment the streak",
      done: (s) => s.app.streak.current >= 1 && s.app.sessionProgress?.date === s.today,
    },
  ],

  invariants: (s) => {
    const out: string[] = [];
    const app = s.app;

    // Attempt ids: unique and below the counter.
    const attIds = new Set<string>();
    for (const a of [...app.diagnostics, ...app.attempts]) {
      if (attIds.has(a.id)) out.push(`duplicate attempt id ${a.id}`);
      attIds.add(a.id);
      if (Number(a.id.slice(1)) >= app.nextAttemptId) out.push(`${a.id} >= nextAttemptId ${app.nextAttemptId}`);
      if (a.overallScore < 0 || a.overallScore > 100) out.push(`${a.id} overall out of range`);
      if (a.confidence < 0 || a.confidence > 1) out.push(`${a.id} confidence out of range`);
    }
    if (app.diagnostics.length > 3) out.push(`too many diagnostics (${app.diagnostics.length})`);

    // SRS ids unique + below the counter; schedule sane.
    const srsIds = new Set<string>();
    for (const i of app.srs) {
      if (srsIds.has(i.id)) out.push(`duplicate srs id ${i.id}`);
      srsIds.add(i.id);
      if (Number(i.id.slice(1)) >= app.nextSrsId) out.push(`${i.id} >= nextSrsId ${app.nextSrsId}`);
      if (i.ease < MIN_EASE - 1e-9) out.push(`${i.id} ease below floor`);
      if (i.interval < 0 || i.lapses < 0) out.push(`${i.id} negative schedule`);
    }

    // Mastery scores + plan integrity.
    for (const m of Object.values(app.mastery)) {
      if (m.score < 0 || m.score > 100) out.push(`${m.soundId} mastery out of range`);
      if (m.mastered && m.score < MASTERED_AT) out.push(`${m.soundId} mastered but score < ${MASTERED_AT}`);
      if (m.trend.some((p) => p.score < 0 || p.score > 100)) out.push(`${m.soundId} trend out of range`);
    }
    if (new Set(app.plan).size !== app.plan.length) out.push("plan has duplicates");
    if (app.plan.some((id) => !isSoundId(id))) out.push("plan has an unknown sound");

    // Streak + quota bounds.
    if (app.streak.current < 0) out.push("negative streak");
    if (app.streak.best < app.streak.current) out.push("best < current streak");
    if (app.streak.freezesLeft < 0 || app.streak.freezesLeft > WEEKLY_FREEZES) out.push("freezes out of range");
    if (app.quota.scoredUsed < 0 || app.quota.scoredUsed > PRO_DAILY + MAX_BONUS) out.push(`quota scoredUsed out of range (${app.quota.scoredUsed})`);
    if (app.quota.bonusFromAds < 0 || app.quota.bonusFromAds > MAX_BONUS) out.push("quota bonus out of range");

    // Entitlement consistency.
    const e = app.entitlement;
    if (e.plan === "free" && (e.status === "active" || e.status === "trialing")) out.push("free plan marked active/trialing");
    if (e.status === "active" && e.plan !== "lifetime" && e.plan !== "free" && !e.nextBillingDate) out.push("active sub without a next billing date");

    // Session pointer sane.
    if (app.sessionProgress && app.sessionProgress.index > app.sessionProgress.total) out.push("session index past total");

    return out;
  },

  serialize: (s) => JSON.stringify(s),
  deserialize: (raw) => JSON.parse(raw) as SimState,
};
