/**
 * Spaced repetition for missed words (a utility layer Quick Pronunciation/Say
 * Clear lack). Missed words (<70%) are auto-saved; an SM-2-lite schedule brings
 * them back in a daily due queue. Works fully offline. Pure, date-driven.
 */
import type { DateKey, SRSItem, SRSSource } from "./types";
import { addDays } from "./dates";

export const MIN_EASE = 1.3;
export const START_EASE = 2.5;
export const SRS_DEFAULT_AUTOSAVE = true;

function normalize(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

export function findItem(items: SRSItem[], text: string): SRSItem | undefined {
  const key = normalize(text).toLowerCase();
  return items.find((i) => i.text.toLowerCase() === key);
}

/** Add an item if not already present. Returns the (possibly unchanged) list. */
export function addItem(
  items: SRSItem[],
  input: { id: string; text: string; source: SRSSource; soundTags?: string[] },
  today: DateKey,
): { items: SRSItem[]; added: boolean } {
  const text = normalize(input.text);
  if (!text || findItem(items, text)) return { items, added: false };
  const item: SRSItem = {
    id: input.id,
    text,
    ease: START_EASE,
    interval: 0,
    dueAt: today, // due immediately
    source: input.source,
    lapses: 0,
    soundTags: input.soundTags ?? [],
    addedAt: today,
  };
  return { items: [...items, item], added: true };
}

/**
 * Auto-save missed words from an attempt (only when the toggle is on). Each new
 * word gets a fresh id from `nextId(i)`.
 */
export function autoSaveMisses(
  items: SRSItem[],
  misses: { word: string; soundTags: string[] }[],
  today: DateKey,
  nextId: (i: number) => string,
  enabled = true,
): { items: SRSItem[]; addedIds: string[] } {
  if (!enabled) return { items, addedIds: [] };
  let out = items;
  const addedIds: string[] = [];
  let i = 0;
  for (const m of misses) {
    const id = nextId(i);
    const r = addItem(out, { id, text: m.word, source: "miss", soundTags: m.soundTags }, today);
    if (r.added) {
      out = r.items;
      addedIds.push(id);
      i++;
    }
  }
  return { items: out, addedIds };
}

export function dueItems(items: SRSItem[], today: DateKey): SRSItem[] {
  return items.filter((i) => i.dueAt <= today).sort((a, b) => (a.dueAt < b.dueAt ? -1 : a.dueAt > b.dueAt ? 1 : 0));
}

export function dueCount(items: SRSItem[], today: DateKey): number {
  return items.filter((i) => i.dueAt <= today).length;
}

/**
 * Grade a review. `correct` → interval grows by ease; wrong → reset to 1 day and
 * count a lapse. SM-2-lite: interval 0→1→6→interval*ease.
 */
export function review(items: SRSItem[], id: string, correct: boolean, today: DateKey): SRSItem[] {
  return items.map((it) => {
    if (it.id !== id) return it;
    if (!correct) {
      return { ...it, interval: 1, ease: Math.max(MIN_EASE, it.ease - 0.2), lapses: it.lapses + 1, dueAt: addDays(today, 1) };
    }
    const interval = it.interval <= 0 ? 1 : it.interval === 1 ? 6 : Math.round(it.interval * it.ease);
    const ease = Math.min(3.0, it.ease + 0.1);
    return { ...it, interval, ease, dueAt: addDays(today, interval) };
  });
}

export function removeItem(items: SRSItem[], id: string): SRSItem[] {
  return items.filter((i) => i.id !== id);
}
