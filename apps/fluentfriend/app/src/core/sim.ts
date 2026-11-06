/**
 * Simulation of Fluent Friend's real core logic for the factory's journey bots.
 * Actions are what the UI offers in each state (contextual, same validation);
 * goals are one per PRD user flow; invariants are the data rules that must
 * always hold. serialize/deserialize is exactly what the app persists.
 */
import {
  COURSES,
  SCENARIOS,
  dueMistakes,
  gradeQuiz,
  parseFeedback,
  courseProgress,
  canUseAi,
  dailyLimit,
  INTERVALS,
  type DateKey,
} from "./index";
import { addDays } from "./dates";
import {
  AppState,
  PACK_IDS,
  applyPlacement,
  completeAiSession,
  completeLesson,
  emptyState,
  finishDownload,
  markFirstPhrase,
  packState,
  applyReview,
  reportError,
  setReminder,
  startDownload,
  toggleFavorite,
  grantRewardBonus,
} from "./state";
import { scorePlacement, skippedPlacement } from "./placement";

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
  data: AppState;
  pro: boolean;
  today: DateKey;
}

type Action =
  | { t: "placement"; correct: number }
  | { t: "skip_placement" }
  | { t: "first_phrase" }
  | { t: "complete_day" }
  | { t: "ai" }
  | { t: "ai_scripted" }
  | { t: "reward_bonus" }
  | { t: "start_download" }
  | { t: "finish_download" }
  | { t: "report" }
  | { t: "favorite" }
  | { t: "set_reminder" }
  | { t: "review" }
  | { t: "buy_pro" }
  | { t: "next_day" };

const MAIN_COURSE = "c30";
const SAMPLE_SCENARIO = SCENARIOS[0].id;
const SAMPLE_PHRASE = "p_daily_001";

// A fixed AI output so sim/validate exercise the real parser + mistake pipeline.
const SAMPLE_FEEDBACK = parseFeedback({
  fluency: 75,
  clarity: 70,
  grammar: 65,
  pace: 80,
  corrections: [
    { original: "I goes to market", corrected: "I go to the market.", explanationBn: "I-এর সাথে 'go' হয়।" },
    { original: "He don't know", corrected: "He doesn't know.", explanationBn: "He-এর সাথে doesn't হয়।" },
  ],
});

const DAY_SCORE = gradeQuiz([true, true, true, true, false]).score; // 80

export const sim: AppSim<SimState, Action> = {
  init: () => ({ data: emptyState("2026-01-05"), pro: false, today: "2026-01-05" }),

  actions: (s) => {
    const out: Action[] = [];
    if (!s.data.profile.placementDone) {
      out.push({ t: "placement", correct: 2 }, { t: "skip_placement" });
      return out; // one calm action per onboarding step
    }
    if (!s.data.firstPhraseSpoken) out.push({ t: "first_phrase" });
    if (courseProgress(s.data.progress, MAIN_COURSE).nextLessonId) out.push({ t: "complete_day" });
    if (canUseAi(s.data.quota, s.today, s.pro)) out.push({ t: "ai" });
    else out.push({ t: "ai_scripted" }, { t: "reward_bonus" });
    const pack = packState(s.data, "all");
    if (pack === "idle") out.push({ t: "start_download" });
    else if (pack === "downloading") out.push({ t: "finish_download" });
    if (!s.data.errorReports.some((r) => r.phraseId === SAMPLE_PHRASE)) out.push({ t: "report" });
    out.push({ t: "favorite" });
    if (!s.data.profile.notificationsOn) out.push({ t: "set_reminder" });
    if (dueMistakes(s.data.mistakes, s.today).length) out.push({ t: "review" });
    if (!s.pro) out.push({ t: "buy_pro" });
    out.push({ t: "next_day" });
    return out;
  },

  apply: (s, a) => {
    switch (a.t) {
      case "placement":
        return { ...s, data: applyPlacement(s.data, scorePlacement({ goal: "daily", probes: [true, true].slice(0, a.correct) })) };
      case "skip_placement":
        return { ...s, data: applyPlacement(s.data, skippedPlacement()) };
      case "first_phrase":
        return { ...s, data: markFirstPhrase(s.data, s.today) };
      case "complete_day": {
        const next = courseProgress(s.data.progress, MAIN_COURSE).nextLessonId;
        return next ? { ...s, data: completeLesson(s.data, next, DAY_SCORE, s.today).state } : s;
      }
      case "ai":
        return { ...s, data: completeAiSession(s.data, { scenarioId: SAMPLE_SCENARIO, feedback: SAMPLE_FEEDBACK, durationSec: 120, today: s.today, source: "ai" }).state };
      case "ai_scripted":
        return { ...s, data: completeAiSession(s.data, { scenarioId: SAMPLE_SCENARIO, feedback: parseFeedback({}), durationSec: 90, today: s.today, source: "scripted" }).state };
      case "reward_bonus":
        return { ...s, data: grantRewardBonus(s.data, s.today) };
      case "start_download":
        return { ...s, data: startDownload(s.data, "all") };
      case "finish_download":
        return { ...s, data: finishDownload(s.data, "all") };
      case "report":
        return { ...s, data: reportError(s.data, SAMPLE_PHRASE, "meaning", s.today) };
      case "favorite":
        return { ...s, data: toggleFavorite(s.data, SAMPLE_PHRASE, s.today) };
      case "set_reminder":
        return { ...s, data: setReminder(s.data, "19:30") };
      case "review": {
        const due = dueMistakes(s.data.mistakes, s.today)[0];
        return due ? { ...s, data: applyReview(s.data, due.id, true, s.today) } : s;
      }
      case "buy_pro":
        return { ...s, pro: true, data: s.data };
      case "next_day":
        return { ...s, today: addDays(s.today, 1) };
    }
  },

  goals: [
    { id: "first_phrase", name: "Say the first phrase aloud (F1)", done: (s) => s.data.firstPhraseSpoken },
    { id: "complete_day", name: "Finish a day on the path (F2)", done: (s) => courseProgress(s.data.progress, MAIN_COURSE).done > 0 },
    { id: "ai_session", name: "Finish an AI scenario (F3)", done: (s) => s.data.aiSessions.length > 0 },
    { id: "download_pack", name: "Download a pack for offline (F4)", done: (s) => packState(s.data, "all") === "ready" },
    { id: "review_mistakes", name: "Review a saved mistake (F5)", done: (s) => s.data.mistakes.some((m) => m.correctCount > 0 || m.mastered) },
    { id: "report_error", name: "Report a content error (F6)", done: (s) => s.data.errorReports.length > 0 },
    { id: "go_pro", name: "Upgrade to Pro (F7)", done: (s) => s.pro },
    { id: "set_reminder", name: "Set a daily reminder (F8)", done: (s) => s.data.profile.notificationsOn && !!s.data.profile.reminderTime },
  ],

  invariants: (s) => {
    const out: string[] = [];
    const d = s.data;

    // Quota never exceeds the day's cap.
    const cap = dailyLimit(s.pro) + d.quota.bonusRuns;
    if (d.quota.aiRunsUsed < 0 || d.quota.aiRunsUsed > cap) out.push(`quota ${d.quota.aiRunsUsed}/${cap}`);
    if (d.quota.bonusRuns < 0) out.push("negative bonus");

    // Streak sanity.
    if (d.streak.current < 0) out.push("negative streak");
    if (d.streak.longest < d.streak.current) out.push("longest < current streak");

    // Mistakes: counts bounded, mastered flag consistent, intervals legal.
    const mids = new Set<string>();
    for (const m of d.mistakes) {
      if (mids.has(m.id)) out.push(`dup mistake ${m.id}`);
      mids.add(m.id);
      if (m.correctCount < 0 || m.correctCount > 3) out.push(`${m.id} correctCount ${m.correctCount}`);
      if (m.mastered !== m.correctCount >= 3) out.push(`${m.id} mastered flag off`);
      if (!(INTERVALS as readonly number[]).includes(m.interval)) out.push(`${m.id} bad interval ${m.interval}`);
      if (Number(m.id.slice(1)) >= d.nextMistakeId) out.push(`${m.id} >= nextMistakeId`);
    }

    // Favorites unique.
    const favs = new Set<string>();
    for (const f of d.favorites) {
      if (favs.has(f.phraseId)) out.push(`dup favorite ${f.phraseId}`);
      favs.add(f.phraseId);
    }

    // Error reports: unique phrase, ids below counter.
    const rphr = new Set<string>();
    for (const r of d.errorReports) {
      if (rphr.has(r.phraseId)) out.push(`dup report ${r.phraseId}`);
      rphr.add(r.phraseId);
      if (Number(r.id.slice(2)) >= d.nextReportId) out.push(`${r.id} >= nextReportId`);
    }

    // AI sessions: scores in range, ids below counter.
    for (const x of d.aiSessions) {
      for (const v of [x.fluencyScore, x.clarity, x.grammar, x.pace]) if (v < 0 || v > 100) out.push(`${x.id} score ${v} out of range`);
      if (Number(x.id.slice(1)) >= d.nextSessionId) out.push(`${x.id} >= nextSessionId`);
    }

    // Progress: done lessons carry a completion date; scores in range.
    for (const p of Object.values(d.progress)) {
      if (p.status === "done" && !p.completedAt) out.push(`${p.lessonId} done without date`);
      if (p.score < 0 || p.score > 100) out.push(`${p.lessonId} score ${p.score}`);
    }

    // Certificates unique per course and only for valid courses.
    const certs = new Set<string>();
    for (const c of d.certificates) {
      if (certs.has(c.courseId)) out.push(`dup certificate ${c.courseId}`);
      certs.add(c.courseId);
      if (!COURSES.some((x) => x.id === c.courseId)) out.push(`bad certificate course ${c.courseId}`);
    }

    // Packs only ever hold legal ids/states.
    for (const [id, st] of Object.entries(d.packs)) {
      if (!(PACK_IDS as readonly string[]).includes(id)) out.push(`bad pack ${id}`);
      if (!["idle", "downloading", "ready"].includes(st)) out.push(`bad pack state ${st}`);
    }

    return out;
  },

  serialize: (s) => JSON.stringify(s),
  deserialize: (raw) => JSON.parse(raw) as SimState,
};
