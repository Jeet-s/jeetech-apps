/**
 * In-context microphone permission for the speaking screens.
 *
 * Flow: the learner taps the mic → if permission is still undecided we show a
 * short Bangla primer explaining WHY (and that audio stays on the phone) BEFORE
 * the OS dialog → only on "মাইক চালু করুন" do we call the system prompt. If the
 * mic is denied (now or earlier) the speaking flow never dead-ends: the typed /
 * keyboard-dictation answer stays available and a calm Bangla note offers a
 * Settings shortcut to re-enable it.
 *
 * QA: micStatus() reports "granted" under the speech hook, so ensure() resolves
 * immediately and the primer never appears — the simulated recogniser just runs.
 */
import { useCallback, useRef, useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import { Button, Icon, Sheet, palette, radius, space, tones, type } from "./ui";
import { micStatus, requestMic, speechSupported } from "./speech";

export function useMicGate() {
  const [primerOpen, setPrimerOpen] = useState(false);
  const [denied, setDenied] = useState(false);
  const resolver = useRef<((granted: boolean) => void) | null>(null);

  /** Ensure the mic is granted. Resolves true → start listening; false → fall back to typing. */
  const ensure = useCallback(async (): Promise<boolean> => {
    if (!speechSupported()) return false;
    const status = await micStatus();
    if (status === "granted") {
      setDenied(false);
      return true;
    }
    if (status === "denied") {
      setDenied(true);
      return false;
    }
    // Undecided → show the primer and wait for the learner's choice.
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setPrimerOpen(true);
    });
  }, []);

  const allow = useCallback(async () => {
    setPrimerOpen(false);
    const ok = await requestMic();
    setDenied(!ok);
    resolver.current?.(ok);
    resolver.current = null;
  }, []);

  const dismiss = useCallback(() => {
    setPrimerOpen(false);
    resolver.current?.(false);
    resolver.current = null;
  }, []);

  return { ensure, denied, primerOpen, allow, dismiss };
}

/** The pre-permission primer sheet (shown before the OS dialog). */
export function MicPrimerSheet({ visible, onAllow, onClose }: { visible: boolean; onAllow: () => void; onClose: () => void }) {
  return (
    <Sheet visible={visible} title="মাইক চালু করি?" onClose={onClose}>
      <View style={styles.primer}>
        <View style={styles.primerIcon}>
          <Icon name="mic" size={26} color={palette.primary} />
        </View>
        <Text style={[type.body, { color: palette.ink, textAlign: "center" }]}>
          কথা বলে অনুশীলন করতে মাইক দরকার। আপনার কণ্ঠ এই ফোনেই লেখায় রূপ নেয় — কোনো রেকর্ডিং সংরক্ষণ বা আপলোড হয় না।
        </Text>
        <Button label="মাইক চালু করুন" icon="mic" size="lg" onPress={onAllow} />
        <Button label="বরং টাইপ করে বলি" variant="ghost" onPress={onClose} />
      </View>
    </Sheet>
  );
}

/** Calm Bangla note shown when the mic is denied — the typed answer still works. */
export function MicDeniedNote() {
  return (
    <View style={styles.denied}>
      <Icon name="mic" size={18} color={tones.warning.fg} />
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={[type.bodyStrong, { color: tones.warning.fg }]}>মাইক বন্ধ আছে</Text>
        <Text style={[type.caption, { color: palette.inkSoft }]}>
          কোনো অসুবিধা নেই — নিচে টাইপ করে উত্তর দিন। মাইকে বলতে চাইলে ফোনের সেটিংসে Fluent Friend-এর মাইক অনুমতি চালু করুন।
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
  );
}

const styles = StyleSheet.create({
  primer: { gap: space.md, alignItems: "stretch", paddingTop: space.sm },
  primerIcon: { alignSelf: "center", width: 56, height: 56, borderRadius: 28, backgroundColor: palette.primarySoft, alignItems: "center", justifyContent: "center" },
  denied: {
    flexDirection: "row",
    gap: space.sm,
    backgroundColor: tones.warning.bg,
    borderRadius: radius.md,
    padding: space.md,
  },
});
