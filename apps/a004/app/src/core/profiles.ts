/**
 * Profile + app-settings mutations (units, target ranges, cuisine, theme,
 * disclaimer, quiet hours, family profiles) and swap goals. Unit is per-profile
 * and persists; because data is canonical mg/dL, toggling the unit NEVER
 * rewrites readings.
 */
import {
  type AppState,
  type Context,
  type Cuisine,
  type Profile,
  type Range,
  type ThemePref,
  type SwapGoal,
  CONTEXTS,
  MAX_NAME,
  adaRanges,
  activeProfile,
  makeProfile,
  nextId,
} from "./model";
import { type Unit } from "./units";

function patchActive(s: AppState, fn: (p: Profile) => Profile): AppState {
  return { ...s, profiles: s.profiles.map((p) => (p.id === s.activeProfileId ? fn(p) : p)) };
}

export function setUnit(s: AppState, unit: Unit): AppState {
  return patchActive(s, (p) => ({ ...p, unit }));
}

/** One-tap toggle for the Log header chip. */
export function toggleUnit(s: AppState): AppState {
  return patchActive(s, (p) => ({ ...p, unit: p.unit === "mgdl" ? "mmol" : "mgdl" }));
}

export function setCuisine(s: AppState, cuisine: Cuisine): AppState {
  return patchActive(s, (p) => ({ ...p, cuisine }));
}

export function setTheme(s: AppState, theme: ThemePref): AppState {
  return patchActive(s, (p) => ({ ...p, theme }));
}

export type RangeError = "invalid" | "low_ge_high";

/** Set a custom target range for one context (canonical mg/dL). */
export function setRange(s: AppState, context: Context, range: Range): { state: AppState; error: RangeError | null } {
  if (!Number.isFinite(range.low) || !Number.isFinite(range.high) || range.low <= 0) return { state: s, error: "invalid" };
  if (range.low >= range.high) return { state: s, error: "low_ge_high" };
  return {
    state: patchActive(s, (p) => ({ ...p, rangePreset: "custom", ranges: { ...p.ranges, [context]: { ...range } } })),
    error: null,
  };
}

export function resetRangesToAda(s: AppState): AppState {
  return patchActive(s, (p) => ({ ...p, rangePreset: "ada", ranges: adaRanges() }));
}

export function setLowThreshold(s: AppState, mgdl: number): AppState {
  if (!Number.isFinite(mgdl) || mgdl <= 0) return s;
  return patchActive(s, (p) => ({ ...p, lowThreshold: mgdl }));
}

export function acceptDisclaimer(s: AppState): AppState {
  return { ...s, disclaimerAccepted: true };
}

export function setStreakEnabled(s: AppState, enabled: boolean): AppState {
  return { ...s, streakEnabled: enabled };
}

export function setQuietHours(s: AppState, quietHours: AppState["quietHours"]): AppState {
  return { ...s, quietHours };
}

// ── Family profiles ─────────────────────────────────────────────────────────────

export type ProfileError = "empty_name" | "duplicate" | "last_profile";

export function addProfile(
  s: AppState,
  input: { name: string; unit?: Unit; cuisine?: Cuisine },
  now: number,
): { state: AppState; id?: string; error: ProfileError | null } {
  const name = input.name.trim();
  if (!name || name.length > MAX_NAME) return { state: s, error: "empty_name" };
  if (s.profiles.some((p) => p.name.toLowerCase() === name.toLowerCase())) return { state: s, error: "duplicate" };
  const { id, seq } = nextId(s, "p");
  // New profiles inherit the active profile's unit so the toggle feels consistent.
  const profile = makeProfile({ id, name, unit: input.unit ?? activeProfile(s).unit, cuisine: input.cuisine, createdAt: now });
  return { state: { ...s, profiles: [...s.profiles, profile], seq, activeProfileId: id }, id, error: null };
}

export function switchProfile(s: AppState, id: string): AppState {
  return s.profiles.some((p) => p.id === id) ? { ...s, activeProfileId: id } : s;
}

export function renameProfile(s: AppState, id: string, name: string): { state: AppState; error: ProfileError | null } {
  const n = name.trim();
  if (!n || n.length > MAX_NAME) return { state: s, error: "empty_name" };
  if (s.profiles.some((p) => p.id !== id && p.name.toLowerCase() === n.toLowerCase())) return { state: s, error: "duplicate" };
  return { state: { ...s, profiles: s.profiles.map((p) => (p.id === id ? { ...p, name: n } : p)) }, error: null };
}

export function deleteProfile(s: AppState, id: string): { state: AppState; error: ProfileError | null } {
  if (s.profiles.length <= 1) return { state: s, error: "last_profile" };
  const profiles = s.profiles.filter((p) => p.id !== id);
  const activeProfileId = s.activeProfileId === id ? profiles[0].id : s.activeProfileId;
  return {
    state: {
      ...s,
      profiles,
      activeProfileId,
      readings: s.readings.filter((r) => r.profileId !== id),
      meals: s.meals.filter((m) => m.profileId !== id),
      medications: s.medications.filter((m) => m.profileId !== id),
      medLogs: s.medLogs.filter((m) => m.profileId !== id),
      reminders: s.reminders.filter((r) => r.profileId !== id),
      swapGoals: s.swapGoals.filter((g) => g.profileId !== id),
    },
    error: null,
  };
}

// ── Swap goals (retention; e.g. "try millet roti 3 times this week") ────────────────

export function addSwapGoal(
  s: AppState,
  input: { text: string; targetCount?: number },
  now: number,
): { state: AppState; id?: string; error: "empty" | null } {
  const text = input.text.trim();
  if (!text) return { state: s, error: "empty" };
  const { id, seq } = nextId(s, "sg");
  const goal: SwapGoal = {
    id,
    profileId: s.activeProfileId,
    text: text.slice(0, 120),
    targetCount: Math.max(1, input.targetCount ?? 3),
    doneCount: 0,
    createdAt: now,
    active: true,
  };
  return { state: { ...s, swapGoals: [...s.swapGoals, goal], seq }, id, error: null };
}

export function incrementSwapGoal(s: AppState, id: string): AppState {
  return {
    ...s,
    swapGoals: s.swapGoals.map((g) =>
      g.id === id ? { ...g, doneCount: Math.min(g.targetCount, g.doneCount + 1), active: g.doneCount + 1 < g.targetCount } : g,
    ),
  };
}

export function deleteSwapGoal(s: AppState, id: string): AppState {
  return { ...s, swapGoals: s.swapGoals.filter((g) => g.id !== id) };
}

export function activeSwapGoals(s: AppState): SwapGoal[] {
  return s.swapGoals.filter((g) => g.profileId === s.activeProfileId);
}

/** Convert a context's range from/to make the ADA-vs-custom state obvious in UI. */
export function isCustomRanges(p: Profile): boolean {
  return p.rangePreset === "custom" || CONTEXTS.some((c) => {
    const ada = adaRanges()[c];
    return p.ranges[c].low !== ada.low || p.ranges[c].high !== ada.high;
  });
}
