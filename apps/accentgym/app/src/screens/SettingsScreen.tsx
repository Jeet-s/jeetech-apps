import { useState } from "react";
import { Alert, Linking, Platform, Text, View } from "react-native";
import {
  AccountSheet,
  Button,
  Card,
  Chip,
  ListItem,
  Screen,
  SectionHeader,
  Segmented,
  Toggle,
  palette,
  space,
  toast,
  type,
  useCloudUser,
} from "../ui";
import { canOfferPro } from "../modules/purchase-ui";
import { OnboardingScreen } from "./OnboardingScreen";
import { EmailSignInSheet } from "./EmailSignInSheet";
import { cloud } from "../modules/cloud";
import { store, useSettings } from "../modules/store";
import { restorePurchases } from "../modules/restore-purchases";
import { iap } from "../modules/iap";
import { share } from "../modules/share";
import { notify } from "../modules/notify";
import { openDisplaySettings } from "../modules/display";
import monetization from "../../monetization.json";
import product from "../../product.json";
import { gymStore, useGym, startGymSync } from "../core/data";
import { setReminder } from "../core/profile";
import { chooseAccent, mergeBackup } from "../core/state";
import { ACCENT_NAME } from "../core/accent";
import type { Accent } from "../core/types";

const legal = (monetization as { legal?: { privacyUrl: string } }).legal;
const REMINDER_TIMES = ["08:00", "12:00", "19:00", "21:00"];

export function SettingsScreen({ bottomInset, onPro }: { bottomInset: number; onPro: (from: string) => void }) {
  const [assessment, setAssessment] = useState(false);
  const s = useSettings();
  const gym = useGym();
  const user = useCloudUser();
  const [restoreStatus, setRestoreStatus] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [account, setAccount] = useState(false);
  const [reminderDenied, setReminderDenied] = useState(false);
  const profile = gym.profile;
  const reminderOn = !!profile.reminderTime;

  const patchProfile = (patch: Partial<typeof profile>) => gymStore.set((g) => ({ ...g, profile: { ...g.profile, ...patch } }));

  const setReminderTime = async (time: string | undefined) => {
    // Save the preference FIRST so the toggle/chips reflect it even if permission is denied.
    gymStore.set((g) => ({ ...g, profile: setReminder(g.profile, time) }));
    setReminderDenied(false);
    if (!time) {
      await notify.cancel("daily_practice");
      return;
    }
    const ok = await notify.ask("Daily nudges keep your streak alive.");
    if (!ok) {
      setReminderDenied(true);
      return;
    }
    const [h, m] = time.split(":").map(Number);
    await notify.daily("daily_practice", { hour: h, minute: m }, { title: "Accent Gym", body: "2 minutes of practice keeps your streak 🔥" });
    toast("Reminder set");
  };

  if (assessment) return <OnboardingScreen assessmentOnly onDone={() => setAssessment(false)} onPro={onPro} />;

  return (
    <Screen title="Settings" bottomInset={bottomInset}>
      {cloud.online && cloud.emailSignIn ? (
        <Card padded={false} style={{ paddingHorizontal: space.lg }}>
          <ListItem
            icon="lock"
            title={user && !user.anonymous ? "Account & backup" : "Back up your progress"}
            subtitle={user && !user.anonymous ? user.email ?? "Signed in" : "Sign in with an email code to keep your progress & Pro across phones"}
            onPress={() => setAccount(true)}
          />
        </Card>
      ) : null}

      {canOfferPro() || s.pro ? <Card padded={false} style={{ paddingHorizontal: space.lg }}>
        {s.pro ? (
          <ListItem icon="star" iconTint={palette.warning} title="Pro unlocked" subtitle="Pro tools unlocked · ad-free with Pro" />
        ) : (
          <ListItem icon="star" iconTint={palette.warning} title="Go Pro" subtitle="Pro tools, subscription AI allowance, ad-free with Pro" onPress={() => onPro("settings")} />
        )}
        {s.proSource === "subscription" ? <ListItem icon="star" title="Manage subscription" subtitle={Platform.OS === "ios" ? "Change or cancel in the App Store" : "Change or cancel in Google Play"} onPress={() => iap.manageSubscriptions()} /> : null}
      </Card> : null}

      <Card padded={false} style={{ paddingHorizontal: space.lg }}><ListItem icon="target" title="My three focus sounds" subtitle="Take the optional sound check" onPress={() => setAssessment(true)} /></Card>
      <SectionHeader title="Coaching" />
      <Card style={{ gap: space.md }}>
        <Text style={type.label}>Target accent</Text>
        <Segmented<Accent>
          value={profile.targetAccent}
          onChange={(a) => { gymStore.set((g) => chooseAccent(g, a)); toast(`Scoring to ${ACCENT_NAME[a]}`); }}
          options={[{ value: "us", label: "American" }, { value: "uk", label: "British" }]}
        />
        <Text style={type.label}>Daily goal</Text>
        <Segmented<string>
          value={String(profile.dailyMinutes)}
          onChange={(v) => patchProfile({ dailyMinutes: Number(v) })}
          options={[{ value: "3", label: "3 min" }, { value: "5", label: "5 min" }, { value: "10", label: "10 min" }]}
        />
        <Toggle label="Show IPA" description="Phonetic symbols under each line" value={profile.ipaOn} onChange={(v) => patchProfile({ ipaOn: v })} />
        <Toggle label="Coaching comments" description="Extra per-word voice notes (off keeps it quick)" value={profile.commentsOn} onChange={(v) => patchProfile({ commentsOn: v })} />
      </Card>

      <SectionHeader title="Reminders" />
      <Card style={{ gap: space.sm }}>
        <Toggle
          label="Daily practice reminder"
          description="A gentle nudge to keep your streak"
          value={reminderOn}
          onChange={(v) => setReminderTime(v ? "19:00" : undefined)}
        />
        {reminderOn ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
            {REMINDER_TIMES.map((t) => (
              <Chip key={t} label={t} selected={profile.reminderTime === t} onPress={() => setReminderTime(t)} />
            ))}
          </View>
        ) : null}
        {reminderDenied ? (
          <Card accent={palette.warning}>
            <Text style={type.bodyStrong}>Notifications are off</Text>
            <Text style={type.caption}>Turn them on for Accent Gym in system settings to get your reminder.</Text>
            <View style={{ height: space.sm }} />
            <Button label="Open settings" size="sm" variant="secondary" onPress={() => Linking.openSettings()} />
          </Card>
        ) : null}
      </Card>

      <SectionHeader title="Display" />
      <Card padded={false} style={{ paddingHorizontal: space.lg }}>
        <ListItem icon="settings" title="Theme" value="Follows your phone" onPress={openDisplaySettings} />
        <ListItem icon="settings" title="Text size" value="Follows your phone" onPress={openDisplaySettings} />
      </Card>

      <SectionHeader title="Feedback & sharing" />
      <Card padded={false} style={{ paddingHorizontal: space.lg }}>
        <Toggle label="Vibration" description="A light tap on each action" value={s.haptics !== false} onChange={(v) => store.set({ haptics: v })} />
        <Toggle label="Sounds" description="Subtle confirmation sounds" value={s.sound === true} onChange={(v) => store.set({ sound: v })} />
        <ListItem icon="share" title="Share with friends" subtitle="Send a link to the app" onPress={() => void share.app("settings")} />
      </Card>

      <SectionHeader title="Purchases & data" />
      <Card padded={false} style={{ paddingHorizontal: space.lg }}>
        <ListItem
          icon="lock"
          title={restoring ? "Checking purchases…" : "Restore purchases"}
          subtitle={restoreStatus ?? "Use the store account you bought with"}
          onPress={async () => {
            if (restoring) return;
            setRestoring(true);
            setRestoreStatus("Checking your store account…");
            setRestoreStatus(await restorePurchases());
            setRestoring(false);
          }}
        />
        {legal?.privacyUrl ? <ListItem icon="settings" title="Privacy policy" subtitle="How your data is handled" onPress={() => Linking.openURL(legal.privacyUrl)} /> : null}
        <ListItem
          icon="trash"
          title="Delete all data"
          destructive
          onPress={() =>
            Alert.alert("Delete all data?", "This removes your progress, plan and word set from this phone. It can't be undone.", [
              { text: "Cancel", style: "cancel" },
              { text: "Delete", style: "destructive", onPress: () => { gymStore.reset(); void startGymSync(); toast("All data deleted"); } },
            ])
          }
        />
      </Card>

      <View style={{ alignItems: "center", gap: 2 }}>
        <Text style={type.caption}>{product.title}</Text>
        <Text style={type.caption}>Your voice is turned into text on your phone — recordings never leave the device.</Text>
      </View>

      <EmailSignInSheet visible={account && (!user || user.anonymous)} onClose={() => setAccount(false)} onSignedIn={async ({ switched }) => { await startGymSync().pullNow(switched ? { merge: mergeBackup } : undefined); }} />
      <AccountSheet visible={account && !!user && !user.anonymous} onClose={() => setAccount(false)} onSignedIn={({ switched }) => { void startGymSync().pullNow(switched ? { merge: mergeBackup } : undefined); }} />
    </Screen>
  );
}
