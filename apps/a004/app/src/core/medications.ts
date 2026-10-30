/**
 * Medication & insulin logging — structured fields only. There is deliberately
 * NO dose calculator or recommendation anywhere (wellness-only, Play policy).
 * Saved medications enable one-tap reuse; logs are denormalised so history
 * survives deleting the medication definition.
 */
import {
  type AppState,
  type MedLog,
  type Medication,
  type MedType,
  MAX_NAME,
  MAX_NOTE,
  liveMedLogs,
  nextId,
} from "./model";

export type MedError = "empty_name" | "duplicate" | "bad_dose";

export function validateMedication(s: AppState, name: string, exceptId?: string): MedError | null {
  const n = name.trim();
  if (!n) return "empty_name";
  if (n.length > MAX_NAME) return "empty_name";
  const profileId = s.activeProfileId;
  if (s.medications.some((m) => m.profileId === profileId && m.id !== exceptId && m.name.toLowerCase() === n.toLowerCase()))
    return "duplicate";
  return null;
}

export function addMedication(
  s: AppState,
  input: { name: string; type: MedType; defaultDose: number; doseUnit: string },
): { state: AppState; id?: string; error: MedError | null } {
  const error = validateMedication(s, input.name);
  if (error) return { state: s, error };
  if (!(input.defaultDose >= 0) || !Number.isFinite(input.defaultDose)) return { state: s, error: "bad_dose" };
  const { id, seq } = nextId(s, "med");
  const med: Medication = {
    id,
    profileId: s.activeProfileId,
    name: input.name.trim(),
    type: input.type,
    defaultDose: input.defaultDose,
    doseUnit: input.doseUnit.trim() || defaultDoseUnit(input.type),
  };
  return { state: { ...s, medications: [...s.medications, med], seq }, id, error: null };
}

export function defaultDoseUnit(type: MedType): string {
  return type === "insulin" ? "units" : type === "pill" ? "mg" : type === "injectable" ? "mg" : "dose";
}

export function deleteMedication(s: AppState, id: string): AppState {
  return { ...s, medications: s.medications.filter((m) => m.id !== id) };
}

/** Log a dose. If from a saved medication, name/unit are copied for history. */
export function logMedication(
  s: AppState,
  input: { medicationId: string; dose: number; ts: number; note?: string; name?: string; doseUnit?: string },
  _now: number,
): { state: AppState; id?: string; error: MedError | null } {
  if (!(input.dose >= 0) || !Number.isFinite(input.dose)) return { state: s, error: "bad_dose" };
  const med = s.medications.find((m) => m.id === input.medicationId);
  const name = (input.name ?? med?.name ?? "").trim();
  if (!name) return { state: s, error: "empty_name" };
  const { id, seq } = nextId(s, "ml");
  const log: MedLog = {
    id,
    profileId: s.activeProfileId,
    medicationId: input.medicationId,
    name,
    dose: input.dose,
    doseUnit: input.doseUnit ?? med?.doseUnit ?? "dose",
    ts: input.ts,
    note: (input.note ?? "").slice(0, MAX_NOTE),
    deletedAt: null,
  };
  return { state: { ...s, medLogs: [...s.medLogs, log], seq }, id, error: null };
}

export function deleteMedLog(s: AppState, id: string, now: number): AppState {
  return { ...s, medLogs: s.medLogs.map((l) => (l.id === id ? { ...l, deletedAt: now } : l)) };
}

export function medicationsFor(s: AppState): Medication[] {
  return s.medications.filter((m) => m.profileId === s.activeProfileId);
}

export function medLogsInRange(s: AppState, from: number, to: number): MedLog[] {
  return liveMedLogs(s).filter((l) => l.ts >= from && l.ts <= to);
}
