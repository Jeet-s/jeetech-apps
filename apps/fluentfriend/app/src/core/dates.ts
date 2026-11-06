/**
 * Pure date helpers — all app logic takes `today` explicitly (no hidden clocks).
 * Dates are local wall-clock YYYY-MM-DD keys so a streak ticks over at the
 * learner's own midnight, not UTC.
 */
export type DateKey = string; // YYYY-MM-DD (local)

export function dateKey(d: Date): DateKey {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Add `n` days to a key. Noon anchor keeps us immune to DST hour jumps. */
export function addDays(key: DateKey, n: number): DateKey {
  const [y, m, d] = key.split("-").map(Number);
  return dateKey(new Date(y, m - 1, d + n, 12));
}

/** Whole days from `a` to `b` (b - a); negative if b is before a. */
export function daysBetween(a: DateKey, b: DateKey): number {
  const toUtc = (k: DateKey) => {
    const [y, m, d] = k.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}

export const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
/** Short Bangla weekday labels (TalkBack + trend chart). */
export const WEEKDAY_BN = ["রবি", "সোম", "মঙ্গল", "বুধ", "বৃহঃ", "শুক্র", "শনি"] as const;

export function weekdayIndex(day: DateKey): number {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d, 12).getDay();
}
export const weekdayLabel = (day: DateKey) => WEEKDAY[weekdayIndex(day)];
export const weekdayLabelBn = (day: DateKey) => WEEKDAY_BN[weekdayIndex(day)];

/** "HH:MM" (24h) → minutes from midnight; null if malformed. */
export function parseTime(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** minutes from midnight → "HH:MM" (24h, zero-padded). */
export function formatTime(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(m / 60))}:${p(m % 60)}`;
}
