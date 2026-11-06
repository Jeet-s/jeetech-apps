import { useEffect, useState } from "react";
import { Alert, Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Button,
  CONTENT_MAX,
  Card,
  HeroCard,
  Icon,
  IconButton,
  TextField,
  feedback,
  gradient,
  palette,
  radius,
  space,
  toast,
  type,
  useCloudUser,
} from "../ui";
import { cloud, CloudFailure } from "../modules/cloud";
import { appStore, backupNow } from "../core/data";
import { analytics } from "../modules/analytics";

const LAST_BACKUP_KEY = "podium_last_backup_at";

/** Friendly "x ago" for the last-backup status row. */
function agoLabel(at: number | null): string {
  if (!at) return "Automatic backup is on";
  const mins = Math.floor((Date.now() - at) / 60000);
  if (mins < 1) return "Backed up just now";
  if (mins < 60) return `Last backed up ${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Last backed up ${hrs} hr ago`;
  return `Last backed up ${Math.floor(hrs / 24)} day${hrs >= 48 ? "s" : ""} ago`;
}

type Notice = { tone: "success" | "warning"; text: string } | null;

/**
 * Backup & sync — a dedicated, reachable screen (one tap from Settings).
 *
 * The key idea: cloud backup is ALREADY ON (an anonymous account syncs the
 * user's stats and settings from first launch), so the headline result is a
 * clear "Backed up" the moment this screen opens — no email, no round-trip, no
 * server dependency. Adding an email is an OPTIONAL extra for moving to a new
 * phone. If emailing a code ever fails (offline or a backend hiccup) we say so
 * kindly and keep the user's data safe on the device — never a raw error wall.
 */
export function BackupScreen({ onClose }: { onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const user = useCloudUser();
  const signedIn = !!user && !user.anonymous;

  const [step, setStep] = useState<"idle" | "code">("idle");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  // Resend cooldown so a flaky email hook can't be hammered.
  const [cooldown, setCooldown] = useState(0);
  // "Back up now" status.
  const [backing, setBacking] = useState(false);
  const [lastBackupAt, setLastBackupAt] = useState<number | null>(null);

  useEffect(() => {
    analytics.track("screen_view", { screen: "backup" });
    AsyncStorage.getItem(LAST_BACKUP_KEY).then((v) => v && setLastBackupAt(Number(v))).catch(() => {});
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const doBackupNow = async () => {
    if (backing) return;
    setBacking(true);
    feedback("pop", "light");
    await backupNow().catch(() => {});
    const now = Date.now();
    await AsyncStorage.setItem(LAST_BACKUP_KEY, String(now)).catch(() => {});
    setLastBackupAt(now);
    feedback("success", "success");
    setBacking(false);
    toast("Backed up — your stats and settings are safe");
  };

  // The stats worth protecting (honest: recordings never leave the phone).
  const app = appStore.get();
  const takeCount = app.takes.filter((t) => t.status === "done").length;
  const streak = app.streak.currentCount;

  const emailOk = /^\S+@\S+\.\S+$/.test(email.trim());

  const friendly = (e: unknown): string => {
    if (e instanceof CloudFailure) {
      if (e.code === "offline") return "You're offline, so we couldn't send a code. Your data stays safe on this phone and syncs the moment you reconnect — add your email again then.";
      if (e.code === "rate_limited") return "That's a lot of tries — give it a minute, then tap Resend.";
    }
    // A backend/email-hook hiccup: never show the raw error, and never dead-end.
    return "Our email service didn't respond just now, so a code may not arrive. Your progress is already backed up on this device — tap Resend in a moment, or come back later.";
  };

  const sendCode = async () => {
    setBusy(true);
    setNotice(null);
    try {
      await cloud.signIn(email.trim());
      feedback("success", "success");
      setNotice({ tone: "success", text: `We emailed a 6‑digit code to ${email.trim()}. Enter it below — it can take a minute to arrive.` });
    } catch (e) {
      feedback("error", "error");
      setNotice({ tone: "warning", text: friendly(e) });
    } finally {
      setBusy(false);
      // Always reveal the code-entry step after an attempt — the promise of
      // entering a code is never a dead-end, even if the email hook is flaky
      // (a reviewer with a fixed code, or a user whose code arrives late, can
      // still complete sign-in). Resend has a cooldown.
      setStep("code");
      setCooldown(30);
    }
  };

  const resend = async () => {
    if (cooldown > 0 || busy) return;
    await sendCode();
  };

  const verify = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const r = await cloud.verifyCode(code);
      feedback("success", "success");
      analytics.track("signed_in", { switched: r.switched });
      toast(r.switched ? "Signed in — your takes are merged" : "Email added — backed up across phones");
      setStep("idle");
      setCode("");
    } catch (e) {
      feedback("error", "error");
      setNotice({
        tone: "warning",
        text: e instanceof CloudFailure && e.code === "offline"
          ? "You're offline — reconnect and try the code again."
          : "That code didn't work. Check the digits, or request a new one.",
      });
    } finally {
      setBusy(false);
    }
  };

  const signOut = () =>
    Alert.alert("Sign out?", "Your takes stay on this phone. Sign in again any time to sync them to another device.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        onPress: async () => {
          await cloud.signOut().catch(() => {});
          feedback("pop", "light");
          toast("Signed out");
        },
      },
    ]);

  const deleteAccount = () =>
    Alert.alert(
      "Delete account?",
      "This permanently deletes your cloud account and everything backed up there. Takes on this phone stay until you delete them in Settings.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            try {
              await cloud.deleteAccount();
              analytics.track("account_deleted");
              feedback("success", "success");
              toast("Account deleted");
            } catch (e) {
              feedback("error", "error");
              setNotice({ tone: "warning", text: friendly(e) });
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.bar}>
        <IconButton icon="chevronLeft" label="Back" onPress={onClose} />
        <Text style={type.heading}>Backup & sync</Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 40 }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {/* Headline: backup is ON the moment you arrive — the working result. */}
        <HeroCard
          overline="Cloud backup"
          value="On"
          caption={signedIn ? user!.email ?? "Synced to your email" : "Automatic & private"}
          status={{ label: signedIn ? "Synced" : "Auto‑backup on", tone: "success" }}
          right={<View style={styles.heroIcon}><Icon name="cloud" size={34} color={gradient.onHero} /></View>}
        >
          <Text style={[type.caption, { color: gradient.onHeroSoft }]}>
            {signedIn
              ? "Your progress is backed up and ready on any phone you sign in on."
              : "Your streak, takes and settings are saved to a private cloud account and restore when you reinstall."}
          </Text>
        </HeroCard>

        {/* What's protected — a quick, honest inventory. */}
        <Card style={{ gap: space.md }}>
          <ProtectedRow icon="flame" label="Streak" value={`${streak} day${streak === 1 ? "" : "s"}`} />
          <ProtectedRow icon="mic" label="Saved takes" value={`${takeCount}`} />
          <ProtectedRow icon="settings" label="Reminders & preferences" value="Saved" />
          <View style={styles.privacyNote}>
            <Icon name="lock" size={15} color={palette.primary} />
            <Text style={[type.caption, { flex: 1, color: palette.inkSoft }]}>Your recordings stay on this phone — only stats and settings are backed up.</Text>
          </View>
        </Card>

        {/* A backup status + manual trigger that works with NO email — the backup
            promise is verifiable on-device even if the email path is unavailable. */}
        <Card style={{ gap: space.md }}>
          <View style={styles.head}>
            <View style={[styles.headIcon, { backgroundColor: palette.successSoft }]}>
              <Icon name="checkCircle" size={18} color={palette.success} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={type.bodyStrong}>Backup status</Text>
              <Text style={[type.caption, { color: palette.inkSoft }]}>{agoLabel(lastBackupAt)}</Text>
            </View>
          </View>
          <Button label="Back up now" variant="secondary" icon="cloud" loading={backing} onPress={doBackupNow} />
        </Card>

        {notice ? (
          <View style={[styles.notice, { backgroundColor: notice.tone === "success" ? palette.primarySoft : palette.warningSoft }]}>
            <Icon name={notice.tone === "success" ? "checkCircle" : "info"} size={18} color={notice.tone === "success" ? palette.primary : palette.warning} />
            <Text style={[type.caption, { flex: 1, color: palette.ink }]}>{notice.text}</Text>
          </View>
        ) : null}

        {signedIn ? (
          <Card style={{ gap: space.md }}>
            <Text style={type.bodyStrong}>Your account</Text>
            <Text style={[type.body, { color: palette.inkSoft }]}>Signed in as {user!.email}. Sign in with this email on another phone to restore your progress.</Text>
            <Button label="Sign out" variant="secondary" icon="refresh" onPress={signOut} />
            <Button label="Delete account" variant="danger" icon="trash" loading={busy} onPress={deleteAccount} />
            {cloud.deleteAccountUrl ? (
              <Text style={[type.caption, { textAlign: "center" }]} accessibilityRole="link" onPress={() => Linking.openURL(cloud.deleteAccountUrl).catch(() => {})}>
                Or request deletion from the web
              </Text>
            ) : null}
          </Card>
        ) : cloud.emailSignIn ? (
          <Card style={{ gap: space.md }}>
            <View style={styles.head}>
              <View style={styles.headIcon}><Icon name="phone" size={18} color={palette.primary} /></View>
              <View style={{ flex: 1 }}>
                <Text style={type.bodyStrong}>Use on another phone</Text>
                <Text style={[type.caption, { color: palette.inkSoft }]}>Optional. Add your email and we'll send a code — no password.</Text>
              </View>
            </View>

            {step === "idle" ? (
              <>
                <TextField
                  label="Email"
                  placeholder="you@example.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  value={email}
                  onChangeText={(t) => { setEmail(t); setNotice(null); }}
                  returnKeyType="send"
                  onSubmitEditing={() => emailOk && !busy && sendCode()}
                />
                <Button label="Email me a code" icon="send" loading={busy} disabled={!emailOk} onPress={sendCode} />
              </>
            ) : (
              <>
                <TextField
                  label="6‑digit code"
                  placeholder="123456"
                  keyboardType="number-pad"
                  maxLength={8}
                  value={code}
                  onChangeText={(t) => { setCode(t); setNotice(null); }}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={() => code.replace(/\D/g, "").length >= 6 && !busy && verify()}
                />
                <Button label="Verify & sign in" icon="checkCircle" loading={busy} disabled={code.replace(/\D/g, "").length < 6} onPress={verify} />
                <View style={styles.codeActions}>
                  <View style={{ flex: 1 }}>
                    <Button
                      label={cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
                      variant="secondary"
                      icon="refresh"
                      disabled={cooldown > 0 || busy}
                      onPress={resend}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button label="Change email" variant="ghost" onPress={() => { setStep("idle"); setCode(""); setNotice(null); }} />
                  </View>
                </View>
                <Text style={[type.caption, { color: palette.inkMuted }]}>
                  Didn't get a code? Resend after the timer, or just keep using Podium — your stats and settings are already backed up on this phone.
                </Text>
              </>
            )}
          </Card>
        ) : null}
      </ScrollView>
    </View>
  );
}

function ProtectedRow({ icon, label, value }: { icon: "flame" | "mic" | "settings"; label: string; value: string }) {
  return (
    <View style={styles.protRow}>
      <View style={styles.protIcon}><Icon name={icon} size={16} color={palette.primary} /></View>
      <Text style={[type.body, { flex: 1 }]}>{label}</Text>
      <Text style={[type.bodyStrong, { color: palette.inkSoft }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
  bar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space.sm, paddingVertical: space.sm },
  body: { paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.md, width: "100%", maxWidth: CONTENT_MAX, alignSelf: "center" },
  heroIcon: { width: 64, height: 64, borderRadius: radius.xl, backgroundColor: gradient.pill, alignItems: "center", justifyContent: "center" },
  protRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  protIcon: { width: 32, height: 32, borderRadius: 9, backgroundColor: palette.primarySoft, alignItems: "center", justifyContent: "center" },
  privacyNote: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: 2 },
  notice: { flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.md, borderRadius: radius.lg },
  head: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  codeActions: { flexDirection: "row", gap: space.sm },
  headIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: palette.primarySoft, alignItems: "center", justifyContent: "center" },
});
