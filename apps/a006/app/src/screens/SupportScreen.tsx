import { useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import { Button, Card, EmptyState, ListItem, Pill, SectionHeader, Sheet, TextField, feedback, palette, space, toast, type } from "../ui";
import { Stack, appStore, useApp } from "./common";
import { useNav } from "../nav";
import { analytics } from "../modules/analytics";
import { createTicket, setTicketStatus, type AppState } from "../core/app";
import type { TicketStatus } from "../core/types";
import type { Tone } from "../ui/theme";

const SUPPORT_EMAIL = "support@jeetechstudio.in";

const CHANGELOG = [
  { v: "1.0", date: "2026-10", notes: ["One-tap ball-by-ball scoring with 5s/7s, extras and all wicket types", "Free career stats, scorecards, charts and points tables", "Tournaments with NRR, corrections with an audit log, and offline-first saving"] },
];

const TICKET_TONE: Record<TicketStatus, { label: string; tone: Tone }> = {
  open: { label: "Open", tone: "primary" },
  in_review: { label: "In review", tone: "warning" },
  resolved: { label: "Resolved", tone: "success" },
};

export function SupportScreen({ bottomInset }: { bottomInset: number }) {
  const app = useApp();
  const nav = useNav();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const submit = () => {
    const r = createTicket(app, { subject, body }, Date.now());
    if (r.error) { feedback("error", "error"); return setErr("Add a short subject."); }
    appStore.set(() => r.state as AppState);
    feedback("success", "success");
    analytics.track("support_ticket_created");
    setOpen(false);
    setSubject("");
    setBody("");
    toast("Ticket created — we reply within 24–48h");
  };

  return (
    <Stack title="Support" subtitle="We reply in 24–48 hours" onBack={() => nav.pop()} bottomInset={bottomInset}>
      <Card style={{ gap: space.sm }}>
        <Text style={type.heading}>Need a hand?</Text>
        <Text style={[type.body, { color: palette.inkSoft }]}>Open a tracked ticket in the app, or email us directly. No bots — a person reads every message.</Text>
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <Button label="New ticket" icon="plus" onPress={() => { setErr(null); setOpen(true); }} style={{ flex: 1 }} />
          <Button label="Email us" variant="secondary" icon="mail" onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=Gully%20Score%20support`).catch(() => toast("No email app found"))} style={{ flex: 1 }} />
        </View>
      </Card>

      <SectionHeader title="Your tickets" />
      {app.tickets.length === 0 ? (
        <Card><EmptyState icon="mail" title="No tickets yet" body="Open one any time — you'll see its status here." /></Card>
      ) : (
        <Card padded={false} style={{ paddingHorizontal: space.lg }}>
          {app.tickets.map((t) => (
            <ListItem
              key={t.id}
              icon="mail"
              title={t.subject}
              subtitle={t.body || "No details"}
              trailing={<Pill label={TICKET_TONE[t.status].label} tone={TICKET_TONE[t.status].tone} />}
              onPress={t.status !== "resolved" ? () => resolve(t.id) : undefined}
            />
          ))}
        </Card>
      )}
      {app.tickets.some((t) => t.status !== "resolved") ? <Text style={[type.caption, { textAlign: "center" }]}>Tap a ticket to mark it resolved.</Text> : null}

      <SectionHeader title="What's new" />
      {CHANGELOG.map((c) => (
        <Card key={c.v} style={{ gap: 6 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            <Text style={type.bodyStrong}>Version {c.v}</Text>
            <Text style={type.caption}>{c.date}</Text>
          </View>
          {c.notes.map((n, i) => (
            <View key={i} style={styles.noteRow}>
              <Text style={[type.body, { color: palette.primary }]}>•</Text>
              <Text style={[type.body, { flex: 1, color: palette.inkSoft }]}>{n}</Text>
            </View>
          ))}
        </Card>
      ))}

      <Sheet visible={open} title="New ticket" onClose={() => setOpen(false)}>
        <TextField label="Subject" placeholder="e.g. Wrong run rate on a match" value={subject} onChangeText={(t) => { setSubject(t); setErr(null); }} error={err} maxLength={80} />
        <TextField label="Details (optional)" placeholder="Tell us what happened…" value={body} onChangeText={setBody} multiline style={{ minHeight: 100, paddingTop: space.sm, textAlignVertical: "top" }} />
        <Button label="Submit ticket" size="lg" onPress={submit} />
      </Sheet>
    </Stack>
  );

  function resolve(id: string) {
    appStore.set((s) => setTicketStatus(s, id, "resolved", Date.now()) as AppState);
    feedback("success", "light");
    toast("Marked resolved");
  }
}

const styles = StyleSheet.create({
  noteRow: { flexDirection: "row", gap: space.sm },
});
