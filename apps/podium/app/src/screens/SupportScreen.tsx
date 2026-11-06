import { useState } from "react";
import { Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, CONTENT_MAX, Card, EmptyState, Icon, IconButton, Pill, TextField, feedback, palette, radius, space, toast, type } from "../ui";
import { todayKey } from "../core/data";
import { SUPPORT_EMAIL, addTicket, useTickets } from "../app/support";
import { analytics } from "../modules/analytics";
import product from "../../product.json";

/** In-app support: a contact form (also opens mail), a refund request, and the
 * status of tickets you've raised. Human reply within 24 hours. */
export function SupportScreen({ onClose }: { onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const tickets = useTickets();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const submit = (refund = false) => {
    const subj = (refund ? "Refund request" : subject.trim()) || "Support request";
    if (!refund && message.trim().length < 5) {
      feedback("error", "warning");
      return setErr("Tell us a little more so we can help.");
    }
    setErr(null);
    addTicket(subj, todayKey());
    analytics.track(refund ? "refund_requested" : "support_ticket_created");
    const body = encodeURIComponent(`${message.trim()}\n\n— sent from ${product.title}`);
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subj)}&body=${body}`).catch(() => {});
    setSubject("");
    setMessage("");
    feedback("success", "success");
    toast("Thanks — we'll reply within 24 hours");
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.bar}><IconButton icon="chevronLeft" label="Back" onPress={onClose} /><Text style={type.heading}>Support</Text><View style={{ width: 48 }} /></View>

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 40 }]} keyboardShouldPersistTaps="handled">
        <Card style={{ gap: space.md }}>
          <View style={styles.head}>
            <View style={styles.icon}><Icon name="headset" size={20} color={palette.primary} /></View>
            <Text style={[type.body, { flex: 1, color: palette.inkSoft }]}>Real people, replying within 24 hours. Tell us what's up and we'll sort it.</Text>
          </View>
          <TextField label="Subject" placeholder="e.g. Pro didn't unlock" value={subject} onChangeText={setSubject} maxLength={80} />
          <TextField label="Message" placeholder="What happened?" value={message} onChangeText={(t) => { setMessage(t); setErr(null); }} error={err} multiline style={styles.message} />
          <Button label="Send message" icon="send" onPress={() => submit(false)} />
          <Button label="Request a refund" variant="secondary" onPress={() => submit(true)} />
          <Text style={[type.caption, { textAlign: "center" }]}>Accidental or unactivated purchases are refunded, no questions.</Text>
        </Card>

        <Text style={[type.label, { textTransform: "uppercase", letterSpacing: 0.6, marginTop: space.sm }]}>Your tickets</Text>
        {tickets.length === 0 ? (
          <Card><EmptyState icon="checkCircle" title="No open tickets" body="When you message us, it shows here with its status." /></Card>
        ) : (
          <View style={{ gap: space.sm }}>
            {tickets.map((t) => (
              <View key={t.id} style={styles.ticket}>
                <View style={{ flex: 1 }}>
                  <Text style={type.bodyStrong} numberOfLines={1}>{t.subject}</Text>
                  <Text style={type.caption}>Opened {t.createdAt}</Text>
                </View>
                <Pill label={t.status === "open" ? "Awaiting reply" : "Replied"} tone={t.status === "open" ? "warning" : "success"} />
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
  bar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space.sm, paddingVertical: space.sm },
  body: { paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.md, width: "100%", maxWidth: CONTENT_MAX, alignSelf: "center" },
  head: { flexDirection: "row", gap: space.md, alignItems: "flex-start" },
  icon: { width: 36, height: 36, borderRadius: 10, backgroundColor: palette.primarySoft, alignItems: "center", justifyContent: "center" },
  message: { minHeight: 110, paddingTop: space.md, textAlignVertical: "top" },
  ticket: { flexDirection: "row", alignItems: "center", gap: space.md, backgroundColor: palette.surface, borderRadius: radius.lg, padding: space.lg, borderWidth: 1, borderColor: palette.border },
});
