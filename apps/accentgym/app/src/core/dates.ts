/**
 * Local-calendar date helpers — pure, no hidden clock. Everything that needs
 * "now" takes a DateKey (or an epoch ms) explicitly so logic is testable and
 * timezone-travel safe (the core loop uses the user's LOCAL day with a grace).
 */
export type DateKey = string; // YYYY-MM-DD (local)

const p2 = (n: number) => String(n).padStart(2, "0");

export function dateKey(d: Date): DateKey {
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

/** A fixed, DST-immune epoch for a day (local noon) — used to derive "now" in tests/sim. */
export function noonMs(key: DateKey): number {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0).getTime();
}

export function keyFromMs(ms: number): DateKey {
  return dateKey(new Date(ms));
}

export function addDays(key: DateKey, n: number): DateKey {
  const [y, m, d] = key.split("-").map(Number);
  return dateKey(new Date(y, m - 1, d + n, 12)); // noon: immune to DST jumps
}

/** b - a in whole local days (positive when b is later). */
export function daysBetween(a: DateKey, b: DateKey): number {
  return Math.round((noonMs(b) - noonMs(a)) / 86_400_000);
}

export function isValidKey(key: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(key) && keyFromMs(noonMs(key)) === key;
}

export const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export function weekdayLabel(day: DateKey): string {
  const [y, m, d] = day.split("-").map(Number);
  return WEEKDAY[new Date(y, m - 1, d, 12).getDay()];
}
