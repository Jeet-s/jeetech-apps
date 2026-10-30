/**
 * Doctor report + export (PDF/CSV) — all free. Builds a date-ranged summary
 * (averages by category, time in range, A1C estimate WITH the formula, and the
 * meals/medication lists) as plain data, plus a spreadsheet-safe CSV with a
 * units column. The HTML→PDF rendering happens in the UI layer in Stage 2.
 */
import {
  type AppState,
  type Context,
  type Reading,
  type Meal,
  type MedLog,
  CONTEXTS,
  CONTEXT_LABEL,
  SLOT_LABEL,
  GI_LABEL,
  activeProfile,
  liveReadings,
  liveMeals,
  liveMedLogs,
} from "./model";
import { classify } from "./readings";
import { mealLabel } from "./insights";
import { type Avg, averageMgdl, estimateA1C, A1C_FORMULA } from "./insights";
import { formatValue, UNIT_LABEL, type Unit } from "./units";
import { dayKey, timeLabel } from "./dates";

export interface ReportFields {
  readings: boolean;
  meals: boolean;
  medications: boolean;
}

export const ALL_FIELDS: ReportFields = { readings: true, meals: true, medications: true };

export interface Report {
  from: number;
  to: number;
  unit: Unit;
  profileName: string;
  readings: Reading[];
  meals: Meal[];
  medLogs: MedLog[];
  averages: Record<Context, Avg>;
  overall: Avg;
  tir: { inRange: number; high: number; low: number; total: number; pctInRange: number };
  a1c: ReturnType<typeof estimateA1C>;
  counts: { readings: number; meals: number; medLogs: number };
  hasData: boolean;
  disclaimer: string;
}

export const REPORT_DISCLAIMER =
  "Sugar Plate provides wellness information only and is not a medical device. Estimates (including A1C and carbs) are informational, not a clinical assessment. Share this summary with your clinician — do not change medication without professional advice.";

function readingsBetween(s: AppState, from: number, to: number): Reading[] {
  return liveReadings(s).filter((r) => r.ts >= from && r.ts <= to);
}

export function buildReport(s: AppState, opts: { from: number; to: number; fields?: ReportFields }): Report {
  const fields = opts.fields ?? ALL_FIELDS;
  const profile = activeProfile(s);
  const readings = fields.readings ? readingsBetween(s, opts.from, opts.to) : [];
  const meals = fields.meals ? liveMeals(s).filter((m) => m.ts >= opts.from && m.ts <= opts.to) : [];
  const medLogs = fields.medications ? liveMedLogs(s).filter((l) => l.ts >= opts.from && l.ts <= opts.to) : [];

  const averages = {} as Record<Context, Avg>;
  for (const c of CONTEXTS) averages[c] = averageMgdl(readings.filter((r) => r.context === c));

  let inRange = 0;
  let high = 0;
  let low = 0;
  for (const r of readings) {
    const lvl = classify(r.valueMgdl, r.context, profile).level;
    if (lvl === "in_range") inRange++;
    else if (lvl === "high") high++;
    else low++;
  }
  const total = readings.length;

  return {
    from: opts.from,
    to: opts.to,
    unit: profile.unit,
    profileName: profile.name,
    readings,
    meals,
    medLogs,
    averages,
    overall: averageMgdl(readings),
    tir: { inRange, high, low, total, pctInRange: total ? Math.round((inRange / total) * 100) : 0 },
    a1c: estimateA1C(readings),
    counts: { readings: readings.length, meals: meals.length, medLogs: medLogs.length },
    hasData: readings.length + meals.length + medLogs.length > 0,
    disclaimer: REPORT_DISCLAIMER,
  };
}

// ── Summary lines (used for preview + PDF body) ─────────────────────────────────────

export function reportSummaryLines(r: Report): string[] {
  const unit = UNIT_LABEL[r.unit];
  const avg = (a: Avg) => (a.avgMgdl === null ? "—" : `${formatValue(a.avgMgdl, r.unit)} ${unit} (n=${a.n})`);
  const lines = [
    `Profile: ${r.profileName}`,
    `Range: ${dayKey(r.from)} → ${dayKey(r.to)}`,
    `Readings: ${r.counts.readings} · Meals: ${r.counts.meals} · Medication logs: ${r.counts.medLogs}`,
    `Overall average: ${avg(r.overall)}`,
  ];
  for (const c of CONTEXTS) if (r.averages[c].n) lines.push(`  ${CONTEXT_LABEL[c]} avg: ${avg(r.averages[c])}`);
  lines.push(`Time in range: ${r.tir.pctInRange}% (in ${r.tir.inRange} / high ${r.tir.high} / low ${r.tir.low})`);
  lines.push(
    r.a1c.a1c === null ? "Estimated A1C: —" : `Estimated A1C: ${r.a1c.a1c}%  [${A1C_FORMULA}]  ${r.a1c.confidence}`,
  );
  return lines;
}

// ── CSV ─────────────────────────────────────────────────────────────────────────

function csvCell(v: string | number): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const CSV_HEADER = [
  "Type", "Date", "Time", "Value", "Unit", "Context/Slot", "Carbs_g", "GI", "Medication", "Dose", "Dose_Unit", "Note",
];

/** One timeline CSV, chronological, with a Unit column for glucose values. */
export function toCSV(r: Report): string {
  type Row = { ts: number; cells: (string | number)[] };
  const rows: Row[] = [];

  for (const reading of r.readings) {
    rows.push({
      ts: reading.ts,
      cells: ["Reading", dayKey(reading.ts), timeLabel(reading.ts), formatValue(reading.valueMgdl, r.unit), UNIT_LABEL[r.unit], CONTEXT_LABEL[reading.context], "", "", "", "", "", reading.note],
    });
  }
  for (const meal of r.meals) {
    rows.push({
      ts: meal.ts,
      cells: ["Meal", dayKey(meal.ts), timeLabel(meal.ts), "", "", SLOT_LABEL[meal.slot], meal.carbsTotalG, GI_LABEL[meal.giBand], mealLabel(meal), "", "", meal.note],
    });
  }
  for (const log of r.medLogs) {
    rows.push({
      ts: log.ts,
      cells: ["Medication", dayKey(log.ts), timeLabel(log.ts), "", "", "", "", "", log.name, log.dose, log.doseUnit, log.note],
    });
  }

  rows.sort((a, b) => a.ts - b.ts);
  const body = rows.map((row) => row.cells.map(csvCell).join(","));
  return [CSV_HEADER.join(","), ...body].join("\n");
}

/** Suggest widening the range when a report has nothing in it. */
export function emptyRangeHint(r: Report): string | null {
  return r.hasData ? null : "No entries in this date range. Try widening the dates to include more of your log.";
}
