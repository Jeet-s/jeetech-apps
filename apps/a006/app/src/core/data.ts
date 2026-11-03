import { persisted, usePersisted } from "../modules/persist";
import { syncStore } from "../modules/cloud";
import { emptyApp, type AppState } from "./app";

export const APP_VERSION = 1;

/**
 * Forward-compatible migration. Older/partial saved shapes are merged onto a
 * fresh empty state, and `seq` is pushed past every existing id so new ids
 * never collide. Users' matches must survive every update.
 */
export function migrateApp(old: unknown, _fromVersion: number): AppState {
  const base = emptyApp();
  if (!old || typeof old !== "object") return base;
  const merged: AppState = { ...base, ...(old as Partial<AppState>) };

  // Defensive: a top-level array store can rehydrate as an object — coerce.
  const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  merged.players = arr(merged.players);
  merged.teams = arr(merged.teams);
  merged.matches = arr(merged.matches);
  merged.tournaments = arr(merged.tournaments);
  merged.fixtures = arr(merged.fixtures);
  merged.overrides = arr(merged.overrides);
  merged.audit = arr(merged.audit);
  merged.presets = arr(merged.presets);
  merged.tickets = arr(merged.tickets);
  const st = merged.settings ?? {};
  merged.settings = {
    theme: st.theme ?? "system",
    backupEmail: st.backupEmail ?? null,
    ownerName: st.ownerName,
    leftHandedKeypad: st.leftHandedKeypad,
  };

  const ids = [
    ...merged.players.map((p) => p.id),
    ...merged.teams.map((t) => t.id),
    ...merged.matches.map((m) => m.id),
    ...merged.tournaments.map((t) => t.id),
  ];
  const maxNum = ids.reduce((mx, id) => {
    const n = Number(String(id).replace(/^[a-z]+/i, ""));
    return Number.isFinite(n) ? Math.max(mx, n) : mx;
  }, 0);
  merged.seq = Math.max(merged.seq ?? 1, maxNum + 1);
  return merged;
}

/** The app's own data, persisted on device (append-only ball logs inside). */
export const appStore = persisted<AppState>("gully_v1", emptyApp(), {
  version: APP_VERSION,
  migrate: migrateApp,
});

export const useApp = () => usePersisted(appStore);

/** Cloud backup of the same store — a no-op unless cloud.json enabled it. */
let appSync: { pullNow: (opts?: { merge?: (local: AppState, remote: AppState) => AppState }) => Promise<void> } | null = null;
export function startAppSync() {
  appSync = syncStore(appStore, "gully");
  return appSync;
}
/** Pull the cloud copy now (call after sign-in / switching account). */
export function pullNowApp(): Promise<void> {
  return appSync?.pullNow() ?? Promise.resolve();
}
