import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  Button, Card, EmptyState, Icon, IconButton, Segmented, Sheet, Toggle, Tappable, feedback, palette, radius, space, toast, type,
} from "../ui";
import { useSugar, sugarStore } from "../core/data";
import {
  REMINDER_LABEL, addReminder, editReminder, toggleReminder, deleteReminder, remindersFor,
} from "../core/reminders";
import { setQuietHours } from "../core/profiles";
import { REMINDER_KINDS, type Reminder, type ReminderKind } from "../core/model";
import { notify } from "../modules/notify";
import { analytics } from "../modules/analytics";
import { SubScreen } from "./shared";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const KIND_BODY: Record<ReminderKind, string> = {
  fasting: "A quick morning reading takes about 5 seconds.",
  pre_meal: "Log a reading before you eat.",
  post_meal: "Check your sugar 1–2h after eating.",
  medication: "Time for your medication.",
  meal: "Remember to log your meal.",
  weekly: "Your weekly wellness summary is ready.",
};

function parseHM(t: string): { h: number; m: number } {
  const [h, m] = t.split(":").map(Number);
  return { h: h || 0, m: m || 0 };
}
function fmtHM(h: number, m: number): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(h)}:${p(m)}`;
}

/** Schedule (or reschedule) a reminder's OS notifications. Daily when no days chosen, else weekly per day. */
export async function scheduleReminder(rem: Reminder): Promise<void> {
  return schedule(rem);
}
async function schedule(rem: Reminder): Promise<void> {
  for (let d = 0; d < 7; d++) await notify.cancel(`rem_${rem.id}_${d}`);
  await notify.cancel(`rem_${rem.id}`);
  if (!rem.enabled) return;
  const { h, m } = parseHM(rem.time);
  const content = { title: REMINDER_LABEL[rem.kind], body: KIND_BODY[rem.kind] };
  if (rem.days.length === 0) {
    if (rem.kind === "weekly") await notify.weekly(`rem_${rem.id}`, { weekday: 1, hour: h, minute: m }, content);
    else await notify.daily(`rem_${rem.id}`, { hour: h, minute: m }, content);
  } else {
    for (const day of rem.days) await notify.weekly(`rem_${rem.id}_${day}`, { weekday: day + 1, hour: h, minute: m }, content);
  }
}

export function RemindersScreen({ bottomInset, onBack }: { bottomInset: number; onBack: () => void }) {
  const data = useSugar();
  const reminders = remindersFor(data);
  const [sheet, setSheet] = useState<null | { mode: "add" } | { mode: "edit"; rem: Reminder }>(null);
  const [quiet, setQuiet] = useState(false);

  const toggle = async (rem: Reminder, on: boolean) => {
    if (on && !(await notify.granted())) {
      const ok = await notify.ask("Reminders help you log and check on time. They stay on your device.");
      if (!ok) { toast("Allow notifications to use reminders"); return; }
    }
    const next = toggleReminder(data, rem.id, on);
    sugarStore.set(next);
    feedback("pop", "select");
    void schedule({ ...rem, enabled: on });
    if (on) analytics.track("reminder_set");
  };

  const remove = (rem: Reminder) => {
    sugarStore.set(deleteReminder(data, rem.id));
    void schedule({ ...rem, enabled: false });
    feedback("pop", "warning");
    toast("Reminder removed");
  };

  return (
    <>
      <SubScreen
        title="Reminders"
        subtitle="Free & unlimited · work offline"
        onBack={onBack}
        bottomInset={bottomInset}
        right={<IconButton icon="plus" label="Add reminder" tone="primary" onPress={() => setSheet({ mode: "add" })} />}
      >
        {reminders.length === 0 ? (
          <Card>
            <EmptyState
              icon="bell"
              title="No reminders yet"
              body="Add gentle, offline reminders for fasting checks, meals, medication or your weekly summary."
              action={<Button label="Add a reminder" icon="plus" onPress={() => setSheet({ mode: "add" })} />}
            />
          </Card>
        ) : (
          <View style={{ gap: space.sm }}>
            {reminders.map((r) => (
              <Card key={r.id} padded={false} style={styles.row}>
                <Tappable label={`Edit ${REMINDER_LABEL[r.kind]} at ${r.time}`} onPress={() => setSheet({ mode: "edit", rem: r })} style={styles.rowMain}>
                  <View style={styles.iconWrap}><Icon name="bell" size={18} color={palette.primary} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={type.bodyStrong}>{r.label || REMINDER_LABEL[r.kind]}</Text>
                    <Text style={type.caption}>{r.time} · {r.days.length ? r.days.map((d) => DOW[d]).join(" ") : "Every day"}</Text>
                  </View>
                </Tappable>
                <Tappable label={`${r.enabled ? "On" : "Off"}`} role="switch" accessibilityState={{ checked: r.enabled }} sound={null} onPress={() => toggle(r, !r.enabled)} style={styles.switchWrap}>
                  <View style={[styles.track, r.enabled && { backgroundColor: palette.primary }]}>
                    <View style={[styles.knob, r.enabled && { transform: [{ translateX: 20 }] }]} />
                  </View>
                </Tappable>
              </Card>
            ))}
          </View>
        )}

        <Card>
          <Toggle
            label="Quiet hours"
            description={data.quietHours.enabled ? `No reminders ${data.quietHours.start}–${data.quietHours.end}` : "Silence reminders overnight"}
            value={data.quietHours.enabled}
            onChange={(v) => { sugarStore.set(setQuietHours(data, { ...data.quietHours, enabled: v })); feedback("pop", "select"); if (v) setQuiet(true); }}
          />
          {data.quietHours.enabled ? (
            <Button label={`Change window (${data.quietHours.start}–${data.quietHours.end})`} variant="ghost" size="sm" onPress={() => setQuiet(true)} />
          ) : null}
        </Card>
        <Text style={[type.caption, { textAlign: "center" }]}>Reminders fire on your device, even offline, and after a reboot.</Text>
      </SubScreen>

      {sheet ? (
        <ReminderSheet
          mode={sheet.mode}
          rem={sheet.mode === "edit" ? sheet.rem : undefined}
          onClose={() => setSheet(null)}
          onSaved={(rem) => { void schedule(rem); }}
          onDelete={sheet.mode === "edit" ? () => { remove(sheet.rem); setSheet(null); } : undefined}
        />
      ) : null}

      <QuietHoursSheet visible={quiet} onClose={() => setQuiet(false)} />
    </>
  );
}

function ReminderSheet({ mode, rem, onClose, onSaved, onDelete }: {
  mode: "add" | "edit"; rem?: Reminder; onClose: () => void; onSaved: (rem: Reminder) => void; onDelete?: () => void;
}) {
  const data = useSugar();
  const [kind, setKind] = useState<ReminderKind>(rem?.kind ?? "fasting");
  const [{ h, m }, setHM] = useState(() => parseHM(rem?.time ?? "08:00"));
  const [days, setDays] = useState<number[]>(rem?.days ?? []);

  const bump = (mins: number) => {
    const total = (h * 60 + m + mins + 1440) % 1440;
    setHM({ h: Math.floor(total / 60), m: total % 60 });
  };
  const toggleDay = (d: number) => setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));

  const save = async () => {
    const time = fmtHM(h, m);
    if (mode === "edit" && rem) {
      const res = editReminder(data, rem.id, { kind, time, days, label: REMINDER_LABEL[kind] });
      if (res.error) { feedback("error", "error"); return; }
      sugarStore.set(res.state);
      onSaved({ ...rem, kind, time, days, label: REMINDER_LABEL[kind] });
      toast("Reminder updated");
    } else {
      if (!(await notify.granted())) await notify.ask("Reminders help you stay on track and stay on your device.");
      const res = addReminder(data, { kind, time, days });
      if (res.error || !res.id) { feedback("error", "error"); return; }
      sugarStore.set(res.state);
      analytics.track("reminder_set");
      onSaved({ id: res.id, profileId: data.activeProfileId, kind, time, days, enabled: true, label: REMINDER_LABEL[kind] });
      toast("Reminder added");
    }
    feedback("success", "success");
    onClose();
  };

  return (
    <Sheet visible title={mode === "edit" ? "Edit reminder" : "New reminder"} onClose={onClose}>
      <Text style={type.label}>WHAT</Text>
      <View style={styles.kindChips}>
        {REMINDER_KINDS.map((k) => (
          <Tappable key={k} label={REMINDER_LABEL[k]} role="button" accessibilityState={{ selected: kind === k }} sound="pop" onPress={() => setKind(k)} style={[styles.kindChip, kind === k && { backgroundColor: palette.primary, borderColor: palette.primary }]}>
            <Text style={[type.label, { color: kind === k ? palette.onPrimary : palette.inkSoft }]}>{REMINDER_LABEL[k]}</Text>
          </Tappable>
        ))}
      </View>

      <Text style={type.label}>TIME</Text>
      <View style={styles.timeRow}>
        <IconButton icon="chevronLeft" label="Earlier" onPress={() => bump(-15)} />
        <Text style={[type.hero, { fontSize: 40 }]}>{fmtHM(h, m)}</Text>
        <IconButton icon="chevronRight" label="Later" onPress={() => bump(15)} />
      </View>

      <Text style={type.label}>DAYS (none = every day)</Text>
      <View style={styles.dayRow}>
        {DOW.map((d, i) => (
          <Tappable key={d} label={d} role="button" accessibilityState={{ selected: days.includes(i) }} sound="pop" onPress={() => toggleDay(i)} style={[styles.dayChip, days.includes(i) && { backgroundColor: palette.primary, borderColor: palette.primary }]}>
            <Text style={[type.caption, { color: days.includes(i) ? palette.onPrimary : palette.inkSoft }]}>{d[0]}</Text>
          </Tappable>
        ))}
      </View>

      <Button label={mode === "edit" ? "Save reminder" : "Add reminder"} size="lg" icon="check" onPress={save} />
      {onDelete ? <Button label="Delete reminder" variant="danger" icon="trash" onPress={onDelete} /> : null}
    </Sheet>
  );
}

function QuietHoursSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const data = useSugar();
  const [start, setStart] = useState(() => parseHM(data.quietHours.start));
  const [end, setEnd] = useState(() => parseHM(data.quietHours.end));
  const bump = (which: "s" | "e", mins: number) => {
    const cur = which === "s" ? start : end;
    const total = (cur.h * 60 + cur.m + mins + 1440) % 1440;
    const next = { h: Math.floor(total / 60), m: total % 60 };
    which === "s" ? setStart(next) : setEnd(next);
  };
  const save = () => {
    sugarStore.set(setQuietHours(data, { enabled: true, start: fmtHM(start.h, start.m), end: fmtHM(end.h, end.m) }));
    feedback("success", "success");
    toast("Quiet hours saved");
    onClose();
  };
  return (
    <Sheet visible={visible} title="Quiet hours" onClose={onClose}>
      <Text style={type.caption}>Reminders scheduled inside this window are skipped.</Text>
      {([["From", "s", start], ["Until", "e", end]] as const).map(([label, key, val]) => (
        <View key={key} style={styles.quietRow}>
          <Text style={[type.bodyStrong, { width: 56 }]}>{label}</Text>
          <IconButton icon="chevronLeft" label={`${label} earlier`} onPress={() => bump(key, -30)} />
          <Text style={[type.heading, { flex: 1, textAlign: "center", fontVariant: ["tabular-nums"] }]}>{fmtHM(val.h, val.m)}</Text>
          <IconButton icon="chevronRight" label={`${label} later`} onPress={() => bump(key, 30)} />
        </View>
      ))}
      <Button label="Save quiet hours" size="lg" onPress={save} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  rowMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, minHeight: 64 },
  iconWrap: { width: 36, height: 36, borderRadius: 10, backgroundColor: palette.primarySoft, alignItems: "center", justifyContent: "center" },
  switchWrap: { paddingHorizontal: space.md, minHeight: 48, justifyContent: "center" },
  track: { width: 48, height: 28, borderRadius: 14, padding: 3, backgroundColor: palette.border },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#fff" },
  kindChips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  kindChip: { minHeight: 44, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: palette.border, justifyContent: "center" },
  timeRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  dayRow: { flexDirection: "row", justifyContent: "space-between", gap: 4 },
  dayChip: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: palette.border, alignItems: "center", justifyContent: "center" },
  quietRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
});
