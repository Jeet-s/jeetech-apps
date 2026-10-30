/**
 * Date & time helpers — pure, deterministic, no hidden clocks.
 *
 * Readings and meals happen at a specific wall-clock moment, so we store an
 * epoch-millisecond `ts`. To stay timezone-stable and testable the UI builds
 * that epoch from the user's LOCAL wall-clock parts (via `wallClock`), and all
 * readers here use UTC getters so the same components come back out on any
 * device. Day keys are "YYYY-MM-DD" like the rest of the factory.
 */
export type DateKey = string; // YYYY-MM-DD
export type TimeOfDay = string; // HH:MM (24h), for reminders

export const MS_DAY = 86_400_000;

const pad = (n: number) => String(n).padStart(2, "0");

/** Build an epoch from local wall-clock parts (what the UI and tests pass in). */
export function wallClock(y: number, mo: number, d: number, h = 12, mi = 0): number {
  return Date.UTC(y, mo - 1, d, h, mi, 0, 0);
}

export function dayKey(ts: number): DateKey {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Midday of a day key, so day arithmetic never trips over DST-like edges. */
export function dayKeyToTs(key: DateKey): number {
  const [y, m, d] = key.split("-").map(Number);
  return wallClock(y, m, d, 12, 0);
}

export function hourOf(ts: number): number {
  return new Date(ts).getUTCHours();
}

export function minuteOf(ts: number): number {
  return new Date(ts).getUTCMinutes();
}

export function startOfDay(ts: number): number {
  const d = new Date(ts);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0);
}

export function addDays(key: DateKey, n: number): DateKey {
  return dayKey(dayKeyToTs(key) + n * MS_DAY);
}

export function addMs(ts: number, ms: number): number {
  return ts + ms;
}

/** Whole days between two keys (b - a); a<b → positive. */
export function daysBetween(a: DateKey, b: DateKey): number {
  return Math.round((dayKeyToTs(b) - dayKeyToTs(a)) / MS_DAY);
}

/** Inclusive span of distinct calendar days covered by the given timestamps. */
export function daySpan(tsList: number[]): number {
  if (tsList.length === 0) return 0;
  let min = Infinity;
  let max = -Infinity;
  for (const ts of tsList) {
    const s = startOfDay(ts);
    if (s < min) min = s;
    if (s > max) max = s;
  }
  return Math.round((max - min) / MS_DAY) + 1;
}

export const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function weekday(ts: number): number {
  return new Date(ts).getUTCDay();
}

export function weekdayLabel(ts: number): string {
  return WEEKDAY[weekday(ts)];
}

/** "HH:MM" of a timestamp. */
export function timeLabel(ts: number): TimeOfDay {
  return `${pad(hourOf(ts))}:${pad(minuteOf(ts))}`;
}

/** Minutes-from-midnight of a "HH:MM" string (for reminders / quiet hours). */
export function parseTime(t: TimeOfDay): number {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * True when `minutes`-from-midnight falls inside quiet hours. Supports windows
 * that wrap past midnight (e.g. 22:00 → 07:00).
 */
export function inQuietHours(minutes: number, start: TimeOfDay, end: TimeOfDay): boolean {
  const s = parseTime(start);
  const e = parseTime(end);
  if (s === e) return false;
  return s < e ? minutes >= s && minutes < e : minutes >= s || minutes < e;
}
