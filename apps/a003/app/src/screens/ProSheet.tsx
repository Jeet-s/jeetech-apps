import { useEffect, useState } from "react";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { Button, Icon, Pill, Sheet, feedback, palette, radius, space, toast, type } from "../ui";
import { art } from "../art";
import { iap } from "../modules/iap";
import { useSettings } from "../modules/store";
import { analytics } from "../modules/analytics";

const PERKS: { icon: import("../ui").IconName; text: string }[] = [
  { icon: "chart", text: "Advanced analytics — trends, overruns & weekday patterns" },
  { icon: "shield", text: "Cloud sync & backup across your devices" },
  { icon: "sparkle", text: "More AI planning — up to 50 plans a day" },
  { icon: "bell", text: "No ads, ever" },
];

/** Core time blocking is free forever — shown so Pro reads as a fair add-on, not a gate. */
const FREE_FEATURES = [
  "Unlimited time blocks & drag-to-plan",
  "Routines, reminders & basic insights",
  "Full backup, CSV export & offline use",
  "5 AI plans a day",
];

/** The Pro offer. Opened from a locked feature or Settings; `from` is tracked. */
export function ProSheet({ visible, from, onClose }: { visible: boolean; from: string; onClose: () => void }) {
  const { pro, adsRemoved } = useSettings();
  const [busy, setBusy] = useState(false);
  // A persistent, in-sheet result for Restore. A toast alone is too easy to miss
  // (it auto-dismisses), so the outcome also stays on-screen until the user acts.
  const [restoreMsg, setRestoreMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { if (visible) { analytics.track("paywall_view", { from }); setRestoreMsg(null); } }, [visible, from]);
  useEffect(() => {
    if (pro && visible) { feedback("unlock", "success"); onClose(); }
  }, [pro, visible, onClose]);

  const run = async (fn: () => Promise<void>) => { setBusy(true); await fn().catch(() => {}); setBusy(false); };
  const plans = iap.plans();
  const lifetime = iap.price("pro_unlock");

  const restore = () =>
    run(async () => {
      setRestoreMsg(null);
      const n = await iap.restore().catch(() => 0);
      feedback(n ? "success" : "pop", n ? "success" : "warning");
      const text = n ? "Purchases restored to this account." : "No previous purchases found on this account.";
      setRestoreMsg({ ok: !!n, text });
      toast(n ? "Purchases restored" : "No purchases to restore");
    });

  return (
    <Sheet
      visible={visible}
      title="BlockDay Pro"
      onClose={onClose}
      headerAction={<Button label="Restore" size="sm" variant="secondary" loading={busy} onPress={restore} style={styles.restoreBtn} />}
    >
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollBody} showsVerticalScrollIndicator keyboardShouldPersistTaps="handled">
      <Image source={art.pro_hero} style={styles.hero} resizeMode="cover" accessibilityIgnoresInvertColors />

      <View style={styles.freeCard}>
        <View style={styles.freeHead}>
          <Icon name="check" size={16} color={palette.success} />
          <Text style={type.bodyStrong}>Always free — no account needed</Text>
        </View>
        {FREE_FEATURES.map((t) => (
          <Text key={t} style={[type.caption, { color: palette.inkSoft }]}>• {t}</Text>
        ))}
      </View>

      <Text style={[type.label, { textTransform: "uppercase", letterSpacing: 0.6 }]}>Pro adds</Text>
      <View style={{ gap: space.sm }}>
        {PERKS.map((p) => (
          <View key={p.text} style={styles.perk}>
            <View style={styles.tick}><Icon name={p.icon} size={16} color={palette.primary} /></View>
            <Text style={[type.body, { flex: 1 }]}>{p.text}</Text>
          </View>
        ))}
      </View>

      <View style={styles.trust}>
        <Icon name="lock" size={14} color={palette.success} />
        <Text style={[type.caption, { flex: 1, color: palette.inkSoft }]}>No extra trackers in Pro — same privacy, still offline-first. We never sell your data.</Text>
      </View>

      {plans.map((p, i) => (
        <Button
          key={p.sku}
          label={`${p.trialDays ? `${p.trialDays}-day free trial, then ` : ""}${p.price}/${p.period === "P1Y" ? "year" : "month"}`}
          size="lg"
          variant={i === 0 ? "primary" : "secondary"}
          loading={busy}
          onPress={() => run(() => iap.subscribe(p.sku))}
        />
      ))}
      {plans.length ? (
        <Text style={[type.caption, { textAlign: "center" }]}>Billing starts after the free trial. Cancel anytime in Google Play.</Text>
      ) : null}

      <View style={styles.or}>
        <View style={styles.rule} /><Text style={type.caption}>or own it forever</Text><View style={styles.rule} />
      </View>
      <Button
        label={`Lifetime unlock${lifetime ? ` · ${lifetime}` : ""}`}
        size="lg"
        variant={plans.length ? "secondary" : "primary"}
        icon="star"
        loading={busy}
        onPress={() => run(() => iap.purchase("pro_unlock"))}
      />
      <Text style={[type.caption, { textAlign: "center" }]}>Lifetime unlocks every Pro feature & removes ads. The higher daily AI limit comes with a subscription.</Text>

      {!adsRemoved ? (
        <Button label={`Just remove ads${iap.price("remove_ads") ? ` · ${iap.price("remove_ads")}` : ""}`} variant="ghost" loading={busy} onPress={() => run(() => iap.purchase("remove_ads"))} />
      ) : null}
      <Button label="Restore purchases" variant="secondary" icon="undo" loading={busy} onPress={restore} />
      {restoreMsg ? (
        <View style={[styles.restoreResult, { backgroundColor: restoreMsg.ok ? palette.successSoft : palette.surfaceAlt }]}>
          <Icon name={restoreMsg.ok ? "check" : "undo"} size={16} color={restoreMsg.ok ? palette.success : palette.inkSoft} />
          <Text style={[type.caption, { flex: 1, color: palette.ink }]}>{restoreMsg.text}</Text>
        </View>
      ) : (
        <Text style={[type.caption, { textAlign: "center" }]}>Already purchased on this account? Restore brings it back — also at the top of this sheet.</Text>
      )}
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  scroll: { maxHeight: 520 },
  scrollBody: { gap: space.lg, paddingBottom: space.xs },
  restoreBtn: { paddingHorizontal: 12 },
  hero: { width: "100%", height: 140, borderRadius: radius.lg },
  freeCard: { backgroundColor: palette.successSoft, borderRadius: radius.lg, padding: space.md, gap: 3 },
  freeHead: { flexDirection: "row", alignItems: "center", gap: space.sm, marginBottom: 2 },
  trust: { flexDirection: "row", alignItems: "center", gap: space.sm, backgroundColor: palette.surfaceAlt, borderRadius: radius.md, padding: space.md },
  perk: { flexDirection: "row", alignItems: "center", gap: space.md },
  tick: { width: 28, height: 28, borderRadius: 14, backgroundColor: palette.primarySoft, alignItems: "center", justifyContent: "center" },
  or: { flexDirection: "row", alignItems: "center", gap: space.md, marginTop: space.xs },
  rule: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: palette.border },
  restoreResult: { flexDirection: "row", alignItems: "center", gap: space.sm, borderRadius: radius.md, padding: space.md },
});
