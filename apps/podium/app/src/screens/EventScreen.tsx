import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Button,
  CONTENT_MAX,
  Card,
  Chip,
  EmptyState,
  HeroCard,
  Icon,
  IconButton,
  ProgressRing,
  Tappable,
  TextField,
  feedback,
  gradient,
  palette,
  radius,
  space,
  toast,
  type,
} from "../ui";
import { art } from "../art";
import { appStore, todayKey, useApp } from "../core/data";
import { archiveEvent, createEvent } from "../core/state";
import { addDays, daysBetween } from "../core/dates";
import type { EventPlan as EventPlanData, EventType, PlanItem } from "../core/types";
import { syncReminders } from "../app/engine";
import type { AppNav } from "../app/nav";
import { analytics } from "../modules/analytics";

const TYPES: { id: EventType; label: string; icon: "briefcase" | "grad" | "rocket" | "glass" | "chart" | "users" }[] = [
  { id: "interview", label: "Interview", icon: "briefcase" },
  { id: "viva", label: "Viva / defence", icon: "grad" },
  { id: "pitch", label: "Pitch", icon: "rocket" },
  { id: "toast", label: "Wedding toast", icon: "glass" },
  { id: "presentation", label: "Presentation", icon: "chart" },
  { id: "meeting", label: "Big meeting", icon: "users" },
];
const WHEN = [
  { label: "Tomorrow", days: 1 },
  { label: "In 3 days", days: 3 },
  { label: "In a week", days: 7 },
  { label: "In 2 weeks", days: 14 },
  { label: "In a month", days: 30 },
];

export function EventScreen({ eventId, nav, onClose }: { eventId?: string; nav: AppNav; onClose: () => void }) {
  const app = useApp();
  const event = eventId ? app.events.find((e) => e.id === eventId) : undefined;
  return event ? <EventPlan event={event} nav={nav} onClose={onClose} /> : <EventSetup nav={nav} onClose={onClose} />;
}

function EventSetup({ nav, onClose }: { nav: AppNav; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const app = useApp();
  const [kind, setKind] = useState<EventType>("interview");
  const [title, setTitle] = useState("");
  const [days, setDays] = useState(7);

  const build = () => {
    const today = todayKey();
    const res = createEvent(appStore.get(), { type: kind, title: title.trim() || undefined, date: addDays(today, days) }, today);
    appStore.set(res.state);
    feedback("success", "success");
    analytics.track("event_created", { type: kind });
    void syncReminders(appStore.get());
    if (res.id) nav.openEvent(res.id);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.bar}><IconButton icon="chevronLeft" label="Back" onPress={onClose} /><Text style={type.heading}>Event prep</Text><View style={{ width: 48 }} /></View>
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 96 }]}>
        {app.events.filter((e) => !e.archived).length === 0 ? (
          <EmptyState art={art.empty_scenarios_saved} title="Got a big day coming?" body="Set the date and we'll build a countdown plan of short drills and a full run-through." />
        ) : null}

        <Text style={type.label}>WHAT ARE YOU PREPARING FOR?</Text>
        <View style={styles.typeGrid}>
          {TYPES.map((t) => (
            <Tappable key={t.id} label={t.label} onPress={() => { feedback("pop", "select"); setKind(t.id); }} style={[styles.typeCard, kind === t.id && styles.typeOn]}>
              <Icon name={t.icon} size={20} color={kind === t.id ? palette.onPrimary : palette.primary} />
              <Text style={[styles.typeLabel, { color: kind === t.id ? palette.onPrimary : palette.ink }]} numberOfLines={1}>{t.label}</Text>
            </Tappable>
          ))}
        </View>

        <TextField label="Title (optional)" placeholder="e.g. Google final round" value={title} onChangeText={setTitle} maxLength={60} />

        <Text style={type.label}>WHEN IS IT?</Text>
        <View style={styles.whenRow}>
          {WHEN.map((w) => (
            <Chip key={w.days} label={w.label} selected={days === w.days} onPress={() => setDays(w.days)} />
          ))}
        </View>
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
        <Button label="Build my plan" icon="calendar" size="lg" onPress={build} />
      </View>
    </View>
  );
}

function EventPlan({ event, nav, onClose }: { event: EventPlanData; nav: AppNav; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const today = todayKey();
  const left = daysBetween(today, event.date);
  const past = left < 0;
  const countdown = past ? "Event passed" : left === 0 ? "Today" : left === 1 ? "Tomorrow" : `In ${left} days`;

  const rehearse = (item: PlanItem) => {
    nav.record({
      mode: item.isFinalRun ? "event_run" : "standard",
      packId: item.focus,
      promptId: item.id,
      promptText: item.isFinalRun ? `Full run-through for your ${event.title.toLowerCase()}.` : item.title.replace(/^Drill: |^Quick drill: /, ""),
      scenario: event.title,
      title: item.title,
      eventId: event.id,
      itemId: item.id,
      finalRun: item.isFinalRun,
    });
  };

  const archive = () => {
    appStore.set((s) => archiveEvent(s, event.id));
    toast("Event archived");
    onClose();
  };

  const todays = event.planItems.find((i) => !i.done && i.day <= today) ?? event.planItems.find((i) => !i.done);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.bar}>
        <IconButton icon="chevronLeft" label="Back" onPress={onClose} />
        <Text style={type.heading} numberOfLines={1}>{event.title}</Text>
        <IconButton icon="trash" label="Archive event" onPress={archive} />
      </View>

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 40 }]}>
        <HeroCard
          overline={countdown}
          value={`${event.readiness}%`}
          caption="ready"
          status={{ label: past ? "Past" : `${event.planItems.filter((i) => i.done).length}/${event.planItems.length} done`, tone: event.readiness >= 70 ? "success" : "warning" }}
          right={<ProgressRing value={event.readiness / 100} size={88} stroke={10} color={gradient.onHero} track={gradient.pill} labelColor={gradient.onHero} label={`${event.readiness}`} sublabel="ready" />}
        />

        {todays && !past ? (
          <Card style={{ gap: space.md }} accent={palette.primary}>
            <Text style={type.overline}>Today's rehearsal</Text>
            <Text style={type.title}>{todays.title}</Text>
            <Button label="Rehearse now" icon="mic" onPress={() => rehearse(todays)} />
          </Card>
        ) : null}

        <Text style={[type.label, { marginTop: space.sm }]}>YOUR PLAN</Text>
        <View style={{ gap: space.sm }}>
          {event.planItems.map((item) => (
            <View key={item.id} style={styles.planRow}>
              <View style={[styles.planCheck, item.done && styles.planCheckOn]}>
                {item.done ? <Icon name="check" size={16} color={palette.onPrimary} /> : <Icon name={item.isFinalRun ? "trophy" : "mic"} size={16} color={palette.primary} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[type.bodyStrong, item.done && { color: palette.inkMuted }]} numberOfLines={2}>{item.title}</Text>
                <Text style={type.caption}>{item.minutes} min{item.isFinalRun ? " · full run" : ""}</Text>
              </View>
              {!item.done && !past ? (
                <Button label={item.isFinalRun ? "Run" : "Start"} size="sm" variant={item.isFinalRun ? "primary" : "secondary"} onPress={() => rehearse(item)} />
              ) : null}
            </View>
          ))}
        </View>

        {past ? (
          <Card><Text style={[type.body, { color: palette.inkSoft, textAlign: "center" }]}>This event has passed. Archive it, or start a new one from Practice.</Text></Card>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
  bar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space.sm, paddingVertical: space.sm, gap: space.sm },
  body: { paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.md, width: "100%", maxWidth: CONTENT_MAX, alignSelf: "center" },
  typeGrid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  typeCard: { width: "47%", flexGrow: 1, flexDirection: "row", alignItems: "center", gap: space.sm, backgroundColor: palette.surface, borderRadius: radius.md, padding: space.md, borderWidth: 1.5, borderColor: palette.border },
  typeOn: { backgroundColor: palette.primary, borderColor: palette.primary },
  typeLabel: { flex: 1, fontFamily: type.bodyStrong.fontFamily, fontSize: 14 },
  whenRow: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  planRow: { flexDirection: "row", alignItems: "center", gap: space.md, backgroundColor: palette.surface, borderRadius: radius.lg, padding: space.md, borderWidth: 1, borderColor: palette.border },
  planCheck: { width: 32, height: 32, borderRadius: 16, backgroundColor: palette.primarySoft, alignItems: "center", justifyContent: "center" },
  planCheckOn: { backgroundColor: palette.success },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: space.lg, paddingTop: space.md, backgroundColor: palette.bg, borderTopWidth: 1, borderTopColor: palette.border },
});
