/**
 * Meter import — turn readings copied off a glucose meter into app readings, either from a CSV
 * exported by a common meter app (Contour, Accu-Chek, Diabetes:M, OneTouch…) or from the AI "scan
 * your meter screen" OCR result. Pure functions over strings/JSON → NewReading[] so validate.ts and
 * sim.ts can exercise them with fixed samples. Values are normalised to canonical mg/dL.
 */
import { type NewReading } from "./readings";
import { type Context, autoContext } from "./model";
import { toMgdl, PLAUSIBLE_MIN_MGDL, PLAUSIBLE_MAX_MGDL } from "./units";
import { wallClock } from "./dates";

export interface ImportResult {
  readings: NewReading[];
  skipped: number;
}

/** Map a free-text context/tag from a CSV into our Context enum (best-effort; defaults by clock). */
function mapContext(raw: string | undefined, ts: number): Context {
  const s = (raw ?? "").toLowerCase();
  if (/fast/.test(s)) return "fasting";
  if (/bed|sleep|night/.test(s)) return "bedtime";
  if (/before|pre/.test(s)) return "pre_meal";
  if (/after|post/.test(s)) return "post_meal";
  if (/random|check/.test(s)) return "random";
  return autoContext(ts);
}

/** Normalise one numeric value + optional unit hint to canonical mg/dL, or null if implausible. */
export function normalizeValue(value: number, unitHint?: "mgdl" | "mmol"): number | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  // If no explicit unit, infer: a value under ~30 is almost certainly mmol/L, not mg/dL.
  const unit: "mgdl" | "mmol" = unitHint ?? (value < 30 ? "mmol" : "mgdl");
  const mgdl = Math.round(toMgdl(value, unit));
  if (mgdl < PLAUSIBLE_MIN_MGDL || mgdl > PLAUSIBLE_MAX_MGDL) return null;
  return mgdl;
}

/** Parse "YYYY-MM-DD"/"YYYY/MM/DD"/"DD-MM-YYYY" + optional "HH:MM" into a wall-clock epoch, or null. */
export function parseDateTime(dateStr: string, timeStr: string | undefined, fallback: number): number {
  const d = dateStr.trim();
  const t = (timeStr ?? "").trim();
  let y = 0, mo = 0, da = 0;
  let m = d.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/); // YYYY-MM-DD
  if (m) { y = +m[1]; mo = +m[2]; da = +m[3]; }
  else {
    m = d.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/); // DD-MM-YYYY (day first — most meter exports)
    if (m) { da = +m[1]; mo = +m[2]; y = +m[3]; }
  }
  if (!y || mo < 1 || mo > 12 || da < 1 || da > 31) return fallback;
  let hh = 0, mi = 0;
  const tm = t.match(/(\d{1,2}):(\d{2})/);
  if (tm) {
    hh = +tm[1]; mi = +tm[2];
    if (/pm/i.test(t) && hh < 12) hh += 12;
    if (/am/i.test(t) && hh === 12) hh = 0;
  }
  if (hh > 23 || mi > 59) { hh = 0; mi = 0; }
  return wallClock(y, mo, da, hh, mi);
}

/** Split a CSV line respecting simple double-quoted fields. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const findCol = (headers: string[], ...names: RegExp[]): number =>
  headers.findIndex((h) => names.some((re) => re.test(h)));

/**
 * Parse a CSV exported by a common meter app into readings. Looks for a header row with a glucose
 * column (and optional date/time/unit/context columns); unknown or out-of-range rows are skipped
 * and counted. `now` is the fallback timestamp for rows without a parseable date.
 */
export function parseMeterCsv(text: string, now: number): ImportResult {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { readings: [], skipped: 0 };
  // Find the header row: the first line that mentions a glucose/value column.
  let headerIdx = lines.findIndex((l) => /gluc|mg\/dl|mmol|value|reading|result/i.test(l) && l.includes(","));
  if (headerIdx < 0) headerIdx = 0;
  const headers = splitCsvLine(lines[headerIdx]).map((h) => h.toLowerCase());
  const valueCol = findCol(headers, /gluc/, /mg\/dl/, /mmol/, /value/, /reading/, /result/);
  if (valueCol < 0) return { readings: [], skipped: 0 };
  const dateCol = findCol(headers, /date/, /day/);
  const timeCol = findCol(headers, /time/, /hour/);
  const unitCol = findCol(headers, /unit/);
  const ctxCol = findCol(headers, /context/, /tag/, /meal/, /note/, /event/);
  // If the glucose header itself names a unit, use it as the default.
  const headerUnit: "mgdl" | "mmol" | undefined = /mmol/i.test(headers[valueCol] ?? "")
    ? "mmol"
    : /mg\/dl/i.test(headers[valueCol] ?? "") ? "mgdl" : undefined;

  const readings: NewReading[] = [];
  let skipped = 0;
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const num = parseFloat((cells[valueCol] ?? "").replace(",", "."));
    let unit = headerUnit;
    if (unitCol >= 0) {
      const u = (cells[unitCol] ?? "").toLowerCase();
      if (/mmol/.test(u)) unit = "mmol";
      else if (/mg/.test(u)) unit = "mgdl";
    }
    const mgdl = normalizeValue(num, unit);
    if (mgdl == null) { skipped++; continue; }
    const ts = dateCol >= 0 ? parseDateTime(cells[dateCol] ?? "", timeCol >= 0 ? cells[timeCol] : undefined, now) : now;
    readings.push({ valueMgdl: mgdl, ts, context: mapContext(ctxCol >= 0 ? cells[ctxCol] : undefined, ts), note: "Imported from meter", source: "csv" });
  }
  return { readings, skipped };
}

// ── OCR (scan your meter screen) ────────────────────────────────────────────────

export interface OcrReading {
  value: number;
  unit?: "mgdl" | "mmol";
  time?: string | null;
}
export interface OcrResult {
  readings: OcrReading[];
}

/** Turn the AI meter-OCR JSON into readings, normalising units and clamping to the plausible range. */
export function sanitizeOcrReadings(raw: OcrResult | null, now: number): ImportResult {
  const rows = raw && Array.isArray(raw.readings) ? raw.readings : [];
  const readings: NewReading[] = [];
  let skipped = 0;
  for (const r of rows) {
    const unit = r.unit === "mmol" || r.unit === "mgdl" ? r.unit : undefined;
    const mgdl = normalizeValue(Number(r.value), unit);
    if (mgdl == null) { skipped++; continue; }
    let ts = now;
    if (r.time && /^\d{1,2}:\d{2}$/.test(r.time)) {
      const d = new Date(now);
      ts = parseDateTime(`${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`, r.time, now);
    }
    readings.push({ valueMgdl: mgdl, ts, context: autoContext(ts), note: "Scanned from meter", source: "ocr" });
  }
  return { readings, skipped };
}
