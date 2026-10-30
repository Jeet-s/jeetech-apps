/// <reference types="node" />
/**
 * Core-logic tests for Sugar Plate — run by `npm run validate`. Every rule in
 * src/core is exercised through the real functions. Final stdout line is JSON:
 *   {"tests": N, "passed": N, "failures": [...], "features": [...]}
 */
import {
  MMOL_FACTOR, toMgdl, toUnit, formatValue, parseValue, valueWarning,
} from "../src/core/units";
import {
  dayKey, addDays, daysBetween, daySpan, weekdayLabel, inQuietHours, parseTime, wallClock,
} from "../src/core/dates";
import {
  emptyState, nextId, activeProfile, autoContext, autoSlot, adaRanges, liveReadings, liveMeals,
  type AppState, type Reading,
} from "../src/core/model";
import { DISHES, searchDishes, dishById, dishCarbs, slug } from "../src/core/dishes";
import {
  addReading, addReadings, validateReading, editReading, deleteReading, restoreReading, bulkDeleteReadings,
  classify, searchReadings, latestLevel, unlinkedReadings,
} from "../src/core/readings";
import {
  parseMeterCsv, sanitizeOcrReadings, normalizeValue, parseDateTime,
} from "../src/core/meterImport";
import {
  parseSfloat, glucoseConcentrationToMgdl, parseGlucoseMeasurement, bleRecordsToReadings,
  bleKey, lastImportedSequence, racpReportRecordsAfter, parseRacpResponse, RACP_REPORT_ALL_RECORDS,
  type GlucoseMeasurement,
} from "../src/core/ble";
import { existingImportKeys } from "../src/core/readings";
import {
  addMeal, totalCarbs, combineGiBand, linkReading, unlinkReading, mealReadings, repeatMeal,
  sameMealCandidate, sanitizeMealEstimate, mealFromEstimate, mealItemFromDish,
} from "../src/core/meals";
import {
  addMedication, logMedication, deleteMedication, medicationsFor,
} from "../src/core/medications";
import {
  addReminder, toggleReminder, isQuiet, nextFire, postMealCheckAt, validateReminderTime,
} from "../src/core/reminders";
import {
  averagesByContext, overallAverage, timeInRange, estimateA1C, a1cForWindow, rankedMeals,
  bestWorstMeals, compareDinnerStaple, loggingStreak, daySeries, insightsReady, A1C_FORMULA,
} from "../src/core/insights";
import {
  buildReport, toCSV, emptyRangeHint, reportSummaryLines, ALL_FIELDS,
} from "../src/core/report";
import {
  countEntries, makeSnapshot, rollSnapshots, verifyCounts, migrateWithVerification, previewRestore, restoreFrom,
} from "../src/core/backup";
import {
  aiRemaining, consumeAi, canUseAi, FREE_AI_DAILY, PRO_AI_DAILY, isProFeature,
} from "../src/core/pro";
import {
  toggleUnit, setRange, resetRangesToAda, setLowThreshold, addProfile, switchProfile, deleteProfile,
  addSwapGoal, incrementSwapGoal, acceptDisclaimer,
} from "../src/core/profiles";
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
function ok(v: unknown, msg = "") {
  if (!v) throw new Error(`${msg} expected truthy, got ${JSON.stringify(v)}`);
}
function near(a: number, b: number, eps = 0.001, msg = "") {
  if (Math.abs(a - b) > eps) throw new Error(`${msg} expected ~${b}, got ${a}`);
}

const DAY = 86_400_000;
const NOON = wallClock(2026, 3, 10, 12, 0);

// ── Units ──────────────────────────────────────────────────────────────────────
test("units", "mg/dL stored as typed", () => eq(toMgdl(130, "mgdl"), 130));
test("units", "mmol → mg/dL uses IFCC factor", () => near(toMgdl(7.2, "mmol"), 7.2 * MMOL_FACTOR));
test("units", "mmol round-trips without drift", () => eq(toUnit(toMgdl(7.2, "mmol"), "mmol"), 7.2));
test("units", "mg/dL round-trips exactly", () => eq(toUnit(130, "mgdl"), 130));
test("units", "format mmol is 1 decimal", () => eq(formatValue(toMgdl(5.5, "mmol"), "mmol"), "5.5"));
test("units", "format mg/dL is integer", () => eq(formatValue(130, "mgdl"), "130"));
test("units", "parse accepts comma decimal", () => near(parseValue("7,2", "mmol")!, 7.2 * MMOL_FACTOR));
test("units", "parse rejects non-number", () => eq(parseValue("abc", "mgdl"), null));
test("units", "parse rejects zero/negative", () => eq(parseValue("0", "mgdl"), null));
test("units", "warn when mmol value looks like mg/dL", () => eq(valueWarning(toMgdl(72, "mmol"), "mmol"), "wrong_unit"));
test("units", "warn implausibly high mg/dL", () => eq(valueWarning(650, "mgdl"), "implausible_high"));
test("units", "normal value has no warning", () => eq(valueWarning(110, "mgdl"), null));

// ── Dates ──────────────────────────────────────────────────────────────────────
test("dates", "dayKey from wall clock", () => eq(dayKey(NOON), "2026-03-10"));
test("dates", "addDays across month", () => eq(addDays("2026-01-31", 1), "2026-02-01"));
test("dates", "addDays across year", () => eq(addDays("2026-12-31", 1), "2027-01-01"));
test("dates", "addDays leap day", () => eq(addDays("2028-02-28", 1), "2028-02-29"));
test("dates", "daysBetween", () => eq(daysBetween("2026-03-01", "2026-03-10"), 9));
test("dates", "weekday label", () => eq(weekdayLabel(NOON), "Tue"));
test("dates", "quiet hours wrap past midnight", () => eq(inQuietHours(parseTime("23:00"), "22:00", "07:00"), true));
test("dates", "midday is not quiet", () => eq(inQuietHours(parseTime("12:00"), "22:00", "07:00"), false));
test("dates", "daySpan counts distinct days inclusive", () =>
  eq(daySpan([NOON, NOON + DAY, NOON + 2 * DAY]), 3));

// ── Auto context / slot ────────────────────────────────────────────────────────
test("auto-context", "morning reads as fasting", () => eq(autoContext(wallClock(2026, 3, 10, 7, 0)), "fasting"));
test("auto-context", "evening reads as post-meal", () => eq(autoContext(wallClock(2026, 3, 10, 20, 0)), "post_meal"));
test("auto-context", "late night reads as bedtime", () => eq(autoContext(wallClock(2026, 3, 10, 23, 0)), "bedtime"));
test("auto-context", "small hours read as fasting, never bedtime", () => eq(autoContext(wallClock(2026, 3, 10, 2, 43)), "fasting"));
test("auto-context", "bedtime starts at 21:00, not before", () =>
  eq([autoContext(wallClock(2026, 3, 10, 20, 30)), autoContext(wallClock(2026, 3, 10, 21, 30))], ["post_meal", "bedtime"]));
test("auto-context", "slot by hour", () =>
  eq([autoSlot(wallClock(2026, 3, 10, 8, 0)), autoSlot(wallClock(2026, 3, 10, 13, 0)), autoSlot(wallClock(2026, 3, 10, 19, 0))], ["breakfast", "lunch", "dinner"]));

// ── Dish database ───────────────────────────────────────────────────────────────
test("dishes", "at least 600 dishes bundled", () => ok(DISHES.length >= 600, `only ${DISHES.length}`));
test("dishes", "all dish ids unique", () => eq(new Set(DISHES.map((d) => d.id)).size, DISHES.length));
test("dishes", "all four regions present", () => eq(Array.from(new Set(DISHES.map((d) => d.region))).sort(), ["africa", "india", "latam", "other"]));
test("dishes", "search finds roti by name", () => ok(searchDishes("roti").some((d) => d.id === "roti")));
test("dishes", "search finds roti by alias chapati", () => ok(searchDishes("chapati").some((d) => d.id === "roti")));
test("dishes", "every dish carries a swap idea", () => ok(DISHES.every((d) => d.swapIdeas.length > 0)));
test("dishes", "carb range is ordered", () => ok(DISHES.every((d) => d.carbsLow <= d.carbsHigh)));
test("dishes", "dishCarbs scales with portion", () => eq(dishCarbs(dishById("steamed_rice")!, 2), 2 * dishCarbs(dishById("steamed_rice")!, 1)));
test("dishes", "cuisine bias floats region up", () => {
  const r = searchDishes("rice", { cuisine: "india" });
  ok(r.length > 0 && r[0].region === "india");
});
test("dishes", "slug strips punctuation", () => eq(slug("Ham and cheese empanada!"), "ham_and_cheese_empanada"));

// ── Readings ────────────────────────────────────────────────────────────────────
const base = () => emptyState(NOON);
test("readings", "add a reading", () => {
  const { state, error } = addReading(base(), { valueMgdl: 120, ts: NOON }, NOON);
  eq(error, null);
  eq(liveReadings(state).length, 1);
});
test("readings", "auto context when omitted", () => {
  const { state } = addReading(base(), { valueMgdl: 100, ts: wallClock(2026, 3, 10, 7, 0) }, NOON);
  eq(liveReadings(state)[0].context, "fasting");
});
test("readings", "reject empty value", () => eq(validateReading({ valueMgdl: 0, ts: NOON }), "no_value"));
test("readings", "reject out-of-range without force", () => eq(validateReading({ valueMgdl: 1000, ts: NOON }), "out_of_range"));
test("readings", "force allows out-of-range", () => eq(validateReading({ valueMgdl: 1000, ts: NOON }, true), null));
test("readings", "decimals accepted (mmol stored canonical)", () => {
  const { state } = addReading(base(), { valueMgdl: toMgdl(5.5, "mmol"), ts: NOON }, NOON);
  eq(formatValue(liveReadings(state)[0].valueMgdl, "mmol"), "5.5");
});
test("readings", "backdated entry allowed", () => {
  const past = NOON - 40 * DAY;
  const { state } = addReading(base(), { valueMgdl: 110, ts: past }, NOON);
  eq(dayKey(liveReadings(state)[0].ts), dayKey(past));
});
test("readings", "classify in-range/high/low", () => {
  const p = activeProfile(base());
  eq([classify(120, "fasting", p).level, classify(200, "post_meal", p).level, classify(60, "fasting", p).level],
    ["in_range", "high", "low"]);
});
test("readings", "low threshold flags unsafe", () => eq(classify(60, "fasting", activeProfile(base())).unsafeLow, true));
test("readings", "classify uses icon not color alone", () => eq(classify(200, "post_meal", activeProfile(base())).icon, "arrow-up"));
test("readings", "edit a reading", () => {
  const { state } = addReading(base(), { valueMgdl: 120, ts: NOON }, NOON);
  const id = liveReadings(state)[0].id;
  const { state: s2 } = editReading(state, id, { valueMgdl: 90 }, NOON + 1000);
  eq(liveReadings(s2)[0].valueMgdl, 90);
});
test("readings", "soft delete then restore", () => {
  const { state } = addReading(base(), { valueMgdl: 120, ts: NOON }, NOON);
  const id = liveReadings(state)[0].id;
  const del = deleteReading(state, id, NOON + 1000);
  eq(liveReadings(del).length, 0);
  eq(liveReadings(restoreReading(del, id, NOON + 2000)).length, 1);
});
test("readings", "bulk delete", () => {
  let s = base();
  for (let i = 0; i < 3; i++) s = addReading(s, { valueMgdl: 100 + i, ts: NOON + i }, NOON).state;
  const ids = liveReadings(s).map((r) => r.id);
  eq(liveReadings(bulkDeleteReadings(s, ids, NOON)).length, 0);
});
test("readings", "search by note", () => {
  let s = base();
  s = addReading(s, { valueMgdl: 120, ts: NOON, note: "after biryani" }, NOON).state;
  s = addReading(s, { valueMgdl: 100, ts: NOON + 1, note: "fasting" }, NOON).state;
  eq(searchReadings(s, "biryani").length, 1);
});
test("readings", "latest level reflects newest reading", () => {
  let s = base();
  s = addReading(s, { valueMgdl: 200, ts: NOON, context: "post_meal" }, NOON).state;
  eq(latestLevel(s)!.level, "high");
});

// ── Meals ─────────────────────────────────────────────────────────────────────────
test("meals", "totalCarbs sums items", () => eq(totalCarbs([{ name: "a", portion: 1, carbsG: 30 }, { name: "b", portion: 1, carbsG: 20 }]), 50));
test("meals", "combine GI takes strongest", () => eq(combineGiBand(["low", "high", "medium"]), "high"));
test("meals", "add a meal from a dish", () => {
  const { state, error } = addMeal(base(), { items: [mealItemFromDish(dishById("roti")!)], ts: NOON }, NOON);
  eq(error, null);
  eq(liveMeals(state).length, 1);
});
test("meals", "reject empty meal", () => eq(addMeal(base(), { items: [], ts: NOON }, NOON).error, "no_items"));
test("meals", "link reading to meal and compute delta", () => {
  let s = base();
  const r1 = addReading(s, { valueMgdl: 110, ts: NOON - 1000 }, NOON); s = r1.state;
  const m = addMeal(s, { items: [mealItemFromDish(dishById("roti")!)], ts: NOON }, NOON); s = m.state;
  const r2 = addReading(s, { valueMgdl: 170, ts: NOON + 2 * 3600_000 }, NOON); s = r2.state;
  s = linkReading(s, r1.id!, m.id!, NOON);
  s = linkReading(s, r2.id!, m.id!, NOON);
  const mr = mealReadings(s, m.id!);
  eq([mr.before!.valueMgdl, mr.after!.valueMgdl, mr.delta], [110, 170, 60]);
});
test("meals", "unlink reading", () => {
  let s = base();
  const r = addReading(s, { valueMgdl: 110, ts: NOON }, NOON); s = r.state;
  const m = addMeal(s, { items: [mealItemFromDish(dishById("roti")!)], ts: NOON }, NOON); s = m.state;
  s = linkReading(s, r.id!, m.id!, NOON);
  s = unlinkReading(s, r.id!, NOON);
  eq(unlinkedReadings(s).length, 1);
});
test("meals", "repeat clones a meal", () => {
  const m = addMeal(base(), { items: [mealItemFromDish(dishById("roti")!)], ts: NOON }, NOON);
  const rep = repeatMeal(m.state, m.id!, NOON + DAY);
  eq(liveMeals(rep.state).length, 2);
  eq(liveMeals(rep.state)[1].items, liveMeals(rep.state)[0].items);
});
test("meals", "same-meal candidate finds yesterday's slot", () => {
  const dinnerYesterday = wallClock(2026, 3, 9, 19, 0);
  const m = addMeal(base(), { items: [mealItemFromDish(dishById("roti")!)], ts: dinnerYesterday, slot: "dinner" }, dinnerYesterday);
  const cand = sameMealCandidate(m.state, "dinner", wallClock(2026, 3, 10, 19, 0));
  ok(cand && cand.id === m.id);
});
test("ai-meal", "sanitize clamps and fills AI estimate", () => {
  const est = sanitizeMealEstimate({ dishes: [{ name: "Rice", carbs_g: 9999 }], gi_band: "banana" as any });
  eq(est.items[0].carbsG, 300);
  eq(est.giBand, "medium");
  ok(est.swapText.length > 0 && est.estimate === true);
});
test("ai-meal", "estimate becomes a NewMeal tagged ai", () => {
  const est = sanitizeMealEstimate({ dishes: [{ name: "Dal", carbs_g: 25 }], carbs_total_g: 25, gi_band: "low", swap: "add veg" });
  eq(mealFromEstimate(est, NOON).source, "ai");
});

// ── Medications ─────────────────────────────────────────────────────────────────
test("medications", "add and reuse a medication", () => {
  const { state, error } = addMedication(base(), { name: "Metformin", type: "pill", defaultDose: 500, doseUnit: "mg" });
  eq(error, null);
  eq(medicationsFor(state).length, 1);
});
test("medications", "reject duplicate name", () => {
  const s = addMedication(base(), { name: "Metformin", type: "pill", defaultDose: 500, doseUnit: "mg" }).state;
  eq(addMedication(s, { name: "metformin", type: "pill", defaultDose: 500, doseUnit: "mg" }).error, "duplicate");
});
test("medications", "log keeps name after med deleted", () => {
  let s = addMedication(base(), { name: "Lantus", type: "insulin", defaultDose: 10, doseUnit: "units" }).state;
  const medId = medicationsFor(s)[0].id;
  const log = logMedication(s, { medicationId: medId, dose: 10, ts: NOON }, NOON); s = log.state;
  s = deleteMedication(s, medId);
  eq(s.medLogs[0].name, "Lantus");
});
test("medications", "reject bad dose", () => {
  const s = addMedication(base(), { name: "X", type: "pill", defaultDose: 1, doseUnit: "mg" }).state;
  eq(logMedication(s, { medicationId: medicationsFor(s)[0].id, dose: NaN, ts: NOON }, NOON).error, "bad_dose");
});

// ── Reminders ─────────────────────────────────────────────────────────────────────
test("reminders", "add a valid reminder", () => eq(addReminder(base(), { kind: "fasting", time: "08:00" }).error, null));
test("reminders", "reject bad time", () => eq(addReminder(base(), { kind: "fasting", time: "25:00" }).error, "bad_time"));
test("reminders", "validate time format", () => eq([validateReminderTime("07:30"), validateReminderTime("7:5")], [true, false]));
test("reminders", "toggle on/off", () => {
  const a = addReminder(base(), { kind: "meal", time: "12:00" });
  eq(toggleReminder(a.state, a.id!, false).reminders[0].enabled, false);
});
test("reminders", "quiet hours detected", () => {
  let s = base();
  s = { ...s, quietHours: { enabled: true, start: "22:00", end: "07:00" } };
  eq([isQuiet(s, "23:00"), isQuiet(s, "12:00")], [true, false]);
});
test("reminders", "nextFire honours selected weekday", () => {
  const a = addReminder(base(), { kind: "medication", time: "09:00", days: [1] }); // Monday only
  const fire = nextFire(a.state.reminders[0], wallClock(2026, 3, 10, 8, 0)); // Tue
  eq(weekdayLabel(fire), "Mon");
});
test("reminders", "post-meal check null inside quiet hours", () => {
  let s = base();
  s = { ...s, quietHours: { enabled: true, start: "22:00", end: "07:00" } };
  eq(postMealCheckAt(wallClock(2026, 3, 10, 21, 0), s), null);
});

// ── Insights ──────────────────────────────────────────────────────────────────────
function withReadings(vals: { v: number; ctx?: Reading["context"]; dayOffset?: number }[]): AppState {
  let s = emptyState(NOON);
  vals.forEach((x, i) => {
    s = addReading(s, { valueMgdl: x.v, ts: NOON + (x.dayOffset ?? 0) * DAY + i * 1000, context: x.ctx }, NOON).state;
  });
  return s;
}
test("insights", "averages by context", () => {
  const s = withReadings([{ v: 100, ctx: "fasting" }, { v: 120, ctx: "fasting" }, { v: 200, ctx: "post_meal" }]);
  const a = averagesByContext(s, NOON + DAY, 30);
  eq(a.fasting.avgMgdl, 110);
  eq(a.fasting.n, 2);
});
test("insights", "overall average", () => eq(overallAverage(withReadings([{ v: 100 }, { v: 140 }]), NOON + DAY, 30).avgMgdl, 120));
test("insights", "time in range counts per context", () => {
  const s = withReadings([{ v: 100, ctx: "fasting" }, { v: 250, ctx: "fasting" }, { v: 60, ctx: "fasting" }]);
  const tir = timeInRange(s, NOON + DAY, 30);
  eq([tir.inRange, tir.high, tir.low, tir.total], [1, 1, 1, 3]);
});
test("insights", "A1C uses eAG formula", () => {
  const s = withReadings([{ v: 110 }]);
  eq(estimateA1C(liveReadings(s)).a1c, 5.5);
});
test("insights", "A1C works from a single reading", () => {
  const est = estimateA1C(liveReadings(withReadings([{ v: 154 }])));
  eq([est.a1c, est.n, est.days], [7, 1, 1]);
  ok(est.confidence.includes("1 reading"));
});
test("insights", "A1C exposes its formula", () => eq(a1cForWindow(withReadings([{ v: 110 }]), NOON + DAY).formula, A1C_FORMULA));
test("insights", "A1C empty is null with note", () => {
  const est = estimateA1C([]);
  eq(est.a1c, null);
  ok(est.confidence.length > 0);
});

function linkedMealState(afterValue: number, beforeValue = 110, item = "Rice"): { s: AppState; mealId: string } {
  let s = emptyState(NOON);
  const r1 = addReading(s, { valueMgdl: beforeValue, ts: NOON - 1000 }, NOON); s = r1.state;
  const m = addMeal(s, { items: [{ name: item, portion: 1, carbsG: 45 }], ts: NOON, slot: "dinner" }, NOON); s = m.state;
  const r2 = addReading(s, { valueMgdl: afterValue, ts: NOON + 2 * 3600_000 }, NOON); s = r2.state;
  s = linkReading(s, r1.id!, m.id!, NOON);
  s = linkReading(s, r2.id!, m.id!, NOON);
  return { s, mealId: m.id! };
}
test("insights", "ranked meals ordered by post reading", () => {
  let { s } = linkedMealState(150);
  // add a worse meal
  const m2 = addMeal(s, { items: [{ name: "Naan", portion: 1, carbsG: 50 }], ts: NOON + 3 * 3600_000, slot: "dinner" }, NOON); s = m2.state;
  const r = addReading(s, { valueMgdl: 220, ts: NOON + 5 * 3600_000 }, NOON); s = r.state;
  s = linkReading(s, r.id!, m2.id!, NOON);
  const ranked = rankedMeals(s);
  eq([ranked[0].postMgdl, ranked[1].postMgdl], [150, 220]);
});
test("insights", "best/worst reports sample size", () => eq(bestWorstMeals(linkedMealState(150).s).sample, 1));
test("insights", "insights not ready under 3 linked meals", () => {
  const r = insightsReady(linkedMealState(150).s, 3);
  eq([r.ready, r.have, r.need], [false, 1, 2]);
});
test("insights", "comparison needs >= 3 of each", () => {
  const c = compareDinnerStaple(emptyState(NOON), "rice", "roti");
  eq(c.enough, false);
  ok(c.note.includes("at least 3"));
});
test("insights", "comparison reports averages when enough", () => {
  let s = emptyState(NOON);
  const mkDinner = (day: number, item: string, nextFasting: number) => {
    const dinner = wallClock(2026, 2, day, 19, 0);
    const morning = wallClock(2026, 2, day + 1, 7, 0);
    s = addMeal(s, { items: [{ name: item, portion: 1, carbsG: 45 }], ts: dinner, slot: "dinner" }, dinner).state;
    s = addReading(s, { valueMgdl: nextFasting, ts: morning, context: "fasting" }, morning).state;
  };
  [1, 2, 3].forEach((d) => mkDinner(d, "Rice bowl", 130));
  [5, 6, 7].forEach((d) => mkDinner(d, "Roti plate", 100));
  const c = compareDinnerStaple(s, "rice", "roti");
  eq([c.enough, Math.round(c.aAvg!), Math.round(c.bAvg!)], [true, 130, 100]);
});
test("insights", "logging streak counts consecutive days", () => {
  const s = withReadings([{ v: 100, dayOffset: 0 }, { v: 100, dayOffset: -1 }, { v: 100, dayOffset: -2 }]);
  eq(loggingStreak(s, NOON), 3);
});
test("insights", "streak off when disabled", () => {
  let s = withReadings([{ v: 100, dayOffset: 0 }]);
  s = { ...s, streakEnabled: false };
  eq(loggingStreak(s, NOON), 0);
});
test("insights", "daySeries has N days ending today", () => {
  const s = withReadings([{ v: 120, dayOffset: 0 }]);
  const series = daySeries(s, NOON, 7);
  eq(series.length, 7);
  eq(series[6].day, dayKey(NOON));
  eq(series[6].avgMgdl, 120);
});

// ── Report & export ────────────────────────────────────────────────────────────────
function reportState(): AppState {
  let s = emptyState(NOON);
  s = addReading(s, { valueMgdl: 120, ts: NOON, context: "fasting", note: "after, rice" }, NOON).state;
  s = addMeal(s, { items: [mealItemFromDish(dishById("roti")!)], ts: NOON }, NOON).state;
  s = addMedication(s, { name: "Metformin", type: "pill", defaultDose: 500, doseUnit: "mg" }).state;
  s = logMedication(s, { medicationId: medicationsFor(s)[0].id, dose: 500, ts: NOON }, NOON).state;
  return s;
}
test("report", "build counts entries in range", () => {
  const r = buildReport(reportState(), { from: NOON - DAY, to: NOON + DAY, fields: ALL_FIELDS });
  eq([r.counts.readings, r.counts.meals, r.counts.medLogs], [1, 1, 1]);
  ok(r.hasData);
});
test("report", "field selection excludes meds", () => {
  const r = buildReport(reportState(), { from: NOON - DAY, to: NOON + DAY, fields: { readings: true, meals: true, medications: false } });
  eq(r.counts.medLogs, 0);
});
test("report", "CSV has a Unit column header", () => ok(toCSV(buildReport(reportState(), { from: NOON - DAY, to: NOON + DAY })).split("\n")[0].includes("Unit")));
test("report", "CSV writes unit label for readings", () => ok(toCSV(buildReport(reportState(), { from: NOON - DAY, to: NOON + DAY })).includes("mg/dL")));
test("report", "CSV escapes commas in notes", () => ok(toCSV(buildReport(reportState(), { from: NOON - DAY, to: NOON + DAY })).includes('"after, rice"')));
test("report", "summary shows A1C formula", () => ok(reportSummaryLines(buildReport(reportState(), { from: NOON - DAY, to: NOON + DAY })).some((l) => l.includes(A1C_FORMULA))));
test("report", "empty range hint", () => {
  const r = buildReport(emptyState(NOON), { from: NOON - DAY, to: NOON + DAY });
  ok(emptyRangeHint(r));
});

// ── Backup / migration ──────────────────────────────────────────────────────────────
test("backup", "count entries is live-only", () => {
  let s = addReading(base(), { valueMgdl: 120, ts: NOON }, NOON).state;
  const id = liveReadings(s)[0].id;
  s = deleteReading(s, id, NOON);
  eq(countEntries(s).readings, 0);
});
test("backup", "rolling keeps last 7 days, one per day", () => {
  let list = [] as ReturnType<typeof makeSnapshot>[];
  for (let i = 0; i < 9; i++) list = rollSnapshots(list, makeSnapshot(base(), NOON + i * DAY));
  eq(list.length, 7);
  eq(new Set(list.map((x) => x.day)).size, 7);
});
test("backup", "two snapshots same day collapse to newest", () => {
  let list = [] as ReturnType<typeof makeSnapshot>[];
  list = rollSnapshots(list, makeSnapshot(base(), NOON));
  list = rollSnapshots(list, makeSnapshot(base(), NOON + 3600_000));
  eq(list.length, 1);
  eq(list[0].ts, NOON + 3600_000);
});
test("backup", "verifyCounts flags mismatch", () => {
  const a = countEntries(addReading(base(), { valueMgdl: 120, ts: NOON }, NOON).state);
  const b = countEntries(base());
  eq(verifyCounts(a, b).ok, false);
});
test("backup", "migration rolls back on data loss", () => {
  const s = addReading(base(), { valueMgdl: 120, ts: NOON }, NOON).state;
  const res = migrateWithVerification(s, (st) => ({ ...st, readings: [] }), NOON);
  eq([res.rolledBack, countEntries(res.state).readings], [true, 1]);
});
test("backup", "identity migration verifies ok", () => {
  const s = addReading(base(), { valueMgdl: 120, ts: NOON }, NOON).state;
  eq(migrateWithVerification(s, (st) => ({ ...st }), NOON).rolledBack, false);
});
test("backup", "preview rejects corrupt file", () => eq(previewRestore("{not json").error, "corrupt"));
test("backup", "preview rejects wrong shape", () => eq(previewRestore("{}").error, "wrong_shape"));
test("backup", "preview + restore round-trips counts", () => {
  const s = addReading(base(), { valueMgdl: 120, ts: NOON }, NOON).state;
  const snap = makeSnapshot(s, NOON);
  eq(previewRestore(snap.data).counts!.readings, 1);
  eq(countEntries(restoreFrom(snap.data).state!).readings, 1);
});
test("backup", "preview rejects a truncated backup missing profiles", () => {
  const s = addReading(base(), { valueMgdl: 120, ts: NOON }, NOON).state;
  const broken = JSON.stringify({ ...s, profiles: undefined });
  eq(previewRestore(broken).error, "wrong_shape");
});
test("backup", "preview rejects a newer-schema backup", () => {
  const s = addReading(base(), { valueMgdl: 120, ts: NOON }, NOON).state;
  eq(previewRestore(JSON.stringify({ ...s, schemaVersion: 999 })).error, "too_new");
});
test("backup", "fresh-install restore recovers every entry", () => {
  // Simulate a phone change: build data, export, then restore onto an empty app.
  let s = emptyState(NOON);
  s = addReading(s, { valueMgdl: 120, ts: NOON, note: "after rice" }, NOON).state;
  s = addMeal(s, { items: [mealItemFromDish(dishById("roti")!)], ts: NOON }, NOON).state;
  const exported = JSON.stringify({ ...s, schemaVersion: 1 });
  const restored = restoreFrom(exported);
  ok(restored.verification.ok);
  eq(countEntries(restored.state!), countEntries(s));
});

// ── Meter import (CSV + OCR) ──────────────────────────────────────────────────────
test("meter-import", "CSV parses rows and maps context + unit", () => {
  const csv = "Date,Time,Glucose (mg/dL),Context\n2026-03-10,07:30,112,Fasting\n2026-03-10,21:15,140,After meal\nbad,row,x,y";
  const res = parseMeterCsv(csv, NOON);
  eq(res.readings.length, 2);
  eq(res.skipped, 1);
  eq([res.readings[0].valueMgdl, res.readings[0].context], [112, "fasting"]);
  eq(res.readings[1].context, "post_meal");
});
test("meter-import", "CSV mmol column converts to canonical mg/dL", () => {
  const csv = "Date,Time,Reading,Unit\n2026-03-10,08:00,5.5,mmol/L";
  const res = parseMeterCsv(csv, NOON);
  eq(res.readings.length, 1);
  near(res.readings[0].valueMgdl, Math.round(toMgdl(5.5, "mmol")), 1);
});
test("meter-import", "normalizeValue infers mmol for small numbers", () => {
  eq(normalizeValue(126), 126);
  near(normalizeValue(5.5)!, Math.round(toMgdl(5.5, "mmol")), 1);
  eq(normalizeValue(5.5, "mgdl"), null); // 5.5 mg/dL is below the plausible floor
  eq(normalizeValue(9999), null);
});
test("meter-import", "parseDateTime builds a wall-clock epoch", () => {
  eq(dayKey(parseDateTime("2026-03-10", "07:30", NOON)), "2026-03-10");
});
test("meter-import", "OCR readings sanitize + clamp", () => {
  const res = sanitizeOcrReadings({ readings: [{ value: 118, unit: "mgdl" }, { value: 0 }] }, NOON);
  eq(res.readings.length, 1);
  eq([res.readings[0].valueMgdl, res.skipped], [118, 1]);
});
test("meter-import", "bulk addReadings lands imported rows", () => {
  const res = parseMeterCsv("Date,Time,Glucose,Context\n2026-03-10,07:30,112,Fasting", NOON);
  const { state, added } = addReadings(base(), res.readings, NOON);
  eq(added, 1);
  eq(liveReadings(state).length, 1);
});

// ── Bluetooth Glucose Profile (0x1808 / 0x2A18 / 0x2A52) ────────────────────────────
// A Glucose Measurement record: flags, seq (uint16 LE), base time (year LE, mo, day, h, m, s),
// [time offset sint16 LE], [concentration SFLOAT LE + type/location]. 0.0012 kg/L = 120 mg/dL.
const GM_120 = [0x02, 5, 0, 0xea, 0x07, 1, 15, 8, 30, 0, 0x0c, 0xc0]; // seq 5, 2026-01-15 08:30, 120 mg/dL
test("ble", "SFLOAT decodes mantissa × 10^exponent", () => {
  near(parseSfloat(0xc00c), 0.0012, 1e-9); // mantissa 12, exponent -4
  ok(Number.isNaN(parseSfloat(0x07ff)), "reserved NaN");
});
test("ble", "kg/L and mol/L concentrations convert to mg/dL", () => {
  eq(glucoseConcentrationToMgdl(0.0012, false), 120); // kg/L
  eq(glucoseConcentrationToMgdl(0.007, true), Math.round(7 * MMOL_FACTOR)); // mol/L → 7 mmol/L
  eq(glucoseConcentrationToMgdl(0, false), null);
  eq(glucoseConcentrationToMgdl(0.9, false), null); // 90000 mg/dL → implausible
});
test("ble", "parseGlucoseMeasurement reads seq, time and value", () => {
  const rec = parseGlucoseMeasurement(GM_120, NOON)!;
  eq(rec.sequence, 5);
  eq(rec.valueMgdl, 120);
  eq(dayKey(rec.ts), "2026-01-15");
  eq([new Date(rec.ts).getUTCHours(), new Date(rec.ts).getUTCMinutes()], [8, 30]);
});
test("ble", "time offset shifts the record timestamp", () => {
  // flags 0x03 = time offset + concentration; offset +60 min.
  const rec = parseGlucoseMeasurement([0x03, 9, 0, 0xea, 0x07, 1, 15, 8, 30, 0, 60, 0, 0x0c, 0xc0], NOON)!;
  eq(new Date(rec.ts).getUTCHours(), 9);
});
test("ble", "short or value-less records are handled", () => {
  eq(parseGlucoseMeasurement([0x02, 1], NOON), null); // too short
  const noValue = parseGlucoseMeasurement([0x00, 7, 0, 0xea, 0x07, 1, 15, 8, 30, 0], NOON)!;
  eq([noValue.sequence, noValue.valueMgdl], [7, null]); // no concentration flag
});
test("ble", "records convert to readings tagged ble with a de-dup key", () => {
  const rec = parseGlucoseMeasurement(GM_120, NOON)!;
  const { readings } = bleRecordsToReadings([rec], "dev-A", new Set());
  eq(readings.length, 1);
  eq([readings[0].source, readings[0].valueMgdl, readings[0].importKey], ["ble", 120, bleKey("dev-A", 5)]);
});
test("ble", "de-dup by device + sequence across a re-import", () => {
  const recs: GlucoseMeasurement[] = [
    { sequence: 5, ts: NOON, valueMgdl: 120 },
    { sequence: 6, ts: NOON, valueMgdl: 132 },
  ];
  // First import: both land and are tagged ble.
  let s = base();
  const first = bleRecordsToReadings(recs, "dev-A", existingImportKeys(s));
  eq(first.readings.length, 2);
  s = addReadings(s, first.readings, NOON).state;
  eq(liveReadings(s).filter((r) => r.source === "ble").length, 2);
  // Re-import the same records → all duplicates, nothing added.
  const again = bleRecordsToReadings(recs, "dev-A", existingImportKeys(s));
  eq([again.readings.length, again.duplicates], [0, 2]);
  eq(addReadings(s, again.readings, NOON).added, 0);
  // A different device with the same sequence is NOT a duplicate.
  eq(bleRecordsToReadings(recs, "dev-B", existingImportKeys(s)).readings.length, 2);
});
test("ble", "dedup survives deleting an imported reading (no re-add)", () => {
  const rec: GlucoseMeasurement = { sequence: 5, ts: NOON, valueMgdl: 120 };
  let s = addReadings(base(), bleRecordsToReadings([rec], "dev-A", new Set()).readings, NOON).state;
  s = deleteReading(s, s.readings[0].id, NOON); // soft-delete keeps the importKey
  eq(bleRecordsToReadings([rec], "dev-A", existingImportKeys(s)).readings.length, 0);
});
test("ble", "lastImportedSequence finds the high-water mark per device", () => {
  const keys = new Set([bleKey("dev-A", 3), bleKey("dev-A", 11), bleKey("dev-B", 99)]);
  eq(lastImportedSequence(keys, "dev-A"), 11);
  eq(lastImportedSequence(keys, "dev-C"), 0);
});
test("ble", "RACP commands and responses encode/parse", () => {
  eq(RACP_REPORT_ALL_RECORDS, [0x01, 0x01]);
  eq(racpReportRecordsAfter(5), [0x01, 0x03, 0x01, 5, 0]);
  eq(racpReportRecordsAfter(300), [0x01, 0x03, 0x01, 300 & 0xff, 300 >> 8]);
  eq(parseRacpResponse([0x06, 0x00, 0x01, 0x01])!.success, true); // response code: success
  eq(parseRacpResponse([0x06, 0x00, 0x01, 0x06])!.success, false); // no records found
  eq(parseRacpResponse([0x05, 0x00, 0x03, 0x00])!.numberOfRecords, 3);
});

// ── Pro gating / AI quota ──────────────────────────────────────────────────────────
test("pro", "free users get 3 AI analyses/day", () => eq(aiRemaining(base(), false, "2026-03-10"), FREE_AI_DAILY));
test("pro", "consuming AI decrements remaining", () => {
  const s = consumeAi(base(), "2026-03-10");
  eq(aiRemaining(s, false, "2026-03-10"), FREE_AI_DAILY - 1);
});
test("pro", "pro users get the higher daily quota", () => eq(aiRemaining(base(), true, "2026-03-10"), PRO_AI_DAILY));
test("pro", "quota resets on a new day", () => {
  let s = base();
  for (let i = 0; i < FREE_AI_DAILY; i++) s = consumeAi(s, "2026-03-10");
  eq(canUseAi(s, false, "2026-03-10"), false);
  eq(canUseAi(s, false, "2026-03-11"), true);
});
test("pro", "cloud sync is a Pro feature", () => eq(isProFeature("cloud_sync"), true));

// ── Profiles / settings ──────────────────────────────────────────────────────────────
test("profiles", "toggle unit persists on profile, data unchanged", () => {
  let s = addReading(base(), { valueMgdl: 130, ts: NOON }, NOON).state;
  const before = liveReadings(s)[0].valueMgdl;
  s = toggleUnit(s);
  eq(activeProfile(s).unit, "mmol");
  eq(liveReadings(s)[0].valueMgdl, before); // canonical mg/dL never rewritten
});
test("profiles", "custom range rejects low>=high", () => eq(setRange(base(), "fasting", { low: 130, high: 120 }).error, "low_ge_high"));
test("profiles", "custom range sets preset custom", () => {
  const { state } = setRange(base(), "fasting", { low: 70, high: 120 });
  eq(activeProfile(state).rangePreset, "custom");
});
test("profiles", "reset ranges back to ADA", () => {
  const { state } = setRange(base(), "fasting", { low: 70, high: 120 });
  eq(activeProfile(resetRangesToAda(state)).ranges.fasting, adaRanges().fasting);
});
test("profiles", "set low threshold", () => eq(activeProfile(setLowThreshold(base(), 65)).lowThreshold, 65));
test("profiles", "add family profile and switch", () => {
  const { state, id } = addProfile(base(), { name: "Mum" }, NOON);
  eq(state.profiles.length, 2);
  eq(switchProfile(state, id!).activeProfileId, id);
});
test("profiles", "reject duplicate profile name", () => {
  const { state } = addProfile(base(), { name: "Mum" }, NOON);
  eq(addProfile(state, { name: "mum" }, NOON).error, "duplicate");
});
test("profiles", "cannot delete the last profile", () => eq(deleteProfile(base(), "p1").error, "last_profile"));
test("profiles", "accept disclaimer once", () => eq(acceptDisclaimer(base()).disclaimerAccepted, true));
test("profiles", "swap goal increments to completion", () => {
  const { state, id } = addSwapGoal(base(), { text: "Try millet roti", targetCount: 2 }, NOON);
  let s = incrementSwapGoal(state, id!);
  s = incrementSwapGoal(s, id!);
  const g = s.swapGoals[0];
  eq([g.doneCount, g.active], [2, false]);
});

// ── Persistence & migration path ────────────────────────────────────────────────────
test("persistence", "nextId increments the counter", () => {
  const s = base();
  eq(nextId(s, "r").id, `r${s.seq + 1}`);
});
test("persistence", "sim state survives serialize → deserialize", () => {
  let s = sim.init();
  for (const a of sim.actions(s).slice(0, 5)) s = sim.apply(s, a);
  eq(sim.deserialize(sim.serialize(s)), s);
});
test("persistence", "sim invariants hold after random-ish actions", () => {
  let s = sim.init();
  for (const a of sim.actions(s)) s = sim.apply(s, a);
  eq(sim.invariants(s), []);
});

const failures = results.filter((r) => !r.ok).map((r) => `${r.name}: ${r.why}`);
for (const r of results) console.error(`${r.ok ? "PASS" : "FAIL"} ${r.name}${r.why ? ` — ${r.why}` : ""}`);
console.log(JSON.stringify({ tests: results.length, passed: results.length - failures.length, failures, features: [...features] }));
process.exit(failures.length ? 1 : 0);
