/** Wall-clock date helpers (YYYY-MM-DD, local). No hidden clocks — `today` is
 *  always passed in by the caller so the logic is pure and testable. */
export type DateKey = string; // YYYY-MM-DD

const p = (n: number) => String(n).padStart(2, "0");

export function dateKey(d: Date): DateKey {
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Add n calendar days to a date key (noon anchor dodges DST jumps). */
export function addDays(key: DateKey, n: number): DateKey {
  const [y, m, d] = key.split("-").map(Number);
  return dateKey(new Date(y, m - 1, d + n, 12));
}

/** Whole days from a → b (b − a). Negative if b is before a. */
export function daysBetween(a: DateKey, b: DateKey): number {
  const toMs = (k: DateKey) => {
    const [y, m, d] = k.split("-").map(Number);
    return new Date(y, m - 1, d, 12).getTime();
  };
  return Math.round((toMs(b) - toMs(a)) / 86_400_000);
}

export const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export function weekdayLabel(day: DateKey): string {
  const [y, m, d] = day.split("-").map(Number);
  return WEEKDAY[new Date(y, m - 1, d, 12).getDay()];
}

/** True for a well-formed YYYY-MM-DD that round-trips to a real date. */
export function isDateKey(s: unknown): s is DateKey {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d, 12);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}
