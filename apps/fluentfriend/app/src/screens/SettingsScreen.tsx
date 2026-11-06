import { useEffect, useState } from "react";
import { Alert, AppState, Linking, StyleSheet, Text, View } from "react-native";
import { Button, Card, Chip, Icon, ListItem, Pill, SectionHeader, Toggle, palette, radius, space, toast, tones, type, useCloudUser } from "../ui";
import { RouteScreen } from "../components";
import { cloud } from "../modules/cloud";
import { store, useSettings } from "../modules/store";
import { iap } from "../modules/iap";
import { share } from "../modules/share";
import { openDisplaySettings } from "../modules/display";
import { analytics } from "../modules/analytics";
import { notify } from "../modules/notify";
import { appStore, useApp } from "../core/data";
import { disableReminder, setReminder, setSlowAudio } from "../core/state";
import { scheduleDaily } from "../reminders";
import { useNav } from "../nav";
import monetization from "../../monetization.json";
import product from "../../product.json";

const legal = (monetization as { legal?: { privacyUrl?: string } }).legal ?? {};
const LEVEL_BN: Record<string, string> = { A1: "সহজ · A1", A2: "মাঝারি · A2", B1: "কঠিন · B1" };
const TIMES = [
  { label: "সকাল ৮টা", value: "08:00" },
  { label: "দুপুর ১টা", value: "13:00" },
  { label: "সন্ধ্যা ৭টা", value: "19:00" },
  { label: "রাত ৯টা", value: "21:00" },
];

/** Settings: reminders, audio speed, theme/text-size, Pro, backup, privacy, delete. */
export function SettingsScreen({ onPro }: { onPro: (from: string) => void }) {
  const nav = useNav();
  const s = useSettings();
  const app = useApp();
  const user = useCloudUser();
  const p = app.profile;
  const backupOn = p.cloudBackupOn;

  // null = permission not relevant yet (reminder off); false = the OS has denied it and the system
  // dialog no longer appears, so we show an "Open settings" path instead of a dead toast.
  const [notifBlocked, setNotifBlocked] = useState(false);

  // When the reminder is on but the OS permission is missing (denied on this phone), surface the
  // blocked state. Re-check when the user comes back from the system settings page so a reminder they
  // just enabled there schedules itself without another toggle tap.
  useEffect(() => {
    let alive = true;
    const sync = async () => {
      if (!p.notificationsOn) {
        if (alive) setNotifBlocked(false);
        return;
      }
      const ok = await notify.granted();
      if (!alive) return;
      setNotifBlocked(!ok);
      if (ok && p.reminderTime) await scheduleDaily(p.reminderTime, appStore.get().streak.current);
    };
    void sync();
    const sub = AppState.addEventListener("change", (st) => {
      if (st === "active") void sync();
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, [p.notificationsOn, p.reminderTime]);

  const toggleReminder = async (on: boolean) => {
    if (on) {
      const time = p.reminderTime ?? "19:00";
      // Record the intent + a default time immediately so the toggle flips on and the time picker is
      // usable even when the permission dialog can't appear — scheduleDaily simply no-ops until granted.
      appStore.set((st) => setReminder(st, time));
      const ok = await notify.ask();
      setNotifBlocked(!ok);
      if (ok) {
        await scheduleDaily(time, appStore.get().streak.current);
        analytics.track("reminder_set");
        toast("রিমাইন্ডার চালু হয়েছে");
      }
    } else {
      appStore.set((st) => disableReminder(st));
      await scheduleDaily(null, 0);
      setNotifBlocked(false);
      analytics.track("reminder_disabled");
    }
  };

  const pickTime = async (time: string) => {
    appStore.set((st) => setReminder(st, time));
    if (notifBlocked || !(await notify.granted())) {
      setNotifBlocked(true);
      toast("সময় সংরক্ষিত — নোটিফিকেশন চালু করতে সেটিংসে যান");
      return;
    }
    await scheduleDaily(time, appStore.get().streak.current);
    toast("রিমাইন্ডারের সময় বদলেছে");
  };

  return (
    <RouteScreen title="সেটিংস" onClose={() => nav.back()}>
      {cloud.enabled ? (
        <Card padded={false} style={{ paddingHorizontal: space.lg }}>
          <ListItem
            icon={backupOn ? "checkCircle" : "lock"}
            iconTint={backupOn ? palette.success : palette.inkMuted}
            title={user && !user.anonymous ? "অ্যাকাউন্ট ও ব্যাকআপ" : "ক্লাউড ব্যাকআপ"}
            subtitle={
              user && !user.anonymous
                ? user.email ?? undefined
                : backupOn
                  ? "চালু — অন্য ফোনে পেতে ইমেইল যোগ করুন"
                  : "বন্ধ — চালু করলে অগ্রগতি ক্লাউডে ব্যাকআপ হবে"
            }
            trailing={user && !user.anonymous ? undefined : <Pill label={backupOn ? "চালু" : "বন্ধ"} tone={backupOn ? "success" : "neutral"} />}
            onPress={() => nav.go({ name: "backup" })}
          />
        </Card>
      ) : null}

      <Card padded={false} style={{ paddingHorizontal: space.lg }}>
        {s.pro ? (
          <ListItem icon="star" iconTint={palette.warning} title="Pro চালু" subtitle="সাপোর্ট করার জন্য ধন্যবাদ!" />
        ) : (
          <ListItem icon="star" iconTint={palette.warning} title="Pro-তে আপগ্রেড" subtitle="বড় AI কোটা, বিজ্ঞাপন সরানো, সার্টিফিকেট" onPress={() => onPro("settings")} />
        )}
      </Card>

      <SectionHeader title="রিমাইন্ডার" />
      <Card style={{ gap: space.sm }}>
        <Toggle label="দৈনিক রিমাইন্ডার" description="দিনে একটি মৃদু নোটিফিকেশন, আপনার বেছে নেওয়া সময়ে" value={p.notificationsOn} onChange={toggleReminder} />
        {p.notificationsOn ? (
          <>
            <Text style={[type.label, { marginTop: space.xs }]}>কখন মনে করিয়ে দেব?</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
              {TIMES.map((t) => (
                <Chip key={t.value} label={t.label} selected={p.reminderTime === t.value} onPress={() => pickTime(t.value)} />
              ))}
            </View>
            {notifBlocked ? (
              <View style={styles.permNotice}>
                <Icon name="bell" size={18} color={tones.warning.fg} />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={[type.bodyStrong, { color: tones.warning.fg }]}>নোটিফিকেশন বন্ধ আছে</Text>
                  <Text style={[type.caption, { color: palette.inkSoft }]}>
                    আপনার সময় সংরক্ষিত হয়েছে, কিন্তু ফোনে নোটিফিকেশন বন্ধ থাকায় রিমাইন্ডার আসবে না। ফোনের সেটিংসে Fluent Friend-এর নোটিফিকেশন চালু করুন।
                  </Text>
                  <Button
                    label="সেটিংস খুলুন"
                    size="sm"
                    variant="secondary"
                    icon="settings"
                    style={{ alignSelf: "flex-start", marginTop: space.xs }}
                    onPress={() => void Linking.openSettings().catch(() => {})}
                  />
                </View>
              </View>
            ) : null}
          </>
        ) : null}
      </Card>

      <SectionHeader title="শেখার স্তর" />
      <Card padded={false} style={{ paddingHorizontal: space.lg }}>
        <ListItem
          icon="award"
          iconTint={palette.primary}
          title="স্তর যাচাই করুন"
          subtitle={`৩টি দ্রুত প্রশ্ন · এখন ${LEVEL_BN[p.level] ?? p.level}`}
          onPress={() => nav.go({ name: "placement" })}
        />
      </Card>

      <SectionHeader title="অডিও ও প্রদর্শন" />
      <Card padded={false} style={{ paddingHorizontal: space.lg }}>
        <Toggle label="ধীর গতির অডিও" description="ইংরেজি বাক্য ০.৭৫x গতিতে বাজবে" value={p.slowAudio} onChange={(v) => appStore.set((st) => setSlowAudio(st, v))} />
        <ListItem icon="settings" title="থিম · ফোন অনুযায়ী" subtitle="লাইট / ডার্ক ফোনের সেটিং থেকে" onPress={openDisplaySettings} />
        <ListItem icon="settings" title="লেখার আকার · ফোন অনুযায়ী" subtitle="ফোনের ফন্ট সাইজ অনুসরণ করে" onPress={openDisplaySettings} />
      </Card>

      <SectionHeader title="সাউন্ড ও স্পর্শ" />
      <Card padded={false} style={{ paddingHorizontal: space.lg }}>
        <Toggle label="কম্পন" description="প্রতিটি ট্যাপে হালকা কম্পন" value={s.haptics !== false} onChange={(v) => store.set({ haptics: v })} />
        <Toggle label="শব্দ" description="মৃদু নিশ্চিতকরণ শব্দ" value={s.sound === true} onChange={(v) => store.set({ sound: v })} />
      </Card>

      <Card padded={false} style={{ paddingHorizontal: space.lg }}>
        <ListItem icon="share" title="বন্ধুদের জানান" subtitle="অ্যাপের লিঙ্ক পাঠান" onPress={() => void share.app("settings")} />
      </Card>

      <SectionHeader title="মাইক ও গোপনীয়তা" />
      <Card style={styles.micPrivacy}>
        <Icon name="mic" size={18} color={palette.primary} />
        <Text style={[type.caption, { color: palette.inkSoft, flex: 1 }]}>
          কথা বলার অনুশীলনে আপনার কণ্ঠ এই ফোনেই লেখায় রূপ নেয়। কোনো অডিও রেকর্ড বা আপলোড হয় না — শুধু লেখা টেক্সট সংশোধনের জন্য ব্যবহৃত হয়।
        </Text>
      </Card>

      <SectionHeader title="কেনাকাটা ও ডেটা" />
      <Card padded={false} style={{ paddingHorizontal: space.lg }}>
        <ListItem
          icon="refresh"
          title="কেনাকাটা পুনরুদ্ধার"
          onPress={async () => {
            const n = await iap.restore().catch(() => 0);
            toast(n ? "কেনাকাটা পুনরুদ্ধার হয়েছে" : "কোনো কেনাকাটা পাওয়া যায়নি");
          }}
        />
        {s.proSource === "subscription" ? <ListItem icon="star" title="সাবস্ক্রিপশন ম্যানেজ করুন" onPress={() => iap.manageSubscriptions()} /> : null}
        {legal.privacyUrl ? <ListItem icon="lock" title="গোপনীয়তা নীতি" onPress={() => Linking.openURL(legal.privacyUrl!)} /> : null}
        <ListItem
          icon="trash"
          title="সব ডেটা মুছুন"
          destructive
          onPress={() =>
            Alert.alert("সব ডেটা মুছবেন?", "এই ফোন থেকে আপনার সব অগ্রগতি, ভুল ও পছন্দ মুছে যাবে। এটি ফেরানো যাবে না।", [
              { text: "বাতিল", style: "cancel" },
              { text: "মুছুন", style: "destructive", onPress: () => { appStore.reset(); toast("সব ডেটা মুছে ফেলা হয়েছে"); } },
            ])
          }
        />
      </Card>

      <View style={{ alignItems: "center", gap: 2, marginTop: space.sm }}>
        <Text style={type.caption}>{product.title}</Text>
        <Text style={type.caption}>{cloud.enabled && backupOn ? "ব্যাকআপ চালু — ডেটা নিরাপদে ক্লাউডে সংরক্ষিত।" : "আপনার ডেটা এই ফোনেই থাকে।"}</Text>
      </View>
    </RouteScreen>
  );
}

const styles = StyleSheet.create({
  permNotice: {
    flexDirection: "row",
    gap: space.sm,
    backgroundColor: tones.warning.bg,
    borderRadius: radius.md,
    padding: space.md,
    marginTop: space.xs,
  },
  micPrivacy: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
});
