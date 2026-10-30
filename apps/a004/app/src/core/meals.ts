/**
 * Meal logging + linking readings to meals. Meals are built from the offline
 * dish database (free, unlimited) or from an AI text estimate that is always
 * sanitised back through this core as plain data (labelled "estimate").
 */
import {
  type AppState,
  type Meal,
  type MealItem,
  type MealSlot,
  type GiBand,
  type Reading,
  MAX_NOTE,
  autoSlot,
  liveMeals,
  liveReadings,
  nextId,
} from "./model";
import { type Dish, dishCarbs } from "./dishes";

export interface NewMeal {
  items: MealItem[];
  ts: number;
  slot?: MealSlot;
  giBand?: GiBand;
  swapText?: string;
  note?: string;
  source?: "db" | "ai" | "manual";
}

/** GI band for a whole plate = the strongest band among its dishes. */
export function combineGiBand(bands: GiBand[]): GiBand {
  if (bands.includes("high")) return "high";
  if (bands.includes("medium")) return "medium";
  return "low";
}

export function mealItemFromDish(dish: Dish, portion = 1): MealItem {
  return { name: dish.name, portion, carbsG: dishCarbs(dish, portion) };
}

export function totalCarbs(items: MealItem[]): number {
  return Math.round(items.reduce((sum, i) => sum + i.carbsG, 0));
}

export function addMeal(s: AppState, input: NewMeal, now: number): { state: AppState; id?: string; error: "no_items" | null } {
  if (!input.items.length) return { state: s, error: "no_items" };
  const { id, seq } = nextId(s, "m");
  const meal: Meal = {
    id,
    profileId: s.activeProfileId,
    ts: input.ts,
    slot: input.slot ?? autoSlot(input.ts),
    items: input.items,
    carbsTotalG: totalCarbs(input.items),
    giBand: input.giBand ?? "medium",
    swapText: input.swapText ?? "",
    source: input.source ?? "db",
    userEdited: false,
    note: (input.note ?? "").slice(0, MAX_NOTE),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  return { state: { ...s, meals: [...s.meals, meal], seq }, id, error: null };
}

export function editMeal(
  s: AppState,
  id: string,
  patch: Partial<Pick<Meal, "items" | "slot" | "giBand" | "swapText" | "note" | "ts">>,
  now: number,
): AppState {
  return {
    ...s,
    meals: s.meals.map((m) => {
      if (m.id !== id) return m;
      const items = patch.items ?? m.items;
      return {
        ...m,
        ...patch,
        items,
        carbsTotalG: patch.items ? totalCarbs(items) : m.carbsTotalG,
        note: patch.note !== undefined ? patch.note.slice(0, MAX_NOTE) : m.note,
        userEdited: true,
        updatedAt: now,
      };
    }),
  };
}

export function deleteMeal(s: AppState, id: string, now: number): AppState {
  return {
    ...s,
    // Soft-delete the meal and detach its readings so insights stop counting it.
    meals: s.meals.map((m) => (m.id === id ? { ...m, deletedAt: now, updatedAt: now } : m)),
    readings: s.readings.map((r) => (r.mealId === id ? { ...r, mealId: null, updatedAt: now } : r)),
  };
}

// ── Linking readings ⇄ meals ─────────────────────────────────────────────────────

export function linkReading(s: AppState, readingId: string, mealId: string, now: number): AppState {
  return { ...s, readings: s.readings.map((r) => (r.id === readingId ? { ...r, mealId, updatedAt: now } : r)) };
}

export function unlinkReading(s: AppState, readingId: string, now: number): AppState {
  return { ...s, readings: s.readings.map((r) => (r.id === readingId ? { ...r, mealId: null, updatedAt: now } : r)) };
}

export interface MealReadings {
  before: Reading | null;
  after: Reading | null;
  /** after − before, in mg/dL, when both exist. */
  delta: number | null;
}

/**
 * The before/after readings linked to a meal and the glucose delta.
 *
 * With two or more linked readings the EARLIEST is the "before" and the LATEST
 * the "after" — so attaching any second reading always yields a delta, even when
 * both readings sit on the same side of the meal time (common when logging a
 * reading and a meal moments apart). A single linked reading is classified as a
 * before/after by its time relative to the meal.
 */
export function mealReadings(s: AppState, mealId: string): MealReadings {
  const meal = s.meals.find((m) => m.id === mealId);
  if (!meal) return { before: null, after: null, delta: null };
  const linked = liveReadings(s)
    .filter((r) => r.mealId === mealId)
    .sort((a, b) => a.ts - b.ts);
  if (linked.length === 0) return { before: null, after: null, delta: null };
  if (linked.length === 1) {
    const only = linked[0];
    return only.ts <= meal.ts ? { before: only, after: null, delta: null } : { before: null, after: only, delta: null };
  }
  const before = linked[0];
  const after = linked[linked.length - 1];
  return { before, after, delta: after.valueMgdl - before.valueMgdl };
}

// ── Same meal as yesterday / repeat ────────────────────────────────────────────────

/**
 * Best candidate to repeat for a slot: yesterday's same-slot meal if present,
 * otherwise the most recent meal in that slot. Powers the one-tap chip.
 */
export function sameMealCandidate(s: AppState, slot: MealSlot, now: number): Meal | null {
  const meals = liveMeals(s).filter((m) => m.slot === slot);
  if (!meals.length) return null;
  const dayMs = 86_400_000;
  const yStart = now - dayMs * 1.5;
  const yEnd = now - dayMs * 0.5;
  const yesterday = meals.filter((m) => m.ts >= yStart && m.ts < yEnd);
  const pick = (yesterday.length ? yesterday : meals).slice(-1)[0];
  return pick ?? null;
}

/** Clone a meal's items into a fresh meal logged now (one-tap repeat). */
export function repeatMeal(s: AppState, mealId: string, now: number): { state: AppState; id?: string; error: "not_found" | null } {
  const src = s.meals.find((m) => m.id === mealId);
  if (!src) return { state: s, error: "not_found" };
  const res = addMeal(
    s,
    {
      items: src.items.map((i) => ({ ...i })),
      ts: now,
      slot: autoSlot(now),
      giBand: src.giBand,
      swapText: src.swapText,
      source: src.source,
    },
    now,
  );
  return { state: res.state, id: res.id, error: null };
}

// ── AI meal estimate (sanitised as plain data) ──────────────────────────────────────

export interface AiMealEstimate {
  dishes: { name: string; portion?: number; carbs_g?: number }[];
  carbs_total_g?: number;
  gi_band?: string;
  swap?: string;
}

export interface MealEstimate {
  items: MealItem[];
  carbsTotalG: number;
  giBand: GiBand;
  swapText: string;
  /** Always true — results are labelled as estimates, never medical facts. */
  estimate: true;
}

const asGiBand = (v: unknown): GiBand => (v === "low" || v === "high" ? v : v === "medium" ? "medium" : "medium");

/**
 * Normalise a (possibly messy) AI JSON estimate into clamped, plausible plate
 * data. Carbs are clamped to a sane per-item window so a bad model reply can
 * never produce an absurd total. Pure → validate.ts/sim.ts feed fixed samples.
 */
export function sanitizeMealEstimate(raw: AiMealEstimate): MealEstimate {
  const items: MealItem[] = (raw.dishes ?? [])
    .filter((d) => d && typeof d.name === "string" && d.name.trim())
    .slice(0, 12)
    .map((d) => {
      const portion = Number.isFinite(d.portion) && (d.portion as number) > 0 ? Math.min(d.portion as number, 10) : 1;
      const carbs = Number.isFinite(d.carbs_g) ? Math.max(0, Math.min(d.carbs_g as number, 300)) : 30;
      return { name: d.name.trim().slice(0, 60), portion, carbsG: Math.round(carbs) };
    });
  const summed = totalCarbs(items);
  const total = Number.isFinite(raw.carbs_total_g)
    ? Math.max(0, Math.min(Math.round(raw.carbs_total_g as number), 600))
    : summed;
  const swap = (raw.swap ?? "").toString().trim().slice(0, 240) || "Keep the portion to one serving and add vegetables or protein.";
  return {
    items: items.length ? items : [{ name: "Meal", portion: 1, carbsG: total || 30 }],
    carbsTotalG: total || summed || 30,
    giBand: asGiBand(raw.gi_band),
    swapText: swap,
    estimate: true,
  };
}

/** Turn a sanitised estimate into a NewMeal ready for addMeal. */
export function mealFromEstimate(est: MealEstimate, ts: number, note = ""): NewMeal {
  return { items: est.items, ts, giBand: est.giBand, swapText: est.swapText, note, source: "ai" };
}
