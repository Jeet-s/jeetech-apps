/// <reference types="node" />
/**
 * Core-logic tests for Band Up (run with `npm run validate`). Every rule in
 * src/core is exercised through the real functions. Final stdout line is JSON.
 */
import { addDays, daysBetween, dateKey, isDateKey, weekdayLabel } from "../src/core/dates";
import {
  QUESTIONS,
  repeatQuestions,
  interviewQuestions,
  filterQuestions,
  pickQuestions,
  questionsByTask,
  responseWindowS,
  repeatDiff,
  questionById,
  topicsForTask,
} from "../src/core/questions";
import {
  applyScore,
  bandFromConstructs,
  isTooShort,
  isTolerableSilence,
  localScorePayload,
  markFailed,
  pacingReport,
  queueAttempt,
  queuedAttempts,
  recordAttempt,
  recordingWindowS,
  score30FromBand,
  scoreRange,
  shouldAutoStop,
  validateScorePayload,
  type ScorePayload,
} from "../src/core/scoring";
import {
  canScore,
  consumeCredit,
  creditInfo,
  creditsRemaining,
  grantRewardCredit,
  practisedToday,
  recordActivity,
} from "../src/core/credits";
import {
  beforeAfter,
  completeDrill,
  completedDrills,
  constructStats,
  earnedBadges,
  hasTrend,
  scoreTrend,
  startDrill,
  suggestDrillConstruct,
  taskForConstruct,
  weakestConstruct,
} from "../src/core/insights";
import {
  attachMockAttempt,
  canStartMock,
  finishMock,
  mockQuestionIds,
  mockSectionScore,
  resumableMock,
  startMock,
} from "../src/core/mock";
import { countdownLabel, dailyPlan } from "../src/core/plan";
import { checkQuiz, deletePhrase, QUIZZES, restorePhrase, savePhrase, TEMPLATES, validatePhrase } from "../src/core/learn";
import {
  daysUntilTest,
  emptyState,
  migrate,
  setCaptions,
  setPlaybackSpeed,
  setTargetScore,
  setTestDate,
  type BandUpState,
  type TaskType,
} from "../src/core/model";
import { sim } from "../src/core/sim";

const results: { name: string; ok: boolean; why?: string }[] = [];
const features = new Set<string>();
function test(feature: string, name: string, fn: () => void) {
  features.add(feature);
  try {
    fn();
    results.push({ name, ok: true });
  } catch (e) {
    results.push({ name, ok: false, why: String((e as Error)?.message ?? e).slice(0, 200) });
  }
}
function eq<T>(a: T, b: T, msg = "") {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
function ok(cond: boolean, msg = "expected true") {
  if (!cond) throw new Error(msg);
}

const T = "2026-03-10";

function payload(task: TaskType, band: number, orgDip = false): ScorePayload {
  if (task === "repeat")
    return {
      transcript: "the library closes early on fridays",
      band6: band,
      constructs: { fluency: band, intelligibility: band, repeat_accuracy: orgDip ? Math.max(1, band - 1) : band },
      strengths: ["Clear", "Good pace"],
      weaknesses: ["Missed a word", "Rushed"],
      improvedAnswer: "The library closes early on Fridays.",
    };
  return {
    transcript: "in my opinion yes because it helps people",
    band6: band,
    constructs: { fluency: band, intelligibility: band, language_use: band, organization: orgDip ? Math.max(1, band - 1) : band },
    relevance: 0.9,
    strengths: ["On topic", "Clear reason"],
    weaknesses: ["Few examples", "Some pauses"],
    improvedAnswer: "In my opinion, yes — mainly because it helps people in daily life.",
  };
}

/** Record + score one attempt; returns new state and the attempt id. */
function addScored(s: BandUpState, task: TaskType, band: number, when = T, orgDip = false): { state: BandUpState; id: string } {
  const rec = recordAttempt(
    s,
    { questionId: task === "repeat" ? "qr1" : "qi1", taskType: task, mode: "practice", durationS: 30, speechS: 20, pauseCount: 1, transcript: "answer text here" },
    when,
  );
  const id = rec.id as string;
  const res = applyScore(rec.state, id, payload(task, band, orgDip));
  return { state: res.state, id };
}

// ---------------------------------------------------------------- dates
test("dates", "addDays forward", () => eq(addDays("2026-03-10", 1), "2026-03-11"));
test("dates", "addDays across month", () => eq(addDays("2026-01-31", 1), "2026-02-01"));
test("dates", "addDays across year back", () => eq(addDays("2026-01-01", -1), "2025-12-31"));
test("dates", "addDays leap day", () => eq(addDays("2028-02-28", 1), "2028-02-29"));
test("dates", "daysBetween", () => eq(daysBetween("2026-03-01", "2026-03-10"), 9));
test("dates", "daysBetween negative", () => eq(daysBetween("2026-03-10", "2026-03-01"), -9));
test("dates", "weekday label", () => eq(weekdayLabel("2026-03-10"), "Tue"));
test("dates", "dateKey formats", () => eq(dateKey(new Date(2026, 2, 5, 12)), "2026-03-05"));
test("dates", "isDateKey accepts valid", () => ok(isDateKey("2026-03-10")));
test("dates", "isDateKey rejects nonsense", () => ok(!isDateKey("2026-13-40") && !isDateKey("hello")));

// ---------------------------------------------------------------- question bank
test("question bank", "100+ repeat items", () => ok(repeatQuestions().length >= 100, `only ${repeatQuestions().length}`));
test("question bank", "100+ interview items", () => ok(interviewQuestions().length >= 100, `only ${interviewQuestions().length}`));
test("question bank", "every item labelled task + difficulty", () =>
  ok(QUESTIONS.every((q) => (q.taskType === "repeat" || q.taskType === "interview") && q.difficulty >= 1 && q.difficulty <= 3)));
test("question bank", "repeat items carry a target sentence", () =>
  ok(repeatQuestions().every((q) => !!q.targetSentence && q.targetSentence.length > 0)));
test("question bank", "interview items have a sample answer + why", () =>
  ok(interviewQuestions().every((q) => q.sampleAnswer.length > 20 && q.whyScoresHigh.length > 10)));
test("question bank", "ids are unique", () => eq(new Set(QUESTIONS.map((q) => q.id)).size, QUESTIONS.length));
test("question bank", "filter by task + topic", () => {
  const r = filterQuestions({ task: "interview", topic: "Technology" });
  ok(r.length > 0 && r.every((q) => q.taskType === "interview" && q.topic === "Technology"));
});
test("question bank", "topics are non-empty per task", () => ok(topicsForTask("repeat").length >= 5 && topicsForTask("interview").length >= 5));
test("question bank", "questionById resolves", () => eq(questionById("qr1")?.id, "qr1"));
test("question bank", "pickQuestions is deterministic", () => eq(pickQuestions(questionsByTask("repeat"), 3, 42).map((q) => q.id), pickQuestions(questionsByTask("repeat"), 3, 42).map((q) => q.id)));
test("question bank", "pickQuestions has no duplicates", () => {
  const picked = pickQuestions(questionsByTask("interview"), 4, 7).map((q) => q.id);
  eq(new Set(picked).size, picked.length);
});
test("question bank", "interview window is 45s", () => eq(responseWindowS(interviewQuestions()[0]), 45));
test("question bank", "repeat window within bounds", () => {
  const w = responseWindowS(repeatQuestions()[0]);
  ok(w >= 10 && w <= 25, `window ${w}`);
});

// ---------------------------------------------------------------- repeat diff
test("repeat diff", "perfect match is 100%", () => eq(repeatDiff("The cat sat", "the cat sat").accuracy, 1));
test("repeat diff", "missing word lowers accuracy", () => {
  const d = repeatDiff("the quick brown fox", "the brown fox");
  eq(d.accuracy, 0.75);
  ok(d.tokens.some((t) => t.op === "missing" && t.target === "quick"));
});
test("repeat diff", "extra word is flagged", () => {
  const d = repeatDiff("hello world", "hello there world");
  ok(d.tokens.some((t) => t.op === "extra" && t.said === "there"));
  eq(d.accuracy, 1);
});
test("repeat diff", "ignores punctuation + case", () => eq(repeatDiff("Stop! Now.", "stop now").accuracy, 1));
test("repeat diff", "empty target has 0 total", () => eq(repeatDiff("", "anything").total, 0));

// ---------------------------------------------------------------- scoring maps
test("scoring", "band 6 maps to 30", () => eq(score30FromBand(6), 30));
test("scoring", "band 3 maps to 15", () => eq(score30FromBand(3), 15));
test("scoring", "score range clamps at the top", () => eq(scoreRange(29), [27, 30]));
test("scoring", "score range clamps at the bottom", () => eq(scoreRange(1), [0, 3]));
test("scoring", "band from constructs averages", () => eq(bandFromConstructs({ fluency: 4, organization: 2 }), 3));
test("scoring", "band from empty constructs is 1", () => eq(bandFromConstructs({}), 1));

// ---------------------------------------------------------------- local fallback estimate
test("local score", "repeat estimate is a valid payload", () => {
  const p = localScorePayload({ taskType: "repeat", transcript: "the quick brown fox", durationS: 8, target: "the quick brown fox" });
  eq(validateScorePayload(p, "repeat"), null);
});
test("local score", "interview estimate is a valid payload", () => {
  const p = localScorePayload({ taskType: "interview", transcript: "I prefer studying at home because it is quiet and I can focus for example in the morning", durationS: 40, question: "Where do you prefer to study?" });
  eq(validateScorePayload(p, "interview"), null);
});
test("local score", "a perfect repeat scores higher than a wrong one", () => {
  const good = localScorePayload({ taskType: "repeat", transcript: "the cat sat on the mat", durationS: 7, target: "the cat sat on the mat" });
  const bad = localScorePayload({ taskType: "repeat", transcript: "totally different words here now", durationS: 7, target: "the cat sat on the mat" });
  ok((good.constructs.repeat_accuracy ?? 0) > (bad.constructs.repeat_accuracy ?? 0));
});
test("local score", "repeat improved answer is the target sentence", () => {
  const p = localScorePayload({ taskType: "repeat", transcript: "cat sat", durationS: 5, target: "The cat sat on the mat." });
  eq(p.improvedAnswer, "The cat sat on the mat.");
});
test("local score", "empty transcript still yields a usable payload", () => {
  const p = localScorePayload({ taskType: "interview", transcript: "", durationS: 0, question: "Tell me about yourself." });
  eq(validateScorePayload(p, "interview"), null);
});
test("local score", "band maps into 0-30 via applyScore (estimated flag set)", () => {
  let s = recordAttempt(emptyState(), { questionId: "qr1", taskType: "repeat", mode: "practice", durationS: 8, speechS: 8, pauseCount: 0, transcript: "the cat sat on the mat" }, T).state;
  const id = s.attempts[0].id;
  const p = localScorePayload({ taskType: "repeat", transcript: "the cat sat on the mat", durationS: 8, target: "the cat sat on the mat" });
  const r = applyScore(s, id, p, true);
  eq(r.error, null);
  eq(r.state.attempts[0].status, "scored");
  eq(r.state.attempts[0].estimated, true);
  ok((r.state.attempts[0].score30 ?? 0) >= 0 && (r.state.attempts[0].score30 ?? 0) <= 30);
});

// ---------------------------------------------------------------- pacing
test("pacing", "wpm computed", () => eq(pacingReport({ transcript: "one two three four", durationS: 60, pauseCount: 0 }).wpm, 4));
test("pacing", "slow is labelled slow", () => eq(pacingReport({ transcript: "a b", durationS: 60, pauseCount: 0 }).label, "slow"));
test("pacing", "fast is labelled fast", () => {
  const words = Array.from({ length: 200 }, () => "w").join(" ");
  eq(pacingReport({ transcript: words, durationS: 60, pauseCount: 0 }).label, "fast");
});
test("pacing", "zero duration is safe", () => eq(pacingReport({ transcript: "hi", durationS: 0, pauseCount: 0 }).wpm, 0));

// ---------------------------------------------------------------- recorder rules
test("recorder", "stops after 5s silence", () => ok(shouldAutoStop({ elapsedS: 20, trailingSilenceS: 5, windowS: 45 })));
test("recorder", "does NOT stop at a short pause", () => ok(!shouldAutoStop({ elapsedS: 20, trailingSilenceS: 4, windowS: 45 })));
test("recorder", "stops at the window cap", () => ok(shouldAutoStop({ elapsedS: 45, trailingSilenceS: 0, windowS: 45 })));
test("recorder", "pauses under 5s are tolerated", () => ok(isTolerableSilence(4) && !isTolerableSilence(5)));
test("recorder", "too short under 5s of speech", () => ok(isTooShort(4) && !isTooShort(5)));
test("recorder", "interview window helper is 45", () => eq(recordingWindowS("interview"), 45));
test("recorder", "repeat window helper uses passed value", () => eq(recordingWindowS("repeat", 12), 12));

// ---------------------------------------------------------------- record attempt
test("record attempt", "creates a recorded attempt with pacing", () => {
  const rec = recordAttempt(emptyState(), { questionId: "qi1", taskType: "interview", mode: "practice", durationS: 60, speechS: 40, pauseCount: 2, transcript: "one two three four five six" }, T);
  eq(rec.error, null);
  eq(rec.state.attempts[0].status, "recorded");
  eq(rec.state.attempts[0].pacingWpm, 6);
});
test("record attempt", "rejects too-short answer (retry, no attempt)", () => {
  const rec = recordAttempt(emptyState(), { questionId: "qi1", taskType: "interview", mode: "practice", durationS: 3, speechS: 3, pauseCount: 0, transcript: "um" }, T);
  eq(rec.error, "too_short");
  eq(rec.state.attempts.length, 0);
});
test("record attempt", "ids increment", () => {
  let s = emptyState();
  s = recordAttempt(s, { questionId: "qr1", taskType: "repeat", mode: "practice", durationS: 10, speechS: 8, pauseCount: 0, transcript: "the cat sat on the mat" }, T).state;
  s = recordAttempt(s, { questionId: "qr1", taskType: "repeat", mode: "practice", durationS: 10, speechS: 8, pauseCount: 0, transcript: "the cat sat on the mat" }, T).state;
  eq(s.attempts.map((a) => a.id), ["a1", "a2"]);
});

// ---------------------------------------------------------------- payload validation
test("payload", "valid interview payload passes", () => eq(validateScorePayload(payload("interview", 4), "interview"), null));
test("payload", "rejects empty transcript", () => eq(validateScorePayload({ ...payload("interview", 4), transcript: " " }, "interview"), "bad_transcript"));
test("payload", "rejects out-of-range band", () => eq(validateScorePayload({ ...payload("interview", 4), band6: 9 }, "interview"), "bad_band"));
test("payload", "rejects < 2 strengths", () => eq(validateScorePayload({ ...payload("interview", 4), strengths: ["one"] }, "interview"), "too_few_strengths"));
test("payload", "rejects < 2 weaknesses", () => eq(validateScorePayload({ ...payload("interview", 4), weaknesses: [] }, "interview"), "too_few_weaknesses"));
test("payload", "rejects empty improved answer", () => eq(validateScorePayload({ ...payload("interview", 4), improvedAnswer: "" }, "interview"), "bad_improved"));
test("payload", "rejects bad relevance", () => eq(validateScorePayload({ ...payload("interview", 4), relevance: 2 }, "interview"), "bad_relevance"));
test("payload", "rejects empty constructs", () => eq(validateScorePayload({ ...payload("interview", 4), constructs: {} }, "interview"), "bad_constructs"));

// ---------------------------------------------------------------- apply score
test("apply score", "sets score, status and range", () => {
  const { state, id } = addScored(emptyState(), "interview", 4);
  const a = state.attempts.find((x) => x.id === id)!;
  eq([a.status, a.band6, a.score30], ["scored", 4, 20]);
  eq(scoreRange(a.score30 as number), [18, 22]);
});
test("apply score", "keeps >= 2 strengths and weaknesses", () => {
  const { state, id } = addScored(emptyState(), "interview", 5);
  const a = state.attempts.find((x) => x.id === id)!;
  ok(a.strengths.length >= 2 && a.weaknesses.length >= 2 && !!a.improvedAnswer);
});
test("apply score", "drops constructs that don't belong to the task", () => {
  const rec = recordAttempt(emptyState(), { questionId: "qr1", taskType: "repeat", mode: "practice", durationS: 10, speechS: 8, pauseCount: 0, transcript: "the cat sat on the mat" }, T);
  const bad = { ...payload("repeat", 4), constructs: { fluency: 4, organization: 4, repeat_accuracy: 4, intelligibility: 4 } } as ScorePayload;
  const a = applyScore(rec.state, rec.id as string, bad).state.attempts[0];
  eq(Object.keys(a.constructs).sort(), ["fluency", "intelligibility", "repeat_accuracy"]);
});
test("apply score", "repeat attempts never carry relevance", () => {
  const { state, id } = addScored(emptyState(), "repeat", 4);
  eq(state.attempts.find((x) => x.id === id)!.relevance, null);
});
test("apply score", "unknown attempt id errors", () => eq(applyScore(emptyState(), "a999", payload("repeat", 4)).error, "not_found"));

// ---------------------------------------------------------------- offline queue
test("offline queue", "queue then it appears in queued list", () => {
  const rec = recordAttempt(emptyState(), { questionId: "qi1", taskType: "interview", mode: "practice", durationS: 20, speechS: 15, pauseCount: 1, transcript: "a real answer with words" }, T);
  const q = queueAttempt(rec.state, rec.id as string);
  eq(queuedAttempts(q).length, 1);
  eq(q.attempts[0].status, "queued");
});
test("offline queue", "scoring a queued attempt clears it", () => {
  const rec = recordAttempt(emptyState(), { questionId: "qi1", taskType: "interview", mode: "practice", durationS: 20, speechS: 15, pauseCount: 1, transcript: "a real answer with words" }, T);
  const q = queueAttempt(rec.state, rec.id as string);
  const scored = applyScore(q, rec.id as string, payload("interview", 3)).state;
  eq(queuedAttempts(scored).length, 0);
});
test("offline queue", "markFailed sets failed status", () => {
  const rec = recordAttempt(emptyState(), { questionId: "qi1", taskType: "interview", mode: "practice", durationS: 20, speechS: 15, pauseCount: 1, transcript: "answer words here now" }, T);
  eq(markFailed(rec.state, rec.id as string).attempts[0].status, "failed");
});

// ---------------------------------------------------------------- credits
test("credits", "new user has 3 free lifetime", () => eq(creditInfo(emptyState(), T, false).lifetimeRemaining, 3));
test("credits", "consume spends lifetime first", () => {
  const s = consumeCredit(emptyState(), T, false);
  eq(s.profile.freeScoredUsed, 1);
  eq(creditInfo(s, T, false).lifetimeRemaining, 2);
});
test("credits", "after 3 lifetime, 2 per day", () => {
  let s = emptyState();
  for (let i = 0; i < 3; i++) s = consumeCredit(s, T, false);
  eq(creditInfo(s, T, false).remaining, 2);
});
test("credits", "daily quota exhausts then blocks", () => {
  let s = emptyState();
  for (let i = 0; i < 5; i++) s = consumeCredit(s, T, false); // 3 lifetime + 2 daily
  ok(!canScore(s, T, false));
});
test("credits", "daily quota rolls over next day", () => {
  let s = emptyState();
  for (let i = 0; i < 5; i++) s = consumeCredit(s, T, false);
  ok(canScore(s, addDays(T, 1), false));
  eq(creditsRemaining(s, addDays(T, 1), false), 2);
});
test("credits", "rewarded ad grants one more today", () => {
  let s = emptyState();
  for (let i = 0; i < 5; i++) s = consumeCredit(s, T, false);
  s = grantRewardCredit(s, T);
  eq(creditsRemaining(s, T, false), 1);
});
test("credits", "pro gets a large daily quota", () => eq(creditInfo(emptyState(), T, true).remaining, 150));
test("credits", "pro never touches lifetime free", () => {
  const s = consumeCredit(emptyState(), T, true);
  eq(s.profile.freeScoredUsed, 0);
  eq(s.profile.dayUsed, 1);
});

// ---------------------------------------------------------------- streak
test("streak", "first activity starts at 1", () => eq(recordActivity(emptyState(), T).profile.streakCount, 1));
test("streak", "same day is idempotent", () => {
  const s = recordActivity(emptyState(), T);
  eq(recordActivity(s, T).profile.streakCount, 1);
});
test("streak", "consecutive days add up", () => {
  let s = recordActivity(emptyState(), T);
  s = recordActivity(s, addDays(T, 1));
  s = recordActivity(s, addDays(T, 2));
  eq(s.profile.streakCount, 3);
});
test("streak", "one missed day is saved by the freeze", () => {
  let s = recordActivity(emptyState(), T);
  s = recordActivity(s, addDays(T, 2)); // skipped T+1
  eq(s.profile.streakCount, 2);
  eq(s.profile.freezeAvailable, false);
});
test("streak", "a second gap breaks the streak", () => {
  let s = recordActivity(emptyState(), T);
  s = recordActivity(s, addDays(T, 2)); // freeze used
  s = recordActivity(s, addDays(T, 5)); // big gap
  eq(s.profile.streakCount, 1);
});
test("streak", "practisedToday reflects activity", () => {
  const s = recordActivity(emptyState(), T);
  ok(practisedToday(s, T) && !practisedToday(s, addDays(T, 1)));
});

// ---------------------------------------------------------------- insights
test("insights", "construct stats average across attempts", () => {
  let s = emptyState();
  s = addScored(s, "interview", 4).state;
  s = addScored(s, "interview", 2).state;
  const org = constructStats(s).find((c) => c.construct === "organization")!;
  eq(org.avg, 3);
});
test("insights", "weakest construct is the lowest average", () => {
  let s = emptyState();
  s = addScored(s, "interview", 5, T, true).state; // organization dipped
  s = addScored(s, "interview", 5, T, true).state;
  eq(weakestConstruct(s), "organization");
});
test("insights", "trend appears after 2 scored attempts", () => {
  let s = emptyState();
  s = addScored(s, "interview", 3).state;
  ok(!hasTrend(s));
  s = addScored(s, "interview", 4, addDays(T, 1)).state;
  ok(hasTrend(s) && scoreTrend(s).length === 2);
});
test("insights", "before/after compares first and latest", () => {
  let s = emptyState();
  s = addScored(s, "interview", 3).state;
  s = addScored(s, "interview", 5, addDays(T, 1)).state;
  const ba = beforeAfter(s, "interview")!;
  eq([ba.first, ba.latest, ba.delta], [15, 25, 10]);
});
test("insights", "task for construct routes correctly", () => eq([taskForConstruct("repeat_accuracy"), taskForConstruct("fluency")], ["repeat", "interview"]));
test("insights", "new users get a starter drill suggestion", () => eq(suggestDrillConstruct(emptyState()), "fluency"));
test("insights", "start then complete a drill", () => {
  const started = startDrill(emptyState(), "fluency", T, 3, 1);
  eq(started.state.drills[0].questionIds.length, 3);
  const done = completeDrill(started.state, started.id, T);
  eq(completedDrills(done).length, 1);
});
test("insights", "badges: first attempt and ten attempts", () => {
  let s = emptyState();
  for (let i = 0; i < 10; i++) s = addScored(s, "repeat", 4).state;
  const b = earnedBadges(s);
  ok(b.includes("first_attempt") && b.includes("ten_attempts"));
});

// ---------------------------------------------------------------- mock
test("mock", "free user may start one mock, then it locks", () => {
  ok(canStartMock(emptyState(), false));
  const withOneMock = { ...emptyState(), mocks: [{ id: "m1", startedAt: T, questionIds: [], attemptIds: [], completedAt: T, sectionScore30: null }] };
  ok(!canStartMock(withOneMock, false));
});
test("mock", "pro can always start a mock", () => ok(canStartMock({ ...emptyState(), mocks: [{ id: "m1", startedAt: T, questionIds: [], attemptIds: [], completedAt: T, sectionScore30: null }] }, true)));
test("mock", "mock has 7 repeat then 4 interview", () => {
  const ids = mockQuestionIds(3);
  eq(ids.length, 11);
  ok(ids.slice(0, 7).every((id) => questionById(id)?.taskType === "repeat"));
  ok(ids.slice(7).every((id) => questionById(id)?.taskType === "interview"));
});
test("mock", "attach attempts and compute a section score", () => {
  let s = emptyState();
  const started = startMock(s, true, T, 2);
  s = started.state;
  const mock = s.mocks[0];
  for (const qid of mock.questionIds) {
    const q = questionById(qid)!;
    const rec = recordAttempt(s, { questionId: qid, taskType: q.taskType, mode: "mock", durationS: 20, speechS: 15, pauseCount: 0, transcript: "a complete spoken answer here", mockId: mock.id }, T);
    s = applyScore(rec.state, rec.id as string, payload(q.taskType, 4)).state;
    s = attachMockAttempt(s, mock.id, rec.id as string);
  }
  s = finishMock(s, mock.id, T);
  eq(s.mocks[0].attemptIds.length, 11);
  eq(mockSectionScore(s, mock.id), 20);
  eq(s.mocks[0].completedAt, T);
});
test("mock", "resumable mock is found while incomplete", () => {
  const started = startMock(emptyState(), true, T, 1);
  ok(resumableMock(started.state)?.id === started.id);
});

// ---------------------------------------------------------------- plan
test("plan", "daily plan has items and a total time", () => {
  const plan = dailyPlan(emptyState(), T, false);
  ok(plan.items.length >= 3 && plan.totalMinutes > 0);
});
test("plan", "exam week adds a mock item", () => {
  let s = setTestDate(emptyState(), addDays(T, 3));
  const plan = dailyPlan(s, T, true);
  ok(plan.items.some((it) => it.kind === "mock"));
});
test("plan", "countdown label reads clearly", () => eq([countdownLabel(null), countdownLabel(0), countdownLabel(1), countdownLabel(5)], ["No test date set", "Test is today — you've got this", "1 day to go", "5 days to go"]));
test("plan", "days until test computed", () => eq(daysUntilTest(setTestDate(emptyState(), addDays(T, 10)), T), 10));

// ---------------------------------------------------------------- learn
test("learn", "has templates and quizzes bundled", () => ok(TEMPLATES.length >= 10 && QUIZZES.length >= 10));
test("learn", "save a phrase", () => eq(savePhrase(emptyState(), "In my opinion,", "opening", T).state.phrases.length, 1));
test("learn", "reject empty phrase", () => eq(savePhrase(emptyState(), "   ", "x", T).error, "empty"));
test("learn", "reject duplicate phrase (case-insensitive)", () => {
  const s = savePhrase(emptyState(), "However,", "contrast", T).state;
  eq(savePhrase(s, "however,", "contrast", T).error, "duplicate");
});
test("learn", "reject over-long phrase", () => eq(validatePhrase(emptyState(), "x".repeat(281)), "too_long"));
test("learn", "delete then restore a phrase", () => {
  const s = savePhrase(emptyState(), "All in all,", "closing", T).state;
  const gone = deletePhrase(s, s.phrases[0].id);
  eq(gone.phrases.length, 0);
  eq(restorePhrase(gone, s.phrases[0], 0).phrases.length, 1);
});
test("learn", "quiz checks the right answer", () => {
  const first = QUIZZES[0];
  eq(checkQuiz(first.id, first.answer)?.correct, true);
  eq(checkQuiz(first.id, (first.answer + 1) % first.choices.length)?.correct, false);
});

// ---------------------------------------------------------------- profile
test("profile", "target score clamps to 0-30", () => eq(setTargetScore(emptyState(), 99).profile.targetScore, 30));
test("profile", "target score can be cleared", () => eq(setTargetScore(emptyState(), null).profile.targetScore, null));
test("profile", "invalid playback speed falls back to 1x", () => eq(setPlaybackSpeed(emptyState(), 3).profile.playbackSpeed, 1));
test("profile", "valid playback speed is kept", () => eq(setPlaybackSpeed(emptyState(), 1.5).profile.playbackSpeed, 1.5));
test("profile", "captions toggle", () => eq(setCaptions(emptyState(), false).profile.captions, false));

// ---------------------------------------------------------------- migration
test("migration", "garbage migrates to empty state", () => eq(migrate(null, 1).attempts.length, 0));
test("migration", "partial old data keeps attempts and fills profile", () => {
  const old = { attempts: [{ id: "a1" }], nextId: 2 } as unknown;
  const m = migrate(old, 1);
  eq(m.attempts.length, 1);
  eq(m.profile.playbackSpeed, 1);
  eq(m.nextId, 2);
});

// ---------------------------------------------------------------- persistence
test("persistence", "sim state survives serialize → deserialize", () => {
  let s = sim.init();
  for (const a of sim.actions(s).slice(0, 4)) s = sim.apply(s, a);
  eq(sim.deserialize(sim.serialize(s)), s);
});
test("persistence", "no invariant violations after a scored attempt", () => {
  let s = sim.init();
  s = sim.apply(s, { t: "answer", task: "interview" });
  eq(sim.invariants(s), []);
});

const failures = results.filter((r) => !r.ok).map((r) => `${r.name}: ${r.why}`);
for (const r of results) console.error(`${r.ok ? "PASS" : "FAIL"} ${r.name}${r.why ? ` — ${r.why}` : ""}`);
console.log(JSON.stringify({ tests: results.length, passed: results.length - failures.length, failures, features: [...features] }));
process.exit(failures.length ? 1 : 0);
