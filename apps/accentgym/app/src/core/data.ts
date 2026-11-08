import { persisted, usePersisted } from "../modules/persist";
import { syncStore } from "../modules/cloud";
import { dateKey } from "./dates";
import { emptyState, migrateState, type AppState } from "./state";

/**
 * Accent Gym's on-device state — one versioned store, cloud-backed when the user
 * signs in. Bump `version` + handle the old shape in `migrate` on any model
 * change so progress always survives an update.
 */
export const gymStore = persisted<AppState>("accentgym_v1", emptyState(dateKey(new Date())), {
  version: 2,
  migrate: (old, _from) => migrateState(old, dateKey(new Date())),
});
export const useGym = () => usePersisted(gymStore);

/** Cloud backup/sync of progress + entitlement (no-op until the user signs in). */
let gymSync: ReturnType<typeof syncStore<AppState>> | undefined;
export function startGymSync() {
  return gymSync ??= syncStore(gymStore, "accentgym");
}
