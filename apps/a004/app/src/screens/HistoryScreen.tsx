import { memo, useMemo, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import Animated, { LinearTransition } from "react-native-reanimated";
import {
  Button, Card, EmptyState, Icon, IconButton, Pill, Screen, Segmented, Sheet, TextField, Tappable,
  feedback, palette, radius, space, toast, type,
} from "../ui";
import { art } from "../art";
import { useSugar, sugarStore } from "../core/data";
import {
  activeProfile, liveReadings, liveMeals, liveMedLogs, CONTEXT_LABEL, SLOT_LABEL, GI_LABEL,
  type Reading, type Meal, type MedLog, type Context,
} from "../core/model";
import {
  classifyReading, editReading, deleteReading, restoreReading, bulkDeleteReadings, validateReading,
} from "../core/readings";
import { deleteMeal } from "../core/meals";
import { MealEditor } from "./MealsScreen";
import { mealLabel } from "../core/insights";
import { deleteMedLog } from "../core/medications";
import { formatValue, parseValue, valueWarning, UNIT_LABEL } from "../core/units";
import { dayKey } from "../core/dates";
import { Keypad, applyKey, ContextPicker, DateTimeField, nowTs, relativeDay, levelColor, levelIcon } from "./shared";

type Filter = "all" | "readings" | "meals" | "meds";
type Entry = { ts: number; kind: "reading"; r: Reading } | { ts: number; kind: "meal"; m: Meal } | { ts: number; kind: "med"; l: MedLog };

/** History: searchable, filterable timeline with edit, delete + undo and bulk delete. */
export function HistoryScreen({ bottomInset, onPro }: { bottomInset: number; onPro: (from: string) => void }) {
  const data = useSugar();
  const profile = activeProfile(data);

  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [edit, setEdit] = useState<Reading | null>(null);
  const [mealDetail, setMealDetail] = useState<Meal | null>(null);
  const [mealEdit, setMealEdit] = useState<Meal | null>(null);
  const [medDetail, setMedDetail] = useState<MedLog | null>(null);

  const entries = useMemo<Entry[]>(() => {
    const term = q.trim().toLowerCase();
    const out: Entry[] = [];
    if (filter === "all" || filter === "readings")
      for (const r of liveReadings(data))
        if (!term || r.note.toLowerCase().includes(term) || CONTEXT_LABEL[r.context].toLowerCase().includes(term))
          out.push({ ts: r.ts, kind: "reading", r });
    if (filter === "all" || filter === "meals")
      for (const m of liveMeals(data))
        if (!term || mealLabel(m).toLowerCase().includes(term) || m.items.some((i) => i.name.toLowerCase().includes(term)) || m.note.toLowerCase().includes(term))
          out.push({ ts: m.ts, kind: "meal", m });
    if (filter === "all" || filter === "meds")
      for (const l of liveMedLogs(data))
        if (!term || l.name.toLowerCase().includes(term) || l.note.toLowerCase().includes(term))
          out.push({ ts: l.ts, kind: "med", l });
    return out.sort((a, b) => b.ts - a.ts);
  }, [data, q, filter]);

  // Group by day for section headers.
  const groups = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const e of entries) {
      const k = dayKey(e.ts);
      (map.get(k) ?? map.set(k, []).get(k)!).push(e);
    }
    return Array.from(map.entries());
  }, [entries]);

  const toggleSel = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // Open an IN-APP confirm (a JS-rendered Sheet, not a native Alert.alert — the on-device tester
  // never saw/tapped the native dialog, so bulk delete read as "nothing happens"). The Sheet shows
  // real Buttons the tester can see and tap, then the rows visibly disappear with an Undo toast.
  const askBulkDelete = () => {
    if (!selected.size) return;
    feedback("pop", "light");
    setConfirmBulk(true);
  };

  const doBulkDelete = () => {
    const ids = [...selected];
    if (!ids.length) { setConfirmBulk(false); return; }
    const snapshot = data;
    const now = nowTs();
    const rSet = new Set(liveReadings(data).map((r) => r.id));
    const mSet = new Set(liveMeals(data).map((m) => m.id));
    const lSet = new Set(liveMedLogs(data).map((l) => l.id));
    // Delete readings in one pass, then meals and med logs individually.
    let next = bulkDeleteReadings(data, ids.filter((id) => rSet.has(id)), now);
    for (const id of ids) {
      if (mSet.has(id)) next = deleteMeal(next, id, now);
      else if (lSet.has(id)) next = deleteMedLog(next, id, now);
    }
    sugarStore.set(next);
    feedback("pop", "warning");
    setSelected(new Set());
    setSelectMode(false);
    setConfirmBulk(false);
    // Toast fires from the app-level host once the Sheet has closed, so Undo is never hidden behind it.
    toast(`${ids.length} deleted`, { label: "Undo", onPress: () => sugarStore.set(snapshot) });
  };

  const delReading = (r: Reading) => {
    sugarStore.set(deleteReading(data, r.id, nowTs()));
    feedback("pop", "warning");
    toast("Reading deleted", { label: "Undo", onPress: () => sugarStore.set((s) => restoreReading(s, r.id, nowTs())) });
  };
  const delMeal = (m: Meal) => {
    const snapshot = data;
    sugarStore.set(deleteMeal(data, m.id, nowTs()));
    feedback("pop", "warning");
    toast("Meal deleted", { label: "Undo", onPress: () => sugarStore.set(snapshot) });
  };
  const delMed = (l: MedLog) => {
    const snapshot = data;
    sugarStore.set(deleteMedLog(data, l.id, nowTs()));
    feedback("pop", "warning");
    toast("Entry deleted", { label: "Undo", onPress: () => sugarStore.set(snapshot) });
  };

  const total = liveReadings(data).length + liveMeals(data).length + liveMedLogs(data).length;

  return (
    <>
      <Screen
        title="History"
        subtitle={`${total} entr${total === 1 ? "y" : "ies"} · search is always free`}
        bottomInset={bottomInset}
        right={
          total ? (
            <Button
              label={selectMode ? "Done" : "Select"}
              variant="ghost"
              size="sm"
              onPress={() => { setSelectMode((v) => !v); setSelected(new Set()); }}
            />
          ) : undefined
        }
      >
        <TextField label="" placeholder="Search notes, foods, medications…" value={q} onChangeText={setQ} />
        <Segmented
          options={[
            { value: "all", label: "All" },
            { value: "readings", label: "Sugar" },
            { value: "meals", label: "Meals" },
            { value: "meds", label: "Meds" },
          ]}
          value={filter}
          onChange={(f) => setFilter(f as Filter)}
        />

        {selectMode ? (
          <Button label={selected.size ? `Delete ${selected.size} selected` : "Tap entries to select"} variant="danger" icon="trash" disabled={!selected.size} onPress={askBulkDelete} />
        ) : null}

        {entries.length === 0 ? (
          <Card>
            <EmptyState
              art={art.empty_history}
              title={q ? "No matches" : "Your log is empty"}
              body={q ? "Try a different search term." : "Readings, meals and medications you log will show up here — fully editable, forever."}
            />
          </Card>
        ) : (
          groups.map(([day, items]) => (
            <View key={day} style={{ gap: space.sm }}>
              <Text style={[type.label, styles.dayHead]}>{relativeDay(dayKeyToMid(day), nowTs()).toUpperCase()}</Text>
              {items.map((e) => (
                <Animated.View key={entryKey(e)} layout={LinearTransition.duration(160)}>
                  {e.kind === "reading" ? (
                    <ReadingRow
                      e={e.r}
                      profile={profile}
                      selectMode={selectMode}
                      selected={selected.has(e.r.id)}
                      onToggle={() => toggleSel(e.r.id)}
                      onEdit={() => setEdit(e.r)}
                      onDelete={() => delReading(e.r)}
                    />
                  ) : e.kind === "meal" ? (
                    <MealRow
                      m={e.m}
                      selectMode={selectMode}
                      selected={selected.has(e.m.id)}
                      onToggle={() => toggleSel(e.m.id)}
                      onOpen={() => { feedback("pop", "light"); setMealDetail(e.m); }}
                      onDelete={() => delMeal(e.m)}
                    />
                  ) : (
                    <MedRow
                      l={e.l}
                      selectMode={selectMode}
                      selected={selected.has(e.l.id)}
                      onToggle={() => toggleSel(e.l.id)}
                      onOpen={() => { feedback("pop", "light"); setMedDetail(e.l); }}
                      onDelete={() => delMed(e.l)}
                    />
                  )}
                </Animated.View>
              ))}
            </View>
          ))
        )}
      </Screen>

      {/* In-app bulk-delete confirm — a JS-rendered Sheet with real, tappable Buttons (the old native
          Alert.alert was invisible to the on-device tester, so "Delete N selected" read as dead). */}
      <Sheet visible={confirmBulk} title={`Delete ${selected.size} entr${selected.size === 1 ? "y" : "ies"}?`} onClose={() => setConfirmBulk(false)}>
        <Text style={type.body}>
          This removes the selected {selected.size === 1 ? "entry" : "entries"} from your log. You can undo for a few seconds.
        </Text>
        <Button label={`Delete ${selected.size} entr${selected.size === 1 ? "y" : "ies"}`} size="lg" variant="danger" icon="trash" onPress={doBulkDelete} />
        <Button label="Cancel" size="lg" variant="ghost" onPress={() => setConfirmBulk(false)} />
      </Sheet>

      {edit ? <ReadingEditSheet reading={edit} onClose={() => setEdit(null)} /> : null}
      {mealDetail ? (
        <MealDetailSheet
          meal={mealDetail}
          onEdit={() => { const m = mealDetail; setMealDetail(null); setMealEdit(m); }}
          onDelete={() => { delMeal(mealDetail); setMealDetail(null); }}
          onClose={() => setMealDetail(null)}
        />
      ) : null}
      {mealEdit ? (
        <MealEditor key={mealEdit.id} mode="edit" meal={mealEdit} onClose={() => setMealEdit(null)} onPro={onPro} />
      ) : null}
      {medDetail ? (
        <MedDetailSheet
          log={medDetail}
          onDelete={() => { delMed(medDetail); setMedDetail(null); }}
          onClose={() => setMedDetail(null)}
        />
      ) : null}
    </>
  );
}

function entryKey(e: Entry): string {
  return e.kind === "reading" ? e.r.id : e.kind === "meal" ? e.m.id : e.l.id;
}
function dayKeyToMid(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y, m - 1, d, 12, 0, 0, 0);
}
function timeOnly(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

// ── Rows ────────────────────────────────────────────────────────────────────────
// Memoised so a search keystroke / selection toggle only re-renders the rows that actually changed —
// a long timeline no longer re-lays-out every row on each render (keeps scroll jank down on low-end phones).
const ReadingRow = memo(function ReadingRow({ e, profile, selectMode, selected, onToggle, onEdit, onDelete }: {
  e: Reading; profile: ReturnType<typeof activeProfile>; selectMode: boolean; selected: boolean; onToggle: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const lvl = classifyReading(e, profile);
  const c = levelColor(lvl.level);
  const unit = profile.unit;
  return (
    <Card padded={false} style={styles.row} accent={c}>
      <Tappable label={`${CONTEXT_LABEL[e.context]} ${formatValue(e.valueMgdl, unit)}, ${lvl.label}`} onPress={selectMode ? onToggle : onEdit} style={styles.rowMain}>
        {selectMode ? (
          <View style={[styles.checkbox, selected && { backgroundColor: palette.primary, borderColor: palette.primary }]}>
            {selected ? <Icon name="check" size={16} color={palette.onPrimary} /> : null}
          </View>
        ) : (
          <View style={[styles.rowDot, { backgroundColor: c + "22" }]}>
            <Icon name={levelIcon(lvl)} size={16} color={c} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <View style={styles.readingTitle}>
            <Text style={type.bodyStrong} numberOfLines={1}>{CONTEXT_LABEL[e.context]} · {lvl.label}</Text>
            {e.source === "ble" ? <Pill label="Bluetooth" tone="primary" icon={<Icon name="link" size={11} color={palette.primary} />} /> : null}
          </View>
          <Text style={type.caption} numberOfLines={1}>{timeOnly(e.ts)}{e.note ? ` · ${e.note}` : ""}{e.mealId ? " · linked to a meal" : ""}</Text>
        </View>
        <Text style={[type.number, { fontSize: 20 }]}>{formatValue(e.valueMgdl, unit)}</Text>
      </Tappable>
      {!selectMode ? <IconButton icon="trash" label="Delete reading" size={34} onPress={onDelete} style={{ marginRight: space.sm }} /> : null}
    </Card>
  );
});

const MealRow = memo(function MealRow({ m, selectMode, selected, onToggle, onOpen, onDelete }: {
  m: Meal; selectMode: boolean; selected: boolean; onToggle: () => void; onOpen: () => void; onDelete: () => void;
}) {
  return (
    <Card padded={false} style={styles.row} accent={palette.accent}>
      <Tappable label={selectMode ? `${selected ? "Deselect" : "Select"} meal: ${mealLabel(m)}` : `View meal: ${mealLabel(m)}`} onPress={selectMode ? onToggle : onOpen} style={styles.rowMain}>
        {selectMode ? (
          <View style={[styles.checkbox, selected && { backgroundColor: palette.primary, borderColor: palette.primary }]}>
            {selected ? <Icon name="check" size={16} color={palette.onPrimary} /> : null}
          </View>
        ) : (
          <View style={[styles.rowDot, { backgroundColor: palette.primarySoft }]}>
            <Icon name="meal" size={16} color={palette.primary} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={type.bodyStrong} numberOfLines={1}>{mealLabel(m)}</Text>
          <Text style={type.caption} numberOfLines={1}>{timeOnly(m.ts)} · {SLOT_LABEL[m.slot]} · {GI_LABEL[m.giBand]} GI{m.note ? ` · ${m.note}` : ""}</Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={[type.number, { fontSize: 20 }]}>{m.carbsTotalG}</Text>
          <Text style={type.caption}>g</Text>
        </View>
      </Tappable>
      {!selectMode ? <IconButton icon="trash" label="Delete meal" size={34} onPress={onDelete} style={{ marginRight: space.sm }} /> : null}
    </Card>
  );
});

const MedRow = memo(function MedRow({ l, selectMode, selected, onToggle, onOpen, onDelete }: {
  l: MedLog; selectMode: boolean; selected: boolean; onToggle: () => void; onOpen: () => void; onDelete: () => void;
}) {
  return (
    <Card padded={false} style={styles.row} accent={palette.inkMuted}>
      <Tappable label={selectMode ? `${selected ? "Deselect" : "Select"} medication: ${l.name}` : `View medication: ${l.name}`} onPress={selectMode ? onToggle : onOpen} style={styles.rowMain}>
        {selectMode ? (
          <View style={[styles.checkbox, selected && { backgroundColor: palette.primary, borderColor: palette.primary }]}>
            {selected ? <Icon name="check" size={16} color={palette.onPrimary} /> : null}
          </View>
        ) : (
          <View style={[styles.rowDot, { backgroundColor: palette.surfaceAlt }]}>
            <Icon name="pill" size={16} color={palette.inkSoft} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={type.bodyStrong} numberOfLines={1}>{l.name}</Text>
          <Text style={type.caption}>{timeOnly(l.ts)}{l.note ? ` · ${l.note}` : ""}</Text>
        </View>
        <Text style={type.amount}>{l.dose} {l.doseUnit}</Text>
      </Tappable>
      {!selectMode ? <IconButton icon="trash" label="Delete medication log" size={34} onPress={onDelete} style={{ marginRight: space.sm }} /> : null}
    </Card>
  );
});

// ── Edit a reading (keypad) ────────────────────────────────────────────────────────
function ReadingEditSheet({ reading, onClose }: { reading: Reading; onClose: () => void }) {
  const data = useSugar();
  const profile = activeProfile(data);
  const unit = profile.unit;
  const [raw, setRaw] = useState(formatValue(reading.valueMgdl, unit));
  const [ctx, setCtx] = useState<Context>(reading.context);
  const [ts, setTs] = useState(reading.ts);
  const [note, setNote] = useState(reading.note);
  const [whenOpen, setWhenOpen] = useState(false);

  const save = () => {
    const mgdl = parseValue(raw, unit);
    if (mgdl == null) { feedback("error", "error"); return; }
    const err = validateReading({ valueMgdl: mgdl, ts });
    const apply = (force: boolean) => {
      const res = editReading(data, reading.id, { valueMgdl: mgdl, context: ctx, ts, note: note.trim() }, nowTs(), force);
      if (res.error) { feedback("error", "error"); return; }
      sugarStore.set(res.state);
      feedback("success", "success");
      toast("Reading updated");
      onClose();
    };
    if (err || valueWarning(mgdl, unit)) {
      Alert.alert("Check this value", `Save ${raw} ${UNIT_LABEL[unit]} anyway?`, [
        { text: "Cancel", style: "cancel" },
        { text: "Save anyway", onPress: () => apply(true) },
      ]);
      return;
    }
    apply(false);
  };

  return (
    <Sheet visible title="Edit reading" onClose={onClose}>
      <View style={styles.editValue}>
        <Text style={[type.hero, { fontSize: 44 }]}>{raw || "—"}</Text>
        <Text style={type.label}>{UNIT_LABEL[unit]}</Text>
      </View>
      <ContextPicker value={ctx} onChange={setCtx} />
      <Keypad onKey={(k) => setRaw((r) => applyKey(r, k))} onDelete={() => setRaw((r) => r.slice(0, -1))} decimal={unit === "mmol"} />
      <Tappable label="Change time" role="button" sound="pop" onPress={() => setWhenOpen(true)} style={styles.whenChip}>
        <Icon name="clock" size={16} color={palette.inkSoft} />
        <Text style={type.label}>{relativeDay(ts, nowTs())} · {timeOnly(ts)}</Text>
      </Tappable>
      <TextField label="Note" placeholder="Optional note" value={note} onChangeText={setNote} maxLength={1000} multiline />
      <Button label="Save changes" size="lg" icon="check" onPress={save} />
      <Sheet visible={whenOpen} title="When was this reading?" onClose={() => setWhenOpen(false)}>
        <DateTimeField ts={ts} onChange={setTs} />
        <Button label="Done" size="lg" onPress={() => setWhenOpen(false)} />
      </Sheet>
    </Sheet>
  );
}

// ── Meal detail ────────────────────────────────────────────────────────────────────
function MealDetailSheet({ meal, onEdit, onDelete, onClose }: { meal: Meal; onEdit: () => void; onDelete: () => void; onClose: () => void }) {
  return (
    <Sheet visible title="Meal details" onClose={onClose}>
      <View style={styles.detailHead}>
        <View style={[styles.rowDot, { backgroundColor: palette.primarySoft }]}>
          <Icon name="meal" size={16} color={palette.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={type.bodyStrong}>{mealLabel(meal)}</Text>
          <Text style={type.caption}>{SLOT_LABEL[meal.slot]} · {relativeDay(meal.ts, nowTs())} · {timeOnly(meal.ts)}</Text>
        </View>
      </View>

      <View style={styles.detailStats}>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}>
          <Text style={[type.number, { fontSize: 28 }]}>{meal.carbsTotalG}</Text>
          <Text style={type.label}>g carbs</Text>
        </View>
        <Pill label={`${GI_LABEL[meal.giBand]} GI`} />
      </View>

      <Card>
        {meal.items.length ? (
          meal.items.map((item, i) => (
            <View key={i} style={styles.detailItem}>
              <Text style={[type.body, { flex: 1 }]} numberOfLines={2}>{item.name} × {item.portion}</Text>
              <Text style={type.caption}>{item.carbsG} g</Text>
            </View>
          ))
        ) : (
          <Text style={type.caption}>No items recorded.</Text>
        )}
      </Card>

      {meal.note ? (
        <Card>
          <Text style={type.label}>Note</Text>
          <Text style={type.body}>{meal.note}</Text>
        </Card>
      ) : null}

      {meal.swapText ? (
        <Card>
          <Text style={type.label}>Smart swap</Text>
          <Text style={type.body}>{meal.swapText}</Text>
        </Card>
      ) : null}

      <Button label="Edit meal" size="lg" variant="secondary" icon="edit" onPress={onEdit} />
      <Button label="Delete meal" size="lg" variant="danger" icon="trash" onPress={onDelete} />
    </Sheet>
  );
}

// ── Read-only medication detail ─────────────────────────────────────────────────────
function MedDetailSheet({ log, onDelete, onClose }: { log: MedLog; onDelete: () => void; onClose: () => void }) {
  return (
    <Sheet visible title="Medication details" onClose={onClose}>
      <View style={styles.detailHead}>
        <View style={[styles.rowDot, { backgroundColor: palette.surfaceAlt }]}>
          <Icon name="pill" size={16} color={palette.inkSoft} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={type.bodyStrong}>{log.name}</Text>
          <Text style={type.caption}>{relativeDay(log.ts, nowTs())} · {timeOnly(log.ts)}</Text>
        </View>
      </View>

      <View style={styles.detailStats}>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}>
          <Text style={[type.number, { fontSize: 28 }]}>{log.dose}</Text>
          <Text style={type.label}>{log.doseUnit}</Text>
        </View>
      </View>

      {log.note ? (
        <Card>
          <Text style={type.label}>Note</Text>
          <Text style={type.body}>{log.note}</Text>
        </Card>
      ) : null}

      <Button label="Delete entry" size="lg" variant="danger" icon="trash" onPress={onDelete} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  dayHead: { marginTop: space.sm, letterSpacing: 0.6 },
  readingTitle: { flexDirection: "row", alignItems: "center", gap: space.sm, flexShrink: 1 },
  row: { flexDirection: "row", alignItems: "center" },
  rowMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.sm, paddingHorizontal: space.md, minHeight: 60 },
  rowDot: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  checkbox: { width: 26, height: 26, borderRadius: 7, borderWidth: 2, borderColor: palette.border, alignItems: "center", justifyContent: "center" },
  whenChip: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: palette.border, alignSelf: "flex-start" },
  editValue: { flexDirection: "row", alignItems: "baseline", justifyContent: "center", gap: space.sm },
  detailHead: { flexDirection: "row", alignItems: "center", gap: space.md },
  detailStats: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
  detailItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md, paddingVertical: 6 },
});
