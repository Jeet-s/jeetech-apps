/**
 * Local reminder scheduling rules — free and unlimited. The actual OS
 * scheduling goes through src/modules/notify.ts in the UI layer; this file
 * owns the data, validation, quiet-hours and "next fire" calculation so it is
 * testable without a device.
 */
import {
  type AppState,
  type Reminder,
  type ReminderKind,
  nextId,
} from "./model";
import { inQuietHours, parseTime, MS_DAY } from "./dates";

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const REMINDER_LABEL: Record<ReminderKind, string> = {
  fasting: "Fasting check",
  pre_meal: "Before-meal check",
  post_meal: "After-meal check",
  medication: "Medication",
  meal: "Log a meal",
  weekly: "Weekly summary",
};

export function validateReminderTime(time: string): boolean {
  return TIME_RE.test(time);
}

export function addReminder(
  s: AppState,
  input: { kind: ReminderKind; time: string; days?: number[]; label?: string },
): { state: AppState; id?: string; error: "bad_time" | null } {
  if (!validateReminderTime(input.time)) return { state: s, error: "bad_time" };
  const { id, seq } = nextId(s, "rem");
  const reminder: Reminder = {
    id,
    profileId: s.activeProfileId,
    kind: input.kind,
    time: input.time,
    days: (input.days ?? []).filter((d) => d >= 0 && d <= 6),
    enabled: true,
    label: input.label ?? REMINDER_LABEL[input.kind],
  };
  return { state: { ...s, reminders: [...s.reminders, reminder], seq }, id, error: null };
}

export function toggleReminder(s: AppState, id: string, enabled: boolean): AppState {
  return { ...s, reminders: s.reminders.map((r) => (r.id === id ? { ...r, enabled } : r)) };
}

export function editReminder(
  s: AppState,
  id: string,
  patch: Partial<Pick<Reminder, "time" | "days" | "label" | "kind">>,
): { state: AppState; error: "bad_time" | null } {
  if (patch.time !== undefined && !validateReminderTime(patch.time)) return { state: s, error: "bad_time" };
  return {
    state: { ...s, reminders: s.reminders.map((r) => (r.id === id ? { ...r, ...patch } : r)) },
    error: null,
  };
}

export function deleteReminder(s: AppState, id: string): AppState {
  return { ...s, reminders: s.reminders.filter((r) => r.id !== id) };
}

export function remindersFor(s: AppState): Reminder[] {
  return s.reminders.filter((r) => r.profileId === s.activeProfileId);
}

/** Does a reminder's time land inside the user's quiet hours? */
export function isQuiet(s: AppState, time: string): boolean {
  if (!s.quietHours.enabled) return false;
  return inQuietHours(parseTime(time), s.quietHours.start, s.quietHours.end);
}

/**
 * Next fire timestamp at/after `from` for a reminder, honouring selected days
 * (empty = every day). Returns a local wall-clock epoch to match stored ts.
 */
export function nextFire(reminder: Reminder, from: number): number {
  const mins = parseTime(reminder.time);
  for (let i = 0; i < 8; i++) {
    const dayStart = startOfDayLocal(from + i * MS_DAY);
    const candidate = dayStart + mins * 60_000;
    if (candidate < from) continue;
    const dow = new Date(candidate).getUTCDay();
    if (reminder.days.length === 0 || reminder.days.includes(dow)) return candidate;
  }
  return startOfDayLocal(from) + mins * 60_000; // fallback (shouldn't hit)
}

function startOfDayLocal(ts: number): number {
  const d = new Date(ts);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0);
}

/**
 * After a pre-meal reading linked to a meal, suggest a post-meal check 2h
 * later (one gentle follow-up). Returns the epoch to schedule, or null if that
 * lands in quiet hours.
 */
export function postMealCheckAt(mealTs: number, s: AppState, hoursLater = 2): number | null {
  const at = mealTs + hoursLater * 3_600_000;
  const mins = new Date(at).getUTCHours() * 60 + new Date(at).getUTCMinutes();
  if (s.quietHours.enabled && inQuietHours(mins, s.quietHours.start, s.quietHours.end)) return null;
  return at;
}
