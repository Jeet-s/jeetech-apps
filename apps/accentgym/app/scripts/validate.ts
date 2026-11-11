/// <reference types="node" />
/**
 * Core-logic tests for Accent Gym — run by `npm run validate`. Every rule in
 * src/core is exercised through the REAL functions: dates, scoring honesty,
 * sound check, mastery, SRS, streak+recovery, quota, entitlement/trial, assessment,
 * sessions, profile, and the full state reducers + sim round-trip.
 *
 * Final stdout line MUST be JSON:
 *   {"tests": N, "passed": N, "failures": [...], "features": [...]}
 */
import { addDays, daysBetween, isValidKey, noonMs, weekdayLabel } from "../src/core/dates";
import {
  CLOSE_SCORE,
  GOOD_SCORE,
  coachingPhoneme,
  flaggedSounds,
  hasEstimatedContrast,
  interpret,
  isCleanSuccess,
  missedWords,
  mockScore,
  parseScoreResult,
  overallFrom,
  soundScore,
  statusFor,
} from "../src/core/scoring";
import { L1_TROUBLE, isSoundId, pairsForSound, revealsL1, SOUNDS } from "../src/core/sounds";
import { diagnosticsFor, practiceFor, sentenceForSound, SENTENCE_BY_ID } from "../src/core/sentences";
import { accentAffectedSounds, ipaForSound, rulesFor } from "../src/core/accent";
import { buildPlan, buildReport, reorderPlan, worstSounds } from "../src/core/soundplan";
import { MASTERED_AT, masteredCount, recordSound, recordSounds, trendWindow } from "../src/core/mastery";
import { addItem, autoSaveMisses, dueCount, dueItems, review, START_EASE } from "../src/core/srs";
import { WEEKLY_FREEZES, atRisk, canRecover, emptyStreak, recordActivity, weekStart } from "../src/core/streak";
import { FREE_DAILY, PRO_DAILY, REWARD_BONUS, addBonus, allowance, canScore, emptyQuota, remaining, rollover, useScore } from "../src/core/quota";
import {
  TRIAL_MS,
  cancel,
  freeEntitlement,
  grandfather,
  isPro,
  purchase,
  restore,
  startTrial,
  tick,
  trialReminderDue,
} from "../src/core/entitlement";
import { buildAssessment, clarityLabel, retestDue } from "../src/core/assessment";
import { buildDailySession, isComplete, startProgress, advance } from "../src/core/session";
import { defaultProfile, setReminder, splitIntoSentences, validateCustomText } from "../src/core/profile";
import {
  beginTrial,
  buy,
  chooseLanguage,
  completeDiagnosis,
  completeDrill,
  completeGuidedPractice,
  migrateState,
  completeSession,
  emptyState,
  finishOnboarding,
  linkAccount,
  pro,
  recordCustom,
  recordDiagnostic,
  recordPractice,
  saveCustomText,
  mergeBackup,
  restoreFromBackup,
  toggleAutoSaveMisses,
  watchRewarded,
} from "../src/core/state";
import { MAX_COACHING_WORDS, coachingPhrases, transcriptMatch, pairQuestion, mouthPose } from "../src/core/practice";
import { restoredAccess, restoreFailure } from "../src/core/restore";
import { sim } from "../src/core/sim";
import type { ScoreResult, SoundMastery } from "../src/core/types";

type MasteryMap = Record<string, SoundMastery>;

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
const nowT = noonMs(T);

// ── Dates ─────────────────────────────────────────────────────────────────
test("dates", "addDays forward", () => eq(addDays("2026-03-10", 1), "2026-03-11"));
test("dates", "addDays across month", () => eq(addDays("2026-01-31", 1), "2026-02-01"));
test("dates", "addDays across year backwards", () => eq(addDays("2026-01-01", -1), "2025-12-31"));
test("dates", "leap day", () => eq(addDays("2028-02-28", 1), "2028-02-29"));
test("dates", "daysBetween", () => eq(daysBetween("2026-03-01", "2026-03-10"), 9));
test("dates", "weekday label", () => eq(weekdayLabel("2026-03-10"), "Tue"));
test("dates", "valid key check", () => ok(isValidKey("2026-03-10") && !isValidKey("2026-13-40")));

// ── Sounds catalog + L1 ─────────────────────────────────────────────────────
test("sounds", "catalog ids unique + valid", () => {
  const ids = SOUNDS.map((s) => s.id);
  eq(new Set(ids).size, ids.length);
  ok(ids.every(isSoundId));
});
test("sounds", "every L1 has a vetted trouble list", () =>
  ok((["hi", "es", "ar", "other"] as const).every((l) => L1_TROUBLE[l].length >= 4 && L1_TROUBLE[l].every(isSoundId))));
test("sounds", "every sound has ≥1 example and a tip", () => ok(SOUNDS.every((s) => s.examples.length >= 1 && s.tip.length > 10)));
test("sounds", "minimal pairs exist for key contrasts", () => ok(pairsForSound("v").length >= 2 && pairsForSound("θ").length >= 2 && pairsForSound("ɪ").length >= 2));
test("sounds", "revealsL1 flags a Hindi trouble sound but not for 'other'", () => ok(revealsL1("w", "hi") && !revealsL1("w", "other")));

// ── Accent rules ────────────────────────────────────────────────────────────
test("accent", "UK is non-rhotic, US is rhotic for /r/", () => ok(ipaForSound("r", "uk") !== ipaForSound("r", "us")));
test("accent", "each accent has named rules", () => ok(rulesFor("us").length >= 1 && rulesFor("uk").length >= 1));
test("accent", "accent-sensitive sounds detected in a sentence", () => eq(accentAffectedSounds(["r", "v", "t"]), ["r", "t"]));

// ── Scoring honesty ─────────────────────────────────────────────────────────
const sent = SENTENCE_BY_ID["s_start_2"]; // "The weather is very warm today."
test("scoring", "model audio scores ≥ 90", () => ok(interpret("a1", mockScore(sent, "us", "model"), { accent: "us", timestamp: nowT }).overallScore >= 90));
test("scoring", "native calibration scores ≥ 90", () => ok(interpret("a1", mockScore(sent, "us", "native"), { accent: "us", timestamp: nowT }).overallScore >= 90));
test("scoring", "deliberately wrong audio scores < 50", () => ok(interpret("a1", mockScore(sent, "us", "poor"), { accent: "us", timestamp: nowT }).overallScore < 50));
test("scoring", "silent audio is low-confidence (no fake score trusted)", () => ok(interpret("a1", mockScore(sent, "us", "silent"), { accent: "us", timestamp: nowT }).lowConfidence));
test("scoring", "mumbled audio is low-confidence", () => ok(interpret("a1", mockScore(sent, "us", "mumble"), { accent: "us", timestamp: nowT }).lowConfidence));
test("scoring", "same recording scores within ±5 (deterministic)", () => {
  const a = interpret("a1", mockScore(sent, "us", "good"), { accent: "us", timestamp: nowT });
  const b = interpret("a2", mockScore(sent, "us", "good"), { accent: "us", timestamp: nowT });
  ok(Math.abs(a.overallScore - b.overallScore) <= 5);
});
test("scoring", "ALL words are scored, not just two", () => {
  const a = interpret("a1", mockScore(sent, "us", "good"), { accent: "us", timestamp: nowT });
  eq(a.wordScores.length, 6); // The weather is very warm today
  ok(a.wordScores.every((w) => w.phonemes.length >= 1));
});
test("scoring", "status thresholds", () => eq([statusFor(90), statusFor(70), statusFor(30)], ["good", "close", "off"]));
test("coaching evidence", "every with matching /v/ is a neutral sound guide even at a low score", () => {
  const phone = { ph: "v", expectedIPA: "v", heardIPA: "v", score: 31 };
  const word = { word: "every", score: 31, phonemes: [phone] };
  eq(coachingPhoneme(word), phone);
  ok(!hasEstimatedContrast(phone));
});
test("coaching evidence", "IPA wrappers, whitespace and unicode composition do not create false contrasts", () => {
  ok(!hasEstimatedContrast({ ph: "v", expectedIPA: " /v/ ", heardIPA: "v", score: 15 }));
  ok(!hasEstimatedContrast({ ph: "a", expectedIPA: "ã", heardIPA: "a\u0303", score: 15 }));
});
test("coaching evidence", "a missing estimate never becomes an invented substitution", () => {
  ok(!hasEstimatedContrast({ ph: "v", expectedIPA: "v", heardIPA: "", score: 0 }));
  ok(!hasEstimatedContrast({ ph: "v", expectedIPA: "", heardIPA: "w", score: 0 }));
  eq(coachingPhoneme({ word: "every", score: 0, phonemes: [] }), undefined);
});
test("coaching evidence", "an explicit contrast takes priority over a lower identical-symbol score", () => {
  const same = { ph: "v", expectedIPA: "v", heardIPA: "v", score: 10 };
  const different = { ph: "r", expectedIPA: "r", heardIPA: "l", score: 60 };
  const word = { word: "very", score: 35, phonemes: [same, different] };
  eq(coachingPhoneme(word), different);
  ok(hasEstimatedContrast(different));
  eq(word.phonemes, [same, different]);
});
test("scoring", "flagged sounds come back worst-first and below CLOSE", () => {
  const a = interpret("a1", mockScore(sent, "us", "weak"), { accent: "us", timestamp: nowT });
  const f = flaggedSounds(a);
  ok(f.length >= 1 && f.every((x) => x.score < CLOSE_SCORE));
  ok(f.every((x, i) => i === 0 || f[i - 1].score <= x.score));
});
test("scoring", "overallFrom is the phoneme mean", () => eq(overallFrom([{ word: "x", score: 0, phonemes: [{ ph: "a", expectedIPA: "a", heardIPA: "a", score: 80 }, { ph: "b", expectedIPA: "b", heardIPA: "b", score: 60 }] }]), 70));
test("scoring", "missed words are collected from a weak take, none from low-confidence", () => {
  const weak = interpret("a1", mockScore(sent, "us", "weak"), { accent: "us", timestamp: nowT });
  const silent = interpret("a2", mockScore(sent, "us", "silent"), { accent: "us", timestamp: nowT });
  ok(missedWords(weak).length >= 1 && missedWords(silent).length === 0);
});
test("scoring", "clean success only when confident and ≥ CLOSE", () => {
  ok(isCleanSuccess(interpret("a1", mockScore(sent, "us", "good"), { accent: "us", timestamp: nowT })));
  ok(!isCleanSuccess(interpret("a2", mockScore(sent, "us", "silent"), { accent: "us", timestamp: nowT })));
});
test("scoring", "low-confidence raw result flags correctly", () => {
  const raw: ScoreResult = { confidence: 0.3, words: [{ word: "hi", score: 0, phonemes: [{ ph: "h", expectedIPA: "h", heardIPA: "h", score: 80 }] }] };
  ok(interpret("a1", raw, { accent: "us", timestamp: nowT }).lowConfidence);
});

// ── Sound check ───────────────────────────────────────────────────────────────
function diagAttempts(l1: Parameters<typeof diagnosticsFor>[0]) {
  return diagnosticsFor(l1).map((d, i) => interpret(`d${i}`, mockScore(d, "us", "weak"), { accent: "us", timestamp: nowT, sentenceId: d.id, isDiagnostic: true }));
}
test("sound check", "report lists exactly 3 sounds with examples + drill-ready data", () => {
  const r = buildReport(diagAttempts("hi"), "hi");
  eq(r.items.length, 3);
  ok(r.items.every((it) => it.examples.length >= 1 && isSoundId(it.soundId)));
});
test("sound check", "report marks sounds that reveal the native language", () => {
  const r = buildReport(diagAttempts("hi"), "hi");
  ok(r.items.some((it) => it.revealsNativeLanguage));
});
test("sound check", "plan seeds from the diagnostic + L1 list, no duplicates", () => {
  const plan = buildPlan(diagAttempts("es"), "es");
  eq(new Set(plan).size, plan.length);
  ok(plan.length >= 3 && plan.every(isSoundId));
});
test("sound check", "other-language users get a general plan", () => ok(buildPlan([], "other").length >= 3));
test("sound check", "plan reorders weakest-first as mastery changes", () => {
  const plan = ["v", "w", "θ"];
  const m = recordSound(recordSound({}, "v", 95, T), "w", 20, T);
  eq(reorderPlan(plan, m)[0], "w"); // weakest first
});
test("sound check", "worstSounds pads to n from the L1 list when diagnostics are thin", () => eq(worstSounds([], "hi", 3).length, 3));

// ── Mastery ─────────────────────────────────────────────────────────────────
test("mastery", "first observation sets the score; EMA smooths later", () => {
  const m1 = recordSound({}, "v", 80, T);
  eq(m1["v"].score, 80);
  const m2 = recordSound(m1, "v", 100, addDays(T, 1));
  ok(m2["v"].score > 80 && m2["v"].score < 100);
});
test("mastery", "mastered needs sustained high scores", () => {
  let m: MasteryMap = {};
  for (let i = 0; i < 3; i++) m = recordSound(m, "v", 95, addDays(T, i));
  ok(m["v"].mastered && m["v"].score >= MASTERED_AT);
});
test("mastery", "one great score alone is not mastery", () => ok(!recordSound({}, "v", 99, T)["v"].mastered));
test("mastery", "masteredCount + trend window", () => {
  let m: MasteryMap = {};
  for (let i = 0; i < 3; i++) m = recordSound(m, "v", 95, addDays(T, i));
  eq(masteredCount(m), 1);
  ok(trendWindow(m["v"], addDays(T, 2), 30).length === 3);
});
test("mastery", "unknown sound id is ignored", () => eq(recordSound({}, "zzz", 90, T), {}));
test("mastery", "batch fold keeps scores in range", () => {
  const m = recordSounds({}, [{ soundId: "v", score: 40 }, { soundId: "w", score: 60 }], T);
  ok(m["v"].score === 40 && m["w"].score === 60);
});

// ── SRS ─────────────────────────────────────────────────────────────────────
test("srs", "add item starts due today with start ease", () => {
  const { items, added } = addItem([], { id: "w1", text: "ship", source: "miss" }, T);
  ok(added && items[0].dueAt === T && items[0].ease === START_EASE);
});
test("srs", "duplicate text is not re-added", () => {
  const a = addItem([], { id: "w1", text: "Ship", source: "miss" }, T).items;
  eq(addItem(a, { id: "w2", text: "ship", source: "miss" }, T).added, false);
});
test("srs", "auto-save adds missed words with fresh ids", () => {
  const r = autoSaveMisses([], [{ word: "very", soundTags: ["v"] }, { word: "warm", soundTags: ["w"] }], T, (i) => `w${i + 1}`);
  eq(r.addedIds, ["w1", "w2"]);
});
test("srs", "auto-save respects the off toggle", () => eq(autoSaveMisses([], [{ word: "very", soundTags: ["v"] }], T, (i) => `w${i}`, false).items.length, 0));
test("srs", "correct review grows interval; wrong resets + counts a lapse", () => {
  let items = addItem([], { id: "w1", text: "ship", source: "miss" }, T).items;
  items = review(items, "w1", true, T); // 0→1
  items = review(items, "w1", true, addDays(T, 1)); // 1→6
  ok(items[0].interval === 6);
  const lapsed = review(items, "w1", false, addDays(T, 7));
  ok(lapsed[0].interval === 1 && lapsed[0].lapses === 1);
});
test("srs", "due queue shows only items due today", () => {
  let items = addItem([], { id: "w1", text: "ship", source: "miss" }, T).items;
  items = review(items, "w1", true, T); // now due tomorrow
  eq(dueCount(items, T), 0);
  eq(dueCount(items, addDays(T, 1)), 1);
  ok(dueItems(items, addDays(T, 1)).length === 1);
});

// ── Streak + recovery ───────────────────────────────────────────────────────
test("streak", "consecutive days build the streak", () => {
  let s = emptyStreak();
  s = recordActivity(s, T);
  s = recordActivity(s, addDays(T, 1));
  s = recordActivity(s, addDays(T, 2));
  eq([s.current, s.best], [3, 3]);
});
test("streak", "same day does not double-count", () => {
  let s = recordActivity(emptyStreak(), T);
  s = recordActivity(s, T);
  eq(s.current, 1);
});
test("streak", "a one-day miss is covered by the weekly freeze", () => {
  let s = recordActivity(emptyStreak(), T); // current 1, freeze available
  s = recordActivity(s, addDays(T, 2)); // skipped T+1 → freeze spent, streak continues
  ok(s.current === 2 && s.freezesLeft === WEEKLY_FREEZES - 1);
});
test("streak", "a big gap with no freeze resets but leaves 24h recovery", () => {
  let s = recordActivity(emptyStreak(), T);
  s = { ...s, freezesLeft: 0 };
  s = recordActivity(s, addDays(T, 5));
  ok(s.current === 1 && canRecover(s, addDays(T, 5)));
});
test("streak", "atRisk when active yesterday and nothing today", () => {
  const s = recordActivity(emptyStreak(), T);
  ok(atRisk(s, addDays(T, 1)) && !atRisk(s, T));
});
test("streak", "freezes refill in a new week", () => {
  let s = recordActivity(emptyStreak(), "2026-03-09"); // Monday
  s = { ...s, freezesLeft: 0 };
  s = recordActivity(s, "2026-03-16"); // next Monday
  ok(s.freezesLeft === WEEKLY_FREEZES);
  eq(weekStart("2026-03-11"), "2026-03-09");
});

// ── Quota (free tier honesty) ───────────────────────────────────────────────
test("quota", "free tier is 5 scored/day", () => eq(allowance(emptyQuota(T), T, false), FREE_DAILY));
test("quota", "pro quota is the high ceiling", () => eq(allowance(emptyQuota(T), T, true), PRO_DAILY));
test("quota", "scoring decrements remaining and blocks at 0", () => {
  let q = emptyQuota(T);
  for (let i = 0; i < FREE_DAILY; i++) q = useScore(q, T, false);
  ok(!canScore(q, T, false) && remaining(q, T, false) === 0);
});
test("quota", "never over-spends past the allowance", () => {
  let q = emptyQuota(T);
  for (let i = 0; i < FREE_DAILY + 3; i++) q = useScore(q, T, false);
  eq(q.scoredUsed, FREE_DAILY);
});
test("quota", "rewarded ad grants +3 bonus (free only)", () => {
  const q = addBonus(emptyQuota(T), T);
  eq(allowance(q, T, false), FREE_DAILY + REWARD_BONUS);
});
test("quota", "resets at local midnight (new day)", () => {
  let q = emptyQuota(T);
  q = useScore(q, T, false);
  eq(rollover(q, addDays(T, 1)).scoredUsed, 0);
});
test("quota", "free tier never expires after day 2 (day 30 still 5)", () => eq(allowance(emptyQuota(addDays(T, 30)), addDays(T, 30), false), FREE_DAILY));

// ── Entitlement / trial / restore ───────────────────────────────────────────
test("entitlement", "no-card trial activates Pro immediately", () => {
  const e = startTrial(freeEntitlement(), "pro_monthly", nowT);
  ok(e.status === "trialing" && isPro(e, nowT) && e.source === "trial");
});
test("entitlement", "trial lapses to free (never silently charges) after 7 days", () => {
  const e = startTrial(freeEntitlement(), "pro_monthly", nowT);
  const after = tick(e, nowT + TRIAL_MS + 1000);
  ok(!isPro(after, nowT + TRIAL_MS + 1000) && after.plan === "free" && after.status === "expired");
});
test("entitlement", "48h reminder is due inside the window only", () => {
  const e = startTrial(freeEntitlement(), "pro_monthly", nowT);
  ok(!trialReminderDue(e, nowT) && trialReminderDue(e, nowT + TRIAL_MS - 3600_000));
});
test("entitlement", "monthly purchase sets a next billing date ~30 days out (not a lump year)", () => {
  const e = purchase(freeEntitlement(), "pro_monthly", nowT);
  const days = Math.round(((e.nextBillingDate ?? 0) - nowT) / 86_400_000);
  ok(isPro(e, nowT) && days === 30);
});
test("entitlement", "lifetime is always Pro with no billing date", () => {
  const e = purchase(freeEntitlement(), "lifetime", nowT);
  ok(isPro(e, nowT + 10 * 365 * 86_400_000) && !e.nextBillingDate);
});
test("entitlement", "cancel keeps access until period end, then expires", () => {
  const e = cancel(purchase(freeEntitlement(), "pro_monthly", nowT));
  ok(isPro(e, nowT)); // still active until the date
  ok(!isPro(tick(e, nowT + 31 * 86_400_000), nowT + 31 * 86_400_000));
});
test("entitlement", "restore re-grants Pro from a snapshot and tags the source", () => {
  const bought = purchase(freeEntitlement(), "lifetime", nowT);
  const r = restore(bought, nowT + 5_000);
  ok(isPro(r, nowT) && r.source === "restore");
});
test("entitlement", "existing buyers are grandfathered when plans change", () => {
  const e = grandfather(purchase(freeEntitlement(), "pro_yearly", nowT));
  eq(e.grandfatheredPlan, "pro_yearly");
});
test("entitlement", "active sub renews by pushing the billing date out", () => {
  const e = purchase(freeEntitlement(), "pro_monthly", nowT);
  const renewed = tick(e, (e.nextBillingDate ?? 0) + 1000);
  ok((renewed.nextBillingDate ?? 0) > (e.nextBillingDate ?? 0) && isPro(renewed, (e.nextBillingDate ?? 0) + 1000));
});

// ── Assessment ──────────────────────────────────────────────────────────────
test("assessment", "clarity label is CEFR-style and monotonic", () => ok(clarityLabel(95).startsWith("C1") && clarityLabel(10).startsWith("A1")));
test("assessment", "baseline assessment captures 3 top sounds", () => {
  const as = buildAssessment("as1", diagAttempts("hi"), "hi", T);
  eq(as.topSounds.length, 3);
  ok(as.overall >= 0 && as.overall <= 100);
});
test("assessment", "re-test is due only after 14 days", () => {
  const as = buildAssessment("as1", diagAttempts("hi"), "hi", T);
  ok(!retestDue([as], addDays(T, 13)) && retestDue([as], addDays(T, 14)));
});

// ── Session ─────────────────────────────────────────────────────────────────
test("session", "daily session is capped to the chosen minutes and is non-empty", () => {
  const s = buildDailySession({ srs: [], plan: ["v", "w", "θ", "ɪ"], mastery: {}, pro: false, minutes: 5, today: T });
  ok(s.items.length >= 3 && s.items.length <= 7 && s.estMinutes <= 6);
});
test("session", "due SRS items lead the session", () => {
  const srs = addItem([], { id: "w1", text: "ship", source: "miss", soundTags: ["ɪ"] }, T).items;
  const s = buildDailySession({ srs, plan: ["v"], mastery: {}, pro: false, minutes: 5, today: T });
  eq(s.items[0].kind, "srs");
});
test("session", "progress completes and survives advance", () => {
  const s = buildDailySession({ srs: [], plan: ["v", "w", "θ"], mastery: {}, pro: false, minutes: 5, today: T });
  let p = startProgress(s);
  for (let i = 0; i < s.items.length; i++) p = advance(p);
  ok(isComplete(p, s));
});

// ── Profile ─────────────────────────────────────────────────────────────────
test("profile", "defaults: comments off, ipa on, follows phone theme, no voice-data opt-in", () => {
  const p = defaultProfile(T);
  ok(!p.commentsOn && p.ipaOn && p.theme === "system" && !p.voiceDataOptIn);
});
test("profile", "reminder time validates HH:MM and can be turned off", () => {
  eq(setReminder(defaultProfile(T), "08:30").reminderTime, "08:30");
  eq(setReminder(defaultProfile(T), "99:99").reminderTime, undefined); // bad input ignored
  eq(setReminder(defaultProfile(T), undefined).reminderTime, undefined);
});
test("profile", "custom text validation + sentence splitting", () => {
  eq(validateCustomText("   "), "empty");
  eq(validateCustomText("x".repeat(201)), "too_long");
  eq(validateCustomText("123 456"), "unsupported");
  eq(validateCustomText("Hello there"), null);
  eq(splitIntoSentences("Hi there. How are you?"), ["Hi there.", "How are you?"]);
});

// ── State reducers (the real product loop) ──────────────────────────────────
function fresh() {
  return emptyState(T);
}
function runDiagnostics(s0: ReturnType<typeof fresh>, l1: Parameters<typeof diagnosticsFor>[0]) {
  let s = chooseLanguage(s0, l1);
  for (const d of diagnosticsFor(l1)) {
    s = recordDiagnostic(s, mockScore(d, "us", "weak"), { accent: "us", timestamp: nowT, sentenceId: d.id }, T).state;
  }
  return s;
}
test("state", "fresh install has a general plan and a free entitlement", () => {
  const s = fresh();
  ok(s.plan.length >= 3 && !pro(s, nowT) && s.srs.length === 0);
});
test("state", "F1: three diagnostics → report with 3 named sounds + baseline assessment", () => {
  let s = runDiagnostics(fresh(), "hi");
  const rep = completeDiagnosis(s, T);
  const report = buildReport(rep.diagnostics, "hi");
  ok(report.items.length === 3 && rep.reportShown && rep.assessments.length === 1);
});
test("state", "diagnostics do not consume the daily quota", () => {
  const s = runDiagnostics(fresh(), "hi");
  eq(remaining(s.quota, T, false), FREE_DAILY);
});
test("state", "F2: a weak take flags a sound; a better retry raises it", () => {
  const sent2 = SENTENCE_BY_ID["s_start_1"];
  let s = fresh();
  s = recordPractice(s, mockScore(sent2, "us", "weak"), { accent: "us", timestamp: nowT, sentenceId: sent2.id }, T, nowT).state;
  const before = soundScore(s.attempts[0], sent2.soundTags[0]);
  s = recordPractice(s, mockScore(sent2, "us", "good"), { accent: "us", timestamp: nowT, sentenceId: sent2.id, isRetry: true }, T, nowT).state;
  const after = soundScore(s.attempts[1], sent2.soundTags[0]);
  ok(before !== null && after !== null && after > before);
});
test("state", "practice auto-saves missed words to the personal set", () => {
  const sent2 = SENTENCE_BY_ID["s_start_1"];
  const s = recordPractice(fresh(), mockScore(sent2, "us", "weak"), { accent: "us", timestamp: nowT, sentenceId: sent2.id }, T, nowT).state;
  ok(s.srs.length >= 1 && s.srs.every((i) => i.source === "miss"));
});
test("state", "auto-save can be toggled off", () => {
  const sent2 = SENTENCE_BY_ID["s_start_1"];
  let s = toggleAutoSaveMisses(fresh(), false);
  s = recordPractice(s, mockScore(sent2, "us", "weak"), { accent: "us", timestamp: nowT, sentenceId: sent2.id }, T, nowT).state;
  eq(s.srs.length, 0);
});
test("state", "free user is blocked after 5 scored sentences; Pro is not", () => {
  const sent2 = SENTENCE_BY_ID["s_start_1"];
  let s = fresh();
  for (let i = 0; i < FREE_DAILY; i++) s = recordPractice(s, mockScore(sent2, "us", "good"), { accent: "us", timestamp: nowT, sentenceId: sent2.id }, T, nowT).state;
  const blocked = recordPractice(s, mockScore(sent2, "us", "good"), { accent: "us", timestamp: nowT, sentenceId: sent2.id }, T, nowT);
  eq(blocked.blocked, "quota");
  // Rewarded ad unblocks +3.
  const s2 = watchRewarded(s, T);
  ok(recordPractice(s2, mockScore(sent2, "us", "good"), { accent: "us", timestamp: nowT, sentenceId: sent2.id }, T, nowT).blocked === undefined);
});
test("state", "F4: type-any-text scores and saves a custom item", () => {
  const raw = mockScore({ text: "The quick brown fox", soundTags: ["r", "w"] }, "us", "good");
  const out = recordCustom(fresh(), "The quick brown fox.", raw, T, nowT);
  ok(out.state.attempts.length === 1 && out.state.srs.some((i) => i.source === "custom"));
});
test("state", "custom text validation blocks empty input", () => eq(recordCustom(fresh(), "   ", { confidence: 0.9, words: [] }, T, nowT).error, "empty"));
test("state", "F3: a passed drill raises the sound's mastery", () => {
  const s = completeDrill(fresh(), "v", 0.95, T);
  ok(s.mastery["v"].score >= 90);
});
test("state", "F7: completing a session increments the streak and marks it done", () => {
  const s = completeSession(fresh(), T, nowT);
  ok(s.streak.current === 1 && isComplete(s.sessionProgress, buildDailySession({ srs: s.srs, plan: s.plan, mastery: s.mastery, pro: false, minutes: 5, today: T })));
});
test("state", "F5: no-card trial makes the user Pro and lifts the cap", () => {
  const s = beginTrial(fresh(), "pro_monthly", nowT);
  ok(pro(s, nowT) && allowance(s.quota, T, true) === PRO_DAILY);
});
test("state", "F6: reinstall wipes local, restore brings Pro + progress back", () => {
  let s = runDiagnostics(fresh(), "hi");
  s = buy(s, "lifetime", nowT);
  s = linkAccount(s, "demo@accentgym.app");
  const backupSnapshot = s; // what the cloud holds
  const reinstalled = emptyState(T); // fresh install
  ok(!pro(reinstalled, nowT) && reinstalled.diagnostics.length === 0);
  const restored = restoreFromBackup(reinstalled, backupSnapshot, nowT);
  ok(pro(restored, nowT) && restored.diagnostics.length === 3 && restored.entitlement.source === "restore");
});
test("state", "guest-to-account linking preserves everything", () => {
  let s = runDiagnostics(fresh(), "hi");
  const before = s.diagnostics.length;
  s = linkAccount(s, "demo@accentgym.app");
  eq(s.diagnostics.length, before);
  eq(s.profile.accountId, "demo@accentgym.app");
});

// ── Persistence / sim round-trip ────────────────────────────────────────────
test("persistence", "sim state survives serialize → deserialize", () => {
  let s = sim.init();
  for (const a of sim.actions(s).slice(0, 5)) s = sim.apply(s, a);
  eq(sim.deserialize(sim.serialize(s)), s);
});
test("persistence", "every sim goal is defined and the fresh state violates no invariant", () => {
  ok(sim.goals.length >= 7);
  eq(sim.invariants(sim.init()), []);
});
test("persistence", "a scripted run of all core actions never breaks an invariant", () => {
  let s = sim.init();
  const script: Parameters<typeof sim.apply>[1][] = [
    { t: "set_language", l1: "hi" },
    { t: "finish_setup" },
    { t: "record_diagnostic" },
    { t: "record_diagnostic" },
    { t: "record_diagnostic" },
    { t: "view_report" },
    { t: "record_practice" },
    { t: "retry_better" },
    { t: "add_custom" },
    { t: "complete_session" },
    { t: "start_trial" },
    { t: "buy_lifetime" },
    { t: "login" },
    { t: "reinstall" },
    { t: "restore" },
  ];
  for (const a of script) {
    s = sim.apply(s, a);
    eq(sim.invariants(s), []);
  }
});

// QA regressions: reject unrelated input, preserve saves offline, and keep proxy output honest.
test("recognition", "unrelated diagnostic speech cannot be accepted", () => {
  ok(!transcriptMatch("The ship sailed with the sheep.", "I think this is the third month.").accepted);
  ok(!transcriptMatch("I would like a cup of water, please.", "I think the best").accepted);
});
test("recognition", "punctuation and case do not reject a correct line", () => ok(transcriptMatch("We have very warm weather.", "WE have very warm weather!").accepted));
test("recognition", "silence and empty prompts are rejected", () => { ok(!transcriptMatch("Hello", "").accepted); ok(!transcriptMatch("", "hello").accepted); });
test("recognition", "repeating one word cannot impersonate a whole sentence", () => ok(!transcriptMatch("The cat sat on the mat", "the the the the the the").accepted));
test("recognition", "long unrelated speech cannot pass via a few common words", () => ok(!transcriptMatch("The cat sat", "The cat sat but this is a completely different long sentence with extra words").accepted));
test("recognition", "small recognition omissions are allowed with missing words identified", () => { const r = transcriptMatch("I think this is the third month", "I think this is third month"); ok(r.accepted); eq(r.missing, ["the"]); });
test("recognition", "reordered speech is not treated as a matching sentence", () => ok(!transcriptMatch("one two three four five", "five four three two one").accepted));
test("recognition", "result counts come from recognised words rather than AI scores", () => {
  const match = transcriptMatch("I would like a cup of water, please.", "I would like a cup of water please!");
  eq([match.matched, match.total], [8, 8]);
  const missed = transcriptMatch("We speak every day", "We speak day");
  eq([missed.matched, missed.total], [3, 4]);
  eq(missed.missing, ["every"]);
  const repeated = transcriptMatch("the cat sat on the mat", "the the the the the the");
  eq([repeated.matched, repeated.total], [2, 6]);
  eq(transcriptMatch("", "").matched, 0);
});
test("score validation", "valid complete proxy output survives parsing", () => { const raw = mockScore({ text: "Very warm", soundTags: ["v", "w"] }, "us", "weak"); eq(parseScoreResult(raw), raw); });
test("score validation", "missing phonemes do not become invented scores", () => eq(parseScoreResult({ confidence: .9, words: [{ word: "hello", score: 99 }] }), null));
test("score validation", "nonfinite confidence and empty words are rejected", () => { eq(parseScoreResult({ confidence: NaN, words: [] }), null); eq(parseScoreResult({ confidence: .9, words: [] }), null); });
test("score validation", "out of range phoneme scores cannot enter progress", () => { const raw = mockScore({ text: "Very", soundTags: ["v"] }, "us", "weak"); raw.words[0].phonemes[0].score = 101; eq(parseScoreResult(raw), null); });
test("score validation", "slash-wrapped IPA is canonicalized for sound plan matching", () => { const raw = mockScore({ text: "Very", soundTags: ["v"] }, "us", "weak"); raw.words[0].phonemes[0].ph = "/v/"; eq(parseScoreResult(raw)?.words[0].phonemes[0].ph, "v"); });
test("review save", "Hear and check saves a phrase without AI or a score", () => { const s = saveCustomText(fresh(), "Please bring me a glass of water.", T); eq(s.srs[0].text, "Please bring me a glass of water."); eq(s.quota.scoredUsed, 0); eq(s.attempts, []); });
test("review save", "saving works when the scoring allowance is exhausted", () => { const s = saveCustomText({ ...fresh(), quota: { date: T, scoredUsed: 5, bonusFromAds: 0 } }, "water", T); eq(s.srs.length, 1); eq(s.quota.scoredUsed, 5); });
test("review save", "repeated save deduplicates and keeps the identifier counter", () => { const a = saveCustomText(fresh(), "Water", T); const b = saveCustomText(a, " water ", T); eq(b.srs.length, 1); eq(a.nextSrsId, b.nextSrsId); });
test("review save", "invalid text cannot enter the review set", () => { eq(saveCustomText(fresh(), " ", T), fresh()); eq(saveCustomText(fresh(), "x".repeat(201), T), fresh()); });
test("listening drill", "every mother-tongue plan has a reachable word-pair question", () => { for (const l1 of ["hi", "es", "ar", "other"] as const) for (const id of buildPlan([], l1)) ok(pairQuestion(pairsForSound(id).filter(p => p.level === "word"), 0) !== null); });
test("listening drill", "questions alternate target and contrast and survive the last pair", () => { const pairs = pairsForSound("ɪ").filter(p => p.level === "word"); eq(pairQuestion(pairs, 0)?.correct, "ship"); eq(pairQuestion(pairs, 1)?.correct, "beat"); ok(!!pairQuestion(pairs, 3)); eq(pairQuestion([], 0), null); });
test("mouth guide", "sound-specific mouth positions differ", () => { ok(mouthPose("æ").wide); ok(mouthPose("w").round); eq(mouthPose("θ").tongue, "between"); ok(mouthPose("v").lipBite); ok(mouthPose("p").closed); });
test("backup merge", "switching accounts keeps both phones' review words without duplicate ids", () => { const a = saveCustomText(fresh(), "water", T); const b = saveCustomText(saveCustomText(fresh(), "ship", T), "Water", T); const merged = mergeBackup(a, b); eq(merged.srs.length, 2); eq(new Set(merged.srs.map(i => i.id)).size, 2); ok(merged.srs.every(i => Number(i.id.slice(1)) < merged.nextSrsId)); eq(sim.invariants({ ...sim.init(), app: merged }), []); });

test("score validation", "uncertain diagnostics do not advance the check", () => { const d = diagnosticsFor("hi")[0]; const out = recordDiagnostic(fresh(), mockScore(d, "us", "mumble"), { accent: "us", timestamp: nowT, sentenceId: d.id }, T); eq(out.state.diagnostics.length, 0); ok(!!out.attempt?.lowConfidence); });
test("score validation", "uncertain practice does not spend an attempt or update mastery", () => { const d = diagnosticsFor("hi")[0]; const out = recordPractice(fresh(), mockScore(d, "us", "silent"), { accent: "us", timestamp: nowT }, T, nowT); eq(out.state, fresh()); });
test("backup merge", "guest sound check and baseline survive switching to an empty account", () => { const guest = completeDiagnosis(runDiagnostics(fresh(), "hi"), T); const merged = mergeBackup(guest, fresh()); eq(merged.diagnostics.length, 3); eq(merged.assessments.length, 1); ok(merged.reportShown); eq(sim.invariants({ ...sim.init(), app: merged }), []); });

test("offline practice", "listen-and-say records activity without manufacturing scores or spending AI", () => {
  const before = fresh(); const s = completeGuidedPractice(before, "  We have very warm weather.  ", T);
  eq(s.guidedPractice, { text: "We have very warm weather.", date: T });
  eq(s.streak.current, 1); eq(s.attempts, before.attempts); eq(s.diagnostics, before.diagnostics); eq(s.mastery, before.mastery); eq(s.quota, before.quota);
});
test("offline practice", "empty, unsupported and overlong input cannot record activity", () => {
  for (const text of ["", "  ", "1234", "a".repeat(201)]) eq(completeGuidedPractice(fresh(), text, T), fresh());
});
test("offline practice", "repeat practice keeps one streak day; following day advances it", () => {
  const a = completeGuidedPractice(fresh(), "water", T);
  eq(completeGuidedPractice(a, "warm", T).streak.current, 1);
  const b = completeGuidedPractice(a, "weather", addDays(T, 1)); eq(b.streak.current, 2);
  eq(b.guidedPractice?.text, "weather");
});
test("offline practice", "unscored practice stays available when AI allowance is exhausted", () => {
  const before = { ...fresh(), quota: { date: T, scoredUsed: 5, bonusFromAds: 0 } };
  const after = completeGuidedPractice(before, "water", T);
  eq(after.quota, before.quota); eq(after.guidedPractice?.text, "water"); eq(after.mastery, {});
});
test("persistence", "version 1 migration preserves existing scores, words, purchases and session resume", () => {
  const old = { ...runDiagnostics(saveCustomText(buy(fresh(), "lifetime", nowT), "water", T), "hi"), sessionProgress: { date: T, index: 2, total: 6 } };
  eq(migrateState(JSON.parse(JSON.stringify(old)), T), old);
  eq(migrateState(null, T), fresh());
});
test("persistence", "guided practice survives sim save and restore", () => {
  const s = sim.apply(sim.apply(sim.init(), { t: "skip_setup" }), { t: "guided_practice" });
  eq(sim.deserialize(sim.serialize(s)), s); ok(!!s.app.guidedPractice); eq(sim.invariants(s), []);
});
test("backup merge", "newer offline practice survives switching accounts", () => {
  const local = completeGuidedPractice(fresh(), "warm weather", addDays(T, 1));
  const remote = completeGuidedPractice(fresh(), "water", T);
  eq(mergeBackup(local, remote).guidedPractice, local.guidedPractice);
  eq(mergeBackup(remote, local).guidedPractice, local.guidedPractice);
});

test("restore recovery", "an empty store account is distinct from missing store service", () => {
  ok(restoreFailure({ code: "item-not-owned" }).message.includes("No previous purchases"));
  for (const code of ["billing-unavailable", "iap-not-available", "init-connection"]) {
    const r = restoreFailure({ code }); ok(!r.retry && r.message.includes("cannot check"));
  }
});
test("restore recovery", "only transient failures retry; unknown errors never invent a successful restore", () => {
  for (const code of ["not-prepared", "service-disconnected", "network-error", "service-error", "connection-closed", "service-timeout", "service-unavailable", "sync-error"]) ok(restoreFailure({ code }).retry);
  for (const e of [null, new Error("failure"), { code: "unknown" }]) { const r = restoreFailure(e); ok(!r.retry && r.message.includes("did not finish")); }
});

test("coaching phrases", "long speech is kept in ordered short phrases without lost words", () => {
  const speech = "I think the best way to learn a new language is to practice every day. For example, when I moved to a new city, I spoke with my neighbors each morning, and within a few months I felt much more confident.";
  const parts = coachingPhrases(speech);
  ok(parts.length > 1); ok(parts.every(p => p.split(/\s+/).length <= MAX_COACHING_WORDS));
  eq(parts[0], "I think the best way to learn a new language is to practice every day.");
  eq(parts.join(" "), speech); ok(parts[parts.length - 1].endsWith("confident."));
});
test("coaching phrases", "empty, short, punctuation and unsplit long speech are handled", () => {
  eq(coachingPhrases("  "), []); eq(coachingPhrases("Water, please!"), ["Water, please!"]);
  const long = Array.from({ length: 100 }, (_, i) => `word${i}`).join(" ");
  eq(coachingPhrases(long).join(" "), long); eq(coachingPhrases(long).length, 6);
});
test("coaching phrases", "long sentences break at breath or clause boundaries", () => {
  const text = "Every morning I like to practise with my neighbours, and when we finish we go to the little cafe around the corner for breakfast.";
  const parts = coachingPhrases(text);
  eq(parts.join(" "), text); ok(parts[0].endsWith("neighbours,"));
  ok(parts.every(p => p.split(/\s+/).length <= MAX_COACHING_WORDS));
});
test("coaching phrases", "fallback avoids ending on a dangling article or preposition", () => {
  const text = "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen to learn pronunciation together";
  const parts = coachingPhrases(text);
  ok(parts[0].endsWith("seventeen")); ok(parts[1].startsWith("to learn")); eq(parts.join(" "), text);
});
test("assessment payoff", "each supported language finishes with three actionable priority drills", () => {
  for (const l1 of ["hi", "es", "ar", "other"] as const) {
    const s = completeDiagnosis(runDiagnostics(chooseLanguage(fresh(), l1), l1), T);
    const report = buildReport(s.diagnostics, l1);
    eq(report.items.length, 3); eq(new Set(report.items.map(i => i.soundId)).size, 3);
    ok(report.items.every(i => i.name && i.observed && pairsForSound(i.soundId).length > 0));
    eq(s.assessments.length, 1); eq(completeDiagnosis(s, T).assessments.length, 1);
  }
});
const freeAccess = { pro: false, adsRemoved: false };
const subSkus = ["pro_monthly", "pro_yearly"];
const owned = (productId: string, purchaseState = "purchased") => ({ productId, purchaseState });
test("restore access", "successful empty ownership query works without a product catalog", () => {
  eq(restoredAccess(freeAccess, [], subSkus), { access: { ...freeAccess, proSource: undefined }, count: 0 });
});
test("restore access", "lifetime, subscription and ad removal restore independently", () => {
  eq(restoredAccess(freeAccess, [owned("pro_unlock")], subSkus).access, { pro: true, adsRemoved: true, proSource: "lifetime" });
  eq(restoredAccess(freeAccess, [owned("pro_yearly")], subSkus).access, { pro: true, adsRemoved: true, proSource: "subscription" });
  eq(restoredAccess(freeAccess, [owned("remove_ads")], subSkus).access, { pro: false, adsRemoved: true, proSource: undefined });
});
test("restore access", "pending, suspended, unknown and duplicate transactions do not grant extra access", () => {
  const result = restoredAccess(freeAccess, [owned("pro_unlock", "pending"), { ...owned("pro_monthly"), isSuspendedAndroid: true }, owned("other")], subSkus);
  eq(result.access.pro, false); eq(result.count, 0);
  eq(restoredAccess(freeAccess, [owned("pro_unlock"), owned("pro_unlock")], subSkus).count, 1);
});
test("restore access", "grandfathered lifetime survives empty store query; expired subscription does not", () => {
  const lifetime = { pro: true, adsRemoved: true, proSource: "lifetime" as const };
  eq(restoredAccess(lifetime, [], subSkus).access, lifetime);
  eq(restoredAccess({ pro: true, adsRemoved: true }, [], subSkus).access, lifetime);
  eq(restoredAccess({ pro: true, adsRemoved: true, proSource: "subscription" }, [], subSkus).access.pro, false);
});
test("restore recovery", "native error spellings reconnect rather than repeat a disconnected query", () => {
  ok(restoreFailure({ code: "E_SERVICE_UNAVAILABLE" }).retry);
  ok(restoreFailure({ code: "E_NOT_PREPARED" }).retry);
  ok(restoreFailure({ code: "E_ITEM_NOT_OWNED" }).message.includes("No previous purchases"));
});

test("quick onboarding", "every language/accent choice opens a free line without diagnostics or an account", () => {
  for (const nativeLanguage of ["hi", "es", "ar", "other"] as const) {
    for (const targetAccent of ["us", "uk"] as const) {
      const before = emptyState(T);
      const s = finishOnboarding(before, { nativeLanguage, targetAccent });
      ok(s.onboarded); eq(s.profile.nativeLanguage, nativeLanguage); eq(s.profile.targetAccent, targetAccent);
      ok(!!sentenceForSound(s.plan[0], false));
      eq(s.plan, buildPlan([], nativeLanguage)); eq(s.diagnostics, []); eq(s.attempts, []);
      eq(s.quota, before.quota); eq(s.entitlement, before.entitlement); eq(s.profile.accountId, undefined);
      ok(!before.onboarded); eq(before.profile.nativeLanguage, "other");
    }
  }
});
test("quick onboarding", "skip keeps the saved profile, words, purchases and partial sound check", () => {
  const old = buy(saveCustomText(fresh(), "water", T), "lifetime", nowT);
  const d = diagnosticsFor("hi")[0];
  const before = recordDiagnostic(old, mockScore(d, "us", "weak"), { accent: "us", timestamp: nowT, sentenceId: d.id }, T).state;
  eq(finishOnboarding(before), { ...before, onboarded: true });
  eq(finishOnboarding(finishOnboarding(before)), finishOnboarding(before));
  eq(migrateState(JSON.parse(JSON.stringify(finishOnboarding(before))), T), finishOnboarding(before));
});
test("quick onboarding", "journeys keep core actions behind setup and skip discards draft choices", () => {
  const start = sim.init();
  ok(!sim.actions(start).some(a => a.t === "record_diagnostic" || a.t === "record_practice"));
  let s = sim.apply(start, { t: "set_language", l1: "es" });
  s = sim.apply(s, { t: "set_accent", accent: "uk" });
  eq(s.app, start.app);
  const skipped = sim.apply(s, { t: "skip_setup" });
  eq(skipped.app, finishOnboarding(start.app)); eq(skipped.setup, undefined);
  const finished = sim.apply(s, { t: "finish_setup" });
  eq(finished.app.profile.nativeLanguage, "es"); eq(finished.app.profile.targetAccent, "uk");
  eq(finished.setup, undefined); ok(sim.actions(finished).some(a => a.t === "record_practice"));
});
test("quick onboarding", "skip reaches saved offline practice and a return streak without a sound check", () => {
  let s = sim.apply(sim.init(), { t: "skip_setup" });
  s = sim.apply(s, { t: "guided_practice" });
  eq(s.app.streak.current, 1); eq(s.app.streak.lastActiveDate, s.today); eq(s.app.diagnostics.length, 0);
  s = sim.deserialize(sim.serialize(s));
  s = sim.apply(s, { t: "next_day" });
  ok(atRisk(s.app.streak, s.today));
  s = sim.apply(s, { t: "guided_practice" });
  eq(s.app.streak.current, 2); eq(s.app.quota.scoredUsed, 0); eq(sim.invariants(s), []);
});

const failures = results.filter((r) => !r.ok).map((r) => `${r.name}: ${r.why}`);
for (const r of results) if (!r.ok || process.env.VERBOSE === "1") console.error(`${r.ok ? "PASS" : "FAIL"} ${r.name}${r.why ? ` — ${r.why}` : ""}`);
console.log(JSON.stringify({ tests: results.length, passed: results.length - failures.length, failures, features: [...features] }));
process.exit(failures.length ? 1 : 0);
