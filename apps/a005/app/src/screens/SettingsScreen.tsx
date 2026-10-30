import { useState } from "react";
import { Alert, Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  AccountSheet,
  Button,
  Card,
  Chip,
  ListItem,
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
import { SpeedPicker } from "./audio";
import type { ScreenProps } from "./nav";
import { cloud } from "../modules/cloud";
import { openDisplaySettings } from "../modules/display";
import { store, useSettings } from "../modules/store";
import { iap } from "../modules/iap";
import { notify } from "../modules/notify";
import { analytics } from "../modules/analytics";
import { bandUpStore, prefsStore, useBandUp, usePrefs, startBandUpSync } from "../core/data";
import { setCaptions, setPlaybackSpeed, setTargetScore, setTestDate, addDays, daysUntilTest, type PlaybackSpeed } from "../core/model";
import { countdownLabel } from "../core/plan";
import monetization from "../../monetization.json";

const dateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const DATE_OPTIONS: { label: string; days: number | null }[] = [
  { label: "In 2 weeks", days: 14 },
  { label: "In 1 month", days: 30 },
  { label: "In 2 months", days: 60 },
  { label: "In 3 months", days: 90 },
  { label: "Not booked", days: null },
];
const TARGETS = [20, 22, 24, 26, 28, 30];
const REMINDER_HOURS = [7, 8, 9, 12, 17, 18, 19, 20, 21];
const hourLabel = (h: number) => `${h % 12 || 12}:00 ${h >= 12 ? "PM" : "AM"}`;
const privacyUrl = (monetization as { legal?: { privacyUrl?: string } }).legal?.privacyUrl;

// Plain-language disclosure that must stay true to the Data safety form (see lib/play/app-content.ts appFacts):
// audio is transcribed on-device and never uploaded; only the transcript text is sent for AI scoring; AdMob collects
// and shares ad data; the optional backup and push token use our server. No "everything stays on your phone" claim.
const PRIVACY_SECTIONS: { title: string; body: string }[] = [
  {
    title: "Your voice stays on your phone",
    body: "Your spoken answer is turned into text right here on your device by Android's speech recognizer. The audio is never recorded to a file, uploaded, stored or shared.",
  },
  {
    title: "AI scoring (needs the internet)",
    body: "Only the text transcript — not your audio — is sent to our server and AI provider to estimate a score and rewrite your answer. It isn't used to train models. On-device pacing still works offline.",
  },
  {
    title: "Ads",
    body: "Band Up shows ads from Google AdMob. After you accept the consent prompt, AdMob collects and shares with Google an advertising ID, approximate location (from your IP), app activity and diagnostics to show and measure ads. Go Pro to remove ads.",
  },
  {
    title: "Reminders & updates",
    body: "Practice reminders are scheduled on your phone. If you allow notifications, a push token is registered with our server so we can send occasional updates. You can turn reminders off any time.",
  },
  {
    title: "Backup (optional)",
    body: "Everything works offline and signed out. If you sign in with an email code, your practice history is backed up to our server so it follows you to a new phone.",
  },
];

/** Settings: Pro, exam setup, audio/display, reminders, backup, purchases,
 *  privacy, delete all data and the non-affiliation / estimate disclaimer. */
export function SettingsScreen({ bottomInset, onPro }: ScreenProps) {
  const s = useSettings();
  const data = useBandUp();
  const prefs = usePrefs();
  const user = useCloudUser();
  const today = dateKey(new Date());
  const [account, setAccount] = useState(false);
  const [sheet, setSheet] = useState<"date" | "target" | "time" | "privacy" | null>(null);

  const daysLeft = daysUntilTest(data, today);

  const scheduleReminder = (hour: number) =>
    notify.daily("practice", { hour, minute: 0 }, { title: "10 minutes today moves your score", body: "Speak one answer and keep your streak alive. Ready?" });

  const toggleReminder = async (on: boolean) => {
    feedback("pop", "select");
    if (on) {
      const ok = await notify.ask("Get a short daily nudge to keep your streak and move your score.");
      if (!ok) {
        toast("Enable notifications in system settings to get reminders.");
        return;
      }
      await scheduleReminder(prefs.reminderHour);
      prefsStore.set((p) => ({ ...p, remindersOn: true }));
      analytics.track("reminder_enabled", {});
      toast(`Daily reminder set for ${hourLabel(prefs.reminderHour)}`);
    } else {
      await notify.cancel("practice");
      prefsStore.set((p) => ({ ...p, remindersOn: false }));
      toast("Daily reminder off");
    }
  };

  const setReminderHour = async (hour: number) => {
    prefsStore.set((p) => ({ ...p, reminderHour: hour }));
    feedback("pop", "select");
    setSheet(null);
    if (prefs.remindersOn && (await notify.granted())) await scheduleReminder(hour);
    toast(prefs.remindersOn ? `Reminder moved to ${hourLabel(hour)}` : `Reminder time set to ${hourLabel(hour)}`);
  };

  const deleteAll = () =>
    Alert.alert("Delete all data?", "This removes every answer, score, phrase and setting from this phone. It can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          bandUpStore.reset();
          prefsStore.reset();
          notify.cancel("practice");
          // Wipe first-run state too, so the app restarts at onboarding exactly
          // like a fresh install (test date, mic check and the "second session"
          // ad gate all reset). Entitlements (Pro / removed ads) are purchases
          // and survive — Restore brings them back regardless.
          store.set({ onboarded: false, sessions: 0 });
          feedback("success", "warning");
          toast("All data deleted");
        },
      },
    ]);

  return (
    <Screen title="Settings" bottomInset={bottomInset}>
      {/* Pro */}
      <Card padded={false} style={styles.cardPad}>
        {s.pro ? (
          <ListItem icon="star" iconTint={palette.accent} title="Pro active" subtitle={s.proSource === "subscription" ? "Exam-date pass / subscription" : "Lifetime unlock — thank you!"} />
        ) : (
          <ListItem icon="star" iconTint={palette.accent} title="Upgrade to Pro" subtitle="Unlimited AI scoring, mocks & packs" onPress={() => onPro("settings")} />
        )}
        {s.proSource === "subscription" ? <ListItem icon="refresh" title="Manage subscription" onPress={() => iap.manageSubscriptions()} /> : null}
      </Card>

      {/* Backup */}
      {cloud.online && cloud.emailSignIn ? (
        <>
          <SectionHeader title="Backup" />
          <Card padded={false} style={styles.cardPad}>
            <ListItem
              icon="lock"
              title={user && !user.anonymous ? "Account & backup" : "Back up your progress"}
              subtitle={user && !user.anonymous ? user.email ?? "Signed in" : "Optional — email code, no password. Keeps your history across phones."}
              onPress={() => setAccount(true)}
            />
          </Card>
        </>
      ) : null}

      {/* Exam setup */}
      <SectionHeader title="Exam setup" />
      <Card padded={false} style={styles.cardPad}>
        <ListItem icon="calendar" title="Test date" value={countdownLabel(daysLeft)} onPress={() => setSheet("date")} />
        <ListItem icon="target" title="Target score" value={data.profile.targetScore ? `${data.profile.targetScore}/30` : "Not set"} onPress={() => setSheet("target")} />
      </Card>

      {/* Audio & display */}
      <SectionHeader title="Audio & display" />
      <Card style={{ gap: space.md }}>
        <View>
          <Text style={type.bodyStrong}>Default playback speed</Text>
          <Text style={[type.caption, { marginBottom: space.sm }]}>For the item, sample and improved answers</Text>
          <SpeedPicker value={data.profile.playbackSpeed} onChange={(v: PlaybackSpeed) => bandUpStore.set((st) => setPlaybackSpeed(st, v))} />
        </View>
        <Toggle label="Show sentence text" description="Show the Repeat sentence while you listen. Off keeps it hidden so you practise hearing — reveal it any time with “Show text”." value={data.profile.captions} onChange={(v) => bandUpStore.set((st) => setCaptions(st, v))} />
      </Card>

      {/* Display — the app follows the phone's theme & text size; these open the phone's controls. */}
      <SectionHeader title="Display" />
      <Card padded={false} style={styles.cardPad}>
        <ListItem
          icon="contrast"
          title="Theme"
          subtitle="Follows your phone — light or dark"
          value="Open"
          onPress={() => { feedback("tap", "light"); openDisplaySettings(); }}
        />
        <ListItem
          icon="textSize"
          title="Text size"
          subtitle="Follows your phone's font size"
          value="Open"
          onPress={() => { feedback("tap", "light"); openDisplaySettings(); }}
        />
      </Card>

      {/* Reminders */}
      <SectionHeader title="Reminders" />
      <Card padded={false} style={styles.cardPad}>
        <Toggle label="Daily practice reminder" description={`A gentle nudge at ${hourLabel(prefs.reminderHour)} to keep your streak`} value={prefs.remindersOn} onChange={toggleReminder} />
        <ListItem icon="clock" title="Reminder time" value={hourLabel(prefs.reminderHour)} onPress={() => setSheet("time")} />
      </Card>

      {/* Feedback */}
      <SectionHeader title="Feedback" />
      <Card padded={false} style={styles.cardPad}>
        <Toggle label="Vibration" description="A light tap on actions" value={s.haptics !== false} onChange={(v) => store.set({ haptics: v })} />
        <Toggle label="Sounds" description="Subtle confirmation sounds" value={s.sound === true} onChange={(v) => store.set({ sound: v })} />
      </Card>

      {/* Purchases & data */}
      <SectionHeader title="Purchases & data" />
      <Card padded={false} style={styles.cardPad}>
        <ListItem
          icon="refresh"
          title="Restore purchases"
          onPress={async () => {
            const n = await iap.restore().catch(() => 0);
            toast(n ? "Purchases restored" : "No purchases found");
          }}
        />
        <ListItem icon="lock" title="Privacy & data" subtitle="What stays on your phone, what's sent and why" onPress={() => { feedback("tap", "light"); setSheet("privacy"); }} />
        <ListItem icon="trash" title="Delete all data" destructive onPress={deleteAll} />
      </Card>

      {/* Disclaimer */}
      <View style={styles.footer}>
        <Text style={[type.caption, { textAlign: "center" }]}>
          Scores are AI estimates, not official results. Band Up is an independent study tool and is not affiliated with or endorsed by the test owner.
        </Text>
        <Text style={[type.caption, { textAlign: "center" }]}>Your answers and scores live on this phone. Ads, AI scoring and optional backup use the internet — see Privacy &amp; data.</Text>
      </View>

      <AccountSheet visible={account} onClose={() => setAccount(false)} onSignedIn={() => { startBandUpSync().pullNow().catch(() => {}); }} />

      {/* Exam date / target sheets */}
      <Sheet visible={sheet === "date"} title="When is your test?" onClose={() => setSheet(null)}>
        <View style={styles.chips}>
          {DATE_OPTIONS.map((o) => (
            <Chip
              key={o.label}
              label={o.label}
              onPress={() => {
                bandUpStore.set((st) => setTestDate(st, o.days === null ? null : addDays(today, o.days)));
                feedback("pop", "select");
                setSheet(null);
                toast(o.days === null ? "Test date cleared" : "Test date saved");
              }}
            />
          ))}
        </View>
      </Sheet>
      <Sheet visible={sheet === "time"} title="Reminder time" onClose={() => setSheet(null)}>
        <Text style={type.caption}>When should we nudge you to practice each day?</Text>
        <View style={styles.chips}>
          {REMINDER_HOURS.map((h) => (
            <Chip key={h} label={hourLabel(h)} selected={prefs.reminderHour === h} onPress={() => setReminderHour(h)} />
          ))}
        </View>
      </Sheet>
      <Sheet visible={sheet === "target"} title="Target speaking score" onClose={() => setSheet(null)}>
        <View style={styles.chips}>
          {TARGETS.map((t) => (
            <Chip
              key={t}
              label={`${t}/30`}
              selected={data.profile.targetScore === t}
              onPress={() => {
                bandUpStore.set((st) => setTargetScore(st, t));
                feedback("pop", "select");
                setSheet(null);
                toast(`Target set to ${t}/30`);
              }}
            />
          ))}
        </View>
      </Sheet>

      {/* Privacy & data — a self-contained, honest account of every data flow (Google Play policy: the app's own
          disclosure must match the Data safety form — audio is on-device, only the transcript is sent; AdMob and the
          optional backup/push use the network). Keep it truthful; never claim "everything stays on your phone". */}
      <Sheet visible={sheet === "privacy"} title="Privacy & data" onClose={() => setSheet(null)}>
        <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: space.md, paddingBottom: space.sm }}>
          {PRIVACY_SECTIONS.map((p) => (
            <View key={p.title} style={{ gap: 2 }}>
              <Text style={type.bodyStrong}>{p.title}</Text>
              <Text style={[type.caption, { color: palette.inkSoft }]}>{p.body}</Text>
            </View>
          ))}
          <Text style={[type.caption, { color: palette.inkMuted }]}>
            Delete your account and backup any time in Backup → Delete account, or wipe this phone with “Delete all data”. Backup is encrypted in transit but not end-to-end.
          </Text>
          {privacyUrl ? (
            <Button variant="secondary" icon="lock" label="Read the full privacy policy" onPress={() => Linking.openURL(privacyUrl)} />
          ) : null}
        </ScrollView>
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  cardPad: { paddingHorizontal: space.lg },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  footer: { alignItems: "center", gap: space.sm, marginTop: space.sm, paddingHorizontal: space.sm },
});
