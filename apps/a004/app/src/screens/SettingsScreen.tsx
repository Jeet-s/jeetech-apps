import { useState } from "react";
import { Alert, Linking, StyleSheet, Text, View } from "react-native";
import {
  AccountSheet, Button, Card, IconButton, ListItem, Screen, SectionHeader, Segmented, Sheet, Toggle,
  feedback, palette, space, toast, type, useCloudUser,
} from "../ui";
import { useSugar, sugarStore, snapshotsStore, pullSugarNow } from "../core/data";
import { store, useSettings } from "../modules/store";
import { cloud } from "../modules/cloud";
import { iap } from "../modules/iap";
import { activeProfile, CONTEXTS, CONTEXT_LABEL, type Context } from "../core/model";
import { setUnit, setStreakEnabled, setLowThreshold, setRange, resetRangesToAda, isCustomRanges } from "../core/profiles";
import { formatValue, UNIT_LABEL, MMOL_FACTOR, type Unit } from "../core/units";
import { LOW_SAFETY_NOTE } from "../core/readings";
import { REPORT_DISCLAIMER } from "../core/report";
import { openDisplaySettings } from "../modules/display";
import monetization from "../../monetization.json";
import product from "../../product.json";

const legal = (monetization as { legal?: { privacyUrl?: string } }).legal ?? {};

export function SettingsScreen({ bottomInset, onPro }: { bottomInset: number; onPro: (from: string) => void }) {
  const data = useSugar();
  const s = useSettings();
  const profile = activeProfile(data);
  const user = useCloudUser();
  const [account, setAccount] = useState(false);
  const [ranges, setRanges] = useState(false);

  const deleteAll = () =>
    Alert.alert("Delete all data?", "This permanently removes every reading, meal, medication and backup snapshot from this phone. It can't be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete everything", style: "destructive", onPress: () => { sugarStore.reset(); snapshotsStore.reset(); feedback("pop", "warning"); toast("All data deleted"); } },
    ]);

  return (
    <>
      <Screen title="Settings" bottomInset={bottomInset}>
        {cloud.online && cloud.emailSignIn ? (
          <Card padded={false} style={styles.card}>
            <ListItem
              icon="cloud"
              title={user && !user.anonymous ? "Account & cloud backup" : "Back up to the cloud (Pro)"}
              subtitle={user && !user.anonymous ? user.email ?? undefined : "Optional email-code sign-in — never needed to use the app"}
              onPress={() => (s.pro || (user && !user.anonymous) ? setAccount(true) : onPro("cloud_sync"))}
            />
          </Card>
        ) : null}

        <Card padded={false} style={styles.card}>
          {s.pro ? (
            <ListItem icon="star" iconTint={palette.accent} title="Pro unlocked" subtitle="Thank you for supporting Sugar Plate" />
          ) : (
            <ListItem icon="star" iconTint={palette.accent} title="Upgrade to Pro" subtitle="Cloud backup, unlimited AI coaching, clinician reports" onPress={() => onPro("settings")} />
          )}
          {s.proSource === "subscription" ? <ListItem icon="star" title="Manage subscription" onPress={() => iap.manageSubscriptions()} /> : null}
        </Card>

        <SectionHeader title="Units & targets" />
        <Card style={styles.card}>
          <Text style={[type.label, { marginBottom: 6 }]}>GLUCOSE UNIT</Text>
          <Segmented
            options={[{ value: "mgdl" as Unit, label: "mg/dL" }, { value: "mmol" as Unit, label: "mmol/L" }]}
            value={profile.unit}
            onChange={(u) => { sugarStore.set(setUnit(data, u)); feedback("pop", "select"); }}
          />
          <Text style={[type.caption, { marginTop: 6 }]}>Stored as mg/dL, so switching never changes your numbers.</Text>
        </Card>
        <Card padded={false} style={styles.card}>
          <ListItem
            icon="insights"
            title="Target ranges"
            subtitle={isCustomRanges(profile) ? "Custom ranges" : "ADA-aligned defaults"}
            value={`low ${formatValue(profile.lowThreshold, profile.unit)}`}
            onPress={() => setRanges(true)}
          />
        </Card>

        <SectionHeader title="Display & feedback" />
        <Card padded={false} style={styles.card}>
          <Toggle label="Show logging streak" description="A gentle count of days logged — no pressure" value={data.streakEnabled} onChange={(v) => sugarStore.set(setStreakEnabled(data, v))} />
          <Toggle label="Vibration" description="A light tap on each action" value={s.haptics !== false} onChange={(v) => store.set({ haptics: v })} />
          <Toggle label="Sounds" description="Subtle confirmation sounds (off by default)" value={s.sound === true} onChange={(v) => store.set({ sound: v })} />
        </Card>

        <SectionHeader title="Appearance" />
        <Card padded={false} style={styles.card}>
          {/* The app follows the phone's light/dark theme and text size — these open the phone's
              Display settings (a real control), never a dead-end "no dark theme" dialog. */}
          <ListItem
            icon="settings"
            title="Theme"
            subtitle="Follows your phone"
            value="Light / Dark"
            onPress={() => void openDisplaySettings()}
          />
          <ListItem
            icon="info"
            title="Text size"
            subtitle="Follows your phone"
            value="Up to 200%"
            onPress={() => void openDisplaySettings()}
          />
        </Card>
        <Text style={[type.caption, styles.note]}>Sugar Plate follows your phone's light or dark theme and system font size (up to 200%) for a calm, high-contrast look.</Text>

        <SectionHeader title="Privacy & data" />
        <Card padded={false} style={styles.card}>
          <ListItem icon="shield" title="Where your data lives" subtitle={cloud.enabled ? "On this phone; backed up to the cloud only when signed in" : "Only on this phone"} onPress={() => Alert.alert("Your data", "Readings, meals and medications are stored on this device. Cloud backup is optional and only used when you sign in with an email code. We never sell data or show ads.")} />
          {legal.privacyUrl ? <ListItem icon="doc" title="Privacy policy" onPress={() => Linking.openURL(legal.privacyUrl!)} /> : null}
          <ListItem icon="info" title="Wellness disclaimer" onPress={() => Alert.alert("Wellness only", `${REPORT_DISCLAIMER}\n\n${LOW_SAFETY_NOTE}`)} />
          <ListItem icon="history" title="Restore purchases" onPress={async () => { const n = await iap.restore().catch(() => 0); feedback(n ? "unlock" : "pop", n ? "success" : "warning"); toast(n ? "Purchases restored — Pro is now active" : "Nothing to restore — no previous purchase found on this account"); }} />
          <ListItem icon="trash" title="Delete all data" destructive onPress={deleteAll} />
        </Card>

        <View style={{ alignItems: "center", gap: 2, marginTop: space.sm }}>
          <Text style={type.caption}>{product.title}</Text>
          <Text style={type.caption}>No account needed · Wellness only</Text>
        </View>
      </Screen>

      <AccountSheet visible={account} onClose={() => setAccount(false)} onSignedIn={(r) => void pullSugarNow({ switched: r.switched })} />
      {ranges ? <RangesSheet onClose={() => setRanges(false)} /> : null}
    </>
  );
}

function RangesSheet({ onClose }: { onClose: () => void }) {
  const data = useSugar();
  const profile = activeProfile(data);
  const unit = profile.unit;
  const stepMgdl = unit === "mmol" ? Math.round(MMOL_FACTOR * 0.1) : 5;
  const show = (mgdl: number) => formatValue(mgdl, unit);

  const bumpRange = (c: Context, key: "low" | "high", dir: number) => {
    const r = { ...profile.ranges[c] };
    r[key] = Math.max(1, r[key] + dir * stepMgdl);
    if (r.low < r.high) { const res = setRange(data, c, r); if (!res.error) sugarStore.set(res.state); feedback("pop", "light"); }
  };
  const bumpLow = (dir: number) => { sugarStore.set(setLowThreshold(data, Math.max(1, profile.lowThreshold + dir * stepMgdl))); feedback("pop", "light"); };

  return (
    <Sheet visible title="Target ranges" onClose={onClose}>
      <Text style={type.caption}>Readings are colour-coded against these targets (shown in {UNIT_LABEL[unit]}). Not medical advice.</Text>
      <View style={{ gap: space.xs }}>
        {CONTEXTS.map((c) => (
          <View key={c} style={styles.rangeRow}>
            <Text style={[type.bodyStrong, { flex: 1 }]}>{CONTEXT_LABEL[c]}</Text>
            <Stepper label={`${CONTEXT_LABEL[c]} low`} value={show(profile.ranges[c].low)} onLess={() => bumpRange(c, "low", -1)} onMore={() => bumpRange(c, "low", 1)} />
            <Text style={type.caption}>–</Text>
            <Stepper label={`${CONTEXT_LABEL[c]} high`} value={show(profile.ranges[c].high)} onLess={() => bumpRange(c, "high", -1)} onMore={() => bumpRange(c, "high", 1)} />
          </View>
        ))}
      </View>
      <View style={styles.rangeRow}>
        <Text style={[type.bodyStrong, { flex: 1 }]}>Low alert below</Text>
        <Stepper label="Low alert threshold" value={show(profile.lowThreshold)} onLess={() => bumpLow(-1)} onMore={() => bumpLow(1)} />
      </View>
      <Button label="Reset to ADA defaults" variant="ghost" onPress={() => { sugarStore.set(resetRangesToAda(data)); feedback("pop", "select"); toast("Reset to ADA defaults"); }} />
      <Button label="Done" size="lg" onPress={onClose} />
    </Sheet>
  );
}

function Stepper({ label, value, onLess, onMore }: { label: string; value: string; onLess: () => void; onMore: () => void }) {
  return (
    <View style={styles.stepper}>
      <IconButton icon="chevronLeft" label={`${label} down`} size={34} onPress={onLess} />
      <Text style={[type.amount, { minWidth: 34, textAlign: "center" }]}>{value}</Text>
      <IconButton icon="chevronRight" label={`${label} up`} size={34} onPress={onMore} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { paddingHorizontal: space.lg },
  note: { textAlign: "center", color: palette.inkMuted },
  rangeRow: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 48 },
  stepper: { flexDirection: "row", alignItems: "center", gap: 2 },
});
