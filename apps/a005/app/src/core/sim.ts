/**
 * Simulation of Band Up's real core logic for the factory journey bots.
 * Actions mirror what the UI offers; goals are one per core PRD flow; invariants
 * are the data rules that must always hold. No UI, no clocks — `today` is state.
 */
import {
  FREE_DAILY_SCORES,
  FREE_LIFETIME_SCORES,
  MOCK_TOTAL_ITEMS,
  PLAYBACK_SPEEDS,
  PRO_DAILY_SCORES,
  SCORE_MAX,
  SCORE_MIN,
  addDays,
  attemptById,
  emptyState,
  scoredAttempts,
  type BandUpState,
  type Construct,
  type DateKey,
  type TaskType,
} from "./model";
import { recordAttempt, applyScore, queueAttempt, queuedAttempts, type ScorePayload } from "./scoring";
import { canScore, consumeCredit, grantRewardCredit, recordActivity } from "./credits";
import { completeDrill, completedDrills, startDrill, suggestDrillConstruct, attemptConstructsValid } from "./insights";
import { attachMockAttempt, canStartMock, completedMocks, finishMock, resumableMock, startMock } from "./mock";
import { savePhrase } from "./learn";
import { questionById } from "./questions";

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
  data: BandUpState;
  pro: boolean;
  online: boolean;
  today: DateKey;
}

type Action =
  | { t: "answer"; task: TaskType }
  | { t: "answer_short"; task: TaskType }
  | { t: "score_queued" }
  | { t: "drill" }
  | { t: "do_mock" }
  | { t: "save_phrase" }
  | { t: "watch_ad" }
  | { t: "buy_pro" }
  | { t: "toggle_online" }
  | { t: "next_day" };

const REPEAT_QID = "qr1";
const INTERVIEW_QID = "qi1";
const PHRASES = ["In my opinion,", "On the other hand,", "The main reason is that", "For example,", "All in all,"];

const SAMPLE_TRANSCRIPT: Record<TaskType, string> = {
  repeat: "the library closes early on fridays",
  interview: "in my opinion yes mainly because it helps people in daily life for example in my own experience it made a real difference",
};

/** A deterministic, valid AI payload for a task (varies the band to build a trend). */
function samplePayload(task: TaskType, variant: number): ScorePayload {
  const base = 3 + (variant % 3); // 3..5
  const dip = Math.max(2, base - 1);
  if (task === "repeat") {
    return {
      transcript: SAMPLE_TRANSCRIPT.repeat,
      band6: base,
      constructs: { fluency: base, intelligibility: base, repeat_accuracy: dip },
      strengths: ["Clear voice", "Good pace"],
      weaknesses: ["Missed one word", "Slightly rushed"],
      improvedAnswer: "The library closes early on Fridays.",
    };
  }
  return {
    transcript: SAMPLE_TRANSCRIPT.interview,
    band6: base,
    constructs: { fluency: base, intelligibility: base, language_use: base, organization: dip },
    relevance: 0.9,
    strengths: ["On topic", "Clear reason"],
    weaknesses: ["Few examples", "Some long pauses"],
    improvedAnswer: "In my opinion, yes — mainly because it helps people in everyday life, as I've seen myself.",
  };
}

function doAnswer(s: SimState, task: TaskType): SimState {
  const q = task === "repeat" ? REPEAT_QID : INTERVIEW_QID;
  const rec = recordAttempt(
    s.data,
    { questionId: q, taskType: task, mode: "practice", durationS: 30, speechS: 20, pauseCount: 2, transcript: SAMPLE_TRANSCRIPT[task] },
    s.today,
  );
  if (rec.error || !rec.id) return s;
  let data = recordActivity(rec.state, s.today);
  if (!s.online) {
    data = queueAttempt(data, rec.id);
  } else if (canScore(data, s.today, s.pro)) {
    data = consumeCredit(data, s.today, s.pro);
    data = applyScore(data, rec.id, samplePayload(task, data.attempts.length)).state;
  }
  return { ...s, data };
}

function doMock(s: SimState): SimState {
  const started = startMock(s.data, s.pro, s.today, s.data.nextId + 1);
  if (started.error || !started.id) return s;
  const mockId = started.id;
  let data = started.state;
  const mock = data.mocks.find((m) => m.id === mockId);
  if (!mock) return { ...s, data };
  for (let i = mock.attemptIds.length; i < mock.questionIds.length; i++) {
    const qid = mock.questionIds[i];
    const q = questionById(qid);
    if (!q) continue;
    const rec = recordAttempt(
      data,
      { questionId: qid, taskType: q.taskType, mode: "mock", durationS: 30, speechS: 18, pauseCount: 1, transcript: SAMPLE_TRANSCRIPT[q.taskType], mockId },
      s.today,
    );
    if (!rec.id) continue;
    data = rec.state;
    data = attachMockAttempt(data, mockId, rec.id);
    if (!s.online) {
      data = queueAttempt(data, rec.id);
    } else if (canScore(data, s.today, s.pro)) {
      data = consumeCredit(data, s.today, s.pro);
      data = applyScore(data, rec.id, samplePayload(q.taskType, i)).state;
    }
  }
  data = finishMock(data, mockId, s.today);
  data = recordActivity(data, s.today);
  return { ...s, data };
}

function doScoreQueued(s: SimState): SimState {
  if (!s.online) return s;
  let data = s.data;
  for (const a of queuedAttempts(data)) {
    if (!canScore(data, s.today, s.pro)) break;
    data = consumeCredit(data, s.today, s.pro);
    data = applyScore(data, a.id, samplePayload(a.taskType, data.attempts.length)).state;
  }
  return { ...s, data };
}

export const sim: AppSim<SimState, Action> = {
  init: () => ({ data: emptyState(), pro: false, online: true, today: "2026-02-01" }),

  actions: (s) => {
    const list: Action[] = [
      { t: "answer", task: "repeat" },
      { t: "answer", task: "interview" },
      { t: "answer_short", task: "interview" },
      { t: "drill" },
      { t: "do_mock" },
      { t: "save_phrase" },
      { t: "toggle_online" },
      { t: "next_day" },
    ];
    if (queuedAttempts(s.data).length && s.online) list.push({ t: "score_queued" });
    if (!s.pro) list.push({ t: "buy_pro" }, { t: "watch_ad" });
    return list;
  },

  apply: (s, a) => {
    switch (a.t) {
      case "answer":
        return doAnswer(s, a.task);
      case "answer_short": {
        // Too short: UI prompts a retry; no attempt is created (state unchanged).
        const q = a.task === "repeat" ? REPEAT_QID : INTERVIEW_QID;
        const rec = recordAttempt(
          s.data,
          { questionId: q, taskType: a.task, mode: "practice", durationS: 3, speechS: 3, pauseCount: 0, transcript: "um" },
          s.today,
        );
        return rec.id ? { ...s, data: rec.state } : s;
      }
      case "score_queued":
        return doScoreQueued(s);
      case "drill": {
        const c = suggestDrillConstruct(s.data);
        const started = startDrill(s.data, c, s.today, 3, s.data.nextId + 1);
        let data = completeDrill(started.state, started.id, s.today);
        data = recordActivity(data, s.today);
        return { ...s, data };
      }
      case "do_mock":
        return doMock(s);
      case "save_phrase": {
        const text = PHRASES[s.data.phrases.length % PHRASES.length];
        return { ...s, data: savePhrase(s.data, text, "general", s.today).state };
      }
      case "watch_ad":
        return s.pro ? s : { ...s, data: grantRewardCredit(s.data, s.today) };
      case "buy_pro":
        return { ...s, pro: true };
      case "toggle_online":
        return { ...s, online: !s.online };
      case "next_day":
        return { ...s, today: addDays(s.today, 1) };
    }
  },

  goals: [
    { id: "first_scored", name: "Get your first AI-scored answer", done: (s) => scoredAttempts(s.data).length >= 1 },
    { id: "interview_set", name: "Complete an Interview set (4 answers)", done: (s) => s.data.attempts.filter((a) => a.taskType === "interview").length >= 4 },
    { id: "drill_done", name: "Finish a weak-spot drill", done: (s) => completedDrills(s.data).length >= 1 },
    { id: "mock_done", name: "Complete a full mock test", done: (s) => completedMocks(s.data).length >= 1 },
    { id: "save_phrase", name: "Save a phrase in Learn", done: (s) => s.data.phrases.length >= 1 },
    { id: "go_pro", name: "Unlock Pro with no account", done: (s) => s.pro },
  ],

  invariants: (s) => {
    const out: string[] = [];
    const d = s.data;
    const ids = new Set<string>();
    for (const list of [d.attempts, d.drills, d.mocks, d.phrases]) {
      for (const item of list as { id: string }[]) {
        if (ids.has(item.id)) out.push(`duplicate id ${item.id}`);
        ids.add(item.id);
        const num = Number(item.id.slice(1));
        if (!Number.isFinite(num) || num >= d.nextId) out.push(`${item.id} >= nextId ${d.nextId}`);
      }
    }
    // Attempts
    for (const a of d.attempts) {
      if (a.startedAt > s.today) out.push(`${a.id} started in the future`);
      if (a.status === "scored") {
        if (typeof a.score30 !== "number" || a.score30 < SCORE_MIN || a.score30 > SCORE_MAX) out.push(`${a.id} bad score30`);
        if (typeof a.band6 !== "number" || a.band6 < 1 || a.band6 > 6) out.push(`${a.id} bad band6`);
        if (a.strengths.length < 2) out.push(`${a.id} < 2 strengths`);
        if (a.weaknesses.length < 2) out.push(`${a.id} < 2 weaknesses`);
        if (!a.transcript.trim()) out.push(`${a.id} empty transcript`);
        if (!a.improvedAnswer || !a.improvedAnswer.trim()) out.push(`${a.id} no improved answer`);
        if (!attemptConstructsValid(a)) out.push(`${a.id} invalid constructs`);
      } else {
        if (a.score30 !== null || a.band6 !== null) out.push(`${a.id} unscored but has a score`);
      }
      if (a.taskType === "repeat" && a.relevance !== null) out.push(`${a.id} repeat has relevance`);
      if (a.relevance !== null && (a.relevance < 0 || a.relevance > 1)) out.push(`${a.id} relevance out of range`);
    }
    // Credits
    const p = d.profile;
    if (p.freeScoredUsed < 0 || p.freeScoredUsed > FREE_LIFETIME_SCORES) out.push(`freeScoredUsed ${p.freeScoredUsed}`);
    if (p.dayUsed < 0) out.push(`dayUsed ${p.dayUsed}`);
    if (p.creditsDate === s.today) {
      const cap = s.pro ? PRO_DAILY_SCORES : FREE_DAILY_SCORES + p.dayBonus;
      if (p.dayUsed > cap) out.push(`dayUsed ${p.dayUsed} > cap ${cap}`);
    }
    if (p.streakCount < 0) out.push(`streak ${p.streakCount}`);
    if (p.lastActiveDate && p.lastActiveDate > s.today) out.push(`lastActive in the future`);
    if (!(PLAYBACK_SPEEDS as readonly number[]).includes(p.playbackSpeed)) out.push(`bad playback speed`);
    if (p.targetScore !== null && (p.targetScore < SCORE_MIN || p.targetScore > SCORE_MAX)) out.push(`target out of range`);
    // Phrases unique text
    const texts = new Set<string>();
    for (const ph of d.phrases) {
      const key = ph.text.toLowerCase();
      if (texts.has(key)) out.push(`duplicate phrase "${ph.text}"`);
      texts.add(key);
    }
    // Mocks
    for (const m of d.mocks) {
      const seen = new Set<string>();
      for (const id of m.attemptIds) {
        if (seen.has(id)) out.push(`mock ${m.id} duplicate attempt ${id}`);
        seen.add(id);
        if (!attemptById(d, id)) out.push(`mock ${m.id} dangling attempt ${id}`);
      }
      if (m.attemptIds.length > MOCK_TOTAL_ITEMS) out.push(`mock ${m.id} too many items`);
      if (m.completedAt && m.attemptIds.length !== MOCK_TOTAL_ITEMS) out.push(`mock ${m.id} completed but ${m.attemptIds.length} items`);
      if (m.sectionScore30 !== null && (m.sectionScore30 < SCORE_MIN || m.sectionScore30 > SCORE_MAX)) out.push(`mock ${m.id} bad section score`);
    }
    return out;
  },

  serialize: (s) => JSON.stringify(s),
  deserialize: (raw) => JSON.parse(raw) as SimState,
};

export type { SimState, Action, Construct };
