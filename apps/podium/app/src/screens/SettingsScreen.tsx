import { useState } from "react";
import { Alert, Linking, Platform, StyleSheet, Text, View } from "react-native";
import {
  Card,
  Chip,
  Icon,
  ListItem,
  Pill,
  Screen,
  SectionHeader,
  Sheet,
  Toggle,
  feedback,
  palette,
  space,
  toast,
  type,
  useCloudUser,
} from "../ui";
import { appStore, useApp } from "../core/data";
import { deleteAllRecordings, deleteEverything, updateSettings } from "../core/state";
import { todayKey } from "../core/data";
import { syncReminders } from "../app/engine";
import { notify } from "../modules/notify";
import { cloud } from "../modules/cloud";
import { store, useSettings } from "../modules/store";
import { iap } from "../modules/iap";
import { share } from "../modules/share";
import { openDisplaySettings } from "../modules/display";
import { analytics } from "../modules/analytics";
import monetization from "../../monetization.json";
import product from "../../product.json";
import type { ScreenProps } from "../app/nav";

const privacyUrl = (monetization as { legal?: { privacyUrl?: string } }).legal?.privacyUrl;
const TIMES: { t: string; label: string }[] = [
  { t: "08:00", label: "8:00 AM" },
  { t: "12:30", label: "12:30 PM" },
  { t: "18:30", label: "6:30 PM" },
  { t: "21:00", label: "9:00 PM" },
];

/** Settings: reminders, subscription, privacy & data, backup, support, appearance. */
export function SettingsScreen({ bottomInset, nav }: ScreenProps) {
  const app = useApp();
  const s = useSettings();
  const user = useCloudUser();
  const [privacy, setPrivacy] = useState(false);
  const settings = app.settings;

  const toggleTime = async (t: string) => {
    const has = settings.reminderTimes.includes(t);
    const times = has ? settings.reminderTimes.filter((x) => x !== t) : [...settings.reminderTimes, t];
    if (!has && settings.reminderTimes.length === 0) {
      const ok = await notify.ask("A gentle daily nudge to practise.");
      if (!ok) return toast("Allow notifications to get reminders");
      analytics.track("reminder_time_set");
    }
    appStore.set((cur) => updateSettings(cur, { reminderTimes: times }));
    feedback("pop", "select");
    void syncReminders(appStore.get());
  };

  const setField = (patch: Parameters<typeof updateSettings>[1]) => {
    appStore.set((cur) => updateSettings(cur, patch));
    void syncReminders(appStore.get());
  };

  return (
    <Screen title="Settings" bottomInset={bottomInset}>
      {/* Backup / account */}
      {cloud.online ? (
        <Card padded={false} style={styles.card}>
          <ListItem
            icon="cloud"
            iconTint={palette.success}
            title={user && !user.anonymous ? "Backup & sync" : "Your progress is backed up"}
            subtitle={user && !user.anonymous ? (user.email ?? undefined) : "Auto‑backup on · add an email to use on another phone"}
            trailing={!user || user.anonymous ? <Pill label="On" tone="success" /> : undefined}
            onPress={() => nav.openBackup()}
          />
        </Card>
      ) : null}

      {/* Pro */}
      <Card padded={false} style={styles.card}>
        {s.pro ? (
          <ListItem icon="star" iconTint={palette.warning} title="Pro" subtitle={s.proSource === "subscription" ? "Subscription active" : "Lifetime — thank you!"} onPress={() => nav.pro("settings")} />
        ) : (
          <ListItem icon="star" iconTint={palette.warning} title="Go Pro" subtitle="Up to 48 takes/day, long rehearsals, deep analytics" onPress={() => nav.pro("settings")} />
        )}
        {s.proSource === "subscription" ? <ListItem icon="settings" title="Manage subscription" subtitle={`Change or cancel in the ${Platform.OS === "ios" ? "App Store" : "Play Store"}`} onPress={() => iap.manageSubscriptions()} /> : null}
        <ListItem icon="refresh" title="Restore purchases" onPress={async () => { const n = await iap.restore().catch(() => 0); analytics.track("restore_completed"); toast(n ? "Purchases restored" : "No purchases found"); }} />
      </Card>

      {/* Reminders */}
      <SectionHeader title="Practice reminders" />
      <Card style={{ gap: space.md }}>
        <Text style={type.caption}>Pick when we nudge you. Skipped automatically if you've already practised today.</Text>
        <View style={styles.chips}>
          {TIMES.map((tm) => (
            <Chip key={tm.t} label={tm.label} selected={settings.reminderTimes.includes(tm.t)} onPress={() => toggleTime(tm.t)} />
          ))}
        </View>
        <Toggle label="Streak-at-risk nudge" description="An evening reminder when your streak is on the line" value={settings.streakAtRiskNudge} onChange={(v) => setField({ streakAtRiskNudge: v })} />
        <Toggle label="Weekly summary" description="A recap of your week's progress" value={settings.weeklySummary} onChange={(v) => setField({ weeklySummary: v })} />
      </Card>

      {/* Coaching preferences */}
      <SectionHeader title="Coaching" />
      <Card padded={false} style={styles.card}>
        <ListItem icon="trophy" iconTint={palette.warning} title="Streak & badges" subtitle="Your streak, best run and skill badges" onPress={() => nav.openAchievements()} />
        <Toggle label="Stutter-friendly mode" description="Don't flag repeated words as fillers" value={settings.stutterFriendly} onChange={(v) => setField({ stutterFriendly: v })} />
        <Toggle label="Reduce motion" description="Turn off celebrations and confetti" value={settings.reduceMotion} onChange={(v) => setField({ reduceMotion: v })} />
        <ListItem icon="globe" title="Language" value="English" chevron={false} />
      </Card>

      {/* Recording — honest about the input path (runtime records from the phone
          mic; Bluetooth headsets may not route in). */}
      <SectionHeader title="Recording" />
      <Card padded={false} style={styles.card}>
        <ListItem
          icon="headset"
          title="Microphone input"
          subtitle="Records from your phone mic. Wired headsets work; a Bluetooth headset may fall back to the phone mic."
          chevron={false}
        />
      </Card>

      {/* Feedback */}
      <SectionHeader title="Feedback" />
      <Card padded={false} style={styles.card}>
        <Toggle label="Vibration" description="A light tap on actions" value={s.haptics !== false} onChange={(v) => store.set({ haptics: v })} />
        <Toggle label="Sounds" description="Subtle confirmation sounds" value={s.sound === true} onChange={(v) => store.set({ sound: v })} />
      </Card>

      {/* Appearance — real controls, never a dead-end */}
      <SectionHeader title="Appearance" />
      <Card padded={false} style={styles.card}>
        <ListItem icon="moon" title="Theme" subtitle="Follows your phone" onPress={openDisplaySettings} />
        <ListItem icon="document" title="Text size" subtitle="Follows your phone" onPress={openDisplaySettings} />
      </Card>

      {/* Support + share */}
      <SectionHeader title="Help & sharing" />
      <Card padded={false} style={styles.card}>
        <ListItem icon="headset" title="Contact support" subtitle="We reply within 24 hours" onPress={() => nav.openSupport()} />
        <ListItem icon="share" title="Share with friends" subtitle="Send a link to Podium" onPress={() => void share.app("settings")} />
      </Card>

      {/* Privacy & data */}
      <SectionHeader title="Privacy & data" />
      <Card padded={false} style={styles.card}>
        <ListItem icon="lock" title="How your audio is handled" onPress={() => setPrivacy(true)} />
        {privacyUrl ? <ListItem icon="document" title="Privacy policy" onPress={() => Linking.openURL(privacyUrl).catch(() => {})} /> : null}
        <ListItem
          icon="trash"
          title="Delete all recordings"
          subtitle="Removes every take, transcript and report"
          onPress={() =>
            Alert.alert("Delete all recordings?", "This removes every take, transcript and report from this phone. Your streak and settings stay.", [
              { text: "Cancel", style: "cancel" },
              { text: "Delete", style: "destructive", onPress: () => { appStore.set((cur) => deleteAllRecordings(cur)); analytics.track("recordings_deleted"); toast("All recordings deleted"); } },
            ])
          }
        />
        <ListItem
          icon="trash"
          title="Delete all data"
          destructive
          onPress={() =>
            Alert.alert("Delete everything?", "This wipes all takes, progress and settings from this phone. It can't be undone.", [
              { text: "Cancel", style: "cancel" },
              { text: "Delete", style: "destructive", onPress: () => { appStore.set(() => deleteEverything(todayKey())); void notify.cancelAll(); toast("All data deleted"); } },
            ])
          }
        />
      </Card>

      <View style={{ alignItems: "center", gap: 2, paddingTop: space.sm }}>
        <Text style={type.caption}>{product.title}</Text>
        <Text style={type.caption}>Audio stays on your device by default.</Text>
      </View>

      <Sheet visible={privacy} title="Your audio, your device" onClose={() => setPrivacy(false)}>
        <View style={{ gap: space.md }}>
          <PrivacyLine icon="mic" text="Your voice is turned into text on your device. The audio itself never leaves your phone." />
          <PrivacyLine icon="sparkle" text="Only the transcript text is sent to our AI to write your tips and rewrite — processed transiently, not stored or used to train models." />
          <PrivacyLine icon="cloud" text="Cloud backup is optional and covers your stats and settings only, never your recordings." />
          <PrivacyLine icon="checkCircle" text="Coaching is for skill development — it isn't medical, therapy or professional advice." />
          {privacyUrl ? (
            <Text style={[type.caption, { textAlign: "center", textDecorationLine: "underline" }]} onPress={() => Linking.openURL(privacyUrl).catch(() => {})} accessibilityRole="link">
              Read the full privacy policy
            </Text>
          ) : null}
        </View>
      </Sheet>
    </Screen>
  );
}

function PrivacyLine({ icon, text }: { icon: "mic" | "sparkle" | "cloud" | "checkCircle"; text: string }) {
  return (
    <View style={styles.privacyRow}>
      <View style={styles.privacyIcon}><Icon name={icon} size={18} color={palette.primary} /></View>
      <Text style={[type.body, { flex: 1, color: palette.inkSoft }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { paddingHorizontal: space.lg },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  privacyRow: { flexDirection: "row", gap: space.md, alignItems: "flex-start" },
  privacyIcon: { width: 32, height: 32, borderRadius: 9, backgroundColor: palette.primarySoft, alignItems: "center", justifyContent: "center" },
});
