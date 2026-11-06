import { persisted, usePersisted } from "../modules/persist";
import { syncStore } from "../modules/cloud";
import { dateKey } from "./dates";
import { AppState, STATE_VERSION, emptyState, migrateState } from "./state";

/** Seed date for the initial/migrated value (wiring layer may read the clock). */
const seed = () => dateKey(new Date());

/** The app's own data, persisted on device (bump STATE_VERSION + migrate on model changes). */
export const appStore = persisted<AppState>("fluent_v2", emptyState(seed()), {
  version: STATE_VERSION,
  migrate: (old) => migrateState(old, seed()),
});

export const useApp = () => usePersisted(appStore);

/** Today's local date key — screens pass this into the pure reducers. */
export const todayKey = () => dateKey(new Date());

/** Cloud backup/sync of the whole state — a no-op unless cloud.json enabled it. Cached so the
 *  Backup screen can pullNow() on the same handle instead of opening a second subscription. */
let appSync: { pullNow: (opts?: { merge?: (local: AppState, remote: AppState) => AppState }) => Promise<void> } | null = null;
export function startAppSync() {
  if (!appSync) appSync = syncStore(appStore, "fluent_state");
  return appSync;
}
