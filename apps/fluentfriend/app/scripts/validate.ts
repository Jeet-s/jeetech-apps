/// <reference types="node" />
/**
 * Core-logic tests for Fluent Friend — run by the factory's QA with
 * `npm run validate`. Every rule in src/core is exercised through the real
 * functions. Final stdout line MUST be JSON:
 *   {"tests": N, "passed": N, "failures": [...], "features": [...]}
 */
import {
  addDays,
  daysBetween,
  weekdayLabel,
  parseTime,
  formatTime,
} from "../src/core/dates";
import { scorePlacement, skippedPlacement } from "../src/core/placement";
import { scoreSpeaking, scoreBand, PASS_SCORE } from "../src/core/speaking";
import { checkAnswer, gradeQuiz } from "../src/core/quiz";
import {
  FREE_AI_RUNS,
  PRO_AI_RUNS,
  emptyQuota,
  remaining,
  canUseAi,
  consumeRun,
  grantBonus,
  dailyLimit,
} from "../src/core/quota";
import { emptyStreak, recordActivity, streakAtRisk } from "../src/core/streak";
import { newMistake, dueMistakes, reviewMistake, masteredCount } from "../src/core/mistakes";
import { parseFeedback, parseReply, MAX_CORRECTIONS } from "../src/core/feedback";
import { searchPhrases, searchDictionary } from "../src/core/search";
import { auditContent, releaseReady, scenarioLevelCounts, CONTENT_FLOORS } from "../src/core/content";
import {
  displayStatus,
  courseProgress,
  completesCourse,
  markLessonDone,
  lockReasonBn,
} from "../src/core/courses";
import {
  emptyState,
  migrateState,
  applyPlacement,
  toggleFavorite,
  isFavorite,
  reportError,
  startDownload,
  finishDownload,
  packState,
  completeLesson,
  completeAiSession,
  applyReview,
  fluencyTrend,
  trendReady,
  grantRewardBonus,
  setReminder,
  disableReminder,
  markFirstPhrase,
} from "../src/core/state";
import { lessonsForCourse, getLesson, SCENARIOS, PHRASES, QUIZ_ITEMS, GRAMMAR, DRILLS, DICTIONARY, SCRIPTED, getReviewer, REVIEWERS } from "../src/core/catalog";
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

// ---------- Dates ----------
test("dates", "addDays forward", () => eq(addDays("2026-03-10", 1), "2026-03-11"));
test("dates", "addDays across month", () => eq(addDays("2026-01-31", 1), "2026-02-01"));
test("dates", "addDays across year backwards", () => eq(addDays("2026-01-01", -1), "2025-12-31"));
test("dates", "addDays leap day", () => eq(addDays("2028-02-28", 1), "2028-02-29"));
test("dates", "daysBetween", () => eq(daysBetween("2026-03-01", "2026-03-10"), 9));
test("dates", "daysBetween negative", () => eq(daysBetween("2026-03-10", "2026-03-01"), -9));
test("dates", "weekday label", () => eq(weekdayLabel("2026-03-10"), "Tue"));
test("dates", "parseTime valid", () => eq(parseTime("19:30"), 19 * 60 + 30));
test("dates", "parseTime rejects bad", () => eq(parseTime("25:00"), null));
test("dates", "formatTime roundtrips", () => eq(formatTime(parseTime("07:05")!), "07:05"));

// ---------- Placement ----------
test("placement", "two correct → B1", () => eq(scorePlacement({ goal: "job", probes: [true, true] }).level, "B1"));
test("placement", "one correct → A2", () => eq(scorePlacement({ goal: "study", probes: [true, false] }).level, "A2"));
test("placement", "none correct → A1", () => eq(scorePlacement({ goal: "daily", probes: [false, false] }).level, "A1"));
test("placement", "goal carried through", () => eq(scorePlacement({ goal: "job", probes: [] }).goal, "job"));
test("placement", "null goal defaults to daily", () => eq(scorePlacement({ goal: null, probes: [] }).goal, "daily"));
test("placement", "always starts day 1", () => eq(scorePlacement({ goal: "job", probes: [true, true] }).startDay, 1));
test("placement", "skipped defaults A1/daily", () => eq(skippedPlacement(), { level: "A1", goal: "daily", startDay: 1 }));

// ---------- Speaking ----------
test("speaking", "perfect match = 100 & passed", () => {
  const r = scoreSpeaking("My name is Rahul", "my name is rahul");
  eq([r.score, r.passed], [100, true]);
});
test("speaking", "missing word lowers score + tip", () => {
  const r = scoreSpeaking("I go to the market", "I go to market");
  ok(r.score < 100 && r.missed.includes("the") && !!r.tipBn, `got ${JSON.stringify(r)}`);
});
test("speaking", "ignores punctuation & case", () => eq(scoreSpeaking("How are you?", "how are you").score, 100));
test("speaking", "empty transcript scores 0", () => eq(scoreSpeaking("Hello there", "").score, 0));
test("speaking", "tolerates extra words", () => eq(scoreSpeaking("thank you", "um thank you so much").score, 100));
test("speaking", "pass threshold respected", () => ok(scoreSpeaking("one two three four five", "one two three").passed === (60 >= PASS_SCORE)));
// Trust fix (QA): copy/colour follow the band; celebration ONLY in the "great" band, never on a low score.
test("speaking", "exact match celebrates (great band)", () => {
  const r = scoreSpeaking("My name is Rahul", "my name is rahul");
  ok(r.band === "great" && r.celebrate === true, JSON.stringify(r));
});
test("speaking", "partial take never celebrates", () => {
  // 3/5 = 60 → passes (advances) but is NOT a celebration (band 'ok', amber).
  const r = scoreSpeaking("one two three four five", "one two three");
  ok(r.passed === true && r.celebrate === false && r.band === "ok", JSON.stringify(r));
});
test("speaking", "low score is retry band, no praise", () => {
  const r = scoreSpeaking("one two three four five", "one");
  ok(r.band === "retry" && r.celebrate === false && r.score < 50, JSON.stringify(r));
});
test("speaking", "band boundaries", () => eq([scoreBand(100), scoreBand(80), scoreBand(79), scoreBand(50), scoreBand(49)], ["great", "great", "ok", "ok", "retry"]));
// Trust fix (QA): the corrected transcript keeps the written case/punctuation (not a lowercase echo),
// and the single weakest word is flagged for highlighting.
test("speaking", "surface keeps original case", () => {
  const r = scoreSpeaking("My name is Rahul.", "my name is rahul");
  eq(r.words.map((w) => w.surface), ["My", "name", "is", "Rahul."]);
});
test("speaking", "weakest index points at first missed word", () => {
  const r = scoreSpeaking("I go to the market", "I go to market");
  ok(r.weakestIndex === 3 && r.words[3].ok === false, JSON.stringify(r));
});
test("speaking", "perfect match has no weakest word", () => eq(scoreSpeaking("How are you?", "how are you").weakestIndex, -1));
// QA feature_tour: a perfect take must STILL show a highlighted focus word + a Bangla tip (never a bare score).
test("speaking", "perfect take still has a focus word + Bangla tip", () => {
  const r = scoreSpeaking("My name is Rahul.", "my name is rahul");
  ok(r.focusIndex >= 0 && r.focusTone === "practice" && r.coachTipBn.length > 0, JSON.stringify(r));
});
test("speaking", "missed take coaches the missed word", () => {
  const r = scoreSpeaking("I go to the market", "I go to market");
  ok(r.focusTone === "error" && r.focusIndex === r.weakestIndex && r.coachTipBn.length > 0, JSON.stringify(r));
});

// ---------- Quiz ----------
test("quiz", "correct answer", () => {
  const q = QUIZ_ITEMS[0];
  eq(checkAnswer(q, q.answer).correct, true);
});
test("quiz", "wrong answer returns explanation + answer", () => {
  const q = QUIZ_ITEMS[0];
  const r = checkAnswer(q, "definitely wrong");
  eq([r.correct, r.answer === q.answer, r.explanationBn.length > 0], [false, true, true]);
});
test("quiz", "case/space insensitive", () => {
  const q = QUIZ_ITEMS[0];
  eq(checkAnswer(q, `  ${q.answer.toUpperCase()} `).correct, true);
});
test("quiz", "grade 4/5 = 80 passed", () => eq(gradeQuiz([true, true, true, true, false]), { total: 5, correct: 4, score: 80, passed: true }));
test("quiz", "grade 2/5 = 40 failed", () => eq(gradeQuiz([true, true, false, false, false]).passed, false));

// ---------- Quota ----------
test("quota", "free remaining starts at 8", () => eq(remaining(emptyQuota(T), T, false), FREE_AI_RUNS));
test("quota", "pro remaining starts at 53", () => eq(remaining(emptyQuota(T), T, true), PRO_AI_RUNS));
test("quota", "consume reduces remaining", () => eq(remaining(consumeRun(emptyQuota(T), T), T, false), FREE_AI_RUNS - 1));
test("quota", "exhausted blocks use", () => {
  let q = emptyQuota(T);
  for (let i = 0; i < FREE_AI_RUNS; i++) q = consumeRun(q, T);
  eq(canUseAi(q, T, false), false);
});
test("quota", "bonus adds runs", () => eq(remaining(grantBonus(emptyQuota(T), T), T, false), FREE_AI_RUNS + 3));
test("quota", "rolls over on a new day", () => {
  let q = emptyQuota(T);
  for (let i = 0; i < FREE_AI_RUNS; i++) q = consumeRun(q, T);
  eq(remaining(q, addDays(T, 1), false), FREE_AI_RUNS);
});
test("quota", "pro cap larger than free", () => ok(dailyLimit(true) > dailyLimit(false)));

// ---------- Streak ----------
test("streak", "first activity = 1", () => eq(recordActivity(emptyStreak(), T).current, 1));
test("streak", "same day no change", () => {
  const s = recordActivity(emptyStreak(), T);
  eq(recordActivity(s, T).current, 1);
});
test("streak", "consecutive days increment", () => {
  let s = recordActivity(emptyStreak(), T);
  s = recordActivity(s, addDays(T, 1));
  s = recordActivity(s, addDays(T, 2));
  eq(s.current, 3);
});
test("streak", "one skipped day forgiven by freeze", () => {
  let s = recordActivity(emptyStreak(), T); // day 0, freeze available
  s = recordActivity(s, addDays(T, 2)); // skipped day 1
  eq([s.current, s.freezeAvailable], [2, false]);
});
test("streak", "gap with no freeze resets", () => {
  let s = recordActivity(emptyStreak(), T);
  s = recordActivity(s, addDays(T, 2)); // uses freeze → 2
  s = recordActivity(s, addDays(T, 4)); // another gap, no freeze → reset
  eq(s.current, 1);
});
test("streak", "longest tracks best", () => {
  let s = recordActivity(emptyStreak(), T);
  s = recordActivity(s, addDays(T, 1));
  s = recordActivity(s, addDays(T, 5)); // reset to 1
  eq([s.current, s.longest], [1, 2]);
});
test("streak", "at risk when yesterday was last", () => {
  const s = recordActivity(emptyStreak(), T);
  eq(streakAtRisk(s, addDays(T, 1)), true);
});

// ---------- Mistakes ----------
test("mistakes", "new mistake due today, not mastered", () => {
  const m = newMistake("m1", "s1", "I goes", "I go", "x", T);
  eq([m.dueAt, m.mastered, m.correctCount], [T, false, 0]);
});
test("mistakes", "newly saved mistake shows up in the due list immediately", () => {
  const m = newMistake("m1", "s1", "a", "b", "x", T);
  eq(dueMistakes([m], T).length, 1);
});
test("mistakes", "due filter respects date + cap", () => {
  const ms = Array.from({ length: 12 }, (_, i) => newMistake(`m${i}`, "s", "a", "b", "x", addDays(T, -2)));
  eq(dueMistakes(ms, T).length, 10);
});
test("mistakes", "a reviewed (future-due) item is excluded until its next date", () => {
  const m = reviewMistake(newMistake("m1", "s", "a", "b", "x", T), true, T); // first correct → due T+3
  eq([m.dueAt, dueMistakes([m], T).length], [addDays(T, 3), 0]);
});
test("mistakes", "3 correct reviews master it", () => {
  let m = newMistake("m1", "s", "a", "b", "x", T);
  let day = T;
  for (let i = 0; i < 3; i++) {
    day = m.dueAt;
    m = reviewMistake(m, true, day);
  }
  eq([m.correctCount, m.mastered], [3, true]);
});
test("mistakes", "wrong review resets progress", () => {
  let m = newMistake("m1", "s", "a", "b", "x", T);
  m = reviewMistake(m, true, addDays(T, 1));
  m = reviewMistake(m, false, addDays(T, 4));
  eq([m.correctCount, m.mastered], [0, false]);
});
test("mistakes", "mastered count", () => {
  let m = newMistake("m1", "s", "a", "b", "x", T);
  for (let i = 0; i < 3; i++) m = reviewMistake(m, true, m.dueAt);
  eq(masteredCount([m]), 1);
});

// ---------- Feedback parsing ----------
test("feedback", "clamps scores 0..100", () => {
  const f = parseFeedback({ fluency: 250, clarity: -5, grammar: 50.6, pace: 80, corrections: [] });
  eq([f.fluency, f.clarity, f.grammar, f.pace], [100, 0, 51, 80]);
});
test("feedback", "caps corrections at 5 + drops empty", () => {
  const corr = Array.from({ length: 8 }, (_, i) => ({ original: `o${i}`, corrected: `c${i}`, explanationBn: "e" }));
  corr.push({ original: "x", corrected: "", explanationBn: "e" } as any);
  eq(parseFeedback({ corrections: corr }).corrections.length, MAX_CORRECTIONS);
});
test("feedback", "parses JSON string", () => eq(parseFeedback('{"fluency":60,"clarity":60,"grammar":60,"pace":60,"corrections":[]}').fluency, 60));
test("feedback", "garbage → safe zeros", () => eq(parseFeedback("not json").fluency, 0));
test("feedback", "reply parses suggestions (max 3)", () => {
  const r = parseReply({ reply: "Hello", hintBn: "বলুন", suggestions: ["a", "b", "c", "d"] });
  eq([r.reply, r.suggestions.length], ["Hello", 3]);
});
test("feedback", "reply default when empty", () => eq(parseReply({}).reply, "Okay."));

// ---------- Search ----------
test("search", "English query matches", () => ok(searchPhrases("name").some((p) => p.en.includes("name"))));
test("search", "Bangla query matches", () => ok(searchPhrases("দাম").length > 0));
test("search", "empty query returns all", () => eq(searchPhrases("").length, PHRASES.length));
test("search", "topic filter narrows", () => ok(searchPhrases("", "health").every((p) => p.topic === "health")));
test("search", "dictionary search", () => ok(searchDictionary("water").length > 0));
test("search", "no match returns empty", () => eq(searchPhrases("zzzzxyq").length, 0));

// ---------- Content audit ----------
test("content", "no structural problems", () => eq(auditContent().problems, []));
test("content", "every phrase reviewed", () => eq(auditContent().unreviewed, []));
test("content", "release ready", () => eq(releaseReady(), true));
test("content", "25+ scenarios", () => ok(SCENARIOS.length >= 25, `only ${SCENARIOS.length}`));
test("content", "scenarios span 3 levels", () => {
  const c = scenarioLevelCounts();
  ok(c.A1 > 0 && c.A2 > 0 && c.B1 > 0, JSON.stringify(c));
});
test("content", "every lesson has a speaking exercise + dual audio", () => {
  for (const l of lessonsForCourse("c30")) {
    const sp = PHRASES.find((p) => p.id === l.speakingPhraseId)!;
    ok(!!sp && !!sp.audioNormalUri && !!sp.audioSlowUri && sp.audioNormalUri !== sp.audioSlowUri, l.id);
  }
});
test("content", "grammar cards have 3 examples + mini-quiz", () => ok(GRAMMAR.every((g) => g.examples.length >= 3 && g.quiz.options.includes(g.quiz.answer))));
test("content", "pronunciation drills have Bangla tips", () => ok(DRILLS.length >= 6 && DRILLS.every((d) => d.tipBn.length > 0)));
test("content", "phrasebook + dictionary meet depth floors", () => ok(PHRASES.length >= CONTENT_FLOORS.phrases && DICTIONARY.length >= CONTENT_FLOORS.dictionary, `${PHRASES.length}/${DICTIONARY.length}`));
test("content", "every phrase maps to a real reviewer record", () => ok(PHRASES.every((p) => !!getReviewer(p.reviewedBy)), "a phrase has no reviewer record"));
test("content", "reviewer record carries name + credential + date", () => {
  const r = REVIEWERS.editor_bilingual_v1;
  ok(!!r && r.name.length > 0 && r.credential.length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(r.reviewedOn) && r.phrasesReviewed === PHRASES.length, JSON.stringify(r));
});
test("content", "dictionary entries are unique (no duplicate words)", () => eq(new Set(DICTIONARY.map((w) => w.en)).size, DICTIONARY.length));
test("content", "grammar library is deep (22+ cards)", () => ok(GRAMMAR.length >= 22, `only ${GRAMMAR.length}`));
test("content", "every scenario has a multi-turn offline script with chips", () =>
  ok(SCENARIOS.every((s) => {
    const fb = SCRIPTED[s.scriptedFallbackId];
    return fb && fb.turns.length >= 3 && fb.turns.every((t) => t.ai.trim() && t.hintBn.trim() && t.suggestions.length > 0);
  })));
test("content", "scenarios have distinct (not shared) scripts", () =>
  ok(SCRIPTED["fb_sc_market"].turns[0].ai !== SCRIPTED["fb_sc_bank_open"].turns[0].ai && SCRIPTED["fb_sc_clinic"].turns[0].ai !== SCRIPTED["fb_sc_interview"].turns[0].ai));

// ---------- Courses ----------
test("courses", "7-day + 30-day exist", () => eq([lessonsForCourse("c7").length, lessonsForCourse("c30").length], [7, 30]));
test("courses", "day 1 available, day 2 locked", () => {
  const m = {};
  eq([displayStatus(m, "c30_d1"), displayStatus(m, "c30_d2")], ["available", "locked"]);
});
test("courses", "finishing day 1 unlocks day 2", () => {
  const m = markLessonDone({}, "c30_d1", 80, T);
  eq([displayStatus(m, "c30_d1"), displayStatus(m, "c30_d2")], ["done", "available"]);
});
test("courses", "lock reason names the prior day", () => ok((lockReasonBn({}, "c30_d2") ?? "").includes("1")));
test("courses", "course progress counts done", () => {
  const m = markLessonDone({}, "c30_d1", 90, T);
  const p = courseProgress(m, "c30");
  eq([p.done, p.currentDay, p.nextLessonId], [1, 2, "c30_d2"]);
});
test("courses", "completesCourse true on last lesson", () => {
  let m = {};
  const lessons = lessonsForCourse("c7");
  for (const l of lessons.slice(0, 6)) m = markLessonDone(m, l.id, 80, T);
  eq(completesCourse(m, "c7_d7"), true);
});

// ---------- State reducers ----------
test("state", "applyPlacement sets level + done", () => {
  const s = applyPlacement(emptyState(T), scorePlacement({ goal: "job", probes: [true, true] }));
  eq([s.profile.level, s.profile.goal, s.profile.placementDone], ["B1", "job", true]);
});
test("state", "favorite toggles on then off", () => {
  let s = toggleFavorite(emptyState(T), "p_daily_001", T);
  ok(isFavorite(s, "p_daily_001"));
  s = toggleFavorite(s, "p_daily_001", T);
  eq(isFavorite(s, "p_daily_001"), false);
});
test("state", "report error dedupes by phrase", () => {
  let s = reportError(emptyState(T), "p_daily_001", "meaning", T);
  s = reportError(s, "p_daily_001", "spelling", T);
  eq(s.errorReports.length, 1);
});
test("state", "download start → finish → ready", () => {
  let s = startDownload(emptyState(T), "all");
  eq(packState(s, "all"), "downloading");
  s = finishDownload(s, "all");
  eq(packState(s, "all"), "ready");
});
test("state", "complete lesson marks done + streak + first phrase", () => {
  const { state } = completeLesson(emptyState(T), "c30_d1", 80, T);
  eq([state.progress["c30_d1"].status, state.streak.current, state.firstPhraseSpoken], ["done", 1, true]);
});
test("state", "finishing last lesson issues certificate + badge", () => {
  let s = emptyState(T);
  for (const l of lessonsForCourse("c7").slice(0, 6)) s = completeLesson(s, l.id, 80, T).state;
  const done = completeLesson(s, "c7_d7", 80, T);
  ok(done.completedCourse === "c7" && done.state.certificates.some((c) => c.courseId === "c7") && done.state.badges.includes("course_7"));
});
test("state", "AI session saves mistakes + consumes quota + first_ai badge", () => {
  const f = parseFeedback({ fluency: 70, clarity: 70, grammar: 70, pace: 70, corrections: [{ original: "I goes", corrected: "I go", explanationBn: "x" }] });
  const r = completeAiSession(emptyState(T), { scenarioId: "sc_intro", feedback: f, durationSec: 120, today: T, source: "ai" });
  eq([r.state.aiSessions.length, r.state.mistakes.length, r.state.quota.aiRunsUsed, r.state.badges.includes("first_ai")], [1, 1, 1, true]);
});
test("state", "scripted session: no quota, no mistakes", () => {
  const r = completeAiSession(emptyState(T), { scenarioId: "sc_intro", feedback: parseFeedback({}), durationSec: 90, today: T, source: "scripted" });
  eq([r.state.quota.aiRunsUsed, r.state.mistakes.length], [0, 0]);
});
test("state", "apply review updates the mistake", () => {
  const f = parseFeedback({ corrections: [{ original: "a", corrected: "b", explanationBn: "x" }] });
  let s = completeAiSession(emptyState(T), { scenarioId: "sc_intro", feedback: f, durationSec: 60, today: T, source: "ai" }).state;
  const id = s.mistakes[0].id;
  s = applyReview(s, id, true, addDays(T, 1));
  eq(s.mistakes[0].correctCount, 1);
});
test("state", "fluency trend has 7 points, needs 2 sessions", () => {
  let s = emptyState(T);
  eq(trendReady(s), false);
  const f = parseFeedback({ fluency: 80, clarity: 80, grammar: 80, pace: 80, corrections: [] });
  s = completeAiSession(s, { scenarioId: "sc_intro", feedback: f, durationSec: 60, today: T, source: "ai" }).state;
  s = completeAiSession(s, { scenarioId: "sc_intro", feedback: f, durationSec: 60, today: addDays(T, 1), source: "ai" }).state;
  const trend = fluencyTrend(s, addDays(T, 1));
  eq([trend.length, trendReady(s), trend[6].score], [7, true, 80]);
});
test("state", "reward bonus raises remaining", () => {
  const s = grantRewardBonus(emptyState(T), T);
  eq(remaining(s.quota, T, false), FREE_AI_RUNS + 3);
});
test("state", "set then disable reminder", () => {
  let s = setReminder(emptyState(T), "19:30");
  eq([s.profile.notificationsOn, s.profile.reminderTime], [true, "19:30"]);
  s = disableReminder(s);
  eq(s.profile.notificationsOn, false);
});
test("state", "markFirstPhrase is idempotent", () => {
  let s = markFirstPhrase(emptyState(T), T);
  const streak1 = s.streak.current;
  s = markFirstPhrase(s, addDays(T, 1));
  eq(s.streak.current, streak1); // second call does nothing
});

// ---------- Migration ----------
test("migration", "fills new fields, keeps old progress", () => {
  const oldShape = { progress: { c30_d1: { lessonId: "c30_d1", status: "done", score: 90, completedAt: T, lastStep: 0 } }, favorites: [{ phraseId: "p_daily_001", createdAt: T }] };
  const m = migrateState(oldShape, T);
  eq([m.progress["c30_d1"].score, m.favorites.length, m.badges, Array.isArray(m.certificates)], [90, 1, [], true]);
});
test("migration", "garbage → fresh empty state", () => eq(migrateState(null, T).aiSessions.length, 0));

// ---------- Persistence ----------
test("persistence", "sim state survives serialize → deserialize", () => {
  let s = sim.init();
  for (const a of sim.actions(s).slice(0, 2)) s = sim.apply(s, a);
  eq(sim.deserialize(sim.serialize(s)), s);
});

const failures = results.filter((r) => !r.ok).map((r) => `${r.name}: ${r.why}`);
for (const r of results) if (!r.ok || process.env.VERBOSE === "1") console.error(`${r.ok ? "PASS" : "FAIL"} ${r.name}${r.why ? ` — ${r.why}` : ""}`);
console.log(JSON.stringify({ tests: results.length, passed: results.length - failures.length, failures, features: [...features] }));
process.exit(failures.length ? 1 : 0);
