import { persisted, usePersisted } from "../modules/persist";
import { syncStore } from "../modules/cloud";
import {
  type BlockDayState,
  type BlockDaySettings,
  defaultSettings,
  emptyState,
} from "./model";
import { mergeBlockDayState } from "./sync";

/**
 * BlockDay's on-device data — the single source of truth, offline-first. Two
 * versioned stores: the plan itself and the user's settings. Bump `version` and
 * extend `migrate` whenever a shape changes so nobody ever loses a day's plan.
 */
export const blockDayStore = persisted<BlockDayState>("blockday_v1", emptyState(), {
  version: 1,
  migrate: (_old, _from) => emptyState(), // v1 is the first shape; future versions map here
});
export const useBlockDay = () => usePersisted(blockDayStore);

export const settingsStore = persisted<BlockDaySettings>("blockday_settings_v1", defaultSettings(), { version: 1 });
export const useBlockDaySettings = () => usePersisted(settingsStore);

/** Cloud backup/sync of the plan (Pro only; a no-op unless the factory enabled sync). */
let _sync: ReturnType<typeof syncStore<BlockDayState>> | null = null;
export function startBlockDaySync() {
  if (!_sync) _sync = syncStore(blockDayStore, "blockday");
  return _sync;
}

/**
 * Pull the cloud copy and MERGE it into this device's plan (per-record, overlap
 * safe) rather than overwriting — so a day planned on another phone is never
 * lost. Call after sign-in, after switching account, or from "Sync now".
 */
export function syncBlockDayNow() {
  return startBlockDaySync().pullNow({ merge: mergeBlockDayState });
}
