import { useState } from "react";
import { Linking, Platform, StyleSheet, Text, View } from "react-native";
import { Button, Card, Icon, Toggle, TextField, feedback, palette, space, toast, type } from "../ui";
import { useSugar } from "../core/data";
import { countEntries } from "../core/backup";
import product from "../../product.json";
import appJson from "../../app.json";
import { SubScreen } from "./shared";

const SUPPORT_EMAIL = "support@jeetechstudio.in";
const VERSION = (appJson as { expo?: { version?: string } }).expo?.version ?? "1.0.0";

const CHANGELOG: { v: string; notes: string[] }[] = [
  { v: VERSION, notes: ["First release: 5-second glucose logging, offline dish database, time-in-range, A1C estimate, reminders, CSV/PDF export and local backup — all free.", "Optional Pro: cloud backup, AI meal coaching and clinician reports."] },
];

export function SupportScreen({ bottomInset, onBack }: { bottomInset: number; onBack: () => void }) {
  const data = useSugar();
  const [message, setMessage] = useState("");
  const [diagnostics, setDiagnostics] = useState(false);

  const send = () => {
    const counts = countEntries(data);
    const diag = diagnostics
      ? `\n\n---\nDiagnostics (no health values): ${product.title} v${VERSION}, ${Platform.OS}, entries ${counts.total} (${counts.readings} readings, ${counts.meals} meals).`
      : "";
    const body = encodeURIComponent(`${message}${diag}`);
    const subject = encodeURIComponent(`Sugar Plate support (v${VERSION})`);
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`)
      .then(() => { feedback("success", "success"); toast("Opening your email app"); })
      .catch(() => toast(`Email us at ${SUPPORT_EMAIL}`));
  };

  return (
    <SubScreen title="Support" subtitle="A real person replies within 24h" onBack={onBack} bottomInset={bottomInset}>
      <Card>
        <Text style={[type.bodyStrong, { marginBottom: space.sm }]}>Contact us</Text>
        <TextField label="Message" placeholder="Tell us what's happening or what you'd like to see." value={message} onChangeText={setMessage} multiline style={{ minHeight: 100 }} />
        <View style={{ marginTop: space.sm }}>
          <Toggle
            label="Attach diagnostics"
            description="App version & entry counts only — never your readings or notes"
            value={diagnostics}
            onChange={setDiagnostics}
          />
        </View>
        <Button label="Send email" size="lg" icon="share" disabled={!message.trim()} onPress={send} style={{ marginTop: space.sm }} />
        <Text style={[type.caption, { textAlign: "center", marginTop: space.xs }]}>{SUPPORT_EMAIL}</Text>
      </Card>

      <Text style={[type.label, { marginTop: space.sm }]}>WHAT'S NEW</Text>
      {CHANGELOG.map((c) => (
        <Card key={c.v}>
          <View style={styles.verHead}>
            <Icon name="doc" size={16} color={palette.primary} />
            <Text style={type.bodyStrong}>Version {c.v}</Text>
          </View>
          {c.notes.map((n, i) => (
            <View key={i} style={styles.noteRow}>
              <Text style={[type.caption, { color: palette.inkSoft }]}>• </Text>
              <Text style={[type.caption, { color: palette.inkSoft, flex: 1 }]}>{n}</Text>
            </View>
          ))}
        </Card>
      ))}
      <Text style={[type.caption, { textAlign: "center" }]}>We announce every feature or pricing change here — and never remove a free feature.</Text>
    </SubScreen>
  );
}

const styles = StyleSheet.create({
  verHead: { flexDirection: "row", alignItems: "center", gap: space.sm, marginBottom: space.xs },
  noteRow: { flexDirection: "row", marginTop: 2 },
});
