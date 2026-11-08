/**
 * The 5-minute daily session: built from the SRS due queue plus the weakest
 * plan sounds, capped to the user's chosen minutes. Supports "resume where you
 * left off" via a simple index that survives an app kill (persisted in state).
 */
import type { DateKey, SRSItem, SoundMastery } from "./types";
import { dueItems } from "./srs";
import { reorderPlan } from "./soundplan";
import { SOUND_BY_ID } from "./sounds";
import { sentenceForSound } from "./sentences";

export const SECONDS_PER_ITEM = 45;

export type SessionItemKind = "srs" | "sound";
export interface SessionItem {
  kind: SessionItemKind;
  refId: string; // SRS item id, or sound id
  text: string;
  soundTags: string[];
}

export interface DailySession {
  date: DateKey;
  items: SessionItem[];
  estMinutes: number;
}

export interface SessionProgress {
  date: DateKey;
  index: number; // next item to do
  total: number;
}

export function buildDailySession(opts: {
  srs: SRSItem[];
  plan: string[];
  mastery: Record<string, SoundMastery>;
  pro: boolean;
  minutes: number;
  today: DateKey;
}): DailySession {
  const cap = Math.max(3, Math.floor((opts.minutes * 60) / SECONDS_PER_ITEM));
  const items: SessionItem[] = [];

  // 1) Due SRS items first (up to ~half the session).
  const due = dueItems(opts.srs, opts.today);
  for (const it of due) {
    if (items.length >= Math.ceil(cap / 2)) break;
    items.push({ kind: "srs", refId: it.id, text: it.text, soundTags: it.soundTags });
  }

  // 2) Fill the rest with the weakest plan sounds (a target sentence each).
  const ordered = reorderPlan(opts.plan, opts.mastery);
  for (const soundId of ordered) {
    if (items.length >= cap) break;
    const s = SOUND_BY_ID[soundId];
    const sentence = sentenceForSound(soundId, opts.pro);
    items.push({
      kind: "sound",
      refId: soundId,
      text: sentence?.text ?? (s ? `Practice the ${s.name}` : soundId),
      soundTags: [soundId],
    });
  }

  return { date: opts.today, items, estMinutes: Math.round((items.length * SECONDS_PER_ITEM) / 60) };
}

export function startProgress(session: DailySession): SessionProgress {
  return { date: session.date, index: 0, total: session.items.length };
}

export function advance(p: SessionProgress): SessionProgress {
  return { ...p, index: Math.min(p.total, p.index + 1) };
}

export function isComplete(p: SessionProgress | undefined, session: DailySession): boolean {
  return !!p && p.date === session.date && p.total > 0 && p.index >= p.total;
}

/** Resume point valid only for today's session; a new day starts fresh. */
export function resumeIndex(p: SessionProgress | undefined, today: DateKey): number {
  return p && p.date === today ? p.index : 0;
}
