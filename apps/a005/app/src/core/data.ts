import { persisted, usePersisted } from "../modules/persist";
import { syncStore } from "../modules/cloud";
import { DATA_VERSION, emptyState, migrate, type BandUpState } from "./model";
import { emptyHabits, type HabitsState } from "./habits";

/**
 * The app's own data, persisted on device (offline-first). The shape + migrate
 * live in model.ts (pure, testable); this file only wires them to storage.
 */
export const bandUpStore = persisted<BandUpState>("bandup_v1", emptyState(), {
  version: DATA_VERSION,
  migrate,
});

export const useBandUp = () => usePersisted(bandUpStore);

/**
 * Optional cloud backup of the store (a no-op unless the factory switched cloud
 * saving on). Call after the store has loaded; on sign-in call pullNow().
 */
export function startBandUpSync() {
  return syncStore(bandUpStore, "bandup");
}

/**
 * UI-only preferences that don't belong in the core domain model or the
 * factory-owned app-settings store (e.g. the local reminder toggle/time).
 */
export interface Prefs {
  remindersOn: boolean;
  reminderHour: number; // 24h local
  // Remembered once the OS mic permission has been granted (onboarding mic check
  // or a first practice recording), so the practice screen opens straight on
  // "Start speaking" — never a second "Allow microphone" gate or a flash of it
  // (the OS permission is already held; this just lets the first render know it
  // synchronously, with no async flash). Persisted survives restarts.
  micGranted?: boolean;
}
export const prefsStore = persisted<Prefs>("bandup_prefs_v1", { remindersOn: false, reminderHour: 18, micGranted: false }, { version: 1 });
export const usePrefs = () => usePersisted(prefsStore);

/**
 * SHOWCASE store (the habit-tracker demo from the base runtime) — no longer used
 * by any screen now that the real Band Up screens are built, kept only so the
 * showcase core module still compiles.
 */
export const habitsStore = persisted<HabitsState>("habits_v1", emptyHabits(), { version: 1 });
export const useHabits = () => usePersisted(habitsStore);
export function startHabitsSync() {
  return syncStore(habitsStore, "habits");
}
