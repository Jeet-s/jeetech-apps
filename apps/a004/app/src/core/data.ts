import { persisted, usePersisted } from "../modules/persist";
import { syncStore } from "../modules/cloud";
import { emptyState, type AppState } from "./model";
import { migrateWithVerification, previewRestore, verifyCounts, countEntries, type Snapshot, type Verification } from "./backup";

// ── Sugar Plate: the app's real on-device store ──────────────────────────────────

export const SUGAR_VERSION = 1;

/** Coerce an unknown stored value into a complete AppState: every field falls back to its
 *  default and every list field is guaranteed to be a real array (so count verification and the
 *  screens never crash on a partial/older shape). */
function coerceState(old: Partial<AppState>, base: AppState): AppState {
  const arr = <T>(v: unknown, d: T[]): T[] => (Array.isArray(v) ? (v as T[]) : d);
  return {
    ...base,
    ...old,
    profiles: arr(old.profiles, base.profiles),
    readings: arr(old.readings, base.readings),
    meals: arr(old.meals, base.meals),
    medications: arr(old.medications, base.medications),
    medLogs: arr(old.medLogs, base.medLogs),
    reminders: arr(old.reminders, base.reminders),
    swapGoals: arr(old.swapGoals, base.swapGoals),
  };
}

/** Per-version forward transform of an already-coerced state. v1 is the initial schema, so this
 *  is identity today; add a `case` here when SUGAR_VERSION is bumped. Count-verified by migrate(). */
function transformForward(s: AppState, _fromVersion: number): AppState {
  return s;
}

/**
 * A pre-migration safety snapshot produced by migrate() when the stored version is older than
 * SUGAR_VERSION. It is flushed to snapshotsStore on boot (App.tsx) BEFORE the migrated state is
 * used, so there is always a "restore last version" point — making the Backup screen's
 * "snapshot before any update" promise true.
 */
let pendingMigrationSnapshot: Snapshot | null = null;
export function takePendingMigrationSnapshot(): Snapshot | null {
  const s = pendingMigrationSnapshot;
  pendingMigrationSnapshot = null;
  return s;
}

/**
 * Migration path for the single app store. Every migration is run through
 * migrateWithVerification: snapshot the old state, apply the forward transform, then compare
 * LIVE entry counts — if any are lost, roll back to the old state (no silent data loss).
 */
function migrate(old: unknown, fromVersion: number): AppState {
  const base = emptyState();
  if (!old || typeof old !== "object") return base;
  const coerced = coerceState(old as Partial<AppState>, base);
  if (fromVersion === SUGAR_VERSION) return coerced; // same shape, nothing to transform
  const res = migrateWithVerification(coerced, (s) => transformForward(s, fromVersion), Date.now());
  pendingMigrationSnapshot = res.snapshot; // flushed to snapshotsStore before the migrated state is used
  return res.state; // rolled back to `coerced` if the transform lost any rows
}

/**
 * Restore an AppState from a backup string with the SAME safety the on-device store gets on an
 * update: coerce the shape, and if the backup was written by an OLDER schema run it through
 * migrateWithVerification (snapshot → forward-transform → count check, rolling back on any loss)
 * BEFORE it is used. Returns `state: null` when the file is unreadable OR verification fails, so the
 * caller can abort and keep the current data untouched. `migrated` tells the UI an upgrade happened.
 */
export function restoreBackup(raw: string, now: number): { state: AppState | null; verification: Verification; migrated: boolean } {
  const preview = previewRestore(raw);
  if (!preview.ok || !preview.counts) {
    return { state: null, verification: { ok: false, mismatches: [preview.error ?? "invalid"] }, migrated: false };
  }
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return { state: null, verification: { ok: false, mismatches: ["corrupt"] }, migrated: false }; }
  const coerced = coerceState(parsed as Partial<AppState>, emptyState());
  const fromVersion = preview.schemaVersion ?? SUGAR_VERSION;
  if (fromVersion < SUGAR_VERSION) {
    const res = migrateWithVerification(coerced, (s) => transformForward(s, fromVersion), now);
    if (res.rolledBack || !res.verification.ok) return { state: null, verification: res.verification, migrated: true };
    return { state: res.state, verification: res.verification, migrated: true };
  }
  // Same schema: verify the parsed counts match the file's declared counts (catches a bad parse).
  const verification = verifyCounts(preview.counts, countEntries(coerced));
  return { state: verification.ok ? coerced : null, verification, migrated: false };
}

export const sugarStore = persisted<AppState>("sugarplate_v1", emptyState(), {
  version: SUGAR_VERSION,
  migrate,
});
export const useSugar = () => usePersisted(sugarStore);

/** Daily rolling local snapshots (last 7) for pre-update safety + restore. */
export const snapshotsStore = persisted<Snapshot[]>("sugarplate_backups_v1", [], { version: 1 });

/**
 * Normalise the snapshots value to a real array. persist.ts rehydrates a stored
 * value with `{ ...initial, ...data }`; for a top-level ARRAY store that turns
 * `[a, b]` back into the object `{ 0: a, 1: b }` (no `.map`/`.length`). Always
 * read snapshots through this so the Backup screen and the daily job stay safe.
 */
export const asSnapshotList = (v: unknown): Snapshot[] =>
  Array.isArray(v) ? v : v && typeof v === "object" ? (Object.values(v as Record<string, Snapshot>) as Snapshot[]) : [];

export const useSnapshots = (): Snapshot[] => asSnapshotList(usePersisted(snapshotsStore));

/**
 * Cloud backup/sync of the app store — Pro-only and a no-op unless the factory
 * switched cloud saving on (cloud.json). Call after the store has loaded.
 */
let sugarSync: ReturnType<typeof syncStore<AppState>> | null = null;
export function startSugarSync() {
  sugarSync = syncStore(sugarStore, "sugarplate");
  return sugarSync;
}

/** Union two app states by id (never deletes); newer `updatedAt` wins per record. */
export function mergeSugar(local: AppState, remote: AppState): AppState {
  const byId = <T extends { id: string; updatedAt?: number }>(a: T[], b: T[]): T[] => {
    const map = new Map<string, T>();
    for (const x of [...a, ...b]) {
      const prev = map.get(x.id);
      if (!prev || (x.updatedAt ?? 0) >= (prev.updatedAt ?? 0)) map.set(x.id, x);
    }
    return Array.from(map.values());
  };
  const profiles = byId(local.profiles, remote.profiles);
  return {
    ...local,
    profiles,
    activeProfileId: profiles.some((p) => p.id === local.activeProfileId) ? local.activeProfileId : remote.activeProfileId,
    readings: byId(local.readings, remote.readings),
    meals: byId(local.meals, remote.meals),
    medications: byId(local.medications, remote.medications),
    medLogs: byId(local.medLogs, remote.medLogs),
    reminders: byId(local.reminders, remote.reminders),
    swapGoals: byId(local.swapGoals, remote.swapGoals),
    seq: Math.max(local.seq, remote.seq),
    disclaimerAccepted: local.disclaimerAccepted || remote.disclaimerAccepted,
  };
}

/** Pull cloud data now (after sign-in). When switching to an existing account, merge instead of overwrite. */
export function pullSugarNow(opts?: { switched?: boolean }): Promise<void> {
  if (!sugarSync) return Promise.resolve();
  return sugarSync.pullNow(opts?.switched ? { merge: mergeSugar } : undefined);
}
