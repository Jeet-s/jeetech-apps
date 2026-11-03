import { useState } from "react";
import { Alert, Linking, Text, View } from "react-native";
import { AccountSheet, Card, ListItem, Screen, SectionHeader, Toggle, feedback, palette, space, toast, type, useCloudUser } from "../ui";
import { SyncChip, appStore, useApp } from "./common";
import { useNav } from "../nav";
import { cloud } from "../modules/cloud";
import { store, useSettings } from "../modules/store";
import { notify } from "../modules/notify";
import { iap } from "../modules/iap";
import { share } from "../modules/share";
import { analytics } from "../modules/analytics";
import { openDisplaySettings } from "../modules/display";
import { pullNowApp } from "../core/data";
import { updateSettings, type AppState } from "../core/app";
import product from "../../product.json";
import monetization from "../../monetization.json";

const privacyUrl = (monetization as { legal?: { privacyUrl?: string } }).legal?.privacyUrl;

/** More: backup/account, Pro, support, feedback, display, purchases & data. */
export function MoreScreen({ bottomInset }: { bottomInset: number }) {
  const app = useApp();
  const nav = useNav();
  const s = useSettings();
  const user = useCloudUser();
  const [account, setAccount] = useState(false);

  const toggleReminders = async (v: boolean) => {
    if (v) {
      const ok = await notify.ask("Get a weekly stat recap and a nudge to finish unfinished matches");
      if (!ok) { feedback("error", "warning"); return toast("Allow notifications in your phone settings to turn this on."); }
      await notify.weekly("recap", { weekday: 1, hour: 18, minute: 0 }, { title: "Your weekly cricket recap 🏏", body: "See who scored the most runs and took the most wickets this week." });
      feedback("success", "medium");
      toast("Weekly recap on — Sundays at 6pm");
    } else {
      await notify.cancel("recap");
      feedback("pop", "light");
    }
    store.set({ reminders: v });
  };

  const liveMatch = app.matches.find((m) => m.status === "live" || m.status === "innings_break");
  const toggleMatchReminders = async (v: boolean) => {
    if (v) {
      const ok = await notify.ask("Get a nudge to finish a match you've left live");
      if (!ok) { feedback("error", "warning"); return toast("Allow notifications in your phone settings to turn this on."); }
      store.set({ matchReminders: true });
      feedback("success", "medium");
      if (liveMatch) {
        await notify.at("unfinished_match", new Date(Date.now() + 6 * 3600 * 1000), {
          title: "Finish your match? 🏏",
          body: "You have a match in progress. Tap to resume scoring where you left off.",
        });
        toast("On — we'll remind you about your live match");
      } else {
        toast("On — we'll nudge you whenever you leave a match unfinished");
      }
    } else {
      await notify.cancel("unfinished_match");
      store.set({ matchReminders: false });
      feedback("pop", "light");
    }
  };

  const deleteAll = () =>
    Alert.alert("Delete all data?", "This removes every match, player, team and tournament from this phone. It can't be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => { appStore.reset(); feedback("error", "warning"); toast("All data deleted"); } },
    ]);

  return (
    <>
    <Screen title="More" bottomInset={bottomInset}>
      {cloud.online && cloud.emailSignIn ? (
        <Card padded={false} style={{ paddingHorizontal: space.lg }}>
          <ListItem
            icon="cloud"
            title={user && !user.anonymous ? "Account & backup" : "Back up your data"}
            subtitle={user && !user.anonymous ? (user.email ?? undefined) : "Optional email sign-in — only for backup & restore"}
            onPress={() => setAccount(true)}
          />
          {/* Visible, honest sync status so the free-backup promise is trustworthy, not just claimed (QA #7). */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingBottom: space.md }}>
            <SyncChip />
            <Text style={[type.caption, { color: palette.inkMuted, flex: 1 }]} numberOfLines={2}>
              Encrypted in transit & at rest · restore with an email code
            </Text>
          </View>
        </Card>
      ) : null}

      <Card padded={false} style={{ paddingHorizontal: space.lg }}>
        {s.pro ? (
          <ListItem icon="star" iconTint={palette.accent} title="Pro unlocked" subtitle="Thanks for supporting the app!" />
        ) : (
          <ListItem icon="star" iconTint={palette.accent} title="Go Pro" subtitle="Power features & no ads — stats stay free" onPress={() => nav.openPro("more")} />
        )}
      </Card>

      <SectionHeader title="Help" />
      <Card padded={false} style={{ paddingHorizontal: space.lg }}>
        <ListItem icon="mail" title="Support & tickets" subtitle="Get help · 24–48h reply" onPress={() => nav.push({ t: "support" })} />
        <ListItem icon="share" title="Share with friends" subtitle="Send a link to the app" onPress={() => void share.app("more")} />
      </Card>

      <SectionHeader title="Feedback" />
      <Card padded={false} style={{ paddingHorizontal: space.lg }}>
        <Toggle label="Vibration" description="A tap on every run and wicket" value={s.haptics !== false} onChange={(v) => store.set({ haptics: v })} />
        <Toggle label="Sounds" description="Subtle confirmation sounds" value={s.sound === true} onChange={(v) => store.set({ sound: v })} />
        <Toggle label="Weekly recap" description="A Sunday summary of your stats" value={s.reminders === true} onChange={toggleReminders} />
        <Toggle label="Unfinished match reminder" description="A nudge to finish a match you left live" value={s.matchReminders === true} onChange={toggleMatchReminders} />
        <Toggle
          label="Left-handed keypad"
          description="Mirror the scoring keypad"
          value={!!app.settings.leftHandedKeypad}
          onChange={(v) => { appStore.set((st) => updateSettings(st, { leftHandedKeypad: v }) as AppState); feedback("pop", "select"); }}
        />
      </Card>

      <SectionHeader title="Display" />
      <Card padded={false} style={{ paddingHorizontal: space.lg }}>
        <ListItem icon="settings" title="Theme" value="Follows your phone" onPress={() => void openDisplaySettings()} />
        <ListItem icon="settings" title="Text size" value="Follows your phone" onPress={() => void openDisplaySettings()} />
      </Card>

      <SectionHeader title="Purchases & data" />
      <Card padded={false} style={{ paddingHorizontal: space.lg }}>
        <ListItem icon="lock" title="Restore purchases" onPress={async () => { const n = await iap.restore().catch(() => 0); toast(n ? "Purchases restored" : "No purchases found"); }} />
        {s.proSource === "subscription" ? <ListItem icon="star" title="Manage subscription" onPress={() => iap.manageSubscriptions()} /> : null}
        {privacyUrl ? <ListItem icon="shield" title="Privacy policy" onPress={() => Linking.openURL(privacyUrl)} /> : null}
        <ListItem icon="trash" title="Delete all data" destructive onPress={deleteAll} />
      </Card>

      <View style={{ alignItems: "center", gap: 2 }}>
        <Text style={type.caption}>{product.title}</Text>
        <Text style={type.caption}>{cloud.enabled ? "Signed-in data is backed up securely." : "Your data never leaves this phone."}</Text>
      </View>

    </Screen>
      {/* Rendered OUTSIDE the Screen's ScrollView: a <Modal> nested inside a ScrollView content container
          failed to present on device (QA: "Back up your data" tapped 3× did nothing) — hoisting it to the
          screen root, like the root-level ProSheet that worked, makes it open reliably. */}
      <AccountSheet visible={account} onClose={() => setAccount(false)} onSignedIn={() => { analytics.track("backup_enabled"); void pullNowApp(); }} />
    </>
  );
}
