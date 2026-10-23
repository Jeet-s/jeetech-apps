/**
 * Templates / routines — reusable sets of blocks you apply to a day. Applying
 * creates independent Block INSTANCES (so one-off edits on a day never touch the
 * template), with intelligent conflict resolution so a routine drops cleanly
 * onto a day that already has blocks.
 */
import { type DateKey } from "./time";
import {
  type Block,
  type BlockDayState,
  type StarterTemplate,
  type Template,
  type TemplateBlock,
  BLOCK_COLORS,
  MAX_TITLE,
} from "./model";
import { appendLog, blocksForDay, cleanTags, createBlock, findFreeSlot } from "./blocks";

export type TemplateError = "empty_name" | "too_long" | "duplicate" | "no_blocks" | "not_found";

export function validateTemplateName(state: BlockDayState, raw: string, exceptId?: string): TemplateError | null {
  const name = raw.trim();
  if (!name) return "empty_name";
  if (name.length > MAX_TITLE) return "too_long";
  if (state.templates.some((t) => t.id !== exceptId && t.name.toLowerCase() === name.toLowerCase())) return "duplicate";
  return null;
}

export interface TemplateResult {
  state: BlockDayState;
  error: TemplateError | null;
  id?: string;
}

/** Create a template from a set of block definitions (ids assigned here). */
export function createTemplate(
  state: BlockDayState,
  input: { name: string; blocks: Omit<TemplateBlock, "id">[]; stackable?: boolean; daysOfWeek?: number[] },
  today: DateKey,
): TemplateResult {
  const error = validateTemplateName(state, input.name);
  if (error) return { state, error };
  if (!input.blocks.length) return { state, error: "no_blocks" };
  let n = state.nextId;
  const blocks: TemplateBlock[] = input.blocks.map((b) => ({
    id: `tb${n++}`,
    title: b.title.trim().slice(0, MAX_TITLE),
    color: (BLOCK_COLORS as readonly string[]).includes(b.color) ? b.color : BLOCK_COLORS[0],
    tags: cleanTags(b.tags),
    durationMin: b.durationMin,
    remindersMin: b.remindersMin ?? [0],
    relativeStartMin: b.relativeStartMin,
  }));
  const id = `t${n++}`;
  const template: Template = {
    id,
    name: input.name.trim(),
    blocks,
    stackable: input.stackable ?? false,
    daysOfWeek: input.daysOfWeek ?? [],
    colorPalette: Array.from(new Set(blocks.map((b) => b.color))),
    createdAt: today,
    updatedAt: today,
  };
  return { state: { ...state, templates: [...state.templates, template], nextId: n }, error: null, id };
}

export function createFromStarter(state: BlockDayState, starter: StarterTemplate, today: DateKey): TemplateResult {
  return createTemplate(
    state,
    { name: starter.name, blocks: starter.blocks, daysOfWeek: starter.daysOfWeek },
    today,
  );
}

export function renameTemplate(state: BlockDayState, id: string, name: string, today: DateKey): TemplateResult {
  if (!state.templates.some((t) => t.id === id)) return { state, error: "not_found" };
  const error = validateTemplateName(state, name, id);
  if (error) return { state, error };
  return {
    state: {
      ...state,
      templates: state.templates.map((t) => (t.id === id ? { ...t, name: name.trim(), updatedAt: today } : t)),
    },
    error: null,
    id,
  };
}

export function deleteTemplate(state: BlockDayState, id: string): BlockDayState {
  return { ...state, templates: state.templates.filter((t) => t.id !== id) };
}

export type ApplyMode = "merge" | "replace";
export type ConflictMode = "auto" | "skip";

export interface ApplyResult {
  state: BlockDayState;
  error: TemplateError | null;
  added: number;
  skipped: number;
}

/**
 * Apply a template to `date`.
 *  - replace: existing blocks on the day are removed first.
 *  - merge + auto: conflicting blocks are slid to the next free slot.
 *  - merge + skip: conflicting blocks are dropped.
 * Every added block is an instance (origin "template", carries templateId) so a
 * later one-off edit changes only that day — never the template.
 */
export function applyTemplate(
  state: BlockDayState,
  templateId: string,
  date: DateKey,
  mode: ApplyMode,
  conflict: ConflictMode,
  today: DateKey,
): ApplyResult {
  const template = state.templates.find((t) => t.id === templateId);
  if (!template) return { state, error: "not_found", added: 0, skipped: 0 };

  let working: BlockDayState =
    mode === "replace"
      ? { ...state, blocks: state.blocks.filter((b) => b.date !== date) }
      : state;

  let added = 0;
  let skipped = 0;
  // Apply in chronological order so auto-resolution cascades predictably.
  const ordered = [...template.blocks].sort((a, b) => a.relativeStartMin - b.relativeStartMin);
  for (const tb of ordered) {
    const dur = tb.durationMin;
    let start = tb.relativeStartMin;
    const makeInput = (s: number) => ({
      date,
      start: s,
      end: s + dur,
      title: tb.title,
      color: tb.color,
      tags: [...tb.tags],
      origin: "template" as const,
      remindersMin: [...tb.remindersMin],
      templateId: template.id,
      templateBlockId: tb.id,
    });
    let res = createBlock(working, makeInput(start), today);
    if (res.error === "overlap") {
      if (conflict === "skip") {
        skipped++;
        continue;
      }
      const slot = findFreeSlot(working.blocks, date, start, dur);
      if (slot === null) {
        skipped++;
        continue;
      }
      start = slot;
      res = createBlock(working, makeInput(start), today);
    }
    if (res.error) {
      skipped++;
      continue;
    }
    working = res.state;
    added++;
  }

  const logged = appendLog(working, "apply_template", `Applied "${template.name}" to ${date} (+${added}, skip ${skipped})`, today);
  return { state: logged, error: null, added, skipped };
}

/** Turn the blocks already on a day into a reusable template. */
export function saveDayAsTemplate(state: BlockDayState, date: DateKey, name: string, today: DateKey): TemplateResult {
  const dayBlocks = blocksForDay(state, date);
  if (!dayBlocks.length) return { state, error: "no_blocks" };
  const blocks: Omit<TemplateBlock, "id">[] = dayBlocks.map((b: Block) => ({
    title: b.title,
    color: b.color,
    tags: [...b.tags],
    durationMin: b.end - b.start,
    remindersMin: [...b.remindersMin],
    relativeStartMin: b.start,
  }));
  return createTemplate(state, { name, blocks }, today);
}

/** Instances on `date` whose time differs from their source template block (one-off deviations). */
export function deviatedInstances(state: BlockDayState, date: DateKey): Block[] {
  return blocksForDay(state, date).filter((b) => {
    if (!b.templateId || !b.templateBlockId) return false;
    const t = state.templates.find((x) => x.id === b.templateId);
    const src = t?.blocks.find((x) => x.id === b.templateBlockId);
    if (!src) return false;
    return b.end - b.start !== src.durationMin || b.start !== src.relativeStartMin;
  });
}
