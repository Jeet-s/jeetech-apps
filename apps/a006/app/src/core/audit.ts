/**
 * Edit audit log. Every post-match correction is recorded with its before/after
 * value so edits can't be abused and can always be reverted. Matches are never
 * auto-deleted — a correction only changes a ball, never removes the match.
 */
import type { AuditEntry, Id } from "./types";

export function makeAudit(
  id: Id,
  entity: string,
  entityId: Id,
  field: string,
  before: unknown,
  after: unknown,
  ts: number,
): AuditEntry {
  return {
    id,
    entity,
    entityId,
    field,
    before: JSON.stringify(before ?? null),
    after: JSON.stringify(after ?? null),
    ts,
  };
}

export function logFor(log: AuditEntry[], entity: string, entityId: Id): AuditEntry[] {
  return log
    .filter((e) => e.entity === entity && e.entityId === entityId)
    .sort((a, b) => b.ts - a.ts);
}

/** The value an entry would restore to on revert. */
export function revertValue(entry: AuditEntry): unknown {
  return JSON.parse(entry.before);
}
