/**
 * Glucose reading logic — the 5-second core job. Pure functions over AppState;
 * `now` is always passed in. Values are canonical mg/dL; validation and the
 * color/icon/label classification live here, never in the UI.
 */
import {
  type AppState,
  type Context,
  type Reading,
  type ReadingSource,
  type Profile,
  MAX_NOTE,
  activeProfile,
  autoContext,
  liveReadings,
  nextId,
} from "./model";
import { PLAUSIBLE_MAX_MGDL, PLAUSIBLE_MIN_MGDL } from "./units";

export type ReadingError = "no_value" | "out_of_range";

export interface NewReading {
  valueMgdl: number;
  ts: number;
  context?: Context;
  note?: string;
  mealId?: string | null;
  source?: ReadingSource;
  importKey?: string | null;
}

export interface Level {
  level: "low" | "in_range" | "high";
  /** Icon name hint — never color alone. */
  icon: "arrow-down" | "check" | "arrow-up";
  label: string;
  /** True when at/below the profile's low threshold → show wellness safety note. */
  unsafeLow: boolean;
}

/** Validate a would-be reading. Out-of-plausible-range is blocked unless forced. */
export function validateReading(input: NewReading, force = false): ReadingError | null {
  if (!Number.isFinite(input.valueMgdl) || input.valueMgdl <= 0) return "no_value";
  if (!force && (input.valueMgdl < PLAUSIBLE_MIN_MGDL || input.valueMgdl > PLAUSIBLE_MAX_MGDL)) return "out_of_range";
  return null;
}

/** Add a reading. `force` lets a confirmed out-of-range value through. */
export function addReading(
  s: AppState,
  input: NewReading,
  now: number,
  force = false,
): { state: AppState; error: ReadingError | null; id?: string } {
  const error = validateReading(input, force);
  if (error) return { state: s, error };
  const { id, seq } = nextId(s, "r");
  const reading: Reading = {
    id,
    profileId: s.activeProfileId,
    valueMgdl: input.valueMgdl,
    ts: input.ts,
    context: input.context ?? autoContext(input.ts),
    note: (input.note ?? "").slice(0, MAX_NOTE),
    mealId: input.mealId ?? null,
    source: input.source ?? "manual",
    importKey: input.importKey ?? null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  return { state: { ...s, readings: [...s.readings, reading], seq }, error: null, id };
}

/** Add several readings at once (meter CSV / OCR / Bluetooth import). Already-validated inputs; returns how many landed. */
export function addReadings(s: AppState, inputs: NewReading[], now: number): { state: AppState; added: number } {
  let state = s;
  let added = 0;
  for (const input of inputs) {
    const res = addReading(state, input, now, true); // forced: values were range-checked at import
    if (!res.error) { state = res.state; added++; }
  }
  return { state, added };
}

/** All de-dup keys already present (across every profile + deleted rows), so a re-import never
 *  re-adds a reading we've seen — not even one the user later deleted. */
export function existingImportKeys(s: AppState): Set<string> {
  const set = new Set<string>();
  for (const r of s.readings) if (r.importKey) set.add(r.importKey);
  return set;
}

export function editReading(
  s: AppState,
  id: string,
  patch: Partial<Pick<Reading, "valueMgdl" | "ts" | "context" | "note" | "mealId">>,
  now: number,
  force = false,
): { state: AppState; error: ReadingError | null } {
  const existing = s.readings.find((r) => r.id === id);
  if (!existing) return { state: s, error: null };
  const merged = { ...existing, ...patch };
  const error = validateReading(merged, force);
  if (error) return { state: s, error };
  return {
    state: {
      ...s,
      readings: s.readings.map((r) =>
        r.id === id ? { ...merged, note: (merged.note ?? "").slice(0, MAX_NOTE), updatedAt: now } : r,
      ),
    },
    error: null,
  };
}

/** Soft-delete (keeps the row for 10s-undo and so tombstones sync cleanly). */
export function deleteReading(s: AppState, id: string, now: number): AppState {
  return { ...s, readings: s.readings.map((r) => (r.id === id ? { ...r, deletedAt: now, updatedAt: now } : r)) };
}

export function restoreReading(s: AppState, id: string, now: number): AppState {
  return { ...s, readings: s.readings.map((r) => (r.id === id ? { ...r, deletedAt: null, updatedAt: now } : r)) };
}

/** Bulk soft-delete (after an explicit confirm in the UI). */
export function bulkDeleteReadings(s: AppState, ids: string[], now: number): AppState {
  const set = new Set(ids);
  return { ...s, readings: s.readings.map((r) => (set.has(r.id) ? { ...r, deletedAt: now, updatedAt: now } : r)) };
}

/** Classify a value for a context against the profile's targets. */
export function classify(mgdl: number, context: Context, profile: Profile): Level {
  const range = profile.ranges[context];
  const unsafeLow = mgdl <= profile.lowThreshold;
  if (mgdl < range.low) return { level: "low", icon: "arrow-down", label: "Low", unsafeLow };
  if (mgdl > range.high) return { level: "high", icon: "arrow-up", label: "High", unsafeLow };
  return { level: "in_range", icon: "check", label: "In range", unsafeLow };
}

export function classifyReading(r: Reading, profile: Profile): Level {
  return classify(r.valueMgdl, r.context, profile);
}

/** Wellness safety note copy (no dosing or treatment advice) for a low reading. */
export const LOW_SAFETY_NOTE =
  "This reading is low. Follow your own care plan for a low glucose level and seek help if you feel unwell. This app offers wellness information only and is not medical advice.";

/** Wellness safety note copy (no dosing or treatment advice) for a very high reading. */
export const HIGH_SAFETY_NOTE =
  "This reading is high. Follow your own care plan for a high glucose level and seek help if you feel unwell. This app offers wellness information only and is not medical advice.";

/** At or above this mg/dL a saved reading surfaces the calm high-reading wellness note (no dosing). */
export const VERY_HIGH_MGDL = 250;

/** Case-insensitive search of live readings by note text. Free & unlimited. */
export function searchReadings(s: AppState, query: string): Reading[] {
  const q = query.trim().toLowerCase();
  const live = liveReadings(s);
  if (!q) return live.slice().reverse();
  return live.filter((r) => r.note.toLowerCase().includes(q)).reverse();
}

/** Readings not yet linked to a meal (for "attach to a meal" prompts). */
export function unlinkedReadings(s: AppState): Reading[] {
  return liveReadings(s).filter((r) => r.mealId === null);
}

/** The most recent live reading for the active profile, if any. */
export function latestReading(s: AppState): Reading | null {
  const live = liveReadings(s);
  return live.length ? live[live.length - 1] : null;
}

/** Convenience: classify the latest reading with the active profile. */
export function latestLevel(s: AppState): Level | null {
  const r = latestReading(s);
  return r ? classifyReading(r, activeProfile(s)) : null;
}
