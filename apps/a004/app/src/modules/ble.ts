import { Platform, PermissionsAndroid } from "react-native";
import {
  GLUCOSE_SERVICE_UUID, GLUCOSE_MEASUREMENT_UUID, RACP_UUID,
  RACP_REPORT_ALL_RECORDS, racpReportRecordsAfter,
  parseGlucoseMeasurement, parseRacpResponse,
  type GlucoseMeasurement,
} from "../core/ble";

/**
 * Bluetooth glucose-meter sync — the THIN native layer. All the real logic (SFLOAT, timestamps,
 * de-dup) lives in src/core/ble.ts and is unit-tested; this file only talks to react-native-ble-plx
 * and moves bytes.
 *
 * react-native-ble-plx is loaded with a GUARDED require, never a static import, so a build that
 * doesn't ship the native module (or a device with no Bluetooth radio — the QA emulator) degrades to
 * state "unsupported" instead of throwing on the startup graph. Every call is wrapped so the Devices
 * screen can always show a clean state and never crash or hang.
 */

export type BleState = "unsupported" | "poweredOff" | "unauthorized" | "resetting" | "ready" | "unknown";

export interface FoundMeter {
  id: string;
  name: string;
}

// ── Guarded native module ─────────────────────────────────────────────────────────────────────
let managerSingleton: any | null = null;
let loadFailed = false;

function getManager(): any | null {
  if (managerSingleton || loadFailed) return managerSingleton;
  try {
    // Lazy require: never on the import graph, so a missing native module can't freeze the splash.
    const mod = require("react-native-ble-plx");
    const BleManager = mod?.BleManager;
    if (!BleManager) { loadFailed = true; return null; }
    managerSingleton = new BleManager();
    return managerSingleton;
  } catch {
    loadFailed = true;
    return null;
  }
}

// ── base64 ↔ bytes (characteristic values are base64) ───────────────────────────────────────────
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function bytesToBase64(bytes: number[]): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] & 0xff;
    const b1 = i + 1 < bytes.length ? bytes[i + 1] & 0xff : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] & 0xff : 0;
    out += B64[b0 >> 2];
    out += B64[((b0 & 0x03) << 4) | (b1 >> 4)];
    out += i + 1 < bytes.length ? B64[((b1 & 0x0f) << 2) | (b2 >> 6)] : "=";
    out += i + 2 < bytes.length ? B64[b2 & 0x3f] : "=";
  }
  return out;
}

function base64ToBytes(b64: string): number[] {
  const clean = (b64 || "").replace(/[^A-Za-z0-9+/]/g, "");
  const out: number[] = [];
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = B64.indexOf(clean[i]);
    const c1 = B64.indexOf(clean[i + 1]);
    const c2 = clean[i + 2] ? B64.indexOf(clean[i + 2]) : -1;
    const c3 = clean[i + 3] ? B64.indexOf(clean[i + 3]) : -1;
    out.push((c0 << 2) | (c1 >> 4));
    if (c2 >= 0) out.push(((c1 & 0x0f) << 4) | (c2 >> 2));
    if (c3 >= 0) out.push(((c2 & 0x03) << 6) | c3);
  }
  return out;
}

// ── State ───────────────────────────────────────────────────────────────────────────────────────
function mapState(raw: string): BleState {
  switch (raw) {
    case "PoweredOn": return "ready";
    case "PoweredOff": return "poweredOff";
    case "Unauthorized": return "unauthorized";
    case "Unsupported": return "unsupported";
    case "Resetting": return "resetting";
    default: return "unknown";
  }
}

export async function getBleState(): Promise<BleState> {
  const m = getManager();
  if (!m) return "unsupported";
  try {
    const s = await m.state();
    return mapState(String(s));
  } catch {
    return "unsupported";
  }
}

// ── Android runtime permissions ──────────────────────────────────────────────────────────────────
/**
 * Request the Bluetooth permissions the scan needs, in-context (after the user taps "Connect").
 * Android 12+ uses BLUETOOTH_SCAN/CONNECT (neverForLocation, so no location prompt); Android 11 and
 * below need fine location to scan. iOS gates via the Info.plist usage string automatically.
 */
export async function ensureBlePermissions(): Promise<boolean> {
  if (Platform.OS !== "android") return true;
  try {
    const api = Platform.Version as number;
    if (api >= 31) {
      const scan = PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN;
      const connect = PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT;
      const res = await PermissionsAndroid.requestMultiple([scan, connect]);
      const granted = PermissionsAndroid.RESULTS.GRANTED;
      return res[scan] === granted && res[connect] === granted;
    }
    const loc = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    return loc === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

// ── Scanning ──────────────────────────────────────────────────────────────────────────────────────
/**
 * Scan for devices advertising the Glucose service. Calls `onFound` for each new meter and returns a
 * stop function. Any native error ends the scan via `onError` so the UI can leave the scanning state.
 */
export function scanForMeters(
  onFound: (m: FoundMeter) => void,
  onError: (state: BleState) => void,
): () => void {
  const m = getManager();
  if (!m) { onError("unsupported"); return () => {}; }
  const seen = new Set<string>();
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    try { m.stopDeviceScan(); } catch { /* ignore */ }
  };
  try {
    m.startDeviceScan([GLUCOSE_SERVICE_UUID], { allowDuplicates: false }, (error: any, device: any) => {
      if (error) {
        stop();
        const reason = error?.reason || error?.message || "";
        if (/unauthorized|permission/i.test(String(reason))) onError("unauthorized");
        else if (/poweredoff|off/i.test(String(reason))) onError("poweredOff");
        else onError("unsupported");
        return;
      }
      if (!device?.id || seen.has(device.id)) return;
      seen.add(device.id);
      onFound({ id: device.id, name: device.name || device.localName || "Glucose meter" });
    });
  } catch {
    onError("unsupported");
  }
  return stop;
}

// ── Import stored records over the Glucose Profile (RACP) ────────────────────────────────────────
export interface BleImportProgress {
  received: number;
}

/**
 * Connect, ask the meter for its stored records (all, or only those after `afterSequence` for a
 * re-sync) and resolve with the parsed Glucose Measurement records. Guarded with a hard timeout so a
 * flaky meter can never hang the screen. Throws on connection failure so the UI shows a retry.
 */
export async function importGlucoseRecords(
  deviceId: string,
  afterSequence: number,
  fallbackTs: number,
  onProgress?: (p: BleImportProgress) => void,
  timeoutMs = 20_000,
): Promise<GlucoseMeasurement[]> {
  const m = getManager();
  if (!m) throw new Error("unsupported");

  const records: GlucoseMeasurement[] = [];
  let measureSub: any = null;
  let racpSub: any = null;
  let device: any = null;
  let finished = false;

  const cleanup = async () => {
    try { measureSub?.remove?.(); } catch { /* ignore */ }
    try { racpSub?.remove?.(); } catch { /* ignore */ }
    try { if (device) await m.cancelDeviceConnection(deviceId); } catch { /* ignore */ }
  };

  return await new Promise<GlucoseMeasurement[]>((resolve, reject) => {
    const done = async (err?: Error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      await cleanup();
      if (err) reject(err); else resolve(records);
    };
    const timer = setTimeout(() => { void done(records.length ? undefined : new Error("timeout")); }, timeoutMs);

    (async () => {
      try {
        device = await m.connectToDevice(deviceId, { timeout: timeoutMs });
        await device.discoverAllServicesAndCharacteristics();

        measureSub = device.monitorCharacteristicForService(
          GLUCOSE_SERVICE_UUID, GLUCOSE_MEASUREMENT_UUID,
          (error: any, ch: any) => {
            if (error || !ch?.value) return;
            const rec = parseGlucoseMeasurement(base64ToBytes(ch.value), fallbackTs);
            if (rec) { records.push(rec); onProgress?.({ received: records.length }); }
          },
        );

        racpSub = device.monitorCharacteristicForService(
          GLUCOSE_SERVICE_UUID, RACP_UUID,
          (error: any, ch: any) => {
            if (error || !ch?.value) return;
            const resp = parseRacpResponse(base64ToBytes(ch.value));
            // Any terminating RACP response (success, "no records", or number-of-records) ends the sync.
            if (resp && (resp.opCode === 0x06 || resp.opCode === 0x05)) void done();
          },
        );

        const command = afterSequence > 0 ? racpReportRecordsAfter(afterSequence) : RACP_REPORT_ALL_RECORDS;
        await device.writeCharacteristicWithResponseForService(
          GLUCOSE_SERVICE_UUID, RACP_UUID, bytesToBase64(command),
        );
      } catch (e) {
        void done(e instanceof Error ? e : new Error("connect_failed"));
      }
    })();
  });
}
