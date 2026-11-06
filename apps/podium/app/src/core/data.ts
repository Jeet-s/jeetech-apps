import { persisted, usePersisted } from "../modules/persist";
import { syncStore } from "../modules/cloud";
import { dateKey } from "./dates";
import { AppState, emptyApp, migrate, STATE_VERSION } from "./state";

/** Today's local date — the one place the app reads the clock. */
export const todayKey = () => dateKey(new Date());

/**
 * The app's whole state, persisted on device (offline-first). Bump
 * STATE_VERSION + extend migrate() whenever the model changes so a user's
 * takes, streak and settings always survive an update.
 */
export const appStore = persisted<AppState>("podium_v1", emptyApp(todayKey()), {
  version: STATE_VERSION,
  migrate: (old, from) => migrate(old, from, todayKey()),
});

export const useApp = () => usePersisted(appStore);

/**
 * Cloud backup of stats + settings (no audio unless opted in). A harmless no-op
 * until the factory switched cloud saving on (cloud.json). Call after load.
 */
let syncController: { pullNow: (opts?: { merge?: (local: AppState, remote: AppState) => AppState }) => Promise<void> } | null = null;
export function startAppSync() {
  syncController = syncStore(appStore, "podium");
  return syncController;
}

/**
 * Force a backup round-trip now (used by the "Back up now" button on the Backup
 * screen). Best-effort and local-first: it resolves even offline, and the
 * next change retries automatically — the data is never at risk on the device.
 */
export async function backupNow(): Promise<void> {
  if (syncController) await syncController.pullNow();
}
