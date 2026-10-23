/**
 * Block operations — create, edit, move, resize, duplicate, shift, and status.
 * Pure: every function takes the current state and returns a NEW state (no
 * mutation, no hidden clock). The hard rule enforced everywhere: no two blocks
 * ever overlap (compared in absolute cross-day minutes), so overnight and
 * same-day conflicts are both caught. Any op that would overlap is rejected
 * (state returned unchanged) rather than corrupting the plan.
 */
import {
  DAY,
  type DateKey,
  dayNumber,
  snap as snapMin,
} from "./time";
import {
  type Block,
  type BlockDayState,
  type LogEntry,
  type LogType,
  type Origin,
  BLOCK_COLORS,
  MAX_LOG,
  MAX_NOTES,
  MAX_REMINDERS,
  MAX_TAGS,
  MAX_TAG_LEN,
  MAX_TITLE,
  MIN_DURATION,
  MAX_DURATION,
} from "./model";

export type BlockError =
  | "empty_title"
  | "too_long"
  | "bad_notes"
  | "too_many_tags"
  | "bad_tag"
  | "bad_time"
  | "too_short"
  | "too_long_duration"
  | "overlap"
  | "not_found";

export interface BlockInput {
  date: DateKey;
  start: number;
  end: number;
  title: string;
  color?: string;
  tags?: string[];
  notes?: string;
  origin?: Origin;
  remindersMin?: number[];
  activityId?: string | null;
  templateId?: string | null;
  templateBlockId?: string | null;
}

// ── Absolute-minute interval helpers (handle overnight + cross-day) ──────────
export const absStart = (b: Pick<Block, "date" | "start">) => dayNumber(b.date) * DAY + b.start;
export const absEnd = (b: Pick<Block, "date" | "start" | "end">) => dayNumber(b.date) * DAY + b.end;
export const duration = (b: Pick<Block, "start" | "end">) => b.end - b.start;

/** Do two time intervals intersect? Touching edges (end === start) is NOT overlap. */
export function overlaps(a: Pick<Block, "date" | "start" | "end">, b: Pick<Block, "date" | "start" | "end">): boolean {
  return absStart(a) < absEnd(b) && absStart(b) < absEnd(a);
}

/** Does `cand` overlap any existing block (optionally ignoring one id)? */
export function overlapsAny(blocks: Block[], cand: Pick<Block, "date" | "start" | "end">, exceptId?: string): boolean {
  return blocks.some((b) => b.id !== exceptId && overlaps(b, cand));
}

// ── Validation ───────────────────────────────────────────────────────────────
export function cleanTags(tags: string[] | undefined): string[] {
  if (!tags) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const t = raw.trim().toLowerCase();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

export function validateTimes(start: number, end: number): BlockError | null {
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "bad_time";
  if (start < 0 || start >= DAY) return "bad_time";
  if (end <= start) return "bad_time";
  const dur = end - start;
  if (dur < MIN_DURATION) return "too_short";
  if (dur > MAX_DURATION) return "too_long_duration";
  return null;
}

export function validateBlockFields(input: {
  title: string;
  start: number;
  end: number;
  notes?: string;
  tags?: string[];
  remindersMin?: number[];
}): BlockError | null {
  const title = input.title.trim();
  if (!title) return "empty_title";
  if (title.length > MAX_TITLE) return "too_long";
  if ((input.notes ?? "").length > MAX_NOTES) return "bad_notes";
  const tags = cleanTags(input.tags);
  if (tags.length > MAX_TAGS) return "too_many_tags";
  if (tags.some((t) => t.length > MAX_TAG_LEN)) return "bad_tag";
  if ((input.remindersMin ?? []).some((r) => !Number.isFinite(r) || r < 0 || r > DAY)) return "bad_time";
  if ((input.remindersMin ?? []).length > MAX_REMINDERS) return "bad_time";
  return validateTimes(input.start, input.end);
}

// ── Internal helpers ──────────────────────────────────────────────────────────
function appendLog(state: BlockDayState, type: LogType, summary: string, at: DateKey): BlockDayState {
  const entry: LogEntry = { id: `l${state.nextId}`, type, summary, at };
  return {
    ...state,
    nextId: state.nextId + 1,
    log: [entry, ...state.log].slice(0, MAX_LOG),
  };
}

const dedupeReminders = (r: number[] | undefined): number[] =>
  Array.from(new Set((r ?? []).filter((n) => Number.isFinite(n) && n >= 0))).sort((a, b) => a - b);

// ── Create / update / delete ──────────────────────────────────────────────────
export interface BlockResult {
  state: BlockDayState;
  error: BlockError | null;
  id?: string;
}

export function createBlock(state: BlockDayState, input: BlockInput, today: DateKey): BlockResult {
  const error = validateBlockFields(input);
  if (error) return { state, error };
  const cand = { date: input.date, start: input.start, end: input.end };
  if (overlapsAny(state.blocks, cand)) return { state, error: "overlap" };
  const id = `b${state.nextId}`;
  const block: Block = {
    id,
    date: input.date,
    start: input.start,
    end: input.end,
    title: input.title.trim(),
    color: input.color && (BLOCK_COLORS as readonly string[]).includes(input.color) ? input.color : BLOCK_COLORS[0],
    tags: cleanTags(input.tags),
    notes: (input.notes ?? "").slice(0, MAX_NOTES),
    origin: input.origin ?? "manual",
    status: "planned",
    remindersMin: dedupeReminders(input.remindersMin ?? [0]),
    activityId: input.activityId ?? null,
    templateId: input.templateId ?? null,
    templateBlockId: input.templateBlockId ?? null,
    actualMin: null,
    createdAt: today,
    updatedAt: today,
  };
  return { state: { ...state, blocks: [...state.blocks, block], nextId: state.nextId + 1 }, error: null, id };
}

export type BlockPatch = Partial<Pick<Block, "title" | "color" | "tags" | "notes" | "remindersMin">>;

/** Edit a block's content (not its time — use resize/move for that). */
export function updateBlock(state: BlockDayState, id: string, patch: BlockPatch, today: DateKey): BlockResult {
  const block = state.blocks.find((b) => b.id === id);
  if (!block) return { state, error: "not_found" };
  const next: Block = {
    ...block,
    ...(patch.title !== undefined ? { title: patch.title } : {}),
    ...(patch.color !== undefined ? { color: patch.color } : {}),
    ...(patch.tags !== undefined ? { tags: patch.tags } : {}),
    ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
    ...(patch.remindersMin !== undefined ? { remindersMin: patch.remindersMin } : {}),
  };
  const error = validateBlockFields(next);
  if (error) return { state, error };
  const clean: Block = {
    ...next,
    title: next.title.trim(),
    tags: cleanTags(next.tags),
    notes: next.notes.slice(0, MAX_NOTES),
    remindersMin: dedupeReminders(next.remindersMin),
    updatedAt: today,
  };
  return { state: { ...state, blocks: state.blocks.map((b) => (b.id === id ? clean : b)) }, error: null, id };
}

export function deleteBlock(state: BlockDayState, id: string): BlockDayState {
  return { ...state, blocks: state.blocks.filter((b) => b.id !== id) };
}

/** Put a deleted block back (Undo), only if its slot is still free. */
export function restoreBlock(state: BlockDayState, block: Block): BlockDayState {
  if (state.blocks.some((b) => b.id === block.id)) return state;
  if (overlapsAny(state.blocks, block)) return state;
  return { ...state, blocks: [...state.blocks, block] };
}

// ── Resize / move (snap + overlap safe) ───────────────────────────────────────
/** Change start and/or end (minutes). Values are snapped to `snapInterval` first. */
export function resizeBlock(
  state: BlockDayState,
  id: string,
  edges: { start?: number; end?: number },
  snapInterval: number,
  today: DateKey,
): BlockResult {
  const block = state.blocks.find((b) => b.id === id);
  if (!block) return { state, error: "not_found" };
  const start = edges.start !== undefined ? snapMin(edges.start, snapInterval) : block.start;
  const end = edges.end !== undefined ? snapMin(edges.end, snapInterval) : block.end;
  const error = validateTimes(start, end);
  if (error) return { state, error };
  if (overlapsAny(state.blocks, { date: block.date, start, end }, id)) return { state, error: "overlap" };
  return {
    state: { ...state, blocks: state.blocks.map((b) => (b.id === id ? { ...b, start, end, updatedAt: today } : b)) },
    error: null,
    id,
  };
}

/** Move a block to a new start (minutes), keeping its duration. Snaps + checks overlap. */
export function moveBlock(state: BlockDayState, id: string, newStart: number, snapInterval: number, today: DateKey): BlockResult {
  const block = state.blocks.find((b) => b.id === id);
  if (!block) return { state, error: "not_found" };
  const start = snapMin(newStart, snapInterval);
  if (start < 0 || start >= DAY) return { state, error: "bad_time" };
  const end = start + duration(block);
  if (overlapsAny(state.blocks, { date: block.date, start, end }, id)) return { state, error: "overlap" };
  return {
    state: { ...state, blocks: state.blocks.map((b) => (b.id === id ? { ...b, start, end, updatedAt: today } : b)) },
    error: null,
    id,
  };
}

/** Earliest start ≥ `after` on `date` where a block of `durationMin` fits without overlap. */
export function findFreeSlot(blocks: Block[], date: DateKey, after: number, durationMin: number): number | null {
  const sameDay = blocks
    .filter((b) => b.date === date)
    .sort((a, b) => a.start - b.start);
  let cursor = Math.max(0, after);
  for (const b of sameDay) {
    if (b.end <= cursor) continue; // already past it
    if (b.start - cursor >= durationMin) return cursor; // fits in the gap before this block
    cursor = Math.max(cursor, b.end);
  }
  // after the last block — allow spilling overnight up to one extra day
  if (cursor + durationMin <= DAY * 2) return cursor;
  return null;
}

/** Long-press duplicate: same block placed in the next free slot after it. */
export function duplicateBlock(state: BlockDayState, id: string, today: DateKey): BlockResult {
  const block = state.blocks.find((b) => b.id === id);
  if (!block) return { state, error: "not_found" };
  const dur = duration(block);
  const slot = findFreeSlot(state.blocks, block.date, block.end, dur);
  if (slot === null) return { state, error: "overlap" };
  return createBlock(
    state,
    {
      date: block.date,
      start: slot,
      end: slot + dur,
      title: block.title,
      color: block.color,
      tags: [...block.tags],
      notes: block.notes,
      origin: block.origin,
      remindersMin: [...block.remindersMin],
      activityId: block.activityId,
    },
    today,
  );
}

// ── Status (start / complete / skip) ──────────────────────────────────────────
export function startBlock(state: BlockDayState, id: string, today: DateKey): BlockDayState {
  return setStatus(state, id, "active", today);
}
export function skipBlock(state: BlockDayState, id: string, today: DateKey): BlockDayState {
  return setStatus(state, id, "skipped", today);
}
export function reopenBlock(state: BlockDayState, id: string, today: DateKey): BlockDayState {
  return {
    ...state,
    blocks: state.blocks.map((b) => (b.id === id ? { ...b, status: "planned", actualMin: null, updatedAt: today } : b)),
  };
}

export function setStatus(state: BlockDayState, id: string, status: Block["status"], today: DateKey): BlockDayState {
  return { ...state, blocks: state.blocks.map((b) => (b.id === id ? { ...b, status, updatedAt: today } : b)) };
}

/** Mark done, recording actual minutes (defaults to the planned duration). */
export function completeBlock(state: BlockDayState, id: string, today: DateKey, actualMin?: number): BlockDayState {
  return {
    ...state,
    blocks: state.blocks.map((b) =>
      b.id === id
        ? { ...b, status: "done", actualMin: Math.max(0, Math.round(actualMin ?? duration(b))), updatedAt: today }
        : b,
    ),
  };
}

// ── Rubber-band shift + multi-select move ──────────────────────────────────────
/** Shift every block on `date` that starts at/after `fromMin` by `deltaMin` (may be negative). */
export function shiftFollowing(
  state: BlockDayState,
  date: DateKey,
  fromMin: number,
  deltaMin: number,
  today: DateKey,
): { state: BlockDayState; error: BlockError | null; moved: number } {
  if (deltaMin === 0) return { state, error: null, moved: 0 };
  const movingIds = new Set(state.blocks.filter((b) => b.date === date && b.start >= fromMin).map((b) => b.id));
  if (!movingIds.size) return { state, error: null, moved: 0 };
  const shifted = state.blocks.map((b) =>
    movingIds.has(b.id) ? { ...b, start: b.start + deltaMin, end: b.end + deltaMin, updatedAt: today } : b,
  );
  if (shifted.some((b) => movingIds.has(b.id) && (b.start < 0 || b.start >= DAY))) return { state, error: "bad_time", moved: 0 };
  // any overlap introduced? (fixed blocks vs moved, moved vs moved stays safe)
  if (hasOverlap(shifted)) return { state, error: "overlap", moved: 0 };
  const after = appendLog({ ...state, blocks: shifted }, "shift", `Shifted ${movingIds.size} block(s) by ${deltaMin}m`, today);
  return { state: after, error: null, moved: movingIds.size };
}

/** Move a selected set of blocks together by `deltaMin` without introducing overlaps. */
export function moveMany(state: BlockDayState, ids: string[], deltaMin: number, today: DateKey): { state: BlockDayState; error: BlockError | null } {
  const set = new Set(ids);
  const moved = state.blocks.map((b) =>
    set.has(b.id) ? { ...b, start: b.start + deltaMin, end: b.end + deltaMin, updatedAt: today } : b,
  );
  if (moved.some((b) => set.has(b.id) && (b.start < 0 || b.start >= DAY))) return { state, error: "bad_time" };
  if (hasOverlap(moved)) return { state, error: "overlap" };
  return { state: { ...state, blocks: moved }, error: null };
}

/** Does any pair of blocks overlap? (absolute-minute, cross-day aware) */
export function hasOverlap(blocks: Block[]): boolean {
  const sorted = [...blocks].sort((a, b) => absStart(a) - absStart(b));
  for (let i = 1; i < sorted.length; i++) {
    if (absStart(sorted[i]) < absEnd(sorted[i - 1])) return true;
  }
  return false;
}

// ── Day queries ────────────────────────────────────────────────────────────────
export function blocksForDay(state: BlockDayState, date: DateKey): Block[] {
  return state.blocks.filter((b) => b.date === date).sort((a, b) => a.start - b.start);
}

export function clearDay(state: BlockDayState, date: DateKey, today: DateKey): BlockDayState {
  const removed = state.blocks.filter((b) => b.date === date).length;
  if (!removed) return state;
  return appendLog({ ...state, blocks: state.blocks.filter((b) => b.date !== date) }, "clear_day", `Cleared ${removed} block(s) on ${date}`, today);
}

/**
 * "Snooze" an active block by `deltaMin`: push every later block on the day by
 * delta first (so there's room), then extend this block's end. Keeps the hard
 * no-overlap invariant; rejects (state unchanged) if it can't fit in the day.
 */
export function snoozeBlock(state: BlockDayState, id: string, deltaMin: number, today: DateKey): BlockResult {
  const block = state.blocks.find((b) => b.id === id);
  if (!block) return { state, error: "not_found" };
  if (deltaMin <= 0) return { state, error: null, id };
  const shifted = shiftFollowing(state, block.date, block.end, deltaMin, today);
  if (shifted.error) return { state, error: shifted.error };
  const newEnd = block.end + deltaMin;
  const err = validateTimes(block.start, newEnd);
  if (err) return { state, error: err };
  const blocks = shifted.state.blocks.map((b) => (b.id === id ? { ...b, end: newEnd, updatedAt: today } : b));
  if (hasOverlap(blocks)) return { state, error: "overlap" };
  return { state: { ...shifted.state, blocks }, error: null, id };
}

/** The block containing `nowMin` on `date` (active now), or null. */
export function activeBlock(state: BlockDayState, date: DateKey, nowMin: number): Block | null {
  const abs = dayNumber(date) * DAY + nowMin;
  return state.blocks.find((b) => b.status !== "skipped" && absStart(b) <= abs && abs < absEnd(b)) ?? null;
}

/** The next block to start at or after `nowMin` on `date`. */
export function nextBlock(state: BlockDayState, date: DateKey, nowMin: number): Block | null {
  const abs = dayNumber(date) * DAY + nowMin;
  return (
    state.blocks
      .filter((b) => b.status === "planned" && absStart(b) >= abs)
      .sort((a, b) => absStart(a) - absStart(b))[0] ?? null
  );
}

export { appendLog };
