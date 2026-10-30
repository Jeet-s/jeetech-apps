/**
 * Bluetooth Glucose Profile — pure parsing of the STANDARD Bluetooth SIG profile a real glucose
 * meter speaks, so the whole import path is testable without any hardware (the emulator has none).
 *
 *   Service               Glucose                     0x1808
 *   Glucose Measurement   notify, per stored record   0x2A18
 *   Record Access Control Point (RACP)  write/indicate 0x2A52
 *
 * The native layer (src/modules/ble.ts) only moves bytes: it writes a RACP command, collects the
 * Glucose Measurement notifications as byte arrays and hands them here. Everything below is plain
 * math over numbers — SFLOAT decode, base-time + time-offset → a wall-clock epoch, unit conversion
 * to canonical mg/dL, and de-dup by device + sequence number — so validate.ts and sim.ts can drive
 * it with fixed sample packets.
 */
import { wallClock } from "./dates";
import { MMOL_FACTOR, PLAUSIBLE_MAX_MGDL, PLAUSIBLE_MIN_MGDL } from "./units";
import { autoContext } from "./model";
import { type NewReading } from "./readings";

// ── 16-bit UUIDs expanded to the Bluetooth base UUID (what react-native-ble-plx expects) ──────
const base = (short: string) => `0000${short}-0000-1000-8000-00805f9b34fb`;
export const GLUCOSE_SERVICE_UUID = base("1808");
export const GLUCOSE_MEASUREMENT_UUID = base("2a18");
export const RACP_UUID = base("2a52");

// ── SFLOAT (IEEE-11073 16-bit) ────────────────────────────────────────────────────────────────
// 4-bit signed exponent (top nibble) + 12-bit signed mantissa. A handful of mantissa values are
// reserved (NaN / ±Infinity / "not at this resolution") and must not be read as a number.
const SFLOAT_RESERVED = new Set([0x07ff, 0x0800, 0x07fe, 0x0802, 0x0801]);

/** Decode a 16-bit SFLOAT to a JS number, or NaN for the reserved/special values. */
export function parseSfloat(raw: number): number {
  const u = raw & 0xffff;
  let mantissa = u & 0x0fff;
  if (SFLOAT_RESERVED.has(mantissa)) return NaN;
  let exponent = (u >> 12) & 0x0f;
  if (exponent >= 0x0008) exponent -= 0x10; // sign-extend 4-bit
  if (mantissa >= 0x0800) mantissa -= 0x1000; // sign-extend 12-bit
  return mantissa * Math.pow(10, exponent);
}

/**
 * Glucose Measurement (0x2A18) concentration → canonical mg/dL.
 * Flag bit 2 picks the units the SFLOAT is in: kg/L (0) or mol/L (1).
 *   1 kg/L  = 100 000 mg/dL
 *   1 mol/L = 1000 mmol/L, and 1 mmol/L = MMOL_FACTOR mg/dL
 * Returns null when the value is missing, reserved, or outside the plausible physiological window.
 */
export function glucoseConcentrationToMgdl(concentration: number, molUnits: boolean): number | null {
  if (!Number.isFinite(concentration) || concentration <= 0) return null;
  const mgdl = molUnits ? concentration * 1000 * MMOL_FACTOR : concentration * 100_000;
  const rounded = Math.round(mgdl);
  if (rounded < PLAUSIBLE_MIN_MGDL || rounded > PLAUSIBLE_MAX_MGDL) return null;
  return rounded;
}

export interface GlucoseMeasurement {
  /** Record sequence number reported by the meter (unique + monotonic per device). */
  sequence: number;
  /** Wall-clock epoch (ms) from the record's base time + time offset. */
  ts: number;
  /** Canonical mg/dL, or null when the record carried no usable concentration. */
  valueMgdl: number | null;
}

/**
 * Parse one Glucose Measurement (0x2A18) record. Layout:
 *   [0]      flags (uint8)
 *   [1..2]   sequence number (uint16 LE)
 *   [3..9]   base time: year (uint16 LE), month, day, hours, minutes, seconds
 *   [10..11] time offset in minutes (sint16 LE)           — only if flag bit 0
 *   [..]     glucose concentration SFLOAT + type/location — only if flag bit 1
 * `fallbackTs` is used when the base time is absent/implausible.
 */
export function parseGlucoseMeasurement(bytes: number[], fallbackTs: number): GlucoseMeasurement | null {
  if (!Array.isArray(bytes) || bytes.length < 10) return null;
  const flags = bytes[0] & 0xff;
  const timeOffsetPresent = (flags & 0x01) !== 0;
  const concentrationPresent = (flags & 0x02) !== 0;
  const molUnits = (flags & 0x04) !== 0;

  const sequence = (bytes[1] & 0xff) | ((bytes[2] & 0xff) << 8);

  const year = (bytes[3] & 0xff) | ((bytes[4] & 0xff) << 8);
  const month = bytes[5] & 0xff;
  const day = bytes[6] & 0xff;
  const hours = bytes[7] & 0xff;
  const minutes = bytes[8] & 0xff;
  const validBase = year >= 1582 && year <= 9999 && month >= 1 && month <= 12 && day >= 1 && day <= 31 && hours <= 23 && minutes <= 59;
  let ts = validBase ? wallClock(year, month, day, hours, minutes) : fallbackTs;

  let cursor = 10;
  if (timeOffsetPresent && bytes.length >= cursor + 2) {
    let offset = (bytes[cursor] & 0xff) | ((bytes[cursor + 1] & 0xff) << 8);
    if (offset >= 0x8000) offset -= 0x10000; // sint16
    if (validBase) ts += offset * 60_000;
    cursor += 2;
  }

  let valueMgdl: number | null = null;
  if (concentrationPresent && bytes.length >= cursor + 2) {
    const raw = (bytes[cursor] & 0xff) | ((bytes[cursor + 1] & 0xff) << 8);
    valueMgdl = glucoseConcentrationToMgdl(parseSfloat(raw), molUnits);
    // (cursor += 3 for concentration + type/location nibble — not needed past this point)
  }

  return { sequence, ts, valueMgdl };
}

// ── Record Access Control Point (0x2A52) ───────────────────────────────────────────────────────
// Op Code 0x01 = Report Stored Records. Operator 0x01 = All records; 0x03 = Greater-than-or-equal-to
// with operand filter 0x01 = sequence number (uint16 LE). The first sync asks for all records; a
// later sync asks only for records after the highest sequence we already imported.
export const RACP_REPORT_ALL_RECORDS: number[] = [0x01, 0x01];

export function racpReportRecordsAfter(sequence: number): number[] {
  const seq = Math.max(0, Math.floor(sequence));
  return [0x01, 0x03, 0x01, seq & 0xff, (seq >> 8) & 0xff];
}

export interface RacpResponse {
  /** 0x06 = Response Code (with request op code + status); 0x05 = Number of Stored Records. */
  opCode: number;
  requestOpCode?: number;
  /** Status for a Response Code: 0x01 = Success. */
  status?: number;
  numberOfRecords?: number;
  success: boolean;
}

/** Parse a RACP indication. Used only to know when the meter has finished sending records. */
export function parseRacpResponse(bytes: number[]): RacpResponse | null {
  if (!Array.isArray(bytes) || bytes.length < 2) return null;
  const opCode = bytes[0] & 0xff;
  if (opCode === 0x06) {
    const requestOpCode = bytes[2] & 0xff;
    const status = bytes[3] & 0xff;
    return { opCode, requestOpCode, status, success: status === 0x01 };
  }
  if (opCode === 0x05) {
    const numberOfRecords = (bytes[2] & 0xff) | ((bytes[3] & 0xff) << 8);
    return { opCode, numberOfRecords, success: true };
  }
  return { opCode, success: false };
}

// ── Records → readings, de-duplicated by device + sequence ──────────────────────────────────────

/** Stable de-dup key for a meter record: the same device + sequence never imports twice. */
export function bleKey(deviceId: string, sequence: number): string {
  return `ble:${deviceId}:${sequence}`;
}

export interface BleImportResult {
  readings: NewReading[];
  /** Records skipped because we've already imported them (same device + sequence). */
  duplicates: number;
  /** Records skipped because they carried no usable glucose value. */
  skipped: number;
}

/**
 * Turn parsed meter records into importable readings, dropping any whose (device, sequence) key is
 * already present (`existing`) or repeated within this batch. Pure — the UI passes
 * `existingImportKeys(state)` and persists the returned readings through `addReadings`.
 */
export function bleRecordsToReadings(records: GlucoseMeasurement[], deviceId: string, existing: Set<string>): BleImportResult {
  const seen = new Set(existing);
  const readings: NewReading[] = [];
  let duplicates = 0;
  let skipped = 0;
  for (const rec of records) {
    if (rec.valueMgdl == null) { skipped++; continue; }
    const key = bleKey(deviceId, rec.sequence);
    if (seen.has(key)) { duplicates++; continue; }
    seen.add(key);
    readings.push({
      valueMgdl: rec.valueMgdl,
      ts: rec.ts,
      context: autoContext(rec.ts),
      note: "Imported over Bluetooth",
      source: "ble",
      importKey: key,
    });
  }
  return { readings, duplicates, skipped };
}

/** Highest sequence number already imported from a device, for an incremental re-sync (0 = none). */
export function lastImportedSequence(existing: Set<string>, deviceId: string): number {
  const prefix = `ble:${deviceId}:`;
  let max = 0;
  for (const k of existing) {
    if (k.startsWith(prefix)) {
      const n = Number(k.slice(prefix.length));
      if (Number.isFinite(n)) max = Math.max(max, n);
    }
  }
  return max;
}
