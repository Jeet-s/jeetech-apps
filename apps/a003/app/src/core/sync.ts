/**
 * Cloud-sync merge — pure. When a device pulls the cloud copy we don't blindly
 * overwrite (last-write-wins loses a day planned on the other phone). Instead we
 * merge per record:
 *   • blocks   — union by id; for a shared id the newer `updatedAt` wins; a block
 *                that only exists remotely is added ONLY if its slot is free, so
 *                the hard no-overlap invariant always survives a merge.
 *   • templates/activities — union by id (newer `updatedAt` wins for templates).
 *   • log      — union by id, most recent first, capped at MAX_LOG.
 * Local is treated as the clean base (it already satisfies the invariant), and
 * every incoming change is overlap-checked before it's accepted.
 */
import type { Activity, Block, BlockDayState, LogEntry, Template } from "./model";
import { MAX_LOG } from "./model";
import { absStart, overlaps } from "./blocks";

/** Lexicographic DateKey/ISO compare is chronological; later string = newer. */
const newer = (a: string, b: string) => (a >= b ? a : b);

function wouldOverlap(blocks: Block[], cand: Block): boolean {
  return blocks.some((b) => b.id !== cand.id && overlaps(b, cand));
}

export function mergeBlocks(local: Block[], remote: Block[]): Block[] {
  const localById = new Map(local.map((b) => [b.id, b]));
  const result: Block[] = [...local];

  // 1) Shared ids: adopt the remote edit when it's newer AND still fits.
  for (const r of remote) {
    const mine = localById.get(r.id);
    if (!mine) continue;
    if (r.updatedAt > mine.updatedAt) {
      const without = result.filter((b) => b.id !== r.id);
      if (!wouldOverlap(without, r)) {
        const i = result.findIndex((b) => b.id === r.id);
        result[i] = r;
      }
    }
  }

  // 2) Remote-only blocks: add in time order, keeping the no-overlap guarantee.
  const remoteOnly = remote.filter((r) => !localById.has(r.id)).sort((a, b) => absStart(a) - absStart(b));
  for (const r of remoteOnly) {
    if (!wouldOverlap(result, r)) result.push(r);
  }
  return result;
}

function mergeById<T extends { id: string }>(local: T[], remote: T[], pick: (a: T, b: T) => T): T[] {
  const map = new Map(local.map((x) => [x.id, x]));
  for (const r of remote) {
    const mine = map.get(r.id);
    map.set(r.id, mine ? pick(mine, r) : r);
  }
  return [...map.values()];
}

export function mergeBlockDayState(local: BlockDayState, remote: BlockDayState): BlockDayState {
  const blocks = mergeBlocks(local.blocks ?? [], remote.blocks ?? []);
  const templates = mergeById<Template>(local.templates ?? [], remote.templates ?? [], (a, b) => (b.updatedAt > a.updatedAt ? b : a));
  const activities = mergeById<Activity>(local.activities ?? [], remote.activities ?? [], (a) => a);
  const log = mergeById<LogEntry>(local.log ?? [], remote.log ?? [], (a) => a)
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .slice(0, MAX_LOG);
  return {
    blocks,
    templates,
    activities,
    log,
    lastBackupAt: newer(local.lastBackupAt ?? "", remote.lastBackupAt ?? "") || null,
    nextId: Math.max(local.nextId ?? 1, remote.nextId ?? 1),
  };
}
