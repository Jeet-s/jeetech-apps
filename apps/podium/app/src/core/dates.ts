/**
 * Local-date helpers — the whole app reasons about days as "YYYY-MM-DD" in the
 * user's local time, so streaks and the daily allowance never break from
 * timezone or offline bugs (a top competitor complaint). Every function takes
 * its date explicitly; there is no hidden clock here.
 */
export type DateKey = string; // YYYY-MM-DD (local)

const p2 = (n: number) => String(n).padStart(2, "0");

/** Local calendar day of a Date. */
export function dateKey(d: Date): DateKey {
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

/** Add (or subtract) whole days to a DateKey. Noon anchor → immune to DST. */
export function addDays(key: DateKey, n: number): DateKey {
  const [y, m, d] = key.split("-").map(Number);
  return dateKey(new Date(y, m - 1, d + n, 12));
}

/** Whole days from a → b (b - a). Negative if b is before a. */
export function daysBetween(a: DateKey, b: DateKey): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const da = Date.UTC(ay, am - 1, ad);
  const db = Date.UTC(by, bm - 1, bd);
  return Math.round((db - da) / 86_400_000);
}

export const isBefore = (a: DateKey, b: DateKey) => a < b;
export const isSameDay = (a: DateKey, b: DateKey) => a === b;

/** True when `day` is the calendar day right before `today`. */
export const isYesterday = (day: DateKey, today: DateKey) => daysBetween(day, today) === 1;

export const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function weekdayLabel(day: DateKey): string {
  const [y, m, d] = day.split("-").map(Number);
  return WEEKDAY[new Date(y, m - 1, d, 12).getDay()];
}

/** ISO-ish week key "YYYY-Www" used to replenish the weekly streak freeze. */
export function weekKey(day: DateKey): string {
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dayNum = (dt.getUTCDay() + 6) % 7; // Mon=0
  dt.setUTCDate(dt.getUTCDate() - dayNum + 3); // nearest Thursday
  const firstThu = new Date(Date.UTC(dt.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((dt.getTime() - firstThu.getTime()) / 86_400_000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
  return `${dt.getUTCFullYear()}-W${p2(week)}`;
}

/** Month key "YYYY-MM" used to replenish the monthly streak repair. */
export const monthKey = (day: DateKey) => day.slice(0, 7);

/** A DateKey is well-formed and a real calendar day. */
export function isValidDateKey(key: unknown): key is DateKey {
  if (typeof key !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y, m - 1, d, 12);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

/** Human "4h 12m" style gap used by the "more takes at midnight" copy. */
export function untilNextMidnight(nowMs: number): { hours: number; minutes: number } {
  const now = new Date(nowMs);
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  const diff = Math.max(0, next.getTime() - now.getTime());
  return { hours: Math.floor(diff / 3_600_000), minutes: Math.floor((diff % 3_600_000) / 60_000) };
}
