import { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import Animated, { LinearTransition } from "react-native-reanimated";
import {
  Button, Card, EmptyState, Icon, IconButton, Segmented, Sheet, Tappable, TextField, feedback, palette, radius, space, toast, type,
} from "../ui";
import { useSugar, sugarStore } from "../core/data";
import {
  addMedication, logMedication, deleteMedication, deleteMedLog, medicationsFor, defaultDoseUnit, type MedError,
} from "../core/medications";
import { liveMedLogs, MED_TYPES, type Medication, type MedType } from "../core/model";
import { analytics } from "../modules/analytics";
import { SubScreen, DateTimeField, formatDateTime, nowTs } from "./shared";

const TYPE_LABEL: Record<MedType, string> = { pill: "Pill", insulin: "Insulin", injectable: "Injectable", other: "Other" };
const MED_ERROR: Record<MedError, string> = { empty_name: "Give the medication a name.", duplicate: "You already have one with this name.", bad_dose: "Enter a valid dose." };

export function MedicationsScreen({ bottomInset, onBack }: { bottomInset: number; onBack: () => void }) {
  const data = useSugar();
  const meds = medicationsFor(data);
  const logs = liveMedLogs(data).slice().reverse();
  const [addOpen, setAddOpen] = useState(false);
  const [logFor, setLogFor] = useState<Medication | null>(null);

  const removeMed = (m: Medication) =>
    Alert.alert("Delete medication?", `Remove "${m.name}" from your saved list? Past logged doses stay in your history.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => { sugarStore.set(deleteMedication(data, m.id)); feedback("pop", "warning"); toast("Medication removed"); } },
    ]);

  const removeLog = (id: string) => {
    const snapshot = data;
    sugarStore.set(deleteMedLog(data, id, nowTs()));
    feedback("pop", "warning");
    toast("Dose removed", { label: "Undo", onPress: () => sugarStore.set(snapshot) });
  };

  return (
    <>
      <SubScreen
        title="Medication"
        subtitle="Log doses — no dose advice, ever"
        onBack={onBack}
        bottomInset={bottomInset}
        right={<IconButton icon="plus" label="Add medication" tone="primary" onPress={() => setAddOpen(true)} />}
      >
        {meds.length === 0 && logs.length === 0 ? (
          <Card>
            <EmptyState
              icon="pill"
              title="No medications yet"
              body="Save your medications or insulin for one-tap logging. We record what you took and when — never a dose recommendation."
              action={<Button label="Add a medication" icon="plus" onPress={() => setAddOpen(true)} />}
            />
          </Card>
        ) : null}

        {meds.length ? (
          <>
            <Text style={type.label}>SAVED · TAP TO LOG A DOSE</Text>
            <View style={{ gap: space.sm }}>
              {meds.map((m) => (
                <Card key={m.id} padded={false} style={styles.row}>
                  <Tappable label={`Log ${m.name}`} onPress={() => setLogFor(m)} style={styles.rowMain}>
                    <View style={styles.iconWrap}><Icon name="pill" size={18} color={palette.primary} /></View>
                    <View style={{ flex: 1 }}>
                      <Text style={type.bodyStrong}>{m.name}</Text>
                      <Text style={type.caption}>{TYPE_LABEL[m.type]} · {m.defaultDose} {m.doseUnit}</Text>
                    </View>
                    <Icon name="plus" size={20} color={palette.primary} />
                  </Tappable>
                  <IconButton icon="trash" label={`Delete ${m.name}`} tone="danger" size={38} onPress={() => removeMed(m)} style={{ marginRight: space.sm }} />
                </Card>
              ))}
            </View>
          </>
        ) : null}

        {logs.length ? (
          <>
            <Text style={[type.label, { marginTop: space.md }]}>RECENT DOSES</Text>
            <View style={{ gap: space.sm }}>
              {logs.slice(0, 30).map((l) => (
                <Animated.View key={l.id} layout={LinearTransition.duration(160)}>
                  <Card padded={false} style={styles.row}>
                    <View style={styles.rowMain}>
                      <View style={[styles.iconWrap, { backgroundColor: palette.surfaceAlt }]}><Icon name="pill" size={18} color={palette.inkSoft} /></View>
                      <View style={{ flex: 1 }}>
                        <Text style={type.bodyStrong}>{l.name}</Text>
                        <Text style={type.caption}>{formatDateTime(l.ts)}{l.note ? ` · ${l.note}` : ""}</Text>
                      </View>
                      <Text style={type.amount}>{l.dose} {l.doseUnit}</Text>
                    </View>
                    <IconButton icon="trash" label="Delete dose" tone="danger" size={38} onPress={() => removeLog(l.id)} style={{ marginRight: space.sm }} />
                  </Card>
                </Animated.View>
              ))}
            </View>
          </>
        ) : null}

        <Text style={[type.caption, { textAlign: "center" }]}>Sugar Plate never calculates or recommends doses. Follow your own care plan.</Text>
      </SubScreen>

      {addOpen ? <AddMedSheet onClose={() => setAddOpen(false)} /> : null}
      {logFor ? <LogDoseSheet med={logFor} onClose={() => setLogFor(null)} /> : null}
    </>
  );
}

function AddMedSheet({ onClose }: { onClose: () => void }) {
  const data = useSugar();
  const [name, setName] = useState("");
  const [mtype, setMtype] = useState<MedType>("pill");
  const [dose, setDose] = useState("");
  const [unit, setUnit] = useState("");
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    const res = addMedication(data, { name, type: mtype, defaultDose: Number(dose) || 0, doseUnit: unit.trim() || defaultDoseUnit(mtype) });
    if (res.error) { feedback("error", "error"); return setError(MED_ERROR[res.error]); }
    sugarStore.set(res.state);
    feedback("success", "success");
    toast(`${name.trim()} saved — tap it to log a dose`);
    onClose();
  };
  return (
    <Sheet visible title="Add medication" onClose={onClose} headerAction={<Button label="Save" size="sm" icon="check" onPress={save} />}>
      <TextField label="Name" placeholder="e.g. Metformin, Lantus" value={name} onChangeText={(t) => { setName(t); setError(null); }} error={error} maxLength={40} autoFocus />
      <Text style={type.label}>TYPE</Text>
      <Segmented options={MED_TYPES.map((t) => ({ value: t, label: TYPE_LABEL[t] }))} value={mtype} onChange={(t) => { setMtype(t); if (!unit) setUnit(defaultDoseUnit(t)); }} />
      <View style={styles.doseRow}>
        <View style={{ flex: 1 }}><TextField label="Default dose" placeholder="e.g. 500" keyboardType="decimal-pad" value={dose} onChangeText={setDose} /></View>
        <View style={{ flex: 1 }}><TextField label="Unit" placeholder={defaultDoseUnit(mtype)} value={unit} onChangeText={setUnit} /></View>
      </View>
      <Button label="Save medication" size="lg" icon="check" onPress={save} />
    </Sheet>
  );
}

function LogDoseSheet({ med, onClose }: { med: Medication; onClose: () => void }) {
  const data = useSugar();
  // Start empty (no stray default typed into the field) — the usual dose shows as a
  // placeholder and is used automatically if the field is left blank.
  const [dose, setDose] = useState("");
  const [note, setNote] = useState("");
  const [ts, setTs] = useState(nowTs());
  const [whenOpen, setWhenOpen] = useState(false);

  const save = () => {
    const amount = Number(dose) || med.defaultDose || 0;
    const res = logMedication(data, { medicationId: med.id, dose: amount, ts, note: note.trim() }, nowTs());
    if (res.error) { feedback("error", "error"); return; }
    sugarStore.set(res.state);
    feedback("success", "success");
    analytics.track("core_action", { feature: "medication_logged" });
    toast(`Logged ${med.name} · ${amount} ${med.doseUnit}`);
    onClose();
  };
  return (
    <Sheet visible title={`Log ${med.name}`} onClose={onClose} headerAction={<Button label="Save" size="sm" icon="check" onPress={save} />}>
      <View style={styles.doseRow}>
        <View style={{ flex: 1 }}>
          <TextField
            label={`Dose (${med.doseUnit})`}
            placeholder={med.defaultDose ? String(med.defaultDose) : `Enter dose in ${med.doseUnit}`}
            keyboardType="decimal-pad"
            value={dose}
            onChangeText={setDose}
          />
        </View>
      </View>
      <Tappable label="Change time" role="button" sound="pop" onPress={() => setWhenOpen(true)} style={styles.whenChip}>
        <Icon name="clock" size={16} color={palette.inkSoft} />
        <Text style={type.label}>{formatDateTime(ts)}</Text>
      </Tappable>
      <TextField label="Note (optional)" placeholder="e.g. with breakfast" value={note} onChangeText={setNote} maxLength={1000} />
      <Button label="Save dose" size="lg" icon="check" onPress={save} />
      <Sheet visible={whenOpen} title="When was this dose?" onClose={() => setWhenOpen(false)}>
        <DateTimeField ts={ts} onChange={setTs} />
        <Button label="Done" size="lg" onPress={() => setWhenOpen(false)} />
      </Sheet>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  rowMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, minHeight: 64 },
  iconWrap: { width: 36, height: 36, borderRadius: 10, backgroundColor: palette.primarySoft, alignItems: "center", justifyContent: "center" },
  doseRow: { flexDirection: "row", gap: space.md },
  whenChip: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: palette.border, alignSelf: "flex-start" },
});
