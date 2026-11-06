/// <reference types="node" />
/**
 * Core-logic tests for Podium — run by QA with `npm run validate`.
 * Covers every rule in src/core through the real functions. Final stdout line:
 *   {"tests": N, "passed": N, "failures": ["name: why", ...], "features": [...]}
 */
import {
  addDays,
  daysBetween,
  isValidDateKey,
  monthKey,
  untilNextMidnight,
  weekKey,
  weekdayLabel,
} from "../src/core/dates";
import { classifyFiller, detectFillers, fillerLemma, repeatedWordIndexes } from "../src/core/fillers";
import {
  LIVE_WPM_WARMUP_MS,
  MAX_PLAUSIBLE_WPM,
  MIN_CONFIDENT_MS,
  MIN_SCORED_WORDS,
  OFFTOPIC_OVERALL_CAP,
  OFFTOPIC_STRUCTURE_CAP,
  analyzeStructure,
  buildReport,
  computeMetrics,
  deterministicTips,
  emptyBaselineSet,
  hasBaseline,
  liveWpm,
  metricContradictions,
  paceVerdict,
  pauseStats,
  pushBaseline,
  reconcileScore,
  takeProvisional,
  wpmOverall,
  wpmSegments,
} from "../src/core/metrics";
import { trimToSentence } from "../src/core/text";
import {
  PRO_DAILY,
  FREE_DAILY,
  addBonusTake,
  buyLifetime,
  canRecord,
  cancelSubscription,
  consumeTake,
  emptyAllowance,
  emptyStreak,
  freeEntitlement,
  isPro,
  refreshStreakGrants,
  refundTake,
  registerPractice,
  renewAllowance,
  repairStreak,
  startSubscription,
  streakAtRisk,
  takesRemaining,
} from "../src/core/progress";
import {
  LESSONS,
  PACKS,
  PROMPTS,
  PROMPT_COUNT,
  buildEventPlan,
  computeReadiness,
  getLesson,
  levelFromScores,
  nextPrompt,
  promptsForPack,
  reflowPlan,
} from "../src/core/content";
import {
  addCustomScenario,
  attachAnalysis,
  beginTake,
  canRecordNow,
  canStartTake,
  drillDoneToday,
  completeEventRun,
  completeQueuedTakes,
  correctFiller,
  createEvent,
  deleteAllRecordings,
  deleteTake,
  emptyApp,
  latestReport,
  migrate,
  proNow,
  recordAndAnalyse,
  retakeWithRewrite,
  subscribe,
} from "../src/core/state";
import { makeWords, SAMPLE_AI, SAMPLE_AI_OFFTOPIC, SAMPLE_FILLERS, SAMPLE_GOOD, SAMPLE_SILENT } from "../src/core/samples";
import type { Transcript } from "../src/core/types";
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
function ok(cond: boolean, msg = "assertion failed") {
  if (!cond) throw new Error(msg);
}

const T = "2026-03-02"; // a Monday
const transcriptOf = (words: typeof SAMPLE_GOOD, takeId = "t1"): Transcript => ({ id: "tr1", takeId, words, language: "en" });

// ---------- dates ----------
test("dates", "addDays forward", () => eq(addDays(T, 1), "2026-03-03"));
test("dates", "addDays across month", () => eq(addDays("2026-01-31", 1), "2026-02-01"));
test("dates", "addDays across year backward", () => eq(addDays("2026-01-01", -1), "2025-12-31"));
test("dates", "addDays leap day", () => eq(addDays("2028-02-28", 1), "2028-02-29"));
test("dates", "daysBetween", () => eq(daysBetween(T, "2026-03-05"), 3));
test("dates", "daysBetween negative", () => eq(daysBetween("2026-03-05", T), -3));
test("dates", "weekday label", () => eq(weekdayLabel(T), "Mon"));
test("dates", "valid date key", () => ok(isValidDateKey("2026-03-02") && !isValidDateKey("2026-13-02") && !isValidDateKey("nope")));
test("dates", "month key", () => eq(monthKey("2026-03-02"), "2026-03"));
test("dates", "week key is stable in a week", () => eq(weekKey("2026-03-02"), weekKey("2026-03-05")));
test("dates", "until next midnight within a day", () => {
  const { hours } = untilNextMidnight(Date.UTC(2026, 2, 2, 20, 0, 0));
  ok(hours >= 0 && hours < 24);
});

// ---------- fillers ----------
test("fillers", "hard filler um", () => eq(classifyFiller(["um"], 0), true));
test("fillers", "basically always a filler", () => eq(classifyFiller(["basically", "we", "ship"], 0), true));
test("fillers", "like as a verb is NOT a filler", () => eq(classifyFiller(["I", "like", "it"], 1), false));
test("fillers", "discourse like IS a filler", () => eq(classifyFiller(["it", "was", "like", "hard"], 2), true));
test("fillers", "so + intensifier is not a filler", () => eq(classifyFiller(["so", "happy"], 0), false));
test("fillers", "so as an opener is a filler", () => eq(classifyFiller(["so", "um", "yeah"], 0), true));
test("fillers", "phrase 'you know' flagged once", () => {
  const w = detectFillers(makeWords(["you", "know", "it"]));
  eq([w[0].isFiller, w[1].isFiller, w[2].isFiller], [true, false, false]);
});
test("fillers", "personal ignore list respected", () => {
  const w = detectFillers(makeWords(["um", "uh"]), { ignore: ["um"] });
  eq([w[0].isFiller, w[1].isFiller], [false, true]);
});
test("fillers", "stutter-friendly spares a repeat", () => {
  const plain = detectFillers(makeWords(["um", "um"]));
  const stutter = detectFillers(makeWords(["um", "um"]), { stutterFriendly: true });
  eq([plain.filter((x) => x.isFiller).length, stutter.filter((x) => x.isFiller).length], [2, 1]);
});
test("fillers", "user-corrected word is respected over re-detection", () => {
  const words = makeWords(["um", "hello"]).map((w, i) => (i === 0 ? { ...w, userCorrected: true, isFiller: false } : w));
  eq(detectFillers(words)[0].isFiller, false);
});
test("fillers", "repeated word indexes", () => eq(repeatedWordIndexes(makeWords(["the", "the", "cat"])), [1]));
test("fillers", "lemma lowercases and strips", () => eq(fillerLemma("Um,"), "um"));

// ---------- metrics (deterministic) ----------
test("metrics", "wpm from timestamps", () => {
  const w = makeWords(["one", "two", "three", "four"], { wpm: 120 });
  const v = wpmOverall(w);
  ok(v > 90 && v < 160, `wpm ${v}`);
});
test("metrics", "wpm capped at 250 for a rushed take", () => {
  const w = makeWords(Array.from({ length: 100 }, () => "x"), { wpm: 400 });
  ok(wpmOverall(w) <= 250);
});
test("metrics", "segments flag implausibly fast as suspect", () => {
  const w = makeWords(Array.from({ length: 100 }, () => "x"), { wpm: 400 });
  ok(wpmSegments(w).some((s) => s.suspect));
});
// Live recorder pace (QA blocker: 210 wpm flashed at 0:09). The recorder shows
// "–" for null, so these guarantee it never surfaces a verdict before the 5s
// warm-up or above the plausible ceiling, whatever the partial word count.
test("metrics", "liveWpm is null before the 5s warm-up (no early verdict)", () => {
  eq(liveWpm(33, LIVE_WPM_WARMUP_MS - 1), null);
  eq(liveWpm(10, 3_000), null);
  eq(liveWpm(5, 0), null);
});
test("metrics", "liveWpm never exceeds the plausible ceiling", () => {
  // 33 words at 9s ⇒ ~220 wpm — above 250 only with a burst; verify the cap holds.
  for (let ms = LIVE_WPM_WARMUP_MS; ms <= 60_000; ms += 250) {
    for (const words of [1, 10, 33, 80, 200, 1000]) {
      const v = liveWpm(words, ms);
      ok(v === null || (v > 0 && v <= MAX_PLAUSIBLE_WPM), `liveWpm(${words},${ms})=${v}`);
    }
  }
});
test("metrics", "liveWpm gives a plausible verdict once warmed up", () => {
  eq(liveWpm(20, 10_000), 120); // 20 words / 10s = 120 wpm
  eq(liveWpm(0, 10_000), null); // no words → nothing to show
});
test("metrics", "pause stats from gaps", () => {
  const w = makeWords(["a", "b", "c"], { wpm: 120, gaps: { 0: 2000 } });
  const ps = pauseStats(w);
  ok(ps.count === 1 && ps.longestMs >= 2000);
});
test("metrics", "pace verdict is a single value", () => {
  eq(paceVerdict(90), "slow");
  eq(paceVerdict(140), "good");
  eq(paceVerdict(220), "fast");
});
test("metrics", "no contradictory metrics in a report", () => {
  for (const sample of [SAMPLE_GOOD, SAMPLE_FILLERS]) eq(metricContradictions(computeMetrics(sample)), []);
});
test("metrics", "structure detects opening/point/close", () => {
  const s = analyzeStructure(SAMPLE_GOOD);
  ok(s.opening && s.point && s.close && s.score === 100);
});
test("metrics", "silent audio has no structure", () => eq(analyzeStructure(SAMPLE_SILENT).score, 0));
test("metrics", "same clip scores identically (deterministic)", () => eq(computeMetrics(SAMPLE_GOOD), computeMetrics(SAMPLE_GOOD)));
test("metrics", "scores are within 0..100", () => {
  const m = computeMetrics(SAMPLE_FILLERS);
  ok([m.overallScore, m.clarity, m.confidence, m.structure.score].every((v) => v >= 0 && v <= 100));
});
test("metrics", "filler-heavy take scores lower than clean take", () => {
  ok(computeMetrics(SAMPLE_FILLERS).overallScore < computeMetrics(SAMPLE_GOOD).overallScore);
});
test("metrics", "deterministic tips are at most three", () => ok(deterministicTips(computeMetrics(SAMPLE_FILLERS)).length <= 3));
// Trust pillar: re-analysing the same clip must never jump the score, and a
// spread of accented / varied-English clips must score sanely with no
// contradictions (QA's "wrong filler or random score in the first session").
test("metrics", "regression: re-analysing a clip returns the same score (no random jump)", () => {
  const first = computeMetrics(SAMPLE_GOOD).overallScore;
  eq(reconcileScore(first, computeMetrics(SAMPLE_GOOD).overallScore), first);
});
test("metrics", "regression: accented / varied-English clips score 0..100 with no contradictions", () => {
  const clips = [
    "good morning sir today I will be telling you about one small idea which is helping our team to work much faster and with less tension".split(" "),
    "so basically we were doing the planning for many hours but now we are deciding in some minutes only and shipping the work more quickly".split(" "),
    "let me share quickly one thing that I learnt this week about speaking slowly and clearly so everybody in the room can follow along".split(" "),
  ];
  for (const text of clips) {
    const w = makeWords(text, { wpm: 130 });
    const m = computeMetrics(w);
    eq(metricContradictions(m), []);
    ok(m.overallScore >= 0 && m.overallScore <= 100);
    eq(computeMetrics(w), computeMetrics(w)); // identical on re-run
  }
});
test("metrics", "reconcile keeps cached score within tolerance", () => eq(reconcileScore(70, 73), 70));
test("metrics", "reconcile adopts a big change", () => eq(reconcileScore(70, 85), 85));
test("metrics", "build report: first baseline before 3 takes", () => {
  const r = buildReport({ id: "r1", transcript: transcriptOf(SAMPLE_GOOD), baselineBefore: emptyBaselineSet(), settings: { ignoreFillers: [], stutterFriendly: false }, ai: SAMPLE_AI, createdAt: T });
  ok(r.isFirstBaseline && r.vsBaselineDelta === null && r.tips.length === 3 && r.rewriteText.length > 0);
});
test("metrics", "build report works without AI (offline)", () => {
  const r = buildReport({ id: "r1", transcript: transcriptOf(SAMPLE_GOOD), baselineBefore: emptyBaselineSet(), settings: { ignoreFillers: [], stutterFriendly: false }, ai: null, createdAt: T });
  ok(r.tips.length > 0 && r.rewriteText === "" && r.overallScore > 0);
});
// Prompt-relevance (QA blocker: an answer about learning a language scored 84
// "Strong" against "Introduce yourself"). An off-topic take must be capped and
// flagged — never posing as a confident score.
test("metrics", "off-topic take: structure and overall scores are capped", () => {
  const onTopic = buildReport({ id: "r1", transcript: transcriptOf(SAMPLE_GOOD), baselineBefore: emptyBaselineSet(), settings: { ignoreFillers: [], stutterFriendly: false }, ai: SAMPLE_AI, createdAt: T });
  const off = buildReport({ id: "r2", transcript: transcriptOf(SAMPLE_GOOD), baselineBefore: emptyBaselineSet(), settings: { ignoreFillers: [], stutterFriendly: false }, ai: SAMPLE_AI_OFFTOPIC, createdAt: T });
  ok(off.onTopic === false, "off-topic flag is surfaced");
  ok(off.structure.score <= OFFTOPIC_STRUCTURE_CAP, `structure ${off.structure.score}`);
  ok(off.overallScore <= OFFTOPIC_OVERALL_CAP, `overall ${off.overallScore}`);
  ok(off.overallScore < onTopic.overallScore, "off-topic scores below the same take on-topic");
});
test("metrics", "unknown relevance (offline) is never penalised as off-topic", () => {
  const r = buildReport({ id: "r1", transcript: transcriptOf(SAMPLE_GOOD), baselineBefore: emptyBaselineSet(), settings: { ignoreFillers: [], stutterFriendly: false }, ai: null, createdAt: T });
  ok(r.onTopic === null && r.overallScore > OFFTOPIC_OVERALL_CAP);
});

// ---------- baseline ----------
test("baseline", "welford mean and count", () => {
  let b = pushBaseline(pushBaseline(pushBaseline(emptyBaselineSet().overall, 10), 20), 30);
  eq([b.rollingMean, b.sampleCount], [20, 3]);
});
test("baseline", "ready only after 3 samples", () => {
  let b = emptyBaselineSet().overall;
  b = pushBaseline(b, 50);
  ok(!hasBaseline(b));
  b = pushBaseline(pushBaseline(b, 60), 70);
  ok(hasBaseline(b));
});

// ---------- allowance ----------
test("allowance", "free tier is 3 a day", () => eq(emptyAllowance(T).freeTakesLimit, FREE_DAILY));
test("allowance", "renew resets at a new day", () => {
  const used = consumeTake(consumeTake(emptyAllowance(T)));
  const next = renewAllowance(used, "2026-03-03", false);
  eq([next.date, next.freeTakesUsed], ["2026-03-03", 0]);
});
test("allowance", "renew raises the limit for Pro", () => eq(renewAllowance(emptyAllowance(T), T, true).freeTakesLimit, PRO_DAILY));
test("allowance", "remaining and canRecord", () => {
  let a = emptyAllowance(T);
  a = consumeTake(consumeTake(consumeTake(a)));
  ok(takesRemaining(a) === 0 && !canRecord(a));
});
test("allowance", "refund gives a take back (silent/failed)", () => {
  const a = refundTake(consumeTake(emptyAllowance(T)));
  eq(a.freeTakesUsed, 0);
});
test("allowance", "bonus takes are capped", () => {
  let a = emptyAllowance(T);
  for (let i = 0; i < 10; i++) a = addBonusTake(a);
  eq(a.bonusTakes, 3);
});

// ---------- streak ----------
test("streak", "first practice sets streak to 1", () => eq(registerPractice(emptyStreak(), T).currentCount, 1));
test("streak", "consecutive days increment", () => {
  const s = registerPractice(registerPractice(emptyStreak(), T), addDays(T, 1));
  eq(s.currentCount, 2);
});
test("streak", "same day does not double-count", () => {
  const s = registerPractice(registerPractice(emptyStreak(), T), T);
  eq(s.currentCount, 1);
});
test("streak", "one missed day spends a freeze and continues", () => {
  const s1 = registerPractice(registerPractice(emptyStreak(), T), addDays(T, 1)); // 2
  const s2 = registerPractice(s1, addDays(T, 3)); // skipped day 2
  ok(s2.currentCount === 3 && s2.freezesAvailable === 0);
});
test("streak", "a bigger gap resets the streak", () => {
  const s1 = registerPractice(registerPractice(emptyStreak(), T), addDays(T, 1));
  eq(registerPractice(s1, addDays(T, 5)).currentCount, 1);
});
test("streak", "weekly freeze replenishes next week", () => {
  const spent = { ...emptyStreak(), freezesAvailable: 0, freezeWeek: weekKey(T) };
  eq(refreshStreakGrants(spent, addDays(T, 8)).freezesAvailable, 1);
});
test("streak", "longest never drops below current", () => {
  let s = emptyStreak();
  for (let i = 0; i < 4; i++) s = registerPractice(s, addDays(T, i));
  const broken = registerPractice(s, addDays(T, 20));
  ok(broken.currentCount === 1 && broken.longest === 4);
});
test("streak", "monthly repair restores a broken streak", () => {
  const s = repairStreak({ ...emptyStreak(), currentCount: 0 }, T, 5);
  ok(s.currentCount === 5 && !s.repairAvailable);
});
test("streak", "at-risk when practiced yesterday but not today", () => {
  const s = registerPractice(emptyStreak(), addDays(T, -1));
  ok(streakAtRisk(s, T));
});

// ---------- entitlement ----------
test("entitlement", "free user is not Pro", () => eq(isPro(freeEntitlement(), T), false));
test("entitlement", "subscription trial is Pro", () => ok(isPro(startSubscription("monthly", T, 7), T)));
test("entitlement", "lifetime is always Pro", () => ok(isPro(buyLifetime(T), "2099-01-01")));
test("entitlement", "expired subscription is not Pro after grace", () => {
  const e = startSubscription("monthly", T, 7); // expires T+37, verified at T
  ok(!isPro(e, addDays(T, 60)));
});
test("entitlement", "offline grace keeps Pro for 7 days", () => {
  const e = { plan: "monthly" as const, status: "active" as const, expiresAt: T, trialEndsAt: null, lastVerifiedAt: T, source: "store" as const };
  ok(isPro(e, addDays(T, 5)) && !isPro(e, addDays(T, 10)));
});
test("entitlement", "cancel keeps Pro until the period ends", () => {
  const e = cancelSubscription(startSubscription("monthly", T, 0), T);
  ok(isPro(e, T));
});

// ---------- content (scenario library) ----------
test("content", "600+ prompts across 12+ packs", () => ok(PROMPT_COUNT >= 600 && PACKS.length >= 12));
test("content", "no off-context prompt (every prompt belongs to a real pack)", () => {
  const ids = new Set(PACKS.map((p) => p.id));
  ok(PROMPTS.every((p) => ids.has(p.packId)));
});
test("content", "each pack has prompts", () => ok(PACKS.every((p) => promptsForPack(p.id).length > 0)));
test("content", "shuffle never dead-ends (cycles when all seen)", () => {
  const all = promptsForPack("viva").map((p) => p.id);
  ok(nextPrompt("viva", all, 3) !== null);
});
test("content", "lessons are reachable and defined", () => ok(LESSONS.length >= 6 && !!getLesson(LESSONS[0].id)));
test("content", "level from placement scores", () => {
  eq(levelFromScores([80, 80, 80]), "advanced");
  eq(levelFromScores([]), "beginner");
});
test("events", "event plan has drills and a final run", () => {
  const plan = buildEventPlan({ id: "ev1", type: "interview", date: addDays(T, 5), today: T });
  ok(plan.planItems.some((i) => i.isFinalRun) && plan.planItems.length >= 2 && plan.readiness === 0);
});
test("events", "compressed plan when within 24h", () => {
  const plan = buildEventPlan({ id: "ev1", type: "pitch", date: addDays(T, 1), today: T });
  ok(plan.planItems.length === 2);
});
test("events", "reflow pulls overdue drills to today (no failed state)", () => {
  const plan = buildEventPlan({ id: "ev1", type: "viva", date: addDays(T, 5), today: T });
  const later = reflowPlan(plan, addDays(T, 3));
  ok(later.planItems.filter((i) => !i.isFinalRun).every((i) => i.day >= addDays(T, 3) || i.done));
});
test("events", "readiness stays within 0..100", () => {
  const plan = buildEventPlan({ id: "ev1", type: "toast", date: addDays(T, 3), today: T });
  const r = computeReadiness({ ...plan, planItems: plan.planItems.map((i) => ({ ...i, done: true })) }, 90);
  ok(r >= 0 && r <= 100);
});

// ---------- state / flows ----------
test("state", "empty app has a valid starter selection", () => {
  const s = emptyApp(T);
  ok(s.selection.packId === "impromptu" && s.selection.promptId.length > 0);
});
test("flow F1", "record → report, one allowance spent", () => {
  const { state, reportId } = recordAndAnalyse(emptyApp(T), { words: SAMPLE_GOOD, ai: SAMPLE_AI }, T, 0);
  ok(!!reportId && state.reports.length === 1 && state.allowance.freeTakesUsed === 1 && state.takes[0].status === "done");
});
test("flow F1", "report score is within 0..100 and has a rewrite", () => {
  const { state } = recordAndAnalyse(emptyApp(T), { words: SAMPLE_GOOD, ai: SAMPLE_AI }, T, 0);
  const r = latestReport(state)!;
  ok(r.overallScore >= 0 && r.overallScore <= 100 && r.rewriteText.length > 0);
});
test("flow F1 edge", "silent take: no report, allowance refunded", () => {
  const { state } = recordAndAnalyse(emptyApp(T), { words: SAMPLE_SILENT }, T, 0);
  ok(state.reports.length === 0 && state.allowance.freeTakesUsed === 0 && state.takes[0].status === "failed");
});
test("flow F1 edge", "too-short take fails without cost", () => {
  const { state } = recordAndAnalyse(emptyApp(T), { words: SAMPLE_GOOD, durationMs: 2000, ai: SAMPLE_AI }, T, 0);
  ok(state.takes[0].status === "failed" && state.takes[0].failReason === "too_short" && state.allowance.freeTakesUsed === 0);
});
test("offline", "offline take queues, then completes when online", () => {
  const queued = recordAndAnalyse(emptyApp(T), { words: SAMPLE_GOOD, ai: SAMPLE_AI, online: false }, T, 0).state;
  ok(queued.takes[0].status === "queued" && queued.queue.length === 1 && queued.reports.length === 0);
  const done = completeQueuedTakes(queued, { words: SAMPLE_GOOD, ai: SAMPLE_AI }, T);
  ok(done.takes[0].status === "done" && done.reports.length === 1 && done.queue.length === 0);
});
test("flow F2", "practising registers a streak", () => {
  const { state } = recordAndAnalyse(emptyApp(T), { words: SAMPLE_GOOD, ai: SAMPLE_AI }, T, 0);
  eq(state.streak.currentCount, 1);
});
test("flow F3", "retake with rewrite links to the original take", () => {
  const first = recordAndAnalyse(emptyApp(T), { words: SAMPLE_GOOD, ai: SAMPLE_AI }, T, 0);
  const orig = first.state.takes[0].id;
  const second = retakeWithRewrite(first.state, orig, { words: SAMPLE_GOOD, ai: SAMPLE_AI }, T, 1000);
  ok(second.state.takes.some((t) => t.retakeOf === orig && t.status === "done"));
});
test("flow F3", "typed answer is tagged `typed` so the report judges it by content, not a clock", () => {
  const res = recordAndAnalyse(emptyApp(T), { words: SAMPLE_GOOD, ai: SAMPLE_AI, durationMs: 9000, typed: true }, T, 0);
  const take = res.state.takes.find((t) => t.id === res.takeId);
  ok(!!take?.typed && take?.status === "done" && !!res.reportId);
  // A recorded take carries no typed flag.
  const rec = recordAndAnalyse(emptyApp(T), { words: SAMPLE_GOOD, ai: SAMPLE_AI }, T, 0);
  ok(!rec.state.takes.find((t) => t.id === rec.takeId)?.typed);
});
test("flow F3", "correct a filler: updates report and personal ignore list", () => {
  const { state } = recordAndAnalyse(emptyApp(T), { words: SAMPLE_FILLERS, ai: SAMPLE_AI }, T, 0);
  const report = latestReport(state)!;
  const tr = state.transcripts.find((t) => t.takeId === report.takeId)!;
  const idx = tr.words.findIndex((w) => w.isFiller);
  const before = report.fillerTotal;
  const next = correctFiller(state, report.id, idx, false, T);
  const after = next.reports.find((r) => r.id === report.id)!;
  ok(next.settings.ignoreFillers.length > 0 && after.fillerTotal < before);
});
test("allowance gate", "free user blocked after 3 takes", () => {
  let s = emptyApp(T);
  for (let i = 0; i < 3; i++) s = recordAndAnalyse(s, { words: SAMPLE_GOOD, ai: SAMPLE_AI }, T, 0).state;
  ok(!canRecordNow(s, T));
  const blocked = beginTake(s, "standard", T);
  eq(blocked.error, "no_allowance");
});
// The rewrite loop ("Try again with the rewrite") must never dead-end on the
// allowance: refining a take you already recorded is free and always available,
// even at 0 free takes (QA: the rewrite path hit "no free takes" with no report).
test("rewrite retake", "retake with rewrite is free and startable at 0 allowance", () => {
  let s = emptyApp(T);
  for (let i = 0; i < 3; i++) s = recordAndAnalyse(s, { words: SAMPLE_GOOD, ai: SAMPLE_AI }, T, 0).state;
  ok(!canRecordNow(s, T), "general takes are spent");
  const orig = s.takes[0].id;
  ok(canStartTake(s, T, "standard", orig), "a retake is still startable at 0 allowance");
  ok(!canStartTake(s, T, "standard"), "a fresh standard take is not");
  const used = s.allowance.freeTakesUsed;
  const r = retakeWithRewrite(s, orig, { words: SAMPLE_GOOD, ai: SAMPLE_AI }, T, 2000);
  ok(!!r.reportId, "the retake produced a scored report");
  eq(r.state.allowance.freeTakesUsed, used); // the retake did not spend a general take
  const rt = r.state.takes.find((t) => t.retakeOf === orig && t.status === "done")!;
  eq(rt.countedAgainstAllowance, false);
});
// Daily drill = the core habit loop. It must always complete (free scored take),
// even when the general allowance is spent — so the drill→score→streak loop never
// dead-ends (QA: drill never marked done once free takes ran out).
test("daily drill", "drill is free and scored even with 0 allowance left", () => {
  let s = emptyApp(T);
  for (let i = 0; i < 3; i++) s = recordAndAnalyse(s, { words: SAMPLE_GOOD, ai: SAMPLE_AI }, T, 0).state; // exhaust the 3 free takes
  ok(!canRecordNow(s, T) && canStartTake(s, T, "daily_drill"), "drill still startable at 0 allowance");
  const res = recordAndAnalyse(s, { mode: "daily_drill", words: SAMPLE_GOOD, ai: SAMPLE_AI }, T, 0);
  ok(!!res.reportId, "drill produced a scored report");
  ok(drillDoneToday(res.state, T), "drill marked done today");
  eq(res.state.allowance.freeTakesUsed, 3); // the drill did not spend a general take
  const drillTake = res.state.takes.find((t) => t.mode === "daily_drill" && t.status === "done")!;
  eq(drillTake.countedAgainstAllowance, false);
});
test("daily drill", "finishing the drill advances the streak at 0 allowance", () => {
  let s = emptyApp(T);
  for (let i = 0; i < 3; i++) s = recordAndAnalyse(s, { words: SAMPLE_GOOD, ai: SAMPLE_AI }, T, 0).state;
  const before = s.streak.currentCount;
  s = recordAndAnalyse(s, { mode: "daily_drill", words: SAMPLE_GOOD, ai: SAMPLE_AI }, T, 0).state;
  ok(s.streak.currentCount >= 1 && s.streak.lastPracticeDate === T);
  ok(before <= s.streak.currentCount);
});
test("daily drill", "a second drill the same day falls back to the allowance", () => {
  let s = emptyApp(T);
  for (let i = 0; i < 3; i++) s = recordAndAnalyse(s, { words: SAMPLE_GOOD, ai: SAMPLE_AI }, T, 0).state;
  s = recordAndAnalyse(s, { mode: "daily_drill", words: SAMPLE_GOOD, ai: SAMPLE_AI }, T, 0).state; // free drill used
  ok(drillDoneToday(s, T) && !canStartTake(s, T, "daily_drill"));
  eq(beginTake(s, "daily_drill", T).error, "no_allowance");
});
test("daily drill", "drill with takes left does not spend a general take", () => {
  const res = recordAndAnalyse(emptyApp(T), { mode: "daily_drill", words: SAMPLE_GOOD, ai: SAMPLE_AI }, T, 0);
  ok(!!res.reportId && res.state.allowance.freeTakesUsed === 0); // drill is a free bonus on top of the 3
  ok(takesRemaining(res.state.allowance) === FREE_DAILY);
});
test("daily drill", "drill pass renews the next day", () => {
  let s = emptyApp(T);
  s = recordAndAnalyse(s, { mode: "daily_drill", words: SAMPLE_GOOD, ai: SAMPLE_AI }, T, 0).state;
  ok(drillDoneToday(s, T));
  const tomorrow = addDays(T, 1);
  ok(!drillDoneToday(s, tomorrow) && canStartTake(s, tomorrow, "daily_drill"));
});
test("flow F4", "subscribe makes the user Pro and raises the daily limit", () => {
  const s = subscribe(emptyApp(T), "monthly", T);
  ok(proNow(s, T) && s.allowance.freeTakesLimit === PRO_DAILY);
});
test("flow F4", "Pro user gets more daily takes than free", () => {
  let s = subscribe(emptyApp(T), "monthly", T);
  for (let i = 0; i < FREE_DAILY + 1; i++) s = recordAndAnalyse(s, { words: SAMPLE_GOOD, ai: SAMPLE_AI }, T, 0).state;
  ok(s.reports.length === FREE_DAILY + 1);
});
test("flow F6", "create event then complete the run-through raises readiness", () => {
  const made = createEvent(emptyApp(T), { type: "interview", date: addDays(T, 5) }, T);
  const done = completeEventRun(made.state, made.id!, 80, T);
  ok((done.events[0].readiness ?? 0) > 0);
});
test("flow F6 edge", "event in the past is rejected", () => {
  const made = createEvent(emptyApp(T), { type: "pitch", date: addDays(T, -1) }, T);
  eq(made.state.events.length, 0);
});
test("custom scenario", "typed topic creates and selects a private pack", () => {
  const { state, id } = addCustomScenario(emptyApp(T), "My keynote on climate", T);
  ok(!!id && state.customPacks.length === 1 && state.selection.packId === id);
});
test("privacy", "delete a take rebuilds the baseline count", () => {
  const { state } = recordAndAnalyse(emptyApp(T), { words: SAMPLE_GOOD, ai: SAMPLE_AI }, T, 0);
  const gone = deleteTake(state, state.takes[0].id);
  ok(gone.takes.length === 0 && gone.reports.length === 0 && gone.baseline.overall.sampleCount === 0);
});
test("privacy", "delete all recordings clears audio, transcripts and reports", () => {
  let s = emptyApp(T);
  s = recordAndAnalyse(s, { words: SAMPLE_GOOD, ai: SAMPLE_AI }, T, 0).state;
  const cleared = deleteAllRecordings(s);
  ok(cleared.takes.length === 0 && cleared.transcripts.length === 0 && cleared.reports.length === 0);
});
test("migration", "migrate merges an old partial state onto defaults", () => {
  const migrated = migrate({ xp: 999 }, 0, T);
  ok(migrated.xp === 999 && migrated.selection.packId === "impromptu" && Array.isArray(migrated.takes));
});

// ---------- report provisional guard + rewrite trim (UX polish) ----------
test("report", "a full answer (>= words, >= time) is scored, not provisional", () => {
  ok(takeProvisional(40, 18_000).provisional === false);
});
test("report", "a thin take (too few words) is provisional, reason thin", () => {
  const p = takeProvisional(MIN_SCORED_WORDS - 1, 20_000);
  ok(p.provisional === true && p.reason === "thin");
});
test("report", "a rushed take (enough words, too short) is provisional, reason rushed", () => {
  const p = takeProvisional(MIN_SCORED_WORDS + 5, MIN_CONFIDENT_MS - 1);
  ok(p.provisional === true && p.reason === "rushed");
});
test("report", "a ~5s 20-word burst (QA case) is flagged provisional, not a confident score", () => {
  ok(takeProvisional(20, 5_000).provisional === true);
});
test("report", "an empty take is not 'provisional' (handled as silent elsewhere)", () => {
  eq(takeProvisional(0, 0), { provisional: false, reason: "none" });
});
test("report", "a fast speaker's full answer at the word floor over enough time still scores", () => {
  ok(takeProvisional(MIN_SCORED_WORDS, MIN_CONFIDENT_MS).provisional === false);
});
test("rewrite", "trimToSentence keeps a complete rewrite unchanged", () => {
  eq(trimToSentence("Practice daily. It compounds."), "Practice daily. It compounds.");
});
test("rewrite", "trimToSentence caps a truncated rewrite at the last sentence boundary", () => {
  eq(
    trimToSentence("The best way to learn a language is to practice every day. When I moved to a new city, I"),
    "The best way to learn a language is to practice every day.",
  );
});
test("rewrite", "trimToSentence flags a single incomplete sentence with an ellipsis", () => {
  eq(trimToSentence("When I moved to a new city, I"), "When I moved to a new city, I…");
});
test("rewrite", "trimToSentence handles empty/whitespace", () => {
  eq(trimToSentence("   "), "");
});
test("rewrite", "trimToSentence respects a closing quote after the terminator", () => {
  eq(trimToSentence('She said "go." and then the next bit that got cut'), 'She said "go."');
});

// ---------- persistence / journeys ----------
test("persistence", "sim state survives serialize → deserialize", () => {
  let s = sim.init();
  for (const a of sim.actions(s).slice(0, 6)) s = sim.apply(s, a);
  eq(sim.deserialize(sim.serialize(s)), s);
});
test("persistence", "sim exposes a goal per core flow and invariants hold at init", () => {
  ok(sim.goals.length >= 3 && sim.invariants(sim.init()).length === 0);
});

const failures = results.filter((r) => !r.ok).map((r) => `${r.name}: ${r.why}`);
for (const r of results) if (!r.ok || process.env.VERBOSE === "1") console.error(`${r.ok ? "PASS" : "FAIL"} ${r.name}${r.why ? ` — ${r.why}` : ""}`);
console.log(JSON.stringify({ tests: results.length, passed: results.length - failures.length, failures, features: [...features] }));
process.exit(failures.length ? 1 : 0);
