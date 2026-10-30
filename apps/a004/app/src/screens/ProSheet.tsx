import { useEffect, useState } from "react";
import { Image, Linking, Platform, StyleSheet, Text, View } from "react-native";
import monetization from "../../monetization.json";
const legal = (monetization as { legal?: { privacyUrl: string; termsUrl: string } }).legal ?? { privacyUrl: "", termsUrl: "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/" };
import { Button, Card, Icon, Pill, Sheet, feedback, palette, radius, space, toast, type } from "../ui";
import { art } from "../art";
import { iap } from "../modules/iap";
import { useSettings } from "../modules/store";
import { analytics } from "../modules/analytics";

const PERKS: { title: string; body: string }[] = [
  { title: "Cloud backup & sync", body: "Restore your log on a new phone with an email code. Never blocks local use." },
  { title: "Unlimited AI meal coaching", body: "Estimate any plate and ask the coach freely (free tier gets 3 a day)." },
  { title: "AI weekly summary", body: "A warm, plain-language recap with a question for your doctor." },
  { title: "Advanced clinician reports", body: "Richer PDF summaries to share with your care team." },
];

const FREE_NOTE = "Always free: logging, notes, search, charts, time-in-range, A1C estimate, reminders, CSV & PDF export, the dish database and 3 AI estimates a day. We never move a free feature behind Pro.";

/** A plan row the sheet can render — either a live store plan or a config-only fallback. */
type DisplayPlan = { sku: string; period: "P1M" | "P1Y"; trialDays: number; price: string; offerToken: string | null };
type ConfigPlan = { sku: string; period: "P1M" | "P1Y"; priceUsd: number; trialDays: number };
type ConfigIap = { sku: string; priceUsd: number };
const CONFIG_PLANS: ConfigPlan[] = (monetization as { subscriptions?: ConfigPlan[] }).subscriptions ?? [];
const CONFIG_IAP: ConfigIap[] = (monetization as { iap?: ConfigIap[] }).iap ?? [];
const usd = (n: number): string => `$${n.toFixed(2)}`;
const configIapPrice = (sku: string): string | null => {
  const found = CONFIG_IAP.find((p) => p.sku === sku);
  return found ? usd(found.priceUsd) : null;
};

/** The Pro offer — subscriptions + lifetime, prices shown before purchase. `from` is tracked. */
export function ProSheet({ visible, from, onClose }: { visible: boolean; from: string; onClose: () => void }) {
  const { pro } = useSettings();
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(false);
  // An inline, LASTING result line for Restore (toasts alone were invisible behind
  // the sheet) so the user always sees "Restored" or "nothing to restore".
  const [restoreMsg, setRestoreMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    if (visible) analytics.track("paywall_view", { from });
  }, [visible, from]);
  useEffect(() => {
    if (pro && visible) {
      feedback("unlock", "success");
      analytics.track("pro_started");
      onClose();
    }
  }, [pro, visible, onClose]);

  const buy = async (sku: string) => { setBusy(true); await iap.purchase(sku).catch(() => {}); setBusy(false); };
  const subscribe = async (sku: string) => { setBusy(true); await iap.subscribe(sku).catch(() => {}); setBusy(false); };

  const restore = async () => {
    if (restoring) return;
    setRestoring(true);
    setRestoreMsg(null);
    const n = await iap.restore().catch(() => 0);
    setRestoring(false);
    feedback(n ? "unlock" : "pop", n ? "success" : "warning");
    const text = n ? "Purchases restored — Pro is now active." : "No previous purchase found on this account.";
    setRestoreMsg({ ok: !!n, text });
    toast(text);
  };

  // Prefer live store plans (localized price, real trial, offer token); fall back to the
  // configured prices so the paywall ALWAYS shows price, period and trial terms.
  const live = iap.plans();
  const plans: DisplayPlan[] =
    live.length > 0
      ? live.map((p) => ({ sku: p.sku, period: p.period, trialDays: p.trialDays, price: p.price, offerToken: p.offerToken }))
      : CONFIG_PLANS.map((p) => ({ sku: p.sku, period: p.period, trialDays: p.trialDays, price: usd(p.priceUsd), offerToken: null }));
  // Yearly first (primary), monthly second (secondary).
  plans.sort((a, b) => (a.period === b.period ? 0 : a.period === "P1Y" ? -1 : 1));
  const lifetime = iap.price("pro_unlock") ?? configIapPrice("pro_unlock");

  return (
    <Sheet visible={visible} title="Sugar Plate Pro" onClose={onClose}>
      <Image source={art.hero_pro_sheet} style={styles.hero} resizeMode="contain" accessibilityIgnoresInvertColors />

      <View style={{ gap: space.md }}>
        {PERKS.map((p) => (
          <View key={p.title} style={styles.perk}>
            <View style={styles.tick}><Icon name="check" size={15} color={palette.success} /></View>
            <View style={{ flex: 1 }}>
              <Text style={type.bodyStrong}>{p.title}</Text>
              <Text style={type.caption}>{p.body}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* A concrete SAMPLE of the AI weekly summary so the main paid value is tangible before paying —
          a real example in the app's own voice, clearly labelled as a sample, no personal data. */}
      <Card style={styles.sample}>
        <View style={styles.sampleHead}>
          <Icon name="insights" size={16} color={palette.primary} />
          <Text style={[type.label, { flex: 1 }]}>SAMPLE WEEKLY SUMMARY</Text>
          <Pill label="Example" tone="neutral" />
        </View>
        <Text style={[type.body, { color: palette.inkSoft }]}>
          “In your log this week, mornings after rice dinners averaged a little higher than after roti, and your steadiest plate was dal with two roti. Time in range held around 68%. One to bring to your doctor: is your fasting target still right for you?”
        </Text>
      </Card>

      {plans.map((p, i) => (
        <Button
          key={p.sku}
          label={`${p.trialDays ? `Try ${p.trialDays} days free, then ` : ""}${p.price}/${p.period === "P1Y" ? "year" : "month"}`}
          size="lg"
          variant={i === 0 ? "primary" : "secondary"}
          loading={busy}
          onPress={() => subscribe(p.sku)}
        />
      ))}
      {Platform.OS !== "ios" ? <Text style={[type.caption, { textAlign: "center" }]}>Cancel anytime in Google Play. Free trial converts to a paid subscription unless cancelled before it ends. Higher AI quota needs a subscription.</Text> : null}
      {Platform.OS === "ios" ? (
        <View style={{ gap: 4 }}>
          <Text style={[type.caption, { textAlign: "center" }]}>
            Payment is charged to your Apple ID. Subscriptions renew automatically unless cancelled at least 24 hours before the period ends. Manage in your App Store account settings.
          </Text>
          <Text style={[type.caption, { textAlign: "center" }]}>
            <Text accessibilityRole="link" style={styles.link} onPress={() => Linking.openURL(legal.termsUrl)}>Terms of Use</Text>
            {legal.privacyUrl ? "  ·  " : ""}
            {legal.privacyUrl ? <Text accessibilityRole="link" style={styles.link} onPress={() => Linking.openURL(legal.privacyUrl)}>Privacy Policy</Text> : null}
          </Text>
        </View>
      ) : null}
      {lifetime ? (
        <Button
          label={`${plans.length ? "Or pay once · lifetime" : "Unlock Pro"} · ${lifetime}`}
          size="lg"
          variant={plans.length ? "ghost" : "primary"}
          loading={busy}
          onPress={() => buy("pro_unlock")}
        />
      ) : null}
      {lifetime ? <Text style={[type.caption, { textAlign: "center" }]}>Lifetime unlocks Pro features forever; the higher AI quota comes with a subscription.</Text> : null}

      {/* A clearly visible Restore control (not a tiny below-the-fold link) with a lasting
          inline result, as Play/Apple require whenever something can be bought. */}
      <Button label="Restore purchases" variant="ghost" icon="history" loading={restoring} onPress={restore} />
      {restoreMsg ? (
        <View style={styles.restoreResult}>
          <Icon name={restoreMsg.ok ? "check" : "info"} size={15} color={restoreMsg.ok ? palette.success : palette.inkSoft} />
          <Text style={[type.caption, { flex: 1, color: restoreMsg.ok ? palette.success : palette.inkSoft }]}>{restoreMsg.text}</Text>
        </View>
      ) : null}

      <Card>
        <View style={styles.freeHead}>
          <Pill label="Free forever" tone="success" />
        </View>
        <Text style={type.caption}>{FREE_NOTE}</Text>
      </Card>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  hero: { width: "100%", height: 150, borderRadius: radius.lg },
  perk: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  tick: { width: 24, height: 24, borderRadius: 12, backgroundColor: palette.successSoft, alignItems: "center", justifyContent: "center", marginTop: 1 },
  link: { textDecorationLine: "underline" },
  freeHead: { flexDirection: "row", marginBottom: space.xs },
  sample: { gap: space.sm },
  sampleHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  restoreResult: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: space.md },
});
