/**
 * Local backup + pre-update safety. Daily rolling JSON snapshots (last 7 days),
 * entry-count verification around every schema migration (a mismatch aborts and
 * rolls back), and a count preview before restoring from a file. Zero data loss
 * is the top pain in this category, so this is defensive on purpose.
 */
import { type AppState } from "./model";
import { dayKey } from "./dates";

export const SCHEMA_VERSION = 1;
export const KEEP_SNAPSHOTS = 7;

export interface Counts {
  readings: number;
  meals: number;
  medications: number;
  medLogs: number;
  reminders: number;
  total: number;
}

export interface Snapshot {
  id: string;
  ts: number;
  day: string;
  schemaVersion: number;
  counts: Counts;
  data: string; // serialized AppState
}

/** Count only LIVE rows (soft-deleted rows don't count toward integrity). */
export function countEntries(s: AppState): Counts {
  const live = <T extends { deletedAt?: number | null }>(arr: T[]) => arr.filter((x) => (x.deletedAt ?? null) === null).length;
  const readings = live(s.readings);
  const meals = live(s.meals);
  const medLogs = live(s.medLogs);
  const medications = s.medications.length;
  const reminders = s.reminders.length;
  return { readings, meals, medications, medLogs, reminders, total: readings + meals + medLogs + medications + reminders };
}

export function makeSnapshot(s: AppState, now: number): Snapshot {
  return {
    id: `bk${now}`,
    ts: now,
    day: dayKey(now),
    schemaVersion: SCHEMA_VERSION,
    counts: countEntries(s),
    data: JSON.stringify(s),
  };
}

/**
 * Keep one snapshot per day (the newest of that day) and at most the last
 * KEEP_SNAPSHOTS days. Call with the new snapshot prepended.
 */
export function rollSnapshots(existing: Snapshot[], fresh: Snapshot): Snapshot[] {
  const byDay = new Map<string, Snapshot>();
  for (const snap of [fresh, ...existing]) {
    const prev = byDay.get(snap.day);
    if (!prev || snap.ts > prev.ts) byDay.set(snap.day, snap);
  }
  return Array.from(byDay.values()).sort((a, b) => b.ts - a.ts).slice(0, KEEP_SNAPSHOTS);
}

export interface Verification {
  ok: boolean;
  mismatches: string[];
}

/** Compare two count sets field-by-field (used around migrations and restores). */
export function verifyCounts(before: Counts, after: Counts): Verification {
  const mismatches: string[] = [];
  for (const key of Object.keys(before) as (keyof Counts)[]) {
    if (before[key] !== after[key]) mismatches.push(`${key}: ${before[key]} → ${after[key]}`);
  }
  return { ok: mismatches.length === 0, mismatches };
}

/**
 * Run a migration with a safety net: snapshot first, migrate, then compare
 * counts. If the counts don't match (data lost), ROLL BACK to the snapshot.
 * Returns the state actually kept plus whether it was rolled back.
 */
export function migrateWithVerification(
  before: AppState,
  migrate: (s: AppState) => AppState,
  now: number,
): { state: AppState; snapshot: Snapshot; verification: Verification; rolledBack: boolean } {
  const snapshot = makeSnapshot(before, now);
  let migrated: AppState;
  try {
    migrated = migrate(before);
  } catch {
    return { state: before, snapshot, verification: { ok: false, mismatches: ["migration threw"] }, rolledBack: true };
  }
  const verification = verifyCounts(countEntries(before), countEntries(migrated));
  if (!verification.ok) return { state: before, snapshot, verification, rolledBack: true };
  return { state: migrated, snapshot, verification, rolledBack: false };
}

export interface RestorePreview {
  ok: boolean;
  counts: Counts | null;
  schemaVersion: number | null;
  error?: "corrupt" | "wrong_shape" | "too_new";
}

/** Every top-level list a valid backup must carry (so a truncated nested file is rejected, not half-restored). */
const REQUIRED_LISTS: (keyof AppState)[] = ["profiles", "readings", "meals", "medications", "medLogs", "reminders"];

/**
 * Parse a backup file's text and preview its entry counts. Rejects corrupt files, files missing
 * any required key (profiles / activeProfileId / seq / the core lists — not just readings+meals,
 * so a truncated nested backup can't slip through), and backups written by a NEWER app version
 * (schemaVersion > this app's) that we can't safely read.
 */
export function previewRestore(raw: string): RestorePreview {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, counts: null, schemaVersion: null, error: "corrupt" };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, counts: null, schemaVersion: null, error: "wrong_shape" };
  }
  const obj = parsed as Partial<AppState> & { schemaVersion?: number };
  const listsOk = REQUIRED_LISTS.every((k) => Array.isArray(obj[k]));
  const metaOk = obj.profiles?.length ? typeof obj.activeProfileId === "string" && typeof obj.seq === "number" : false;
  if (!listsOk || !metaOk) {
    return { ok: false, counts: null, schemaVersion: null, error: "wrong_shape" };
  }
  const schemaVersion = obj.schemaVersion ?? SCHEMA_VERSION;
  if (schemaVersion > SCHEMA_VERSION) {
    return { ok: false, counts: null, schemaVersion, error: "too_new" };
  }
  return { ok: true, counts: countEntries(obj as AppState), schemaVersion };
}

/** Restore state from a validated backup string, verifying counts after load. */
export function restoreFrom(raw: string): { state: AppState | null; verification: Verification } {
  const preview = previewRestore(raw);
  if (!preview.ok || !preview.counts) return { state: null, verification: { ok: false, mismatches: [preview.error ?? "invalid"] } };
  const state = JSON.parse(raw) as AppState;
  const verification = verifyCounts(preview.counts, countEntries(state));
  return { state: verification.ok ? state : null, verification };
}
