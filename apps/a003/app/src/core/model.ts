/**
 * BlockDay domain model — the data shapes and the fixed rules/limits every other
 * core module shares. Pure data + constants; no behaviour, no React, no storage.
 */
import type { DateKey, ISO } from "./time";

export type Origin = "manual" | "template" | "ai" | "calendar";
export type Status = "planned" | "active" | "done" | "skipped";

export interface Block {
  id: string;
  date: DateKey; // the day the block starts on
  start: number; // minutes from midnight, 0..1439
  end: number; // minutes from midnight; > 1440 means it spills past midnight (overnight)
  title: string;
  color: string;
  tags: string[];
  notes: string;
  origin: Origin;
  status: Status;
  /** Pre-alert offsets in minutes before start (0 = at start). */
  remindersMin: number[];
  activityId: string | null;
  templateId: string | null; // set when created by applying a template
  templateBlockId: string | null;
  /** Actual minutes spent, recorded on completion — powers overrun analytics. */
  actualMin: number | null;
  createdAt: DateKey;
  updatedAt: DateKey;
}

export interface Activity {
  id: string;
  name: string;
  color: string;
  tags: string[];
  archived: boolean;
  defaultDurationMin: number;
  defaultRemindersMin: number[];
  createdAt: DateKey;
}

export interface TemplateBlock {
  id: string;
  title: string;
  color: string;
  tags: string[];
  durationMin: number;
  remindersMin: number[];
  relativeStartMin: number; // minutes from midnight
}

export interface Template {
  id: string;
  name: string;
  blocks: TemplateBlock[];
  stackable: boolean;
  daysOfWeek: number[]; // 0..6, informational (which days this routine suits)
  colorPalette: string[];
  createdAt: DateKey;
  updatedAt: DateKey;
}

export type LogType =
  | "create"
  | "update"
  | "delete"
  | "apply_template"
  | "shift"
  | "clear_day"
  | "ai_plan"
  | "backup"
  | "restore";

export interface LogEntry {
  id: string;
  type: LogType;
  summary: string;
  at: DateKey;
}

/** Everything BlockDay persists on-device (one versioned store). */
export interface BlockDayState {
  blocks: Block[];
  activities: Activity[];
  templates: Template[];
  log: LogEntry[];
  lastBackupAt: ISO | null;
  nextId: number;
}

export interface BlockDaySettings {
  theme: "system" | "light" | "dark";
  haptics: boolean;
  largeText: boolean;
  workStart: number; // minutes from midnight
  workEnd: number; // minutes from midnight (> workStart)
  preEndNudgesMin: number[]; // e.g. [5, 1]
  snapIntervalMin: 5 | 10 | 15;
  defaultDurationMin: number;
  timeZoneBehavior: "lockToLocal" | "followDevice";
  notifPersistentBanner: boolean;
  /** Master switch for local block reminders (opt-in; OS permission requested in context). */
  remindersEnabled: boolean;
  /** ADHD live cues: in-app pre-transition ramp + the big full-screen alarm scene. */
  focusCues: boolean;
  /** When a block is active/transitioning, allow the big full-screen alarm scene. */
  fullScreenAlarm: boolean;
  /** When the plan was last backed up to the cloud (shown in Settings → Sync). */
  lastSyncAt: ISO | null;
}

// ── Limits / rules ──────────────────────────────────────────────────────────
export const MIN_DURATION = 5;
export const MAX_DURATION = 1440; // a single block can't exceed 24h
export const MAX_TITLE = 60;
export const MAX_NOTES = 500;
export const MAX_TAGS = 5;
export const MAX_TAG_LEN = 24;
export const MAX_LOG = 200; // activity log keeps the most recent entries
export const MAX_REMINDERS = 4;
export const SNAP_OPTIONS = [5, 10, 15] as const;

/** Categorical activity colours (encode activity/tag, never status). Order is fixed everywhere. */
export const BLOCK_COLORS = ["#0F62FE", "#0FB5A9", "#FF6B6B", "#FFB020", "#7C5CFF"] as const;
export const COLOR_NAMES: Record<string, string> = {
  "#0F62FE": "Cobalt",
  "#0FB5A9": "Teal",
  "#FF6B6B": "Coral",
  "#FFB020": "Amber",
  "#7C5CFF": "Violet",
};

export const emptyState = (): BlockDayState => ({
  blocks: [],
  activities: [],
  templates: [],
  log: [],
  lastBackupAt: null,
  nextId: 1,
});

export const defaultSettings = (): BlockDaySettings => ({
  theme: "system",
  haptics: true,
  largeText: false,
  workStart: 9 * 60,
  workEnd: 17 * 60,
  preEndNudgesMin: [5, 1],
  snapIntervalMin: 15,
  defaultDurationMin: 60,
  timeZoneBehavior: "followDevice",
  notifPersistentBanner: false,
  remindersEnabled: false,
  focusCues: true,
  fullScreenAlarm: true,
  lastSyncAt: null,
});

/** Built-in routines offered during onboarding and in the Templates tab. */
export interface StarterTemplate {
  key: string;
  name: string;
  daysOfWeek: number[];
  blocks: Omit<TemplateBlock, "id">[];
}

const tb = (
  title: string,
  relativeStartMin: number,
  durationMin: number,
  color: string,
  tags: string[],
  remindersMin: number[] = [0],
): Omit<TemplateBlock, "id"> => ({ title, relativeStartMin, durationMin, color, tags, remindersMin });

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    key: "workday",
    name: "Workday Routine",
    daysOfWeek: [1, 2, 3, 4, 5],
    blocks: [
      tb("Plan the day", 9 * 60, 30, BLOCK_COLORS[0], ["focus"]),
      tb("Deep Work", 9 * 60 + 30, 120, BLOCK_COLORS[4], ["focus"], [5, 0]),
      tb("Email & Admin", 11 * 60 + 30, 30, BLOCK_COLORS[3], ["admin"]),
      tb("Lunch", 12 * 60, 60, BLOCK_COLORS[1], ["break"]),
      tb("Meetings", 13 * 60, 90, BLOCK_COLORS[2], ["meeting"]),
      tb("Focus block", 14 * 60 + 30, 90, BLOCK_COLORS[4], ["focus"], [5, 0]),
      tb("Wrap up", 16 * 60, 30, BLOCK_COLORS[0], ["admin"]),
    ],
  },
  {
    key: "study",
    name: "Study Day",
    daysOfWeek: [1, 2, 3, 4, 5, 6],
    blocks: [
      tb("Review notes", 9 * 60, 45, BLOCK_COLORS[0], ["study"]),
      tb("Practice set", 9 * 60 + 45, 75, BLOCK_COLORS[4], ["study"], [5, 0]),
      tb("Break", 11 * 60, 15, BLOCK_COLORS[1], ["break"]),
      tb("Reading", 11 * 60 + 15, 60, BLOCK_COLORS[3], ["study"]),
      tb("Lunch", 12 * 60 + 15, 45, BLOCK_COLORS[1], ["break"]),
      tb("Flashcards", 13 * 60, 30, BLOCK_COLORS[2], ["study"]),
    ],
  },
];
