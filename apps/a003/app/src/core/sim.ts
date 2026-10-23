/**
 * Simulation of BlockDay's real core logic for the factory's journey bots.
 * Actions mirror what the Today timeline / Templates / Insights / Settings
 * screens actually offer (including invalid input the UI lets the user try).
 * Goals = one per PRD user flow; invariants = the data rules that must always
 * hold; serialize/deserialize = exactly what the app persists (the per-session
 * undo history is deliberately excluded — it is not persisted).
 */
import { DAY, type DateKey, addDays } from "./time";
import {
  type BlockDayState,
  type BlockDaySettings,
  BLOCK_COLORS,
  MAX_LOG,
  MAX_TAGS,
  MAX_TAG_LEN,
  MAX_TITLE,
  MIN_DURATION,
  MAX_DURATION,
  STARTER_TEMPLATES,
  defaultSettings,
  emptyState,
} from "./model";
import {
  type BlockInput,
  completeBlock,
  createBlock,
  deleteBlock,
  duplicateBlock,
  blocksForDay,
  findFreeSlot,
  hasOverlap,
  moveBlock,
  resizeBlock,
  shiftFollowing,
  skipBlock,
  startBlock,
} from "./blocks";
import { applyTemplate, createFromStarter, deviatedInstances, saveDayAsTemplate } from "./templates";
import { advancedInsights } from "./stats";
import { type AiPlanItem, applyPlan, planToBlocks } from "./ai";
import { exportBackup, importBackup } from "./backup";
import { type History, canRedo, canUndo, initHistory, record, redo, undo } from "./undo";

export interface Goal<S> {
  id: string;
  name: string;
  done(state: S): boolean;
}

export interface AppSim<S, A> {
  init(): S;
  actions(state: S): A[];
  apply(state: S, action: A): S;
  goals: Goal<S>[];
  invariants(state: S): string[];
  serialize(state: S): string;
  deserialize(raw: string): S;
}

interface SimState {
  data: BlockDayState;
  settings: BlockDaySettings;
  history: History<BlockDayState>; // undo/redo — NOT persisted
  pro: boolean;
  today: DateKey;
  nowMin: number;
  backupFile: string | null; // a saved backup, as if written to disk
  restored: boolean; // completed a backup→restore round-trip
}

type Action =
  | { t: "quick_add"; preset: number }
  | { t: "start"; id: string }
  | { t: "complete"; id: string }
  | { t: "skip"; id: string }
  | { t: "delete"; id: string }
  | { t: "shorten"; id: string }
  | { t: "move_later"; id: string }
  | { t: "duplicate"; id: string }
  | { t: "quick_routine" }
  | { t: "apply_template_replace" }
  | { t: "save_day_as_template" }
  | { t: "shift_following" }
  | { t: "ai_plan" }
  | { t: "backup" }
  | { t: "restore" }
  | { t: "buy_pro" }
  | { t: "undo" }
  | { t: "redo" }
  | { t: "next_day" };

const ADD_PRESETS: { title: string; durationMin: number; color: string; tags: string[] }[] = [
  { title: "Deep Work", durationMin: 90, color: BLOCK_COLORS[4], tags: ["focus"] },
  { title: "Email & Admin", durationMin: 30, color: BLOCK_COLORS[3], tags: ["admin"] },
  { title: "Lunch", durationMin: 60, color: BLOCK_COLORS[1], tags: ["break"] },
  { title: "", durationMin: 30, color: BLOCK_COLORS[0], tags: [] }, // invalid: UI lets you leave the title blank
  { title: "x".repeat(MAX_TITLE + 10), durationMin: 30, color: BLOCK_COLORS[0], tags: [] }, // invalid: too long
];

const SAMPLE_PLAN: AiPlanItem[] = [
  { title: "Write proposal", durationMin: 90, tags: ["focus"] },
  { title: "Review PRs", durationMin: 45, tags: ["focus"] },
  { title: "Inbox zero", durationMin: 30, tags: ["admin"] },
];

const ts = (today: DateKey, nowMin: number): string =>
  `${today}T${String(Math.floor(nowMin / 60)).padStart(2, "0")}:${String(nowMin % 60).padStart(2, "0")}:00`;

/** Commit a data change through the undo history (a no-op change leaves history untouched). */
const commit = (s: SimState, data: BlockDayState): SimState => ({ ...s, data, history: record(s.history, data) });

export const sim: AppSim<SimState, Action> = {
  init: () => {
    const data = emptyState();
    return {
      data,
      settings: defaultSettings(),
      history: initHistory(data),
      pro: false,
      today: "2026-01-05", // a Monday
      nowMin: 9 * 60,
      backupFile: null,
      restored: false,
    };
  },

  actions: (s) => {
    const out: Action[] = [];
    for (let i = 0; i < ADD_PRESETS.length; i++) out.push({ t: "quick_add", preset: i });
    // Per-block actions on today's first few blocks (UI shows the whole timeline).
    for (const b of blocksForDay(s.data, s.today).slice(0, 3)) {
      out.push({ t: "start", id: b.id });
      out.push({ t: "complete", id: b.id });
      out.push({ t: "skip", id: b.id });
      out.push({ t: "delete", id: b.id });
      out.push({ t: "shorten", id: b.id });
      out.push({ t: "move_later", id: b.id });
      out.push({ t: "duplicate", id: b.id });
    }
    out.push({ t: "quick_routine" });
    if (s.data.templates.length) out.push({ t: "apply_template_replace" });
    if (blocksForDay(s.data, s.today).length) out.push({ t: "save_day_as_template" });
    if (blocksForDay(s.data, s.today).length >= 2) out.push({ t: "shift_following" });
    out.push({ t: "ai_plan" });
    out.push({ t: "backup" });
    if (s.backupFile) out.push({ t: "restore" });
    if (!s.pro) out.push({ t: "buy_pro" });
    if (canUndo(s.history)) out.push({ t: "undo" });
    if (canRedo(s.history)) out.push({ t: "redo" });
    out.push({ t: "next_day" });
    return out;
  },

  apply: (s, a) => {
    switch (a.t) {
      case "quick_add": {
        const p = ADD_PRESETS[a.preset];
        const start = findFreeSlot(s.data.blocks, s.today, s.settings.workStart, p.durationMin) ?? s.settings.workStart;
        const input: BlockInput = {
          date: s.today,
          start,
          end: start + p.durationMin,
          title: p.title,
          color: p.color,
          tags: p.tags,
        };
        return commit(s, createBlock(s.data, input, s.today).state);
      }
      case "start":
        return commit(s, startBlock(s.data, a.id, s.today));
      case "complete":
        return commit(s, completeBlock(s.data, a.id, s.today));
      case "skip":
        return commit(s, skipBlock(s.data, a.id, s.today));
      case "delete":
        return commit(s, deleteBlock(s.data, a.id));
      case "shorten": {
        const b = s.data.blocks.find((x) => x.id === a.id);
        if (!b) return s;
        return commit(s, resizeBlock(s.data, a.id, { end: b.end - 15 }, s.settings.snapIntervalMin, s.today).state);
      }
      case "move_later":
        return commit(s, moveBlock(s.data, a.id, (s.data.blocks.find((x) => x.id === a.id)?.start ?? 0) + 30, s.settings.snapIntervalMin, s.today).state);
      case "duplicate":
        return commit(s, duplicateBlock(s.data, a.id, s.today).state);
      case "quick_routine": {
        const starter = STARTER_TEMPLATES[0];
        let data = s.data;
        let tpl = data.templates.find((t) => t.name.toLowerCase() === starter.name.toLowerCase());
        if (!tpl) {
          const made = createFromStarter(data, starter, s.today);
          data = made.state;
          tpl = data.templates.find((t) => t.id === made.id);
        }
        if (!tpl) return s;
        return commit(s, applyTemplate(data, tpl.id, s.today, "merge", "auto", s.today).state);
      }
      case "apply_template_replace": {
        const tpl = s.data.templates[0];
        if (!tpl) return s;
        return commit(s, applyTemplate(s.data, tpl.id, s.today, "replace", "auto", s.today).state);
      }
      case "save_day_as_template":
        return commit(s, saveDayAsTemplate(s.data, s.today, `Day ${s.today} #${s.data.nextId}`, s.today).state);
      case "shift_following": {
        const today = blocksForDay(s.data, s.today);
        if (today.length < 2) return s;
        return commit(s, shiftFollowing(s.data, s.today, today[1].start, 20, s.today).state);
      }
      case "ai_plan": {
        const drafts = planToBlocks(s.data, s.today, SAMPLE_PLAN, s.settings);
        return commit(s, applyPlan(s.data, s.today, drafts, s.today).state);
      }
      case "backup": {
        const data = { ...s.data, lastBackupAt: ts(s.today, s.nowMin) };
        return { ...commit(s, data), backupFile: exportBackup(data, s.settings, ts(s.today, s.nowMin)) };
      }
      case "restore": {
        if (!s.backupFile) return s;
        const r = importBackup(s.backupFile);
        if (!r.ok) return s;
        return { ...commit(s, r.state), settings: r.settings, restored: true };
      }
      case "buy_pro":
        return { ...s, pro: true };
      case "undo": {
        const h = undo(s.history);
        return { ...s, history: h, data: h.present };
      }
      case "redo": {
        const h = redo(s.history);
        return { ...s, history: h, data: h.present };
      }
      case "next_day":
        return { ...s, today: addDays(s.today, 1), nowMin: s.settings.workStart };
    }
  },

  goals: [
    // UF01 — Create and Start a Block
    { id: "create_and_start", name: "Create a block and start it", done: (s) => s.data.blocks.some((b) => b.status === "active") },
    // UF02 — Apply a Template to a Day
    { id: "apply_template", name: "Apply a routine to today", done: (s) => s.data.blocks.some((b) => b.templateId !== null) },
    // UF03 — Rubber-band Shift
    { id: "rubber_band_shift", name: "Shift the rest of the day later", done: (s) => s.data.log.some((l) => l.type === "shift") },
    // UF04 — Snooze and Skip via Notification
    { id: "skip_block", name: "Skip a block", done: (s) => s.data.blocks.some((b) => b.status === "skipped") },
    // UF05 — One-off Deviation Without Changing Template
    { id: "one_off_deviation", name: "Shorten a routine block for today only", done: (s) => deviatedInstances(s.data, s.today).length > 0 },
    // UF06 — Manual Backup and Restore
    { id: "backup_restore", name: "Back up and restore the plan", done: (s) => s.restored },
    // UF07 — Advanced Analytics (Pro)
    {
      id: "advanced_analytics",
      name: "Unlock advanced analytics with data",
      done: (s) => {
        const a = advancedInsights(s.data, s.today, 7, s.pro);
        return !!a && a.totalDoneMin > 0;
      },
    },
    // UF08 — AI Plan from Tasks
    { id: "ai_plan", name: "Generate a plan from tasks with AI", done: (s) => s.data.blocks.some((b) => b.origin === "ai") },
  ],

  invariants: (s) => {
    const out: string[] = [];
    const { data, settings } = s;

    if (data.nextId < 1) out.push(`nextId ${data.nextId} < 1`);
    if (data.log.length > MAX_LOG) out.push(`log length ${data.log.length} > ${MAX_LOG}`);
    if (hasOverlap(data.blocks)) out.push("two blocks overlap");

    const ids = new Set<string>();
    for (const b of data.blocks) {
      if (ids.has(b.id)) out.push(`duplicate block id ${b.id}`);
      ids.add(b.id);
      if (!/^b\d+$/.test(b.id)) out.push(`bad block id ${b.id}`);
      else if (Number(b.id.slice(1)) >= data.nextId) out.push(`${b.id} >= nextId ${data.nextId}`);
      if (!b.title.trim()) out.push(`${b.id} empty title`);
      if (b.title.length > MAX_TITLE) out.push(`${b.id} title too long`);
      if (b.start < 0 || b.start >= DAY) out.push(`${b.id} start ${b.start} out of range`);
      if (b.end <= b.start) out.push(`${b.id} end<=start`);
      const dur = b.end - b.start;
      if (dur < MIN_DURATION || dur > MAX_DURATION) out.push(`${b.id} duration ${dur} out of range`);
      if (!(BLOCK_COLORS as readonly string[]).includes(b.color)) out.push(`${b.id} bad color ${b.color}`);
      if (b.tags.length > MAX_TAGS) out.push(`${b.id} too many tags`);
      if (b.tags.some((t) => t.length > MAX_TAG_LEN)) out.push(`${b.id} tag too long`);
      if (!["planned", "active", "done", "skipped"].includes(b.status)) out.push(`${b.id} bad status`);
      if (b.status === "done" && b.actualMin === null) out.push(`${b.id} done without actualMin`);
    }

    const tnames = new Set<string>();
    for (const t of data.templates) {
      if (!t.name.trim()) out.push(`template ${t.id} empty name`);
      if (tnames.has(t.name.toLowerCase())) out.push(`duplicate template name "${t.name}"`);
      tnames.add(t.name.toLowerCase());
      if (!t.blocks.length) out.push(`template ${t.id} has no blocks`);
    }

    if (settings.workStart >= settings.workEnd) out.push("workStart >= workEnd");
    if (![5, 10, 15].includes(settings.snapIntervalMin)) out.push(`bad snap ${settings.snapIntervalMin}`);
    if (!s.pro) {
      const a = advancedInsights(data, s.today, 7, s.pro);
      if (a !== null) out.push("advanced analytics leaked to a free user");
    }
    return out;
  },

  serialize: (s) =>
    JSON.stringify({
      data: s.data,
      settings: s.settings,
      pro: s.pro,
      today: s.today,
      nowMin: s.nowMin,
      backupFile: s.backupFile,
      restored: s.restored,
    }),

  deserialize: (raw) => {
    const o = JSON.parse(raw) as Omit<SimState, "history">;
    return { ...o, history: initHistory(o.data) };
  },
};
