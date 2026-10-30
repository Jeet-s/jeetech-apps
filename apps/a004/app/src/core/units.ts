/**
 * Glucose unit handling. We store ONE canonical number everywhere: mg/dL.
 * Display and input convert to/from the user's chosen unit. Storing canonical
 * means the unit toggle never rewrites data and historical values convert
 * without drift.
 */
export type Unit = "mgdl" | "mmol";

/** mg/dL per 1 mmol/L (IFCC standard used by mySugr et al.). */
export const MMOL_FACTOR = 18.0182;

export const UNIT_LABEL: Record<Unit, string> = {
  mgdl: "mg/dL",
  mmol: "mmol/L",
};

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Canonical mg/dL → the numeric value shown in the chosen unit. */
export function toUnit(mgdl: number, unit: Unit): number {
  return unit === "mmol" ? round1(mgdl / MMOL_FACTOR) : Math.round(mgdl);
}

/** A value typed in the chosen unit → canonical mg/dL (full precision kept). */
export function toMgdl(value: number, unit: Unit): number {
  return unit === "mmol" ? value * MMOL_FACTOR : value;
}

/** Display string at the unit's natural precision (mg/dL integer, mmol 1 dp). */
export function formatValue(mgdl: number, unit: Unit): string {
  const v = toUnit(mgdl, unit);
  return unit === "mmol" ? v.toFixed(1) : String(v);
}

export function formatWithUnit(mgdl: number, unit: Unit): string {
  return `${formatValue(mgdl, unit)} ${UNIT_LABEL[unit]}`;
}

/**
 * Parse free-typed keypad text in the given unit. Accepts a comma OR dot
 * decimal separator (locales differ). Returns null if not a positive number.
 */
export function parseValue(text: string, unit: Unit): number | null {
  const cleaned = text.trim().replace(",", ".");
  if (!cleaned || !/^\d*\.?\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
  return toMgdl(n, unit);
}

/** Plausible physiological window for a real reading, in mg/dL. */
export const PLAUSIBLE_MIN_MGDL = 20;
export const PLAUSIBLE_MAX_MGDL = 600;

/** Typical in-unit maxima, used to catch a value typed in the wrong unit. */
const SANE_MAX: Record<Unit, number> = { mgdl: 600, mmol: 33.3 };
const SANE_MIN: Record<Unit, number> = { mgdl: 20, mmol: 1.1 };

export type ValueWarning = "wrong_unit" | "implausible_low" | "implausible_high";

/**
 * Non-blocking sanity check on a canonical value for the unit the user typed
 * it in. The UI shows a confirm prompt but still lets the reading be saved.
 */
export function valueWarning(mgdl: number, unit: Unit): ValueWarning | null {
  const inUnit = toUnit(mgdl, unit);
  // A number that is plausible in the OTHER unit but not this one → likely wrong unit.
  if (unit === "mmol" && inUnit > SANE_MAX.mmol) return "wrong_unit";
  if (unit === "mgdl" && inUnit < SANE_MIN.mgdl && mgdl >= PLAUSIBLE_MIN_MGDL) return "wrong_unit";
  if (mgdl < PLAUSIBLE_MIN_MGDL) return "implausible_low";
  if (mgdl > PLAUSIBLE_MAX_MGDL) return "implausible_high";
  return null;
}
