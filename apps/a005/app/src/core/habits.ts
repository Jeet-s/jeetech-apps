/**
 * SHOWCASE core logic (a tiny habit tracker) — pure TypeScript, no React, no
 * storage. The builder REPLACES this with the real app's domain logic, keeping
 * the same discipline: every rule lives here, takes `today` explicitly (no
 * hidden clocks), returns new state (no mutation), and is covered by
 * scripts/validate.ts + driven by src/core/sim.ts.
 */
export type DateKey = string; // YYYY-MM-DD (local)

export interface Habit {
  id: string;
  name: string;
  emoji: string;
  createdAt: DateKey;
  /** Sorted, unique days the habit was done. */
  done: DateKey[];
}

export interface HabitsState {
  habits: Habit[];
  nextId: number;
}

export const FREE_HABIT_LIMIT = 3;
export const MAX_NAME = 40;
export const SUGGESTIONS: { name: string; emoji: string }[] = [
  { name: "Drink water", emoji: "💧" },
  { name: "Read 10 pages", emoji: "📖" },
  { name: "Walk 20 minutes", emoji: "🚶" },
  { name: "Stretch", emoji: "🧘" },
  { name: "No phone in bed", emoji: "🌙" },
  { name: "Journal", emoji: "✍️" },
];

export const emptyHabits = (): HabitsState => ({ habits: [], nextId: 1 });

export function dateKey(d: Date): DateKey {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function addDays(key: DateKey, n: number): DateKey {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y, m - 1, d + n, 12); // noon: immune to DST jumps
  return dateKey(dt);
}

export type AddError = "empty_name" | "too_long" | "duplicate" | "limit";

export function validateName(s: HabitsState, raw: string, exceptId?: string): AddError | null {
  const name = raw.trim();
  if (!name) return "empty_name";
  if (name.length > MAX_NAME) return "too_long";
  if (s.habits.some((h) => h.id !== exceptId && h.name.toLowerCase() === name.toLowerCase())) return "duplicate";
  return null;
}

export function addHabit(
  s: HabitsState,
  input: { name: string; emoji?: string },
  today: DateKey,
  pro: boolean,
): { state: HabitsState; error: AddError | null; id?: string } {
  const error = validateName(s, input.name);
  if (error) return { state: s, error };
  if (!pro && s.habits.length >= FREE_HABIT_LIMIT) return { state: s, error: "limit" };
  const id = `h${s.nextId}`;
  const habit: Habit = { id, name: input.name.trim(), emoji: input.emoji || "✅", createdAt: today, done: [] };
  return { state: { habits: [...s.habits, habit], nextId: s.nextId + 1 }, error: null, id };
}

export function renameHabit(s: HabitsState, id: string, name: string): { state: HabitsState; error: AddError | null } {
  if (!s.habits.some((h) => h.id === id)) return { state: s, error: null };
  const error = validateName(s, name, id);
  if (error) return { state: s, error };
  return { state: { ...s, habits: s.habits.map((h) => (h.id === id ? { ...h, name: name.trim() } : h)) }, error: null };
}

export function deleteHabit(s: HabitsState, id: string): HabitsState {
  return { ...s, habits: s.habits.filter((h) => h.id !== id) };
}

/** Put a deleted habit back where it was (Undo). */
export function restoreHabit(s: HabitsState, habit: Habit, index: number): HabitsState {
  if (s.habits.some((h) => h.id === habit.id)) return s;
  const habits = [...s.habits];
  habits.splice(Math.max(0, Math.min(index, habits.length)), 0, habit);
  return { ...s, habits };
}

export const isDone = (h: Habit, day: DateKey) => h.done.includes(day);

/** Mark/unmark a day. Future days can't be checked. */
export function toggleDay(s: HabitsState, id: string, day: DateKey, today: DateKey): HabitsState {
  if (day > today) return s;
  return {
    ...s,
    habits: s.habits.map((h) => {
      if (h.id !== id) return h;
      const done = isDone(h, day) ? h.done.filter((d) => d !== day) : [...h.done, day].sort();
      return { ...h, done };
    }),
  };
}

/** Consecutive days done, ending today (or yesterday, if today isn't done yet). */
export function streak(h: Habit, today: DateKey): number {
  let day = isDone(h, today) ? today : addDays(today, -1);
  let n = 0;
  while (isDone(h, day)) {
    n++;
    day = addDays(day, -1);
  }
  return n;
}

export function bestStreak(h: Habit): number {
  let best = 0, run = 0;
  let prev: DateKey | null = null;
  for (const d of h.done) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

/** Share of habits done today, 0..1 (0 with no habits). */
export function todayProgress(s: HabitsState, today: DateKey): number {
  if (!s.habits.length) return 0;
  return s.habits.filter((h) => isDone(h, today)).length / s.habits.length;
}

/** Habits done per day for the 7 days ending today (oldest first). */
export function weekSeries(s: HabitsState, today: DateKey): { day: DateKey; count: number }[] {
  return Array.from({ length: 7 }, (_, i) => {
    const day = addDays(today, i - 6);
    return { day, count: s.habits.filter((h) => isDone(h, day)).length };
  });
}

/** Completion rate over the last `days` days (only days since the habit existed). */
export function completionRate(h: Habit, today: DateKey, days = 30): number {
  let possible = 0, done = 0;
  for (let i = 0; i < days; i++) {
    const day = addDays(today, -i);
    if (day < h.createdAt) break;
    possible++;
    if (isDone(h, day)) done++;
  }
  return possible ? done / possible : 0;
}

export const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export function weekdayLabel(day: DateKey): string {
  const [y, m, d] = day.split("-").map(Number);
  return WEEKDAY[new Date(y, m - 1, d, 12).getDay()];
}
