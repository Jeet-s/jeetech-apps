/**
 * Sugar Plate domain model — plain data, no React, no storage. Every rule in
 * the other src/core files operates on this `AppState`; the persisted() store
 * (src/core/data.ts) holds exactly one of these. Glucose is canonical mg/dL.
 */
import type { Unit } from "./units";
import { hourOf } from "./dates";

// ── Enums ────────────────────────────────────────────────────────────────────

/** When a reading was taken, relative to meals. Never color-only in the UI. */
export type Context = "fasting" | "pre_meal" | "post_meal" | "bedtime" | "random";
export const CONTEXTS: Context[] = ["fasting", "pre_meal", "post_meal", "bedtime", "random"];
export const CONTEXT_LABEL: Record<Context, string> = {
  fasting: "Fasting",
  pre_meal: "Before meal",
  post_meal: "After meal",
  bedtime: "Bedtime",
  random: "Random",
};

export type MealSlot = "breakfast" | "lunch" | "dinner" | "snack";
export const MEAL_SLOTS: MealSlot[] = ["breakfast", "lunch", "dinner", "snack"];
export const SLOT_LABEL: Record<MealSlot, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

export type GiBand = "low" | "medium" | "high";
export const GI_LABEL: Record<GiBand, string> = { low: "Low", medium: "Medium", high: "High" };

export type Cuisine = "india" | "africa" | "latam" | "other";
export const CUISINES: Cuisine[] = ["india", "africa", "latam", "other"];
export const CUISINE_LABEL: Record<Cuisine, string> = {
  india: "India",
  africa: "Africa",
  latam: "Latin America",
  other: "Other",
};

export type MedType = "pill" | "insulin" | "injectable" | "other";
export const MED_TYPES: MedType[] = ["pill", "insulin", "injectable", "other"];

export type ReminderKind = "fasting" | "pre_meal" | "post_meal" | "medication" | "meal" | "weekly";
export const REMINDER_KINDS: ReminderKind[] = ["fasting", "pre_meal", "post_meal", "medication", "meal", "weekly"];

export type ThemePref = "system" | "light" | "dark" | "contrast";

// ── Entities ──────────────────────────────────────────────────────────────────

export interface Range {
  low: number; // mg/dL
  high: number; // mg/dL
}

export interface Profile {
  id: string;
  name: string;
  unit: Unit;
  /** Per-context target ranges, canonical mg/dL (ADA defaults or custom). */
  ranges: Record<Context, Range>;
  rangePreset: "ada" | "custom";
  /** Readings below this are flagged with a wellness safety note. */
  lowThreshold: number; // mg/dL
  cuisine: Cuisine;
  theme: ThemePref;
  createdAt: number;
}

/** Where a reading came from. Absent/"manual" for hand-typed (the main path); "ble" is a
 *  reading imported directly from a Bluetooth glucose meter, shown with a Bluetooth tag. */
export type ReadingSource = "manual" | "csv" | "ocr" | "ble";

export interface Reading {
  id: string;
  profileId: string;
  valueMgdl: number;
  ts: number;
  context: Context;
  note: string;
  mealId: string | null;
  /** How the reading was entered. Optional for backwards-compat; undefined means manual. */
  source?: ReadingSource;
  /** Stable de-dup key for imported readings (e.g. "ble:<deviceId>:<sequence>"); null when typed. */
  importKey?: string | null;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export interface MealItem {
  name: string;
  portion: number; // servings
  carbsG: number; // estimated grams for this item at this portion
}

export interface Meal {
  id: string;
  profileId: string;
  ts: number;
  slot: MealSlot;
  items: MealItem[];
  carbsTotalG: number;
  giBand: GiBand;
  swapText: string;
  /** "ai" when carbs came from the AI estimator, "db"/"manual" otherwise. */
  source: "db" | "ai" | "manual";
  userEdited: boolean;
  note: string;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export interface Medication {
  id: string;
  profileId: string;
  name: string;
  type: MedType;
  defaultDose: number;
  doseUnit: string; // "units", "mg", "mL", …
}

export interface MedLog {
  id: string;
  profileId: string;
  medicationId: string;
  name: string; // denormalised so history survives med deletion
  dose: number;
  doseUnit: string;
  ts: number;
  note: string;
  deletedAt: number | null;
}

export interface Reminder {
  id: string;
  profileId: string;
  kind: ReminderKind;
  time: string; // "HH:MM"
  days: number[]; // 0..6 (Sun..Sat); empty = every day
  enabled: boolean;
  label: string;
}

export interface SwapGoal {
  id: string;
  profileId: string;
  text: string; // e.g. "Try millet roti this week"
  targetCount: number;
  doneCount: number;
  createdAt: number;
  active: boolean;
}

export interface QuotaState {
  day: string; // DateKey the counter belongs to
  used: number; // AI analyses used that day
}

// ── App state ──────────────────────────────────────────────────────────────────

export interface AppState {
  profiles: Profile[];
  activeProfileId: string;
  readings: Reading[];
  meals: Meal[];
  medications: Medication[];
  medLogs: MedLog[];
  reminders: Reminder[];
  swapGoals: SwapGoal[];
  seq: number; // monotonic id counter
  quota: QuotaState;
  disclaimerAccepted: boolean;
  /** Optional "days logged" streak display — user can turn it off, no loss-framing. */
  streakEnabled: boolean;
  quietHours: { enabled: boolean; start: string; end: string };
}

// ── Target ranges ────────────────────────────────────────────────────────────

/** ADA-aligned general wellness targets (mg/dL). Not medical advice. */
export const ADA_RANGES: Record<Context, Range> = {
  fasting: { low: 80, high: 130 },
  pre_meal: { low: 80, high: 130 },
  post_meal: { low: 80, high: 180 },
  bedtime: { low: 90, high: 150 },
  random: { low: 80, high: 180 },
};

export const DEFAULT_LOW_THRESHOLD = 70; // mg/dL
export const MAX_NOTE = 1000; // "no short character limit"
export const MAX_NAME = 40;

export function adaRanges(): Record<Context, Range> {
  return {
    fasting: { ...ADA_RANGES.fasting },
    pre_meal: { ...ADA_RANGES.pre_meal },
    post_meal: { ...ADA_RANGES.post_meal },
    bedtime: { ...ADA_RANGES.bedtime },
    random: { ...ADA_RANGES.random },
  };
}

// ── Construction ────────────────────────────────────────────────────────────

export function makeProfile(input: {
  id: string;
  name?: string;
  unit?: Unit;
  cuisine?: Cuisine;
  createdAt: number;
}): Profile {
  return {
    id: input.id,
    name: (input.name ?? "Me").trim() || "Me",
    unit: input.unit ?? "mgdl",
    ranges: adaRanges(),
    rangePreset: "ada",
    lowThreshold: DEFAULT_LOW_THRESHOLD,
    cuisine: input.cuisine ?? "other",
    theme: "system",
    createdAt: input.createdAt,
  };
}

export function emptyState(createdAt = 0): AppState {
  const profile = makeProfile({ id: "p1", name: "Me", createdAt });
  return {
    profiles: [profile],
    activeProfileId: profile.id,
    readings: [],
    meals: [],
    medications: [],
    medLogs: [],
    reminders: [],
    swapGoals: [],
    seq: 1,
    quota: { day: "", used: 0 },
    disclaimerAccepted: false,
    streakEnabled: true,
    quietHours: { enabled: false, start: "22:00", end: "07:00" },
  };
}

/** Allocate the next unique id (prefix keeps ids human-readable and typed). */
export function nextId(s: AppState, prefix: string): { id: string; seq: number } {
  const seq = s.seq + 1;
  return { id: `${prefix}${seq}`, seq };
}

// ── Active profile + queries ──────────────────────────────────────────────────

export function activeProfile(s: AppState): Profile {
  return s.profiles.find((p) => p.id === s.activeProfileId) ?? s.profiles[0];
}

/** Live (not soft-deleted) readings for the active profile, oldest → newest. */
export function liveReadings(s: AppState, profileId = s.activeProfileId): Reading[] {
  return s.readings
    .filter((r) => r.profileId === profileId && r.deletedAt === null)
    .sort((a, b) => a.ts - b.ts);
}

export function liveMeals(s: AppState, profileId = s.activeProfileId): Meal[] {
  return s.meals
    .filter((m) => m.profileId === profileId && m.deletedAt === null)
    .sort((a, b) => a.ts - b.ts);
}

export function liveMedLogs(s: AppState, profileId = s.activeProfileId): MedLog[] {
  return s.medLogs
    .filter((m) => m.profileId === profileId && m.deletedAt === null)
    .sort((a, b) => a.ts - b.ts);
}

// ── Auto context / slot by time of day ────────────────────────────────────────

/**
 * Best-guess reading context from the clock (user can change in one tap).
 * Overnight and early morning read as FASTING (the most common and least
 * surprising first-run guess); the hour after each meal reads as post-meal,
 * the hour before as pre-meal. Bedtime is only guessed late evening
 * (21:00–24:00) — never before ~9pm, where it confused newcomers.
 */
export function autoContext(ts: number): Context {
  const h = hourOf(ts);
  if (h >= 0 && h < 4) return "fasting"; // overnight / small hours → fasting, not bedtime
  if (h >= 4 && h < 9) return "fasting";
  if (h >= 9 && h < 11) return "post_meal"; // after breakfast
  if (h >= 11 && h < 13) return "pre_meal"; // before lunch
  if (h >= 13 && h < 16) return "post_meal"; // after lunch
  if (h >= 16 && h < 19) return "pre_meal"; // before dinner
  if (h >= 19 && h < 21) return "post_meal"; // after dinner
  return "bedtime"; // 21:00–24:00 only
}

export function autoSlot(ts: number): MealSlot {
  const h = hourOf(ts);
  if (h >= 4 && h < 11) return "breakfast";
  if (h >= 11 && h < 16) return "lunch";
  if (h >= 16 && h < 22) return "dinner";
  return "snack";
}
