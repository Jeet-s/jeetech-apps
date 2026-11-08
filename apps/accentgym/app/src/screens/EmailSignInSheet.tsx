import { useEffect, useState } from "react";
import { Keyboard, Text, View } from "react-native";
import { Button, Card, Sheet, TextField, palette, space, type } from "../ui";
import { cloud, CloudFailure } from "../modules/cloud";
import { analytics } from "../modules/analytics";

/** Recovery UI belongs to the app; authentication remains in the factory cloud module. */
export function EmailSignInSheet({ visible, onClose, onSignedIn }: { visible: boolean; onClose: () => void; onSignedIn: (r: { switched: boolean }) => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [delivery, setDelivery] = useState<"idle" | "sent" | "failed">("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (!visible) { setStep("email"); setCode(""); setError(null); setDelivery("idle"); } }, [visible]);
  const valid = /^\S+@\S+\.\S+$/.test(email.trim());
  const run = async (fn: () => Promise<void>, action: "send" | "verify" = "verify") => {
    if (busy) return;
    Keyboard.dismiss();
    setBusy(true); setError(null);
    try { await fn(); }
    catch (e) {
      setError(e instanceof CloudFailure && e.code === "offline" ? "You're offline. Your progress is saved on this phone. Reconnect and try again." : action === "send" ? "No code was sent. Email delivery is unavailable. Your progress remains on this phone; retry delivery or keep practising." : "We couldn't verify that code. Check the latest email and try again.");
    }
    finally { setBusy(false); }
  };
  const send = () => run(async () => {
    setStep("code");
    setDelivery("idle");
    try {
      await cloud.signIn(email.trim());
      setDelivery("sent");
    } catch (e) {
      setDelivery("failed");
      throw e;
    }
  }, "send");
  return (
    <Sheet visible={visible} title={step === "email" ? "Back up your progress" : "Enter your email code"} onClose={onClose}>
      <Text style={type.body}>Backup is optional. Practice, your saved words and listening drills work signed out.</Text>
      {error ? <Card accent={palette.warning}><Text style={type.bodyStrong}>Sign-in didn't finish</Text><Text style={type.body} accessibilityLiveRegion="polite">{error}</Text></Card> : null}
      <View style={{ gap: space.md }}>
        {step === "email" ? <>
          <TextField label="Email" placeholder="you@example.com" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" returnKeyType="send" onSubmitEditing={() => valid && send()} />
          <Button label={busy ? "Sending code…" : error ? "Try sending again" : "Send code"} disabled={!valid || busy} onPress={send} />
          {error ? <Button label="I already have a code" variant="ghost" onPress={() => { setStep("code"); setError(null); }} /> : null}
        </> : <>
          <Text style={type.caption}>{busy && delivery === "idle" ? "Requesting your email code…" : delivery === "failed" ? `No code was sent to ${email}. Retry delivery below. If you already have a valid code, you can enter it here.` : `Enter the code sent to ${email}. Check your inbox and spam folder.`}</Text>
          <TextField label="Email code" value={code} onChangeText={setCode} keyboardType="number-pad" autoComplete="one-time-code" maxLength={8} />
          <Button label={busy ? "Verifying…" : "Verify code"} disabled={code.replace(/\D/g, "").length < 6 || busy} onPress={() => run(async () => { const r = await cloud.verifyCode(code); await onSignedIn(r); analytics.track("signed_in", { switched: r.switched }); onClose(); })} />
          <Button label={busy ? "Requesting code…" : "Resend code"} variant="secondary" disabled={busy || !valid} onPress={send} />
          <Button label="Change email" variant="ghost" onPress={() => { setStep("email"); setError(null); }} />
        </>}
        <Button label="Continue practising offline" variant="secondary" onPress={onClose} />
      </View>
    </Sheet>
  );
}
