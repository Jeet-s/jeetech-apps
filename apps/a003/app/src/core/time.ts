/**
 * Time math for BlockDay — pure, clock-free, timezone-safe.
 *
 * A day is a local calendar date (`DateKey`, YYYY-MM-DD). Within a day, a moment
 * is minutes-from-midnight (0..1439). A block that runs past midnight simply has
 * an `end` > 1440 (e.g. 23:00→01:00 is start 1380, end 1500) — no second date is
 * needed, which keeps overnight blocks and DST changes bug-free (the #1 thing
 * users punish competitors for). For overlap across days we compare ABSOLUTE
 * minutes: dayNumber(date) * 1440 + minute.
 */
export type DateKey = string; // YYYY-MM-DD (local calendar date)
export type ISO = string;

export const DAY = 1440; // minutes in a day
const p2 = (n: number) => String(n).padStart(2, "0");

/** Local calendar date of a JS Date (used only for "today" from the device). */
export function dateKey(d: Date): DateKey {
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

export function isValidDateKey(key: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const [y, m, d] = key.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  // reject impossible days (e.g. 2026-02-30) by round-tripping through UTC
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Whole days since the Unix epoch — a stable integer per calendar date (UTC-anchored, DST-immune). */
export function dayNumber(key: DateKey): number {
  const [y, m, d] = key.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** Calendar date `n` days from `key` (n may be negative). */
export function addDays(key: DateKey, n: number): DateKey {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d) + n * 86_400_000);
  return `${dt.getUTCFullYear()}-${p2(dt.getUTCMonth() + 1)}-${p2(dt.getUTCDate())}`;
}

/** a − b in whole days. */
export function diffDays(a: DateKey, b: DateKey): number {
  return dayNumber(a) - dayNumber(b);
}

export const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** 0=Sun .. 6=Sat, computed in UTC so it never shifts with the device zone. */
export function weekdayIndex(key: DateKey): number {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
export function weekdayLabel(key: DateKey): string {
  return WEEKDAY[weekdayIndex(key)];
}

export const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Round a minute value to the nearest snap interval (5 / 10 / 15). */
export function snap(min: number, interval: number): number {
  if (interval <= 0) return Math.round(min);
  return Math.round(min / interval) * interval;
}

/** "HH:mm" → minutes from midnight, or null if malformed. Accepts "24:00". */
export function parseHHMM(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59 || (h === 24 && min !== 0)) return null;
  return h * 60 + min;
}

/** Minutes → "HH:mm". Values ≥ 1440 (overnight) wrap, so 1500 → "01:00". */
export function toHHMM(min: number): string {
  const m = ((Math.round(min) % DAY) + DAY) % DAY;
  return `${p2(Math.floor(m / 60))}:${p2(m % 60)}`;
}

/** Is this minute value on the day after its block's start date? */
export const spillsOvernight = (endMin: number) => endMin > DAY;

/** "1h 30m" / "45m" / "2h" for a duration in minutes. */
export function fmtDuration(min: number): string {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h && r) return `${h}h ${r}m`;
  if (h) return `${h}h`;
  return `${r}m`;
}
