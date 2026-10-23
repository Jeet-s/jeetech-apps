import { useEffect, useState } from "react";
import { Alert, Linking, Share, StyleSheet, Text, View } from "react-native";
import {
  AccountSheet,
  Button,
  Card,
  Icon,
  IconButton,
  ListItem,
  Screen,
  SectionHeader,
  Segmented,
  Sheet,
  TextField,
  Toggle,
  feedback,
  isDark,
  palette,
  space,
  toast,
  type,
  useCloudUser,
} from "../ui";
import { type BlockDaySettings, MAX_REMINDERS } from "../core/model";
import { DAY, fmtDuration, toHHMM } from "../core/time";
import { exportBackup, importBackup } from "../core/backup";
import { blocksToCSV } from "../core/stats";
import { blockDayStore, settingsStore, syncBlockDayNow, useBlockDay, useBlockDaySettings } from "../core/data";
import { cloud } from "../modules/cloud";
import { store, useSettings } from "../modules/store";
import { iap } from "../modules/iap";
import { notify } from "../modules/notify";
import { analytics } from "../modules/analytics";
import { ActivityLogSheet } from "./BlockSheets";
import product from "../../product.json";

const NUDGE_OPTIONS = [1, 2, 5, 10, 15] as const;

/** Settings: account & sync, Pro, reminders, defaults, feedback, data & privacy. */
export function SettingsScreen({ bottomInset, onPro, privacyUrl }: { bottomInset: number; onPro: (from: string) => void; privacyUrl?: string }) {
  const app = useSettings();
  const s = useBlockDaySettings();
  const data = useBlockDay();
  const user = useCloudUser();
  const [sheet, setSheet] = useState<null | "account" | "hours" | "restore" | "log" | "privacy" | "battery" | "theme">(null);
  const [syncing, setSyncing] = useState(false);

  const patch = (p: Partial<BlockDaySettings>) => settingsStore.set((prev) => ({ ...prev, ...p }));

  const syncNow = async () => {
    setSyncing(true);
    feedback("tap", "light");
    try {
      await syncBlockDayNow();
      patch({ lastSyncAt: new Date().toISOString() });
      feedback("success", "success");
      toast("Synced");
    } catch {
      toast("Couldn’t sync — check your connection");
    }
    setSyncing(false);
  };

  const toggleReminders = async (v: boolean) => {
    if (!v) {
      patch({ remindersEnabled: false });
      await notify.cancelAll();
      toast("Reminders off");
      return;
    }
    const granted = await notify.requestPermission();
    patch({ remindersEnabled: granted });
    feedback(granted ? "success" : "pop", granted ? "success" : "warning");
    toast(granted ? "Reminders on — we’ll nudge you at each block" : "Allow notifications in system settings to get reminders");
  };

  const toggleNudge = (n: number) => {
    const has = s.preEndNudgesMin.includes(n);
    if (!has && s.preEndNudgesMin.length >= MAX_REMINDERS) return toast(`Up to ${MAX_REMINDERS} heads-ups`);
    const next = has ? s.preEndNudgesMin.filter((x) => x !== n) : [...s.preEndNudgesMin, n];
    patch({ preEndNudgesMin: next.slice().sort((a, b) => a - b) });
    toast(has ? `${fmtDuration(n)} heads-up off` : `${fmtDuration(n)} heads-up on`);
  };

  const backup = async () => {
    const iso = new Date().toISOString();
    const file = exportBackup({ ...data, lastBackupAt: iso }, s, iso);
    blockDayStore.set({ ...data, lastBackupAt: iso });
    analytics.track("backup_create");
    feedback("success", "success");
    try { await Share.share({ message: file }); toast("Backup ready to save"); } catch { /* cancelled */ }
  };

  const exportAllCsv = async () => {
    if (!data.blocks.length) return toast("Nothing to export yet");
    analytics.track("export_csv");
    try { await Share.share({ message: blocksToCSV(data.blocks) }); } catch { /* cancelled */ }
  };

  const deleteAll = () => {
    Alert.alert("Delete all data?", "This removes every block, routine and activity log from this phone. It can’t be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => { blockDayStore.reset(); feedback("pop", "warning"); toast("All data deleted"); } },
    ]);
  };

  const lastBackup = data.lastBackupAt ? new Date(data.lastBackupAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : null;

  return (
    <Screen title="Settings" bottomInset={bottomInset}>
      {cloud.online && cloud.emailSignIn ? (
        <Card padded={false} style={styles.card}>
          <ListItem
            icon="shield"
            iconTint={palette.success}
            title={user && !user.anonymous ? "Account & cloud sync" : "Back up & sync (Pro)"}
            subtitle={user && !user.anonymous ? (user.email ?? "Signed in") : "Sign in to sync across devices"}
            onPress={() => setSheet("account")}
          />
          {user && !user.anonymous ? (
            <ListItem
              icon={syncing ? "clock" : "upload"}
              title={syncing ? "Syncing…" : "Sync now"}
              subtitle={s.lastSyncAt ? `Last synced ${new Date(s.lastSyncAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} · encrypted in transit & at rest` : "Back up this device’s plan to the cloud"}
              onPress={syncing ? undefined : syncNow}
            />
          ) : null}
        </Card>
      ) : null}

      <Card padded={false} style={styles.card}>
        {app.pro ? (
          <ListItem icon="sparkle" iconTint={palette.accent} title="Pro unlocked" subtitle="Thanks for supporting BlockDay!" onPress={app.proSource === "subscription" ? () => iap.manageSubscriptions() : undefined} value={app.proSource === "subscription" ? "Manage" : undefined} />
        ) : (
          <ListItem icon="sparkle" iconTint={palette.accent} title="Upgrade to Pro" subtitle="Advanced analytics, cloud sync, more AI" onPress={() => onPro("settings")} />
        )}
      </Card>

      <SectionHeader title="Reminders" />
      <Card padded={false} style={styles.card}>
        <Toggle label="Block reminders" description="Local alerts at each block’s start" value={s.remindersEnabled} onChange={toggleReminders} />
        {s.remindersEnabled ? (
          <Toggle label="Keep active block in the shade" description="An ongoing notice with Done · Snooze · Skip while a block runs" value={s.notifPersistentBanner} onChange={(v) => patch({ notifPersistentBanner: v })} />
        ) : null}
      </Card>
      {s.remindersEnabled ? (
        <>
          <Card style={{ gap: space.sm }}>
            <Text style={type.label}>Heads-up before a block ends</Text>
            <View style={styles.wrap}>
              {NUDGE_OPTIONS.map((n) => (
                <Chip key={n} label={fmtDuration(n)} on={s.preEndNudgesMin.includes(n)} onPress={() => toggleNudge(n)} />
              ))}
            </View>
          </Card>
          <Card padded={false} style={styles.card}>
            <ListItem icon="shield" title="Make alarms reliable" subtitle="Keep reminders on time on Android" onPress={() => setSheet("battery")} />
          </Card>
        </>
      ) : null}

      <SectionHeader title="Focus cues" />
      <Card padded={false} style={styles.card}>
        <Toggle label="Live focus cues" description="An always-on Active Block banner that ramps up as a block ends" value={s.focusCues} onChange={(v) => { patch({ focusCues: v }); toast(v ? "Focus cues on" : "Focus cues off"); }} />
        {s.focusCues ? (
          <Toggle label="Full-screen alarm" description="A big, hard-to-miss transition screen with one-tap Done · Snooze · Skip" value={s.fullScreenAlarm} onChange={(v) => { patch({ fullScreenAlarm: v }); toast(v ? "Full-screen alarm on" : "Full-screen alarm off"); }} />
        ) : null}
      </Card>

      <SectionHeader title="Appearance & accessibility" />
      <Card padded={false} style={styles.card}>
        <ListItem icon="sparkle" iconTint={palette.accent} title="Theme" subtitle={`${isDark ? "Dark" : "Light"} · follows your device`} value={isDark ? "Dark" : "Light"} onPress={() => setSheet("theme")} />
        <Toggle label="Larger text" description="Lets text grow with your device’s text-size setting" value={s.largeText} onChange={(v) => { patch({ largeText: v }); feedback("pop", "select"); toast(v ? "Larger text on" : "Larger text off"); }} />
      </Card>

      <SectionHeader title="Planning defaults" />
      <Card style={{ gap: space.lg }}>
        <View style={{ gap: space.sm }}>
          <Text style={type.label}>Snap to</Text>
          <Segmented options={[{ value: "5", label: "5 min" }, { value: "10", label: "10 min" }, { value: "15", label: "15 min" }]} value={String(s.snapIntervalMin)} onChange={(v) => { patch({ snapIntervalMin: Number(v) as 5 | 10 | 15 }); toast(`Snapping to ${v} min`); }} />
        </View>
        <View style={{ gap: space.sm }}>
          <Text style={type.label}>Default block length</Text>
          <Segmented options={[{ value: "30", label: "30m" }, { value: "45", label: "45m" }, { value: "60", label: "60m" }, { value: "90", label: "90m" }]} value={String(s.defaultDurationMin)} onChange={(v) => { patch({ defaultDurationMin: Number(v) }); toast(`Default block ${fmtDuration(Number(v))}`); }} />
        </View>
        <ListItem icon="clock" title="Work hours" subtitle="Used to lay out AI plans and the timeline" value={`${toHHMM(s.workStart)}–${toHHMM(s.workEnd)}`} onPress={() => setSheet("hours")} />
      </Card>

      <SectionHeader title="Feedback" />
      <Card padded={false} style={styles.card}>
        <Toggle label="Vibration" description="A light tap on every action" value={app.haptics !== false} onChange={(v) => { store.set({ haptics: v }); toast(v ? "Vibration on" : "Vibration off"); }} />
        <Toggle label="Sounds" description="Subtle confirmation sounds" value={app.sound === true} onChange={(v) => { store.set({ sound: v }); toast(v ? "Sounds on" : "Sounds off"); }} />
      </Card>

      <SectionHeader title="Your data" />
      <Card padded={false} style={styles.card}>
        <ListItem icon="download" title="Create backup" subtitle={lastBackup ? `Last backup ${lastBackup}` : "Save a file you can restore anytime"} onPress={backup} />
        <ListItem icon="upload" title="Restore from backup" subtitle="Paste a backup file" onPress={() => setSheet("restore")} />
        <ListItem icon="share" title="Export everything (CSV)" onPress={exportAllCsv} />
        <ListItem icon="list" title="Activity log" subtitle={`${data.log.length} changes`} onPress={() => setSheet("log")} />
        <ListItem icon="trash" title="Delete all data" destructive onPress={deleteAll} />
      </Card>

      <SectionHeader title="Purchases & privacy" />
      <Card padded={false} style={styles.card}>
        <ListItem icon="undo" title="Restore purchases" onPress={async () => { const n = await iap.restore().catch(() => 0); toast(n ? "Purchases restored" : "No purchases found"); }} />
        <ListItem icon="shield" title="Privacy" subtitle="What we store and how to delete it" onPress={() => setSheet("privacy")} />
        {privacyUrl ? <ListItem icon="settings" title="Privacy policy" onPress={() => Linking.openURL(privacyUrl)} /> : null}
      </Card>

      <View style={{ alignItems: "center", gap: 2, paddingTop: space.sm }}>
        <Text style={type.caption}>{product.title}</Text>
        <Text style={type.caption}>Offline-first · {cloud.enabled ? "optional cloud sync" : "your data stays on this phone"}</Text>
      </View>

      <AccountSheet visible={sheet === "account"} onClose={() => setSheet(null)} onSignedIn={() => { syncBlockDayNow(); patch({ lastSyncAt: new Date().toISOString() }); }} />
      <WorkHoursSheet visible={sheet === "hours"} settings={s} onChange={patch} onClose={() => setSheet(null)} />
      <RestoreSheet visible={sheet === "restore"} onClose={() => setSheet(null)} />
      <ActivityLogSheet visible={sheet === "log"} log={data.log} onClose={() => setSheet(null)} />
      <PrivacySheet visible={sheet === "privacy"} onClose={() => setSheet(null)} />
      <BatteryTipsSheet visible={sheet === "battery"} onClose={() => setSheet(null)} />
      <ThemeSheet visible={sheet === "theme"} onClose={() => setSheet(null)} />
    </Screen>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Text
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={() => { feedback("pop", "select"); onPress(); }}
      style={[styles.chip, on && { backgroundColor: palette.primary, color: palette.onPrimary, borderColor: palette.primary }]}
    >
      {label}
    </Text>
  );
}

function WorkHoursSheet({ visible, settings, onChange, onClose }: { visible: boolean; settings: BlockDaySettings; onChange: (p: Partial<BlockDaySettings>) => void; onClose: () => void }) {
  const clamp = (n: number) => Math.max(0, Math.min(DAY, n));
  return (
    <Sheet visible={visible} title="Work hours" onClose={onClose}>
      <Text style={[type.body, { color: palette.inkSoft }]}>Blocks and AI plans lay out between these hours by default.</Text>
      <View style={styles.hoursRow}>
        <Text style={[type.label, { flex: 1 }]}>Start</Text>
        <IconButton icon="minus" label="Earlier start" size={40} onPress={() => onChange({ workStart: clamp(settings.workStart - 30) > settings.workEnd - 30 ? settings.workEnd - 30 : clamp(settings.workStart - 30) })} />
        <Text style={[type.amount, { minWidth: 62, textAlign: "center" }]}>{toHHMM(settings.workStart)}</Text>
        <IconButton icon="plus" label="Later start" size={40} onPress={() => onChange({ workStart: Math.min(settings.workEnd - 30, settings.workStart + 30) })} />
      </View>
      <View style={styles.hoursRow}>
        <Text style={[type.label, { flex: 1 }]}>End</Text>
        <IconButton icon="minus" label="Earlier end" size={40} onPress={() => onChange({ workEnd: Math.max(settings.workStart + 30, settings.workEnd - 30) })} />
        <Text style={[type.amount, { minWidth: 62, textAlign: "center" }]}>{toHHMM(settings.workEnd)}</Text>
        <IconButton icon="plus" label="Later end" size={40} onPress={() => onChange({ workEnd: Math.min(DAY, settings.workEnd + 30) })} />
      </View>
      <Button label="Done" size="lg" onPress={onClose} />
    </Sheet>
  );
}

function RestoreSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (visible) { setText(""); setErr(null); } }, [visible]);
  const restore = () => {
    const r = importBackup(text.trim());
    if (!r.ok) {
      feedback("error", "error");
      return setErr(r.error === "not_backup" ? "That doesn’t look like a BlockDay backup." : r.error === "unsupported" ? "That backup is from a newer version." : "Couldn’t read that backup — your current data is untouched.");
    }
    blockDayStore.set(r.state);
    settingsStore.set(r.settings);
    analytics.track("backup_restore");
    feedback("success", "success");
    toast("Backup restored");
    onClose();
  };
  return (
    <Sheet visible={visible} title="Restore from backup" onClose={onClose}>
      <Text style={[type.body, { color: palette.inkSoft }]}>Paste the contents of a backup file. This replaces everything on this phone.</Text>
      <TextField label="Backup data" placeholder="Paste backup here" value={text} onChangeText={(t) => { setText(t); setErr(null); }} error={err} multiline style={{ minHeight: 100, textAlignVertical: "top", paddingTop: space.md }} />
      <Button label="Restore" size="lg" icon="upload" disabled={!text.trim()} onPress={restore} />
    </Sheet>
  );
}

function PrivacySheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Sheet visible={visible} title="Privacy" onClose={onClose}>
      <View style={{ gap: space.md }}>
        <Row icon="lock" title="On your device by default" body="Your blocks, routines, settings and activity log live only on this phone. No account is required to use BlockDay." />
        <Row icon="shield" title="Optional cloud sync" body="If you sign in (Pro), your plan is backed up and synced. It’s encrypted in transit and at rest — but not end-to-end — so you can restore it on another phone." />
        <Row icon="sparkle" title="AI plan helper" body="When you use ‘Plan with AI’, only the task text you type is sent to generate a plan. No notes, names or analytics are included." />
        <Row icon="trash" title="Delete anytime" body="Delete all on-device data in Settings. Delete your cloud account from the Account sheet — removing everything saved in the cloud." />
      </View>
      {cloud.deleteAccountUrl ? (
        <Text style={[type.caption, { textAlign: "center" }]} accessibilityRole="link" onPress={() => Linking.openURL(cloud.deleteAccountUrl)}>Request account deletion on the web</Text>
      ) : null}
      <Button label="Close" variant="secondary" onPress={onClose} />
    </Sheet>
  );
}

function BatteryTipsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Sheet visible={visible} title="Reliable alarms" onClose={onClose}>
      <Text style={[type.body, { color: palette.inkSoft }]}>
        BlockDay schedules reminders locally on your phone — no account or internet needed. Some Android phones pause background apps to save battery, which can delay alerts. Two quick settings keep them on time:
      </Text>
      <View style={{ gap: space.md }}>
        <Row icon="bell" title="Allow notifications" body="Make sure notifications are enabled for BlockDay so alerts can show." />
        <Row icon="flame" title="Don’t optimise battery for BlockDay" body="In your phone’s Battery settings, set BlockDay to “Unrestricted” (or exclude it from optimisation) so reminders fire exactly on time." />
      </View>
      <Button label="Open system settings" icon="settings" variant="secondary" onPress={() => Linking.openSettings().catch(() => {})} />
      <Button label="Got it" onPress={onClose} />
    </Sheet>
  );
}

function ThemeSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Sheet visible={visible} title="Theme" onClose={onClose}>
      <View style={styles.themeRow}>
        <View style={[styles.themeSwatch, { backgroundColor: isDark ? "#11131A" : "#F6F7FB", borderColor: palette.border }]}>
          <View style={[styles.themeBar, { backgroundColor: palette.primary }]} />
          <View style={[styles.themeBar, { backgroundColor: palette.accent, width: 28 }]} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={type.bodyStrong}>{isDark ? "Dark" : "Light"} theme</Text>
          <Text style={[type.caption, { color: palette.inkSoft }]}>BlockDay matches your device appearance automatically.</Text>
        </View>
      </View>
      <Text style={[type.body, { color: palette.inkSoft }]}>
        To switch between light and dark, change your phone’s display/appearance setting — BlockDay follows it on next launch. Colours meet WCAG AA contrast in both themes.
      </Text>
      <Button label="Open display settings" icon="settings" variant="secondary" onPress={() => Linking.openSettings().catch(() => {})} />
      <Button label="Got it" onPress={onClose} />
    </Sheet>
  );
}

function Row({ icon, title, body }: { icon: import("../ui").IconName; title: string; body: string }) {
  return (
    <View style={styles.privacyRow}>
      <View style={styles.privacyIcon}><Icon name={icon} size={18} color={palette.primary} /></View>
      <View style={{ flex: 1 }}>
        <Text style={type.bodyStrong}>{title}</Text>
        <Text style={[type.caption, { color: palette.inkSoft }]}>{body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { paddingHorizontal: space.lg },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  chip: { ...type.label, color: palette.ink, borderWidth: 1, borderColor: palette.border, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, overflow: "hidden", backgroundColor: palette.surface },
  hoursRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  privacyRow: { flexDirection: "row", gap: space.md },
  privacyIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: palette.primarySoft, alignItems: "center", justifyContent: "center" },
  themeRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  themeSwatch: { width: 64, height: 64, borderRadius: 16, borderWidth: 1, alignItems: "center", justifyContent: "center", gap: 5 },
  themeBar: { width: 36, height: 6, borderRadius: 3 },
});
