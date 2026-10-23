/**
 * AI Plan Helper — PURE logic. The network/proxy call lives in src/modules/ai.ts;
 * everything here is deterministic so validate.ts and sim.ts drive it with fixed
 * sample output. The AI only ENHANCES planning: `parseTasksFallback` gives the
 * same feature fully offline, so the app never depends on the network.
 */
import { type DateKey } from "./time";
import { type Block, type BlockDayState, BLOCK_COLORS, MAX_TITLE, MIN_DURATION, MAX_DURATION } from "./model";
import { createBlock, findFreeSlot, appendLog } from "./blocks";
import type { BlockDaySettings } from "./model";

export interface AiPlanItem {
  title: string;
  durationMin: number;
  tags?: string[];
  color?: string;
}

const clampDuration = (n: number, fallback: number): number => {
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(MAX_DURATION, Math.max(MIN_DURATION, Math.round(n)));
};

/**
 * Offline fallback: parse pasted lines like "Write report 90m", "Emails - 30 min",
 * "Standup 15" into plan items. Trailing duration tokens are extracted; the rest
 * is the title. Lines without a duration get `defaultDurationMin`.
 */
export function parseTasksFallback(text: string, defaultDurationMin: number): AiPlanItem[] {
  const items: AiPlanItem[] = [];
  for (const line of text.split(/\r?\n/)) {
    const raw = line.replace(/^\s*[-*•\d.)]+\s*/, "").trim(); // strip bullets / "1." prefixes
    if (!raw) continue;
    const m = /(?:^|\s|[-–—(])\s*(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours|m|min|mins|minutes)?\s*[)\]]?\s*$/i.exec(raw);
    let durationMin = defaultDurationMin;
    let title = raw;
    if (m) {
      const value = parseFloat(m[1]);
      const unit = (m[2] ?? "m").toLowerCase();
      const isHours = unit.startsWith("h");
      durationMin = clampDuration(isHours ? value * 60 : value, defaultDurationMin);
      title = raw.slice(0, m.index).trim().replace(/[-–—(:]+\s*$/, "").trim();
    }
    if (!title) title = "Task";
    items.push({ title: title.slice(0, MAX_TITLE), durationMin });
  }
  return items;
}

/** Normalise AI JSON output into clean plan items (defensive: AI can return junk). */
export function parseAiPlan(json: unknown, defaultDurationMin: number): AiPlanItem[] {
  const arr = Array.isArray(json)
    ? json
    : json && typeof json === "object" && Array.isArray((json as { blocks?: unknown[] }).blocks)
      ? (json as { blocks: unknown[] }).blocks
      : [];
  const out: AiPlanItem[] = [];
  for (const row of arr) {
    if (!row || typeof row !== "object") continue;
    const r = row as { title?: unknown; durationMin?: unknown; duration?: unknown; tags?: unknown; color?: unknown };
    const title = String(r.title ?? "").trim();
    if (!title) continue;
    const rawDur = Number(r.durationMin ?? r.duration ?? defaultDurationMin);
    out.push({
      title: title.slice(0, MAX_TITLE),
      durationMin: clampDuration(rawDur, defaultDurationMin),
      tags: Array.isArray(r.tags) ? r.tags.map(String) : undefined,
      color: typeof r.color === "string" ? r.color : undefined,
    });
  }
  return out;
}

export interface PlanDraft {
  title: string;
  color: string;
  tags: string[];
  durationMin: number;
  start: number;
  end: number;
  /** Does it sit fully inside the user's work hours? (false = suggested outside) */
  fits: boolean;
}

/**
 * Lay plan items out sequentially from the start of work hours, slotting each
 * into the next free gap around blocks already on the day. Items that run past
 * work hours are still placed but flagged `fits:false` so the UI can warn.
 */
export function planToBlocks(
  state: BlockDayState,
  date: DateKey,
  items: AiPlanItem[],
  settings: BlockDaySettings,
): PlanDraft[] {
  const drafts: PlanDraft[] = [];
  // treat already-placed drafts as occupying the day so we don't stack them
  const occupied: Block[] = state.blocks.filter((b) => b.date === date).map((b) => ({ ...b }));
  let cursor = settings.workStart;
  items.forEach((item, i) => {
    const slot = findFreeSlot(occupied, date, cursor, item.durationMin);
    if (slot === null) return; // day is full
    const start = slot;
    const end = start + item.durationMin;
    const color = item.color && (BLOCK_COLORS as readonly string[]).includes(item.color) ? item.color : BLOCK_COLORS[i % BLOCK_COLORS.length];
    drafts.push({
      title: item.title,
      color,
      tags: item.tags ?? [],
      durationMin: item.durationMin,
      start,
      end,
      fits: end <= settings.workEnd,
    });
    occupied.push({ id: `draft${i}`, date, start, end } as Block);
    cursor = end;
  });
  return drafts;
}

export interface ApplyPlanResult {
  state: BlockDayState;
  added: number;
  skipped: number;
}

/** Commit the chosen drafts as real blocks (origin "ai"). Overlapping ones are skipped. */
export function applyPlan(state: BlockDayState, date: DateKey, drafts: PlanDraft[], today: DateKey): ApplyPlanResult {
  let working = state;
  let added = 0;
  let skipped = 0;
  for (const d of drafts) {
    const res = createBlock(
      working,
      { date, start: d.start, end: d.end, title: d.title, color: d.color, tags: d.tags, origin: "ai" },
      today,
    );
    if (res.error) {
      skipped++;
      continue;
    }
    working = res.state;
    added++;
  }
  if (added) working = appendLog(working, "ai_plan", `AI plan added ${added} block(s) to ${date}`, today);
  return { state: working, added, skipped };
}
