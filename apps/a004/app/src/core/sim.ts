/**
 * Journey-bot simulation over Sugar Plate's REAL core logic (no UI). Actions
 * mirror what the Log screen and sheets offer; goals are one per PRD user flow
 * (F1–F8); invariants are the data rules that must always hold. The factory's
 * scripts/journeys.ts drives this.
 */
import {
  type AppState,
  emptyState,
  liveMeals,
  liveReadings,
  activeProfile,
} from "./model";
import { PLAUSIBLE_MAX_MGDL, PLAUSIBLE_MIN_MGDL } from "./units";
import { addReading, addReadings, deleteReading, bulkDeleteReadings, existingImportKeys } from "./readings";
import { bleRecordsToReadings, type GlucoseMeasurement } from "./ble";
import { addMeal, repeatMeal, linkReading, mealReadings, mealItemFromDish } from "./meals";
import { dishById, DISHES } from "./dishes";
import { addSwapGoal, toggleUnit, acceptDisclaimer } from "./profiles";
import { buildReport } from "./report";
import { makeSnapshot, restoreFrom } from "./backup";
import { MS_DAY, wallClock } from "./dates";

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
  data: AppState;
  pro: boolean;
  now: number;
  /** Journey bookkeeping (not persisted by the app, only by the sim). */
  exported: boolean;
  restored: boolean;
  repeated: boolean;
  bulkDeleted: boolean;
}

/** A fixed set of stored records a simulated Bluetooth meter would return (device "sim-meter"). */
const SIM_BLE_DEVICE = "sim-meter";
const SIM_BLE_RECORDS: GlucoseMeasurement[] = [
  { sequence: 1, ts: wallClock(2026, 1, 4, 7, 30), valueMgdl: 104 },
  { sequence: 2, ts: wallClock(2026, 1, 4, 13, 10), valueMgdl: 158 },
  { sequence: 3, ts: wallClock(2026, 1, 4, 22, 0), valueMgdl: 121 },
];

type Action =
  | { t: "log_reading" }
  | { t: "log_implausible" } // UI allows typing it; core rejects → no-op
  | { t: "import_ble" } // import stored records from a Bluetooth meter (de-dup by device+seq)
  | { t: "log_meal" }
  | { t: "repeat_last_meal" }
  | { t: "delete_last_reading" }
  | { t: "bulk_delete_readings" } // History: select several readings and delete them in one pass
  | { t: "toggle_unit" }
  | { t: "accept_disclaimer" }
  | { t: "add_swap_goal" }
  | { t: "export_report" }
  | { t: "backup_restore" }
  | { t: "buy_pro" }
  | { t: "next_day" };

const LINK_WINDOW = 4 * 3_600_000; // 4h
const DEMO_DISH = dishById("roti") ?? DISHES[0];

function readingValue(s: AppState): number {
  // Deterministic, varied, always plausible (90–209 mg/dL).
  return 90 + (liveReadings(s).length * 17) % 120;
}

function linkedCount(s: AppState, mealId: string): number {
  return liveReadings(s).filter((r) => r.mealId === mealId).length;
}

/** When a meal is logged, attach a recent unlinked reading as the "before". */
function autolinkOnMeal(s: AppState, mealId: string, now: number): AppState {
  const candidate = liveReadings(s)
    .filter((r) => r.mealId === null && Math.abs(now - r.ts) <= LINK_WINDOW)
    .sort((a, b) => a.ts - b.ts)
    .pop();
  return candidate ? linkReading(s, candidate.id, mealId, now) : s;
}

/** When a reading is logged, attach it to a recent meal still missing an after. */
function autolinkOnReading(s: AppState, readingId: string, now: number): AppState {
  const meal = liveMeals(s)
    .filter((m) => Math.abs(now - m.ts) <= LINK_WINDOW && linkedCount(s, m.id) < 2)
    .sort((a, b) => a.ts - b.ts)
    .pop();
  return meal ? linkReading(s, readingId, meal.id, now) : s;
}

export const sim: AppSim<SimState, Action> = {
  init: () => ({
    data: emptyState(wallClock(2026, 1, 5, 8, 0)),
    pro: false,
    now: wallClock(2026, 1, 5, 8, 0),
    exported: false,
    restored: false,
    repeated: false,
    bulkDeleted: false,
  }),

  actions: (s) => {
    const list: Action[] = [
      { t: "log_reading" },
      { t: "log_implausible" },
      { t: "import_ble" },
      { t: "log_meal" },
      { t: "toggle_unit" },
      { t: "add_swap_goal" },
      { t: "export_report" },
      { t: "backup_restore" },
      { t: "next_day" },
    ];
    if (liveMeals(s.data).length) list.push({ t: "repeat_last_meal" });
    if (liveReadings(s.data).length) list.push({ t: "delete_last_reading" });
    if (liveReadings(s.data).length >= 2) list.push({ t: "bulk_delete_readings" });
    if (!s.data.disclaimerAccepted) list.push({ t: "accept_disclaimer" });
    if (!s.pro) list.push({ t: "buy_pro" });
    return list;
  },

  apply: (s, a) => {
    switch (a.t) {
      case "log_reading": {
        const res = addReading(s.data, { valueMgdl: readingValue(s.data), ts: s.now }, s.now);
        if (!res.id) return { ...s, data: res.state };
        return { ...s, data: autolinkOnReading(res.state, res.id, s.now) };
      }
      case "log_implausible": {
        // 999 mg/dL without force → core rejects, state unchanged (never throws).
        return { ...s, data: addReading(s.data, { valueMgdl: 999, ts: s.now }, s.now).state };
      }
      case "import_ble": {
        // Re-importing the same records is idempotent (de-dup by device + sequence).
        const { readings } = bleRecordsToReadings(SIM_BLE_RECORDS, SIM_BLE_DEVICE, existingImportKeys(s.data));
        return { ...s, data: addReadings(s.data, readings, s.now).state };
      }
      case "log_meal": {
        const res = addMeal(
          s.data,
          { items: [mealItemFromDish(DEMO_DISH)], ts: s.now, giBand: DEMO_DISH.giBand, swapText: DEMO_DISH.swapIdeas },
          s.now,
        );
        if (!res.id) return { ...s, data: res.state };
        return { ...s, data: autolinkOnMeal(res.state, res.id, s.now) };
      }
      case "repeat_last_meal": {
        const last = liveMeals(s.data).slice(-1)[0];
        if (!last) return s;
        const before = liveMeals(s.data).length;
        const res = repeatMeal(s.data, last.id, s.now);
        return { ...s, data: res.state, repeated: s.repeated || liveMeals(res.state).length > before };
      }
      case "delete_last_reading": {
        const last = liveReadings(s.data).slice(-1)[0];
        return last ? { ...s, data: deleteReading(s.data, last.id, s.now) } : s;
      }
      case "bulk_delete_readings": {
        // Mirror History's multi-select: take the two oldest live readings and delete them together.
        const live = liveReadings(s.data);
        if (live.length < 2) return s;
        const ids = live.slice(0, 2).map((r) => r.id);
        const before = live.length;
        const next = bulkDeleteReadings(s.data, ids, s.now);
        return { ...s, data: next, bulkDeleted: s.bulkDeleted || liveReadings(next).length === before - 2 };
      }
      case "toggle_unit":
        return { ...s, data: toggleUnit(s.data) };
      case "accept_disclaimer":
        return { ...s, data: acceptDisclaimer(s.data) };
      case "add_swap_goal":
        return { ...s, data: addSwapGoal(s.data, { text: "Try millet roti this week", targetCount: 3 }, s.now).state };
      case "export_report": {
        const report = buildReport(s.data, { from: s.now - 120 * MS_DAY, to: s.now });
        return { ...s, exported: s.exported || report.hasData };
      }
      case "backup_restore": {
        const snap = makeSnapshot(s.data, s.now);
        const { state, verification } = restoreFrom(snap.data);
        return { ...s, data: state ?? s.data, restored: s.restored || verification.ok };
      }
      case "buy_pro":
        return { ...s, pro: true };
      case "next_day":
        return { ...s, now: s.now + MS_DAY };
    }
  },

  goals: [
    { id: "log_reading", name: "Log a glucose reading (F2)", done: (s) => liveReadings(s.data).length > 0 },
    { id: "import_ble", name: "Import readings from a Bluetooth meter (F9)", done: (s) => liveReadings(s.data).some((r) => r.source === "ble") },
    { id: "log_meal", name: "Log a meal / reach first result (F1)", done: (s) => liveMeals(s.data).length > 0 },
    {
      id: "meal_before_after",
      name: "Meal with before & after readings (F3)",
      done: (s) => liveMeals(s.data).some((m) => {
        const mr = mealReadings(s.data, m.id);
        return !!mr.before && !!mr.after;
      }),
    },
    { id: "repeat_meal", name: "Same meal as yesterday (F4)", done: (s) => s.repeated },
    { id: "bulk_delete", name: "Bulk-delete readings from History", done: (s) => s.bulkDeleted },
    { id: "export_report", name: "Export a doctor report (F5)", done: (s) => s.exported },
    { id: "restore", name: "Backup & restore with matching counts (F6)", done: (s) => s.restored },
    { id: "swap_goal", name: "Adopt a swap goal (F7)", done: (s) => s.data.swapGoals.length > 0 },
    { id: "go_pro", name: "Upgrade to Pro (F8)", done: (s) => s.pro },
  ],

  invariants: (s) => {
    const out: string[] = [];
    const d = s.data;
    const ids = new Set<string>();
    const profileIds = new Set(d.profiles.map((p) => p.id));
    let maxSeq = 0;
    const seen = (id: string) => {
      if (ids.has(id)) out.push(`duplicate id ${id}`);
      ids.add(id);
      const n = Number(id.replace(/^[a-z]+/, ""));
      if (Number.isFinite(n)) maxSeq = Math.max(maxSeq, n);
    };

    if (!profileIds.has(d.activeProfileId)) out.push("active profile missing");
    if (d.profiles.length === 0) out.push("no profiles");

    for (const r of d.readings) {
      seen(r.id);
      if (!profileIds.has(r.profileId)) out.push(`reading ${r.id} orphan profile`);
      if (r.deletedAt === null && (r.valueMgdl < PLAUSIBLE_MIN_MGDL || r.valueMgdl > PLAUSIBLE_MAX_MGDL))
        out.push(`reading ${r.id} value out of range`);
      if (r.mealId !== null && !d.meals.some((m) => m.id === r.mealId)) out.push(`reading ${r.id} dangling mealId`);
    }
    for (const m of d.meals) {
      seen(m.id);
      if (!profileIds.has(m.profileId)) out.push(`meal ${m.id} orphan profile`);
      const sum = Math.round(m.items.reduce((a, i) => a + i.carbsG, 0));
      if (m.deletedAt === null && m.carbsTotalG !== sum) out.push(`meal ${m.id} carbs ${m.carbsTotalG} != ${sum}`);
    }
    for (const m of d.medications) seen(m.id);
    for (const l of d.medLogs) seen(l.id);
    for (const rem of d.reminders) seen(rem.id);
    for (const g of d.swapGoals) seen(g.id);

    if (maxSeq > d.seq) out.push(`id seq ${maxSeq} exceeds counter ${d.seq}`);
    if (d.quota.used < 0) out.push("negative quota");
    if (!["mgdl", "mmol"].includes(activeProfile(d).unit)) out.push("bad unit");
    return out;
  },

  serialize: (s) => JSON.stringify(s),
  deserialize: (raw) => JSON.parse(raw) as SimState,
};
