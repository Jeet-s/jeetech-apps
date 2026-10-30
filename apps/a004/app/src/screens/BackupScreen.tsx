import { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { Button, Card, EmptyState, Icon, Pill, feedback, palette, space, toast, type } from "../ui";
import { useSugar, sugarStore, useSnapshots, snapshotsStore, asSnapshotList, SUGAR_VERSION, restoreBackup } from "../core/data";
import { countEntries, makeSnapshot, rollSnapshots, previewRestore, type Snapshot, type Counts } from "../core/backup";
import { type AppState } from "../core/model";
import { analytics } from "../modules/analytics";
import { SubScreen, formatDateTime, nowTs } from "./shared";
import { exportBackupFile, pickBackupText } from "./export";
import { dayKey } from "../core/dates";

const countLine = (c: Counts) => `${c.readings} readings · ${c.meals} meals · ${c.medLogs} doses · ${c.reminders} reminders`;

/** What's on the phone now but NOT in this backup — the entries a restore would drop. Empty when the
 *  backup already has at least as much of everything (nothing is lost). */
function lossSummary(now: Counts, backup: Counts): string | null {
  const fields: [keyof Counts, string, string][] = [
    ["readings", "reading", "readings"],
    ["meals", "meal", "meals"],
    ["medLogs", "dose", "doses"],
    ["medications", "medication", "medications"],
    ["reminders", "reminder", "reminders"],
  ];
  const parts = fields
    .map(([k, one, many]) => ({ n: Math.max(0, now[k] - backup[k]), one, many }))
    .filter((p) => p.n > 0)
    .map((p) => `${p.n} ${p.n === 1 ? p.one : p.many}`);
  if (!parts.length) return null;
  return `You'd lose ${parts.join(", ")} added since this backup. Tap Undo straight after if that's not what you want.`;
}

export function BackupScreen({ bottomInset, onBack }: { bottomInset: number; onBack: () => void }) {
  const data = useSugar();
  const snaps = useSnapshots();
  const [busy, setBusy] = useState(false);
  const live = countEntries(data);

  const backupNow = () => {
    const snap = makeSnapshot(data, nowTs());
    snapshotsStore.set((prev) => rollSnapshots(asSnapshotList(prev), snap));
    feedback("success", "success");
    analytics.track("backup_created");
    toast(`Backed up · ${snap.counts.total} entries`);
  };

  const exportFile = async () => {
    setBusy(true);
    try {
      const serialized = JSON.stringify({ ...data, schemaVersion: SUGAR_VERSION });
      const res = await exportBackupFile(serialized, dayKey(nowTs()));
      feedback("success", "success");
      analytics.track("backup_created");
      toast(res === "shared" ? "Backup ready to save or share" : "Backup saved to the app folder");
    } catch {
      feedback("error", "error");
      toast("Couldn't export — try again");
    } finally {
      setBusy(false);
    }
  };

  const applyRestore = (raw: string, source: string) => {
    const preview = previewRestore(raw);
    if (!preview.ok || !preview.counts) {
      feedback("error", "error");
      const msg =
        preview.error === "corrupt"
          ? "The file is damaged. Your current data is unchanged."
          : preview.error === "too_new"
            ? "This backup was made by a newer version of Sugar Plate. Update the app first, then restore. Your current data is unchanged."
            : "That doesn't look like a complete Sugar Plate backup. Your current data is unchanged.";
      Alert.alert("Can't read that backup", msg);
      return;
    }
    // Spell out exactly what the restore would drop compared with what's on the phone right now, so a
    // restore of an older snapshot is never a silent data loss.
    const loss = lossSummary(live, preview.counts);
    const lossLine = loss ? `\n\n${loss}` : "";
    Alert.alert(
      "Restore this backup?",
      `${source}\n\n${countLine(preview.counts)}\n\nThis replaces what's on this phone now (${live.total} entries). We back up your current data first, and you can undo straight after.${lossLine}`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Restore",
          onPress: () => {
            // Snapshot the current state AND hold on to it, so a restore can be undone in one tap.
            const prevState: AppState = data;
            snapshotsStore.set((prev) => rollSnapshots(asSnapshotList(prev), makeSnapshot(prevState, nowTs())));
            // Migration-verified restore: an older-schema backup is forward-migrated and count-checked
            // first; if verification fails (or the file won't parse) we ABORT and keep the current data.
            const { state, verification, migrated } = restoreBackup(raw, nowTs());
            if (!state || !verification.ok) {
              feedback("error", "error");
              toast("Restore cancelled — your data is unchanged");
              return;
            }
            sugarStore.set(state);
            feedback("success", "success");
            analytics.track("restore_completed");
            const after = countEntries(state);
            toast(
              `Restored · ${after.total} entries${migrated ? " (upgraded)" : " verified"}`,
              { label: "Undo restore", onPress: () => { sugarStore.set(prevState); feedback("pop", "warning"); toast(`Restore undone · ${live.total} entries back`); } },
            );
          },
        },
      ],
    );
  };

  const restoreFromFile = async () => {
    setBusy(true);
    try {
      const text = await pickBackupText();
      if (text) applyRestore(text, "From file");
    } catch {
      feedback("error", "error");
      toast("Couldn't open that file");
    } finally {
      setBusy(false);
    }
  };

  const restoreSnap = (s: Snapshot) => applyRestore(s.data, `Snapshot from ${formatDateTime(s.ts)}`);

  return (
    <SubScreen title="Backup & restore" subtitle="Your data survives a phone change" onBack={onBack} bottomInset={bottomInset}>
      <Card>
        <View style={styles.head}>
          <View>
            <Text style={[type.number, { fontSize: 26 }]}>{live.total}</Text>
            <Text style={type.caption}>entries on this phone</Text>
          </View>
          <Icon name="shield" size={30} color={palette.primary} />
        </View>
        <Text style={[type.caption, { marginTop: space.xs }]}>{countLine(live)}</Text>
      </Card>

      <Button label="Back up now" size="lg" icon="cloud" onPress={backupNow} />
      <Button label="Export backup file" variant="secondary" icon="download" loading={busy} onPress={exportFile} />
      <Button label="Restore from a file" variant="secondary" icon="history" loading={busy} onPress={restoreFromFile} />

      <Text style={[type.label, { marginTop: space.sm }]}>LOCAL SNAPSHOTS · LAST 7 DAYS</Text>
      <Text style={[type.caption, { color: palette.inkSoft }]}>
        {snaps.length ? `Automatic daily backup · last run ${formatDateTime(snaps[0].ts)}` : "An automatic backup is taken each day you open the app."}
      </Text>
      {snaps.length === 0 ? (
        <Card>
          <EmptyState icon="cloud" title="No snapshots yet" body="Tap “Back up now” to make one. Snapshots are also taken automatically each day and before any update." />
        </Card>
      ) : (
        <View style={{ gap: space.sm }}>
          {snaps.map((s) => (
            <Card key={s.id} padded={false} style={styles.row}>
              <View style={styles.rowMain}>
                <View style={styles.iconWrap}><Icon name="cloud" size={18} color={palette.primary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={type.bodyStrong}>{formatDateTime(s.ts)}</Text>
                  <Text style={type.caption}>{s.counts.total} entries</Text>
                </View>
                <Pill label={`v${s.schemaVersion}`} tone="neutral" />
              </View>
              <Button label="Restore" variant="ghost" size="sm" onPress={() => restoreSnap(s)} style={{ marginRight: space.sm }} />
            </Card>
          ))}
        </View>
      )}
      <Text style={[type.caption, { textAlign: "center" }]}>Before any data migration we snapshot first and verify the entry counts — a mismatch rolls back automatically.</Text>
    </SubScreen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  row: { flexDirection: "row", alignItems: "center" },
  rowMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, minHeight: 60 },
  iconWrap: { width: 36, height: 36, borderRadius: 10, backgroundColor: palette.primarySoft, alignItems: "center", justifyContent: "center" },
});
