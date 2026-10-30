import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Image, StyleSheet, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { Button, Card, HeroCard, Icon, ListItem, Pill, ProgressBar, SectionHeader, Skeleton, TextField, feedback, gradient, palette, radius, space, toast, type } from "../ui";
import { SubScreen, nowTs, formatDateTime } from "./shared";
import { useSugar, sugarStore } from "../core/data";
import { liveReadings } from "../core/model";
import { useSettings } from "../modules/store";
import { ai } from "../modules/ai";
import { analytics } from "../modules/analytics";
import { addReadings, existingImportKeys } from "../core/readings";
import { parseMeterCsv, sanitizeOcrReadings, type OcrResult } from "../core/meterImport";
import { bleRecordsToReadings, lastImportedSequence } from "../core/ble";
import { getBleState, ensureBlePermissions, scanForMeters, importGlucoseRecords, type BleState, type FoundMeter } from "../modules/ble";
import { canUseAi, consumeAi, aiRemainingAt } from "../core/pro";
import { dayKey } from "../core/dates";
import { pickBackupText } from "./export";

/**
 * Devices & meters — connect a Bluetooth glucose meter OR use the universal shortcuts.
 *
 * Manual entry stays the main path (five-second keypad on the Log tab). Here you can:
 *   • pair a real Bluetooth meter that speaks the standard Bluetooth Glucose Profile and import its
 *     stored records (de-duplicated by device + sequence number, marked as Bluetooth in History),
 *   • scan your meter's screen with the camera (AI reads the number), or
 *   • import a CSV exported by a common meter app.
 * The Bluetooth states (off / permission denied / no Bluetooth hardware) are handled honestly — the
 * test emulator has no radio, so it lands on a calm "no Bluetooth on this device" explanation.
 */
type Meter = { brand: string; models: string; kind: "meter" | "cgm"; ble: boolean };

const METERS: Meter[] = [
  { brand: "Contour", models: "Next One, Next, Plus", kind: "meter", ble: true },
  { brand: "Accu-Chek", models: "Guide, Instant, Guide Me", kind: "meter", ble: true },
  { brand: "Beurer", models: "GL50 evo, GL49", kind: "meter", ble: true },
  { brand: "GlucoRx", models: "Nexus, HCT", kind: "meter", ble: true },
  { brand: "Caresens", models: "Dual, N Premier", kind: "meter", ble: true },
  { brand: "OneTouch", models: "Verio, Select Plus, Ultra", kind: "meter", ble: false },
  { brand: "True Metrix", models: "Air, Go, Self-monitoring", kind: "meter", ble: false },
  { brand: "Dr. Morepen", models: "BG-03, Gold", kind: "meter", ble: false },
  { brand: "FreeStyle", models: "Libre 2 / 3, Optium, Lite", kind: "cgm", ble: false },
  { brand: "Dexcom", models: "G6, G7, ONE", kind: "cgm", ble: false },
  { brand: "Any other meter", models: "Read the value, log it in seconds", kind: "meter", ble: false },
];

/** Friendly copy for each non-ready Bluetooth state. */
const BT_NOTICE: Record<Exclude<BleState, "ready">, { title: string; body: string }> = {
  unsupported: {
    title: "No Bluetooth on this device",
    body: "This device has no Bluetooth glucose-meter radio (test devices and most emulators don't). You can still scan your meter's screen, import a CSV, or type a reading in about five seconds — all below.",
  },
  poweredOff: {
    title: "Bluetooth is off",
    body: "Turn Bluetooth on in your phone's settings, then tap Connect again to find your meter.",
  },
  unauthorized: {
    title: "Bluetooth permission needed",
    body: "Sugar Plate needs the Bluetooth permission to find and read your meter. Allow it in your phone's settings, then tap Connect again. We never use it for location.",
  },
  resetting: {
    title: "Bluetooth is restarting",
    body: "Your phone's Bluetooth is resetting. Wait a moment and tap Connect again.",
  },
  unknown: {
    title: "Bluetooth isn't ready",
    body: "We couldn't reach Bluetooth just now. Check it's on in your phone's settings and try Connect again.",
  },
};

/** Capture ONE photo of the meter screen, shrunk to ~1024px JPEG base64 before it leaves the phone. */
async function captureMeter(source: "camera" | "library"): Promise<{ uri: string; base64: string } | null> {
  let picked: ImagePicker.ImagePickerResult;
  if (source === "camera") {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return null;
    picked = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], allowsEditing: false, quality: 1 });
  } else {
    picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: false, quality: 1 });
  }
  if (picked.canceled || !picked.assets?.length) return null;
  const shrunk = await manipulateAsync(picked.assets[0].uri, [{ resize: { width: 1024 } }], { compress: 0.7, format: SaveFormat.JPEG, base64: true });
  if (!shrunk.base64) return null;
  return { uri: shrunk.uri, base64: shrunk.base64 };
}

export function DevicesScreen({ bottomInset, onBack, onPro }: { bottomInset: number; onBack: () => void; onPro?: (from: string) => void }) {
  const data = useSugar();
  const settings = useSettings();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<null | "scan" | "csv">(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── Bluetooth state machine ───────────────────────────────────────────────────────────────────
  const [btChecking, setBtChecking] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [meters, setMeters] = useState<FoundMeter[]>([]);
  const [btNotice, setBtNotice] = useState<Exclude<BleState, "ready"> | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [importCount, setImportCount] = useState(0);
  const [btResult, setBtResult] = useState<string | null>(null);
  const [btError, setBtError] = useState<string | null>(null);
  const scanStop = useRef<null | (() => void)>(null);
  const scanTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopScan = () => {
    scanStop.current?.();
    scanStop.current = null;
    if (scanTimer.current) { clearTimeout(scanTimer.current); scanTimer.current = null; }
    setScanning(false);
  };
  // Always stop a running scan when leaving the screen.
  useEffect(() => () => stopScan(), []);

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return METERS;
    return METERS.filter((m) => `${m.brand} ${m.models}`.toLowerCase().includes(term));
  }, [q]);

  const startScan = () => {
    setMeters([]);
    setBtNotice(null);
    setScanning(true);
    feedback("pop", "light");
    let found = 0;
    scanStop.current = scanForMeters(
      (m) => { found += 1; setMeters((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m])); },
      (state) => { stopScan(); if (state !== "ready") setBtNotice(state); },
    );
    scanTimer.current = setTimeout(() => {
      stopScan();
      if (found === 0) setBtResult("No meters found nearby. Turn your meter on, keep it close, and make sure its Bluetooth is on — then tap Scan again.");
    }, 15_000);
  };

  const connect = async () => {
    if (btChecking || scanning) return;
    setBtError(null);
    setBtResult(null);
    setBtNotice(null);
    setMeters([]);
    setBtChecking(true);
    const state = await getBleState();
    if (state !== "ready") { setBtNotice(state); setBtChecking(false); return; }
    const granted = await ensureBlePermissions();
    setBtChecking(false);
    if (!granted) { setBtNotice("unauthorized"); return; }
    startScan();
  };

  const importMeter = async (meter: FoundMeter) => {
    stopScan();
    setImportingId(meter.id);
    setImportCount(0);
    setBtError(null);
    setBtResult(null);
    analytics.track("ble_import_started");
    try {
      const afterSeq = lastImportedSequence(existingImportKeys(data), meter.id);
      const records = await importGlucoseRecords(meter.id, afterSeq, nowTs(), (p) => setImportCount(p.received));
      const result = bleRecordsToReadings(records, meter.id, existingImportKeys(data));
      if (result.readings.length) {
        const { state, added } = addReadings(data, result.readings, nowTs());
        sugarStore.set(state);
        feedback("success", "success");
        analytics.track("core_action", { feature: "meter_import" });
        analytics.track("meter_import", { how: "ble" });
        toast(`Imported ${added} new reading${added === 1 ? "" : "s"}`);
        setBtResult(`${added} new reading${added === 1 ? "" : "s"} imported from ${meter.name}. Find them in History and the Log, tagged Bluetooth.`);
        setMeters([]);
      } else {
        feedback("pop", "light");
        setBtResult(records.length
          ? `${meter.name} is already up to date — no new readings to import.`
          : `No stored readings found on ${meter.name} yet.`);
      }
    } catch {
      feedback("error", "error");
      setBtError("Couldn't finish the import. Make sure the meter is on, unlocked and close to your phone, then tap Connect to try again.");
    } finally {
      setImportingId(null);
    }
  };

  const landReadings = (result: { readings: ReturnType<typeof parseMeterCsv>["readings"]; skipped: number }, how: string) => {
    if (!result.readings.length) {
      feedback("error", "error");
      setError(result.skipped ? `Couldn't read a usable value (${result.skipped} skipped).` : "No readings found to import.");
      return;
    }
    const { state, added } = addReadings(data, result.readings, nowTs());
    sugarStore.set(state);
    feedback("success", "success");
    analytics.track("core_action", { feature: "meter_import" });
    analytics.track("meter_import", { how });
    const skipNote = result.skipped ? ` · ${result.skipped} skipped` : "";
    toast(`Imported ${added} reading${added === 1 ? "" : "s"}${skipNote}`);
  };

  const scanMeter = () => {
    if (busy) return;
    if (!canUseAi(data, settings.pro, dayKey(nowTs()))) { analytics.track("quota_hit"); return onPro?.("meter_ocr"); }
    Alert.alert("Scan your meter", "Point at your meter's screen — we'll read the number. It's a reading transcription, not medical advice.", [
      { text: "Choose from library", onPress: () => void runScan("library") },
      { text: "Take a photo", onPress: () => void runScan("camera") },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const runScan = async (src: "camera" | "library") => {
    setError(null);
    let shot: { uri: string; base64: string } | null = null;
    try { shot = await captureMeter(src); } catch { shot = null; }
    if (!shot) return;
    setPhoto(shot.uri);
    setBusy("scan");
    analytics.track("meter_scan_started");
    const res = await ai.run("meter_ocr", "Read the glucose value(s) shown on this meter or app screen.", { image: shot.base64 });
    setBusy(null);
    if (!res.ok) {
      if (res.reason === "quota") { analytics.track("quota_hit"); return onPro?.("meter_ocr"); }
      feedback("error", "error");
      return setError(res.reason === "offline" ? "You're offline — the photo stays on your phone. Try again when connected, or enter the number on the Log tab." : "Couldn't read that screen. Try again in better light, or type the number on the Log tab.");
    }
    const raw = (res.json ?? null) as OcrResult | null;
    sugarStore.set((s) => consumeAi(s, dayKey(nowTs())));
    landReadings(sanitizeOcrReadings(raw, nowTs()), "ocr");
  };

  const importCsv = async () => {
    if (busy) return;
    setError(null);
    setBusy("csv");
    try {
      const text = await pickBackupText();
      if (!text) { setBusy(null); return; }
      landReadings(parseMeterCsv(text, nowTs()), "csv");
    } catch {
      feedback("error", "error");
      setError("Couldn't open that file. Export a CSV from your meter app and try again.");
    } finally {
      setBusy(null);
    }
  };

  const importing = importingId != null;

  // Last Bluetooth import, derived from the readings themselves (source "ble", importKey
  // "ble:<deviceId>:<seq>"). Because it lives in the data, the paired-meter id and last-sync time
  // survive app updates — a real pain point when rival apps forget the pairing after every update.
  const lastBle = useMemo(() => {
    let newest: { ts: number; deviceId: string } | null = null;
    let count = 0;
    for (const r of liveReadings(data)) {
      if (r.source !== "ble") continue;
      count++;
      const deviceId = (r.importKey ?? "").split(":")[1] ?? "meter";
      if (!newest || r.ts > newest.ts) newest = { ts: r.ts, deviceId };
    }
    return newest ? { ...newest, count } : null;
  }, [data]);

  return (
    <SubScreen title="Devices & meters" subtitle="Bluetooth sync or quick import" onBack={onBack} bottomInset={bottomInset}>
      <HeroCard
        overline="Your meter"
        value="Import, don't retype"
        captionLines={3}
        caption="Pair a Bluetooth glucose meter to pull its stored readings, scan the screen with the camera, or import a CSV. Prefer typing? The five-second keypad on the Log tab is still the main way in."
        right={
          <View style={styles.heroBadge}>
            <Icon name="link" size={30} color={gradient.onHero} />
          </View>
        }
      />

      {/* ── Bluetooth: the real device-sync feature ─────────────────────────────── */}
      <SectionHeader title="Connect over Bluetooth" />
      <Card style={{ gap: space.sm }}>
        <View style={styles.importRow}>
          <View style={styles.importIcon}><Icon name="link" size={20} color={palette.primary} /></View>
          <View style={{ flex: 1 }}>
            <Text style={type.bodyStrong}>Bluetooth glucose meter</Text>
            <Text style={[type.caption, { color: palette.inkSoft }]}>
              Works with meters that support the standard Bluetooth Glucose Profile (e.g. Contour Next One, Accu-Chek Guide). We read only your stored glucose records — never location.
            </Text>
          </View>
        </View>

        {/* Pairing status + last sync — the paired meter and its last sync time persist across app
            updates (they're kept in the readings), so the user always knows the connection is remembered. */}
        <View style={styles.pairStatus}>
          <Icon name={lastBle ? "check" : "info"} size={16} color={lastBle ? palette.success : palette.inkSoft} />
          <Text style={[type.caption, { color: palette.inkSoft, flex: 1 }]}>
            {lastBle
              ? `Last synced ${formatDateTime(lastBle.ts)} · meter ${lastBle.deviceId.slice(0, 8)} · ${lastBle.count} reading${lastBle.count === 1 ? "" : "s"} imported`
              : "No meter paired yet. Pairing is remembered across app updates once you connect."}
          </Text>
        </View>

        {/* Pre-permission explanation + an explicit, step-by-step pairing guide shows BEFORE we ever
            ask for Bluetooth, so a first pairing (the #1 pain point on rival apps) is unambiguous. */}
        {!scanning && !btNotice && !importing && !btResult ? (
          <View style={styles.guide}>
            {[
              "Turn your meter on and enable its Bluetooth (check your meter's manual).",
              "Keep the meter within arm's reach of your phone.",
              "Tap Connect below, then pick your meter from the list.",
              "If a PIN appears, confirm the SAME code on both the meter and your phone.",
            ].map((step, i) => (
              <View key={i} style={styles.guideRow}>
                <View style={styles.guideNum}><Text style={[type.label, { color: palette.primary }]}>{i + 1}</Text></View>
                <Text style={[type.caption, { color: palette.inkSoft, flex: 1 }]}>{step}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {btNotice ? (
          <View style={styles.noticeBox} accessibilityLabel={BT_NOTICE[btNotice].title}>
            <Icon name="info" size={18} color={palette.inkSoft} />
            <View style={{ flex: 1 }}>
              <Text style={type.bodyStrong}>{BT_NOTICE[btNotice].title}</Text>
              <Text style={[type.caption, { color: palette.inkSoft }]}>{BT_NOTICE[btNotice].body}</Text>
            </View>
          </View>
        ) : null}

        {scanning ? (
          <View style={{ gap: 8 }} accessibilityLabel="Searching for meters">
            <View style={styles.importRow}>
              <Text style={[type.bodyStrong, { flex: 1 }]}>Searching for meters…</Text>
              <Text style={[type.caption, { color: palette.inkSoft }]}>{meters.length} found</Text>
            </View>
            {meters.length === 0 ? <Skeleton width="70%" height={14} /> : null}
          </View>
        ) : null}

        {/* Persistent bond/PIN guidance while pairing or importing — it stays on screen the whole time
            (never auto-dismisses), so a PIN prompt on the meter is never missed and the user knows to
            confirm the same code on both devices. A common pain point with rival apps is a PIN screen
            that vanishes mid-pairing. */}
        {scanning || importing ? (
          <View style={styles.noticeBox}>
            <Icon name="lock" size={18} color={palette.inkSoft} />
            <Text style={[type.caption, { color: palette.inkSoft, flex: 1 }]}>
              Keep this screen open. If your meter shows a PIN or asks to bond, confirm the same code on both the meter and your phone — this step won't time out on you.
            </Text>
          </View>
        ) : null}

        {meters.map((m) => (
          <ListItem
            key={m.id}
            icon="link"
            title={m.name}
            subtitle={importingId === m.id ? `Importing… ${importCount} received` : "Tap to import readings"}
            onPress={importing ? undefined : () => void importMeter(m)}
            chevron={!importing}
            trailing={importingId === m.id ? <Pill label="Importing" tone="primary" /> : undefined}
          />
        ))}

        {importing ? (
          <View style={{ gap: 6 }} accessibilityLabel="Importing readings over Bluetooth">
            <ProgressBar value={0.5} tone="primary" />
            <Text style={[type.caption, { color: palette.inkSoft }]}>Reading stored records… {importCount} received</Text>
          </View>
        ) : null}

        {btResult ? (
          <View style={styles.noticeBox}>
            <Icon name={btResult.startsWith("No meters") ? "info" : "check"} size={18} color={btResult.startsWith("No meters") ? palette.inkSoft : palette.success} />
            <Text style={[type.caption, { color: palette.inkSoft, flex: 1 }]}>{btResult}</Text>
          </View>
        ) : null}
        {btError ? <Text style={[type.caption, { color: palette.danger }]}>{btError}</Text> : null}

        <Button
          label={btChecking ? "Checking Bluetooth…" : scanning ? "Searching…" : meters.length || btResult ? "Scan again" : "Connect"}
          icon="link"
          loading={btChecking || scanning}
          disabled={importing}
          onPress={connect}
        />
        {scanning ? <Button label="Stop" variant="ghost" onPress={stopScan} /> : null}
      </Card>

      {/* ── Universal shortcuts (no pairing) ─────────────────────────────────────── */}
      <SectionHeader title="Or import without pairing" action={!settings.pro ? <Text style={type.caption}>{aiRemainingAt(data, false, nowTs())}/3 scans left</Text> : null} />
      <Card style={{ gap: space.sm }}>
        <View style={styles.importRow}>
          <View style={styles.importIcon}><Icon name="camera" size={20} color={palette.primary} /></View>
          <View style={{ flex: 1 }}>
            <Text style={type.bodyStrong}>Scan your meter screen</Text>
            <Text style={[type.caption, { color: palette.inkSoft }]}>Point the camera at the meter — AI reads the number.</Text>
          </View>
        </View>
        <Button label={busy === "scan" ? "Reading…" : "Scan meter screen"} variant="secondary" icon="camera" loading={busy === "scan"} onPress={scanMeter} />
        {photo ? <Image source={{ uri: photo }} style={styles.photo} resizeMode="cover" accessibilityLabel="Meter photo" accessibilityIgnoresInvertColors /> : null}
        {busy === "scan" ? (
          <View style={{ gap: 8 }} accessibilityLabel="Reading your meter">
            <Skeleton width="60%" height={14} />
            <Skeleton width="40%" height={14} />
          </View>
        ) : null}

        <View style={[styles.importRow, { marginTop: space.sm }]}>
          <View style={styles.importIcon}><Icon name="download" size={20} color={palette.primary} /></View>
          <View style={{ flex: 1 }}>
            <Text style={type.bodyStrong}>Import a CSV file</Text>
            <Text style={[type.caption, { color: palette.inkSoft }]}>Export from Contour, Accu-Chek, OneTouch, Diabetes:M…</Text>
          </View>
        </View>
        <Button label={busy === "csv" ? "Importing…" : "Import CSV file"} variant="secondary" icon="download" loading={busy === "csv"} onPress={importCsv} />
        {error ? <Text style={[type.caption, { color: palette.danger }]}>{error}</Text> : null}
      </Card>

      <Card style={styles.howCard}>
        <Text style={type.bodyStrong}>Typing is still the main path</Text>
        <Text style={[type.caption, { color: palette.inkSoft }]}>
          On the Log tab, tap your reading on the big keypad, pick the meal context and save — about five seconds, no pairing needed.
        </Text>
      </Card>

      <SectionHeader title="Supported meters" />
      <TextField label="Find your meter" placeholder="e.g. Contour, Accu-Chek" value={q} onChangeText={setQ} autoCorrect={false} />
      <Text style={[type.caption, { color: palette.inkSoft }]}>
        A <Text style={type.bodyStrong}>Bluetooth</Text> tag means direct import over the standard Glucose Profile. CGMs (FreeStyle Libre, Dexcom) use their own apps — scan the screen or import a CSV instead. Any meter works by reading the number into the Log.
      </Text>
      <Card padded={false} style={styles.listCard}>
        {list.length === 0 ? (
          <View style={styles.emptyRow}>
            <Icon name="search" size={18} color={palette.inkMuted} />
            <Text style={[type.body, { color: palette.inkSoft, flex: 1 }]}>
              No match — but any meter works. Just read the number and log it on the Log tab.
            </Text>
          </View>
        ) : (
          list.map((m) => (
            <ListItem
              key={m.brand}
              icon="link"
              title={m.brand}
              subtitle={m.models}
              chevron={false}
              trailing={<Pill label={m.ble ? "Bluetooth" : m.kind === "cgm" ? "CGM" : "Manual"} tone={m.ble ? "primary" : "neutral"} />}
            />
          ))
        )}
      </Card>

      <Text style={[type.caption, styles.note]}>
        Brand names belong to their owners and are listed only to help you recognise your meter. Imported and scanned
        values are a convenience — check them against your meter. Wellness information only, not medical advice.
      </Text>
    </SubScreen>
  );
}

const styles = StyleSheet.create({
  heroBadge: { width: 64, height: 64, borderRadius: 32, backgroundColor: gradient.pill, alignItems: "center", justifyContent: "center" },
  howCard: { gap: space.xs, marginTop: space.xs },
  importRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  importIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: palette.primarySoft, alignItems: "center", justifyContent: "center" },
  noticeBox: { flexDirection: "row", gap: space.md, alignItems: "flex-start", backgroundColor: palette.surfaceAlt, borderRadius: radius.md, padding: space.md },
  pairStatus: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.xs },
  guide: { gap: space.sm, paddingVertical: space.xs },
  guideRow: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
  guideNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: palette.primarySoft, alignItems: "center", justifyContent: "center" },
  photo: { width: "100%", height: 150, borderRadius: radius.md },
  listCard: { paddingHorizontal: space.lg },
  emptyRow: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.lg },
  note: { textAlign: "center", color: palette.inkMuted, marginTop: space.sm },
});
