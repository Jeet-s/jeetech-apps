/**
 * Manual backup & restore — always free. A backup is a single self-describing
 * JSON file (version + state + settings). Restore validates the shape and
 * migrates old versions; a corrupt or foreign file is rejected WITHOUT touching
 * the user's existing data (returns { ok:false }).
 */
import type { ISO } from "./time";
import {
  type BlockDayState,
  type BlockDaySettings,
  defaultSettings,
  emptyState,
} from "./model";
import { hasOverlap } from "./blocks";

export const BACKUP_VERSION = 1;
const MAGIC = "blockday-backup";

export interface Backup {
  app: typeof MAGIC;
  v: number;
  exportedAt: ISO | null;
  state: BlockDayState;
  settings: BlockDaySettings;
}

export function exportBackup(state: BlockDayState, settings: BlockDaySettings, exportedAt: ISO | null = null): string {
  const payload: Backup = { app: MAGIC, v: BACKUP_VERSION, exportedAt, state, settings };
  return JSON.stringify(payload);
}

export type RestoreResult =
  | { ok: true; state: BlockDayState; settings: BlockDaySettings }
  | { ok: false; error: "corrupt" | "not_backup" | "unsupported" | "invalid" };

/** Migrate a backup payload of any known older version up to the current shape. */
function migrate(raw: { v?: number; state?: unknown; settings?: unknown }): { state: BlockDayState; settings: BlockDaySettings } {
  // Fill any fields a future/older build omitted from defaults; unknown extras are dropped by the spread.
  const state = { ...emptyState(), ...(raw.state as object) } as BlockDayState;
  const settings = { ...defaultSettings(), ...(raw.settings as object) } as BlockDaySettings;
  return { state, settings };
}

export function importBackup(rawText: string): RestoreResult {
  let parsed: { app?: string; v?: number; state?: unknown; settings?: unknown };
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return { ok: false, error: "corrupt" };
  }
  if (!parsed || typeof parsed !== "object") return { ok: false, error: "corrupt" };
  if (parsed.app !== MAGIC) return { ok: false, error: "not_backup" };
  if (typeof parsed.v !== "number" || parsed.v > BACKUP_VERSION) return { ok: false, error: "unsupported" };
  if (!parsed.state || typeof parsed.state !== "object" || !Array.isArray((parsed.state as BlockDayState).blocks)) {
    return { ok: false, error: "invalid" };
  }
  const { state, settings } = migrate(parsed);
  // A trustworthy backup must not restore into an overlapping (corrupt) plan.
  if (hasOverlap(state.blocks)) return { ok: false, error: "invalid" };
  return { ok: true, state, settings };
}
