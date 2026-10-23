import { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Button,
  Card,
  Chip,
  EmptyState,
  Fab,
  Icon,
  IconButton,
  ListItem,
  Screen,
  Sheet,
  Tappable,
  Toggle,
  TextField,
  feedback,
  fonts,
  palette,
  radius,
  space,
  toast,
  type,
} from "../ui";
import { useBannerHeight } from "../modules/layout";
import { art } from "../art";
import { type Template, BLOCK_COLORS, MAX_TITLE, STARTER_TEMPLATES } from "../core/model";
import { applyTemplate, createFromStarter, createTemplate, deleteTemplate, renameTemplate, saveDayAsTemplate } from "../core/templates";
import { WEEKDAY, dateKey, fmtDuration, toHHMM } from "../core/time";
import { blockDayStore, useBlockDay, useBlockDaySettings } from "../core/data";
import { analytics } from "../modules/analytics";
import { useKeyboardVisible } from "./helpers";

const BUILDER_DURATIONS = [30, 45, 60, 90] as const;
// Monday-first display order (WEEKDAY is Sun-indexed 0..6).
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

function daysLabel(days: number[]): string {
  if (!days.length) return "Any day";
  if (days.length === 7) return "Every day";
  return days.slice().sort().map((d) => WEEKDAY[d]).join(" · ");
}

/** Proportional colour strip previewing a routine's blocks across the day. */
function MiniTimeline({ template }: { template: Template }) {
  const blocks = template.blocks.slice().sort((a, b) => a.relativeStartMin - b.relativeStartMin);
  if (!blocks.length) return null;
  return (
    <View style={styles.mini} accessibilityLabel={`${blocks.length} blocks`}>
      {blocks.map((b, i) => (
        <View key={b.id} style={[styles.miniSeg, { flexGrow: Math.max(1, b.durationMin), backgroundColor: b.color, marginLeft: i === 0 ? 0 : 2 }]} />
      ))}
    </View>
  );
}

/** Mon–Sun chips, the days this routine suits highlighted. */
function DayChips({ days }: { days: number[] }) {
  const anyDay = days.length === 0;
  return (
    <View style={styles.dayChips} accessibilityLabel={anyDay ? "Any day" : daysLabel(days)}>
      {DAY_ORDER.map((d) => {
        const on = anyDay || days.includes(d);
        return (
          <View key={d} style={[styles.dayChip, on && styles.dayChipOn]}>
            <Text style={[styles.dayChipText, { color: on ? palette.onPrimary : palette.inkMuted }]}>{WEEKDAY[d][0]}</Text>
          </View>
        );
      })}
    </View>
  );
}

/** Templates / routines: create, apply, rename and delete reusable day plans. */
export function TemplatesScreen({ bottomInset }: { bottomInset: number }) {
  const data = useBlockDay();
  const insets = useSafeAreaInsets();
  const banner = useBannerHeight();
  const today = dateKey(new Date());
  const [selected, setSelected] = useState<Template | null>(null);
  const [sheet, setSheet] = useState<null | "new" | "details" | "saveDay" | "build">(null);

  const set = (next: typeof data, msg?: string) => {
    blockDayStore.set(next);
    if (msg) toast(msg);
  };

  const apply = (t: Template) => {
    const r = applyTemplate(data, t.id, today, "merge", "auto", today);
    feedback("success", "success");
    analytics.track("template_apply");
    set(r.state, `Applied “${t.name}” · +${r.added}${r.skipped ? ` · ${r.skipped} skipped` : ""}`);
    setSheet(null);
  };

  const makeStarter = (key: string) => {
    const starter = STARTER_TEMPLATES.find((s) => s.key === key)!;
    // If it already exists (e.g. created during onboarding) don't dead-end — open
    // it so the user can apply or tweak it instead of a silent "already have it".
    const existing = data.templates.find((t) => t.name.toLowerCase() === starter.name.toLowerCase());
    if (existing) {
      feedback("pop", "light");
      setSelected(existing);
      setSheet("details");
      return;
    }
    const made = createFromStarter(data, starter, today);
    if (made.error) { feedback("error", "error"); return toast("Couldn’t create that routine"); }
    feedback("success", "success");
    analytics.track("template_create");
    set(made.state, `Created “${starter.name}” · apply it to any day`);
    setSheet(null);
  };

  const hasTodayBlocks = data.blocks.some((b) => b.date === today);

  return (
    <>
      <Screen
        title="Routines"
        subtitle="Reusable day plans"
        bottomInset={bottomInset + 76}
      >
        {data.templates.length === 0 ? (
          <Card>
            <EmptyState
              art={art.empty_templates}
              title="Save a routine to plan faster"
              body="Build a day once, then apply it with two taps. Start from a ready-made routine or save a day you’ve already planned."
              action={<Button label="Create a routine" icon="layers" onPress={() => setSheet("new")} />}
            />
          </Card>
        ) : (
          <View style={{ gap: space.md }}>
            {data.templates.map((t) => {
              const totalMin = t.blocks.reduce((s, b) => s + b.durationMin, 0);
              return (
                <Card key={t.id} padded={false} style={styles.tpl}>
                  <Tappable label={`${t.name}, ${t.blocks.length} blocks, ${daysLabel(t.daysOfWeek)}`} onPress={() => { setSelected(t); setSheet("details"); }} scale={0.995} style={styles.tplMain}>
                    <View style={styles.tplHead}>
                      <View style={{ flex: 1 }}>
                        <Text style={type.heading} numberOfLines={1}>{t.name}</Text>
                        <Text style={type.caption}>{t.blocks.length} blocks · {fmtDuration(totalMin)}</Text>
                      </View>
                      <Icon name="chevronRight" size={20} color={palette.inkMuted} />
                    </View>
                    <MiniTimeline template={t} />
                    <DayChips days={t.daysOfWeek} />
                  </Tappable>
                  <View style={styles.tplFoot}>
                    <Button label="Apply to today" icon="check" onPress={() => apply(t)} style={{ flex: 1 }} />
                  </View>
                </Card>
              );
            })}
          </View>
        )}
      </Screen>

      <Fab
        bottom={bottomInset + banner + insets.bottom}
        actions={[{ icon: "plus", label: "New routine", onPress: () => setSheet("new") }]}
      />

      {/* New routine */}
      <Sheet visible={sheet === "new"} title="New routine" onClose={() => setSheet(null)}>
        <Text style={[type.body, { color: palette.inkSoft }]}>Build your own, start from a ready-made routine, or save the plan you’ve built on Today.</Text>
        <View style={{ gap: space.sm }}>
          <ListItem icon="plus" iconTint={palette.primary} title="Build a routine" subtitle="Add your own blocks from scratch" onPress={() => setSheet("build")} />
          {STARTER_TEMPLATES.map((s) => (
            <ListItem key={s.key} icon="layers" title={s.name} subtitle={`${s.blocks.length} blocks`} onPress={() => makeStarter(s.key)} />
          ))}
          <ListItem
            icon="download"
            title="Save today’s plan"
            subtitle={hasTodayBlocks ? "Turn today’s blocks into a routine" : "Add blocks on Today first"}
            onPress={() => { if (!hasTodayBlocks) return toast("Add some blocks on Today first"); setSheet("saveDay"); }}
          />
        </View>
      </Sheet>

      <BuildRoutineSheet visible={sheet === "build"} onClose={() => setSheet(null)} />
      <SaveDaySheet visible={sheet === "saveDay"} onClose={() => setSheet(null)} />
      <TemplateDetailsSheet template={selected} visible={sheet === "details"} onApply={apply} onClose={() => setSheet(null)} />
    </>
  );
}

function SaveDaySheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const data = useBlockDay();
  const today = dateKey(new Date());
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (visible) { setName(""); setErr(null); } }, [visible]);
  const save = () => {
    const r = saveDayAsTemplate(data, today, name, today);
    if (r.error) return setErr(r.error === "duplicate" ? "You already have a routine with that name." : r.error === "no_blocks" ? "There are no blocks to save." : "Give the routine a name.");
    feedback("success", "success");
    analytics.track("template_create");
    blockDayStore.set(r.state);
    toast("Routine saved");
    onClose();
  };
  return (
    <Sheet visible={visible} title="Save today as a routine" onClose={onClose}>
      <TextField label="Routine name" placeholder="e.g. My Workday" value={name} onChangeText={(t) => { setName(t); setErr(null); }} error={err} autoFocus maxLength={MAX_TITLE} />
      <Button label="Save routine" size="lg" icon="check" onPress={save} />
    </Sheet>
  );
}

/** Build a brand-new routine from scratch — starts with three blocks so it's an (almost) one-tap create. */
function BuildRoutineSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const data = useBlockDay();
  const s = useBlockDaySettings();
  const kbVisible = useKeyboardVisible();
  const today = dateKey(new Date());
  const [name, setName] = useState("");
  const [rows, setRows] = useState<{ title: string; durationMin: number }[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      // Pre-fill a sensible name so the primary Save never dead-ends on a blank
      // field — the user can rename it, but a first-time tap always creates.
      setName("My routine");
      setErr(null);
      setRows([
        { title: "Morning focus", durationMin: 90 },
        { title: "Break", durationMin: 30 },
        { title: "Deep work", durationMin: 60 },
      ]);
    }
  }, [visible]);

  const setRow = (i: number, patch: Partial<{ title: string; durationMin: number }>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRow = () => { feedback("pop", "light"); setRows((rs) => [...rs, { title: "", durationMin: s.defaultDurationMin }]); };
  const removeRow = (i: number) => { feedback("pop", "light"); setRows((rs) => rs.filter((_, idx) => idx !== i)); };

  const named = rows.filter((r) => r.title.trim());
  const totalMin = named.reduce((sum, r) => sum + r.durationMin, 0);

  const save = () => {
    if (!named.length) {
      const msg = "Add at least one block with a title.";
      feedback("error", "error");
      toast(msg); // visible above the keyboard, where the inline hint can be hidden
      return setErr(msg);
    }
    let start = s.workStart;
    const blocks = named.map((r, i) => {
      const b = {
        title: r.title.trim(),
        color: BLOCK_COLORS[i % BLOCK_COLORS.length],
        tags: [] as string[],
        durationMin: r.durationMin,
        remindersMin: [0],
        relativeStartMin: start,
      };
      start += r.durationMin;
      return b;
    });
    const r = createTemplate(data, { name, blocks }, today);
    if (r.error) {
      feedback("error", "error");
      const msg = r.error === "duplicate" ? "You already have a routine with that name." : r.error === "too_long" ? "That name is too long." : "Give the routine a name.";
      toast(msg);
      return setErr(msg);
    }
    feedback("success", "success");
    analytics.track("template_create");
    blockDayStore.set(r.state);
    toast(`Routine “${name.trim()}” created · ${blocks.length} blocks`);
    onClose();
  };

  return (
    <Sheet
      visible={visible}
      title="Build a routine"
      onClose={onClose}
      headerAction={kbVisible ? <Button label="Save" size="sm" icon="check" onPress={save} style={styles.headerBtn} /> : undefined}
    >
      <ScrollView style={{ maxHeight: 340 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator>
        <View style={{ gap: space.lg, paddingBottom: space.sm }}>
          <Text style={[type.caption, { color: palette.inkSoft }]}>Ready to go — tweak the blocks below, then save. You can apply it to any day in two taps.</Text>
          <TextField label="Routine name" placeholder="e.g. My Workday" value={name} onChangeText={(t) => { setName(t); setErr(null); }} maxLength={MAX_TITLE} />
          <View style={{ gap: space.sm }}>
            <Text style={type.label}>Blocks{named.length ? ` · ${fmtDuration(totalMin)} total` : ""}</Text>
            {rows.map((r, i) => (
              <View key={i} style={styles.buildRow}>
                <View style={[styles.buildBar, { backgroundColor: BLOCK_COLORS[i % BLOCK_COLORS.length] }]} />
                <View style={{ flex: 1, gap: space.sm }}>
                  <TextField label={`Block ${i + 1}`} placeholder="What is it?" value={r.title} onChangeText={(t) => { setRow(i, { title: t }); setErr(null); }} maxLength={MAX_TITLE} />
                  <View style={styles.buildDurs}>
                    {BUILDER_DURATIONS.map((d) => (
                      <Chip key={d} label={fmtDuration(d)} selected={r.durationMin === d} onPress={() => setRow(i, { durationMin: d })} />
                    ))}
                  </View>
                </View>
                <IconButton icon="trash" label={`Remove block ${i + 1}`} size={40} onPress={() => removeRow(i)} />
              </View>
            ))}
            <Button label="Add a block" icon="plus" variant="secondary" onPress={addRow} />
          </View>
          {err ? <Text style={[type.caption, { color: palette.danger }]}>{err}</Text> : null}
        </View>
      </ScrollView>
      {!kbVisible ? <Button label={`Save routine${named.length ? ` · ${named.length} block${named.length === 1 ? "" : "s"}` : ""}`} size="lg" icon="check" onPress={save} /> : null}
    </Sheet>
  );
}

function TemplateDetailsSheet({ template, visible, onApply, onClose }: { template: Template | null; visible: boolean; onApply: (t: Template) => void; onClose: () => void }) {
  const data = useBlockDay();
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const today = dateKey(new Date());
  // Always read the freshest copy (rename/edits).
  const t = template ? data.templates.find((x) => x.id === template.id) ?? template : null;
  useEffect(() => { if (visible && t) { setName(t.name); setErr(null); } }, [visible, t?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!t) return null;

  const rename = () => {
    if (name.trim() === t.name) return toast("Name unchanged");
    const r = renameTemplate(data, t.id, name, today);
    if (r.error) return setErr(r.error === "duplicate" ? "Another routine has that name." : r.error === "empty_name" ? "Give it a name." : "Name is too long.");
    feedback("success", "success");
    blockDayStore.set(r.state);
    toast("Renamed");
  };
  const toggleStack = (v: boolean) => {
    blockDayStore.set({ ...data, templates: data.templates.map((x) => (x.id === t.id ? { ...x, stackable: v } : x)) });
  };
  const del = () => {
    Alert.alert("Delete routine?", `“${t.name}” will be removed. Days you’ve already planned with it aren’t affected.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => { feedback("pop", "warning"); blockDayStore.set(deleteTemplate(data, t.id)); toast("Routine deleted"); onClose(); } },
    ]);
  };

  return (
    <Sheet visible={visible} title="Routine" onClose={onClose}>
      <TextField label="Name" value={name} onChangeText={(v) => { setName(v); setErr(null); }} error={err} onBlur={rename} maxLength={MAX_TITLE} />
      <Toggle label="Stackable" description="Allow applying on top of another routine" value={t.stackable} onChange={toggleStack} />
      <Text style={type.label}>Blocks</Text>
      <ScrollView style={{ maxHeight: 240 }} showsVerticalScrollIndicator={false}>
        <View style={{ gap: space.xs }}>
          {t.blocks.slice().sort((a, b) => a.relativeStartMin - b.relativeStartMin).map((b) => (
            <View key={b.id} style={styles.tplBlock}>
              <View style={[styles.tplDot, { backgroundColor: b.color }]} />
              <Text style={[type.caption, { width: 48 }]}>{toHHMM(b.relativeStartMin)}</Text>
              <Text style={[type.body, { flex: 1 }]} numberOfLines={1}>{b.title}</Text>
              <Text style={type.caption}>{fmtDuration(b.durationMin)}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
      <Button label="Apply to today" size="lg" icon="check" onPress={() => onApply(t)} />
      <Button label="Delete routine" variant="danger" icon="trash" onPress={del} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  tpl: { overflow: "hidden" },
  tplMain: { gap: space.md, padding: space.lg, paddingBottom: space.md },
  tplHead: { flexDirection: "row", alignItems: "center", gap: space.md },
  mini: { flexDirection: "row", height: 12, borderRadius: 6, overflow: "hidden" },
  miniSeg: { flexBasis: 0, borderRadius: 3 },
  dayChips: { flexDirection: "row", gap: 6 },
  dayChip: { width: 26, height: 26, borderRadius: 13, backgroundColor: palette.surfaceAlt, alignItems: "center", justifyContent: "center" },
  dayChipOn: { backgroundColor: palette.primary },
  dayChipText: { fontFamily: fonts.semibold, fontSize: 12 },
  tplFoot: { flexDirection: "row", gap: space.sm, paddingHorizontal: space.lg, paddingBottom: space.lg },
  tplBlock: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: 6 },
  tplDot: { width: 10, height: 10, borderRadius: 5 },
  headerBtn: { paddingHorizontal: 16 },
  buildRow: { flexDirection: "row", alignItems: "flex-start", gap: space.sm, backgroundColor: palette.surfaceAlt, borderRadius: radius.lg, padding: space.sm },
  buildBar: { width: 5, alignSelf: "stretch", borderRadius: 3, marginTop: 4, minHeight: 40 },
  buildDurs: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
});
