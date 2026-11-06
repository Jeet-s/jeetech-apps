import { useState } from "react";
import { Alert, Linking, StyleSheet, Text, View } from "react-native";
import {
  Button,
  Card,
  HeroCard,
  Icon,
  Pill,
  TextField,
  Toggle,
  feedback,
  gradient,
  palette,
  radius,
  space,
  toast,
  type,
  useCloudUser,
} from "../ui";
import { RouteScreen } from "../components";
import { cloud, CloudFailure } from "../modules/cloud";
import { appStore, startAppSync, useApp } from "../core/data";
import { setCloudBackup } from "../core/state";
import { analytics } from "../modules/analytics";
import { useNav } from "../nav";

/**
 * Cloud backup — OPT-IN (QA / Play data-safety: the old screen auto-synced an anonymous cloud
 * account from first launch, which contradicts the PRD's "progress is local, backup is opt-in").
 *
 * The screen now LEADS with a clear Bangla toggle. Until the learner turns it on, nothing leaves
 * the phone — the hero says "বন্ধ" and the copy says progress is on this device. When they opt in
 * we start syncing (startAppSync) and, as an optional extra, they can add an email so a second
 * phone can restore. Email-code failures stay calm (the GoTrue send hook can 502) and never read
 * as a dead end because the backup-on hero stays above.
 */
export function BackupScreen() {
  const nav = useNav();
  const app = useApp();
  const user = useCloudUser();
  const signedIn = !!user && !user.anonymous;
  const backupOn = app.profile.cloudBackupOn;

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const emailOk = /^\S+@\S+\.\S+$/.test(email);

  const toggleBackup = (on: boolean) => {
    feedback(on ? "success" : "pop", on ? "success" : "light");
    appStore.set((s) => setCloudBackup(s, on));
    if (on) {
      startAppSync(); // begin syncing the whole state now that the learner has opted in
      analytics.track("backup_enabled");
      toast("ক্লাউড ব্যাকআপ চালু হয়েছে");
    } else {
      analytics.track("backup_disabled");
      toast("ব্যাকআপ বন্ধ — ডেটা শুধু এই ফোনে থাকবে");
    }
  };

  const sendCode = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await cloud.signIn(email);
      feedback("pop", "success");
      setStep("code");
    } catch (e) {
      feedback("error", "warning");
      const offline = e instanceof CloudFailure && e.code === "offline";
      setNotice(
        offline
          ? "এখন ইন্টারনেট নেই — সংযোগ পেলে আবার চেষ্টা করুন। আপনার অগ্রগতি এই ফোনে নিরাপদ।"
          // Honest fallback: email code can't be sent right now, so don't claim it's signed in. Point
          // to the toggle above (local → cloud backup still works) and invite retrying email later.
          : backupOn
            ? "আমরা এই মুহূর্তে ইমেইলে কোড পাঠাতে পারছি না। চিন্তা নেই — আপনার ক্লাউড ব্যাকআপ চালু আছে ও অগ্রগতি সংরক্ষিত হচ্ছে। অন্য ফোনে ফিরে পেতে একটু পরে ইমেইল যোগ করার চেষ্টা করুন।"
            : "আমরা এই মুহূর্তে ইমেইলে কোড পাঠাতে পারছি না। আপনার অগ্রগতি এই ফোনে নিরাপদ — উপরের টগল দিয়ে এখনই ক্লাউড ব্যাকআপ চালু করতে পারেন। একটু পরে ইমেইল যোগ করার চেষ্টা করুন।",
      );
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await cloud.verifyCode(code);
      feedback("success", "success");
      analytics.track("signed_in", { switched: r.switched });
      // Signing in implies the learner wants cloud backup — turn it on so the state matches.
      if (!app.profile.cloudBackupOn) appStore.set((s) => setCloudBackup(s, true));
      await startAppSync().pullNow(r.switched ? { merge: (local, remote) => ({ ...remote, ...local }) } : {}).catch(() => {});
      toast("সাইন ইন হয়েছে — অগ্রগতি সব ফোনে মিলবে");
      setCode("");
      setStep("email");
      setEmail("");
    } catch (e) {
      feedback("error", "error");
      setError(e instanceof CloudFailure && e.code === "offline" ? "ইন্টারনেট নেই — সংযোগ পেলে আবার চেষ্টা করুন।" : "কোডটি মেলেনি — আবার দেখে লিখুন।");
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = () =>
    Alert.alert(
      "অ্যাকাউন্ট মুছবেন?",
      "এতে আপনার অ্যাকাউন্ট ও ক্লাউডে রাখা সব কিছু স্থায়ীভাবে মুছে যাবে। এই ফোনের ডেটা সেটিংস থেকে না মোছা পর্যন্ত থাকবে।",
      [
        { text: "বাতিল", style: "cancel" },
        {
          text: "মুছুন",
          style: "destructive",
          onPress: async () => {
            try {
              await cloud.deleteAccount();
              analytics.track("account_deleted");
              toast("অ্যাকাউন্ট মুছে ফেলা হয়েছে");
            } catch {
              toast("এখন মোছা গেল না — পরে চেষ্টা করুন");
            }
          },
        },
      ],
    );

  return (
    <RouteScreen title="ক্লাউড ব্যাকআপ" subtitle="অগ্রগতি নিরাপদ রাখুন" onClose={() => nav.back()}>
      <HeroCard
        overline="ক্লাউড ব্যাকআপ"
        value={backupOn ? "চালু" : "বন্ধ"}
        caption={backupOn ? "আপনার অগ্রগতি ক্লাউডে সংরক্ষিত হচ্ছে" : "আপনার অগ্রগতি এখন শুধু এই ফোনে আছে"}
        status={{ label: backupOn ? "সুরক্ষিত" : "শুধু এই ফোনে", tone: backupOn ? "success" : "neutral" }}
        right={
          <View style={styles.heroIcon}>
            <Icon name={backupOn ? "checkCircle" : "lock"} size={34} color={gradient.onHero} />
          </View>
        }
      />

      {/* The opt-in control — nothing syncs until this is on. */}
      <Card>
        <Toggle
          label="ব্যাকআপ চালু করুন"
          description="চালু করলে আপনার শেখার অগ্রগতি, স্ট্রিক ও ভুলগুলো নিরাপদে ক্লাউডে ব্যাকআপ হবে। যেকোনো সময় বন্ধ করা যাবে।"
          value={backupOn}
          onChange={toggleBackup}
        />
      </Card>

      <Card style={styles.note}>
        <Icon name="lock" size={18} color={palette.primary} />
        <Text style={[type.caption, { flex: 1, color: palette.inkSoft }]}>
          {backupOn
            ? "ডেটা পথে ও সংরক্ষণে এনক্রিপ্ট করা। অ্যাপ সবসময় অফলাইনেও সম্পূর্ণ চলে।"
            : "কোনো সাইন-আপ ছাড়াই অ্যাপ পুরোপুরি কাজ করে। ব্যাকআপ চালু না করলে কিছুই ফোনের বাইরে যায় না।"}
        </Text>
      </Card>

      {signedIn ? (
        <Card style={{ gap: space.md }}>
          <View style={styles.row}>
            <Icon name="person" size={20} color={palette.primary} />
            <View style={{ flex: 1 }}>
              <Text style={type.bodyStrong} numberOfLines={1}>{user!.email}</Text>
              <Text style={type.caption}>অন্য ফোনে এই ইমেইল দিয়ে সাইন ইন করলে অগ্রগতি ফিরে পাবেন।</Text>
            </View>
            <Pill label="সংযুক্ত" tone="success" />
          </View>
          <Button label="সাইন আউট" variant="secondary" onPress={async () => { try { await cloud.signOut(); toast("সাইন আউট হয়েছে"); } catch { /* ignore */ } }} />
          <Button label="অ্যাকাউন্ট মুছুন" variant="danger" icon="trash" onPress={confirmDelete} />
          {cloud.deleteAccountUrl ? (
            <Text style={[type.caption, { textAlign: "center" }]} accessibilityRole="link" onPress={() => Linking.openURL(cloud.deleteAccountUrl)}>
              ওয়েব থেকে অ্যাকাউন্ট মুছুন
            </Text>
          ) : null}
        </Card>
      ) : (
        // The email-code sign-in is ALWAYS reachable here — even before backup is turned on (QA: the
        // tester opened this screen and "found no email login field" because backup was off). Signing
        // in turns backup on automatically.
        <Card style={{ gap: space.md }}>
          <View style={styles.row}>
            <Icon name="globe" size={20} color={palette.primary} />
            <View style={{ flex: 1 }}>
              <Text style={type.bodyStrong}>ইমেইল দিয়ে সাইন ইন (ঐচ্ছিক)</Text>
              <Text style={type.caption}>নতুন বা অন্য ফোনে অগ্রগতি ফিরে পেতে ইমেইল যোগ করুন। পাসওয়ার্ড লাগবে না — সাইন ইন করলে ব্যাকআপ চালু হয়ে যাবে।</Text>
            </View>
          </View>

          {step === "email" ? (
            <>
              <TextField
                label="ইমেইল"
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                value={email}
                onChangeText={(t) => { setEmail(t); if (notice) setNotice(null); }}
                returnKeyType="send"
                onSubmitEditing={() => emailOk && !busy && sendCode()}
              />
              <Button label="কোড পাঠান" loading={busy} disabled={!emailOk} onPress={sendCode} />
            </>
          ) : (
            <>
              <Text style={type.caption}>{email}-এ পাঠানো ৬ অঙ্কের কোড লিখুন।</Text>
              <TextField
                label="কোড"
                placeholder="১২৩৪৫৬"
                keyboardType="number-pad"
                maxLength={8}
                value={code}
                onChangeText={setCode}
                error={error}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={() => code.replace(/\D/g, "").length >= 6 && !busy && verify()}
              />
              <Button label="সাইন ইন" loading={busy} disabled={code.replace(/\D/g, "").length < 6} onPress={verify} />
              <Button label="অন্য ইমেইল দিন" variant="ghost" sound={null} style={{ borderWidth: 0 }} onPress={() => { setStep("email"); setError(null); }} />
            </>
          )}

          {notice ? (
            <View style={styles.notice}>
              <Icon name="chat" size={16} color={palette.warning} />
              <Text style={[type.label, { color: palette.ink, flex: 1 }]}>{notice}</Text>
            </View>
          ) : null}
        </Card>
      )}
    </RouteScreen>
  );
}

const styles = StyleSheet.create({
  heroIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: gradient.pill, alignItems: "center", justifyContent: "center" },
  note: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  row: { flexDirection: "row", alignItems: "center", gap: space.md },
  notice: { flexDirection: "row", alignItems: "flex-start", gap: space.sm, backgroundColor: palette.warningSoft, borderRadius: radius.md, padding: space.md },
});
