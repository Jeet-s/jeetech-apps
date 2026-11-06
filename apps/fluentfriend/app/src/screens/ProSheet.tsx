import { useEffect, useState } from "react";
import { Linking, Platform, StyleSheet, Text, View } from "react-native";
import monetization from "../../monetization.json";

const legal = (monetization as { legal?: { privacyUrl: string; termsUrl: string } }).legal ?? { privacyUrl: "", termsUrl: "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/" };
import { Button, Icon, Sheet, feedback, palette, radius, space, type } from "../ui";
import { iap } from "../modules/iap";
import { useSettings } from "../modules/store";
import { analytics } from "../modules/analytics";
import { bn } from "../util";

// Concrete, benefit-first differences — what the free tier already gives vs what Pro adds (QA:
// "Pro value and the free AI quota are not clearly shown").
const PERKS = [
  "দিনে ৫৩টি AI চ্যাট (ফ্রি-তে ৮টি)",
  "কোনো ব্যানার বিজ্ঞাপন নেই",
  "পূর্ণ “আমার ভুল” স্পেসড-রিপিটিশন রিভিউ",
  "কোর্স সার্টিফিকেট ও বিস্তারিত ফলাফল",
];
const FREE_NOTE = "সব লেসন, বাক্য, ব্যাকরণ ও দিনে ৮টি AI চ্যাট চিরকাল ফ্রি।";

const fmtUsd = (n: number) => `$${n.toFixed(2)}`;
const periodBn = (p: "P1M" | "P1Y") => (p === "P1Y" ? "বছর" : "মাস");

// Prices from the store when it has loaded them, otherwise the catalogue in monetization.json. A reviewer
// or a user on a flaky connection / no Play account must still SEE what Pro costs and how to restore — never a
// bare "not available" with no price and no Restore button (Play policy; QA feature-tour: paywall).
type PlanRow = { sku: string; price: string; period: "P1M" | "P1Y"; trialDays: number; live: boolean };
const SUBS_CFG = (monetization as { subscriptions?: { sku: string; period: "P1M" | "P1Y"; priceUsd: number; trialDays: number }[] }).subscriptions ?? [];
const IAP_CFG = (monetization as { iap?: { sku: string; priceUsd: number }[] }).iap ?? [];
const usdFor = (sku: string) => {
  const o = IAP_CFG.find((i) => i.sku === sku);
  return o ? fmtUsd(o.priceUsd) : null;
};

/** The Pro offer. Opened from a locked feature or Settings; `from` is tracked. */
export function ProSheet({ visible, from, onClose }: { visible: boolean; from: string; onClose: () => void }) {
  const { pro, adsRemoved } = useSettings();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (visible) {
      analytics.track("paywall_view", { from });
      setNotice(null);
    }
  }, [visible, from]);
  useEffect(() => {
    if (pro && visible) {
      feedback("unlock", "success");
      onClose();
    }
  }, [pro, visible, onClose]);

  const storeNotReady = "এই ডিভাইসে স্টোর এখনো প্রস্তুত নয়। Google Play-তে সাইন ইন থাকলে এখান থেকেই কেনা যাবে। নীচের “কেনাকাটা পুনরুদ্ধার” সবসময় কাজ করে।";
  const buy = async (sku: string, live: boolean) => {
    if (!live) { setNotice(storeNotReady); return; }
    setBusy(true); setNotice(null);
    await iap.purchase(sku).catch(() => {});
    setBusy(false);
  };
  const subscribe = async (sku: string, live: boolean) => {
    if (!live) { setNotice(storeNotReady); return; }
    setBusy(true); setNotice(null);
    await iap.subscribe(sku).catch(() => {});
    setBusy(false);
  };
  const doRestore = async () => {
    setNotice("পুনরুদ্ধার হচ্ছে…");
    const n = await iap.restore().catch(() => 0);
    setNotice(n ? `${bn(n)}টি আগের কেনাকাটা পুনরুদ্ধার হয়েছে ✓` : "কোনো আগের কেনাকাটা পাওয়া যায়নি।");
  };

  // Live offers when the store returned them; otherwise fall back to the catalogue price so the sheet is never empty.
  const livePlans = iap.plans();
  const plans: PlanRow[] = livePlans.length
    ? livePlans.map((p) => ({ sku: p.sku, price: p.price, period: p.period, trialDays: p.trialDays, live: true }))
    : SUBS_CFG.map((p) => ({ sku: p.sku, price: fmtUsd(p.priceUsd), period: p.period, trialDays: p.trialDays, live: false }));
  const liveLifetime = iap.price("pro_unlock");
  const lifetime = liveLifetime ?? usdFor("pro_unlock");
  const liveNoAds = iap.price("remove_ads");
  const noAds = liveNoAds ?? usdFor("remove_ads");

  return (
    <Sheet visible={visible} title="Go Pro" onClose={onClose}>
      <View style={styles.hero}>
        <Icon name="star" size={34} color={palette.onPrimary} />
      </View>
      <View style={{ gap: space.sm }}>
        {PERKS.map((p) => (
          <View key={p} style={styles.perk}>
            <View style={styles.tick}><Icon name="check" size={16} color={palette.success} /></View>
            <Text style={type.body}>{p}</Text>
          </View>
        ))}
      </View>
      <View style={styles.freeNote}>
        <Icon name="checkCircle" size={16} color={palette.primary} />
        <Text style={[type.caption, { color: palette.inkSoft, flex: 1 }]}>{FREE_NOTE}</Text>
      </View>
      {plans.map((p, i) => (
        <Button
          key={p.sku}
          label={`${p.trialDays ? `${bn(p.trialDays)} দিন ফ্রি, তারপর ` : ""}${p.price}/${periodBn(p.period)}`}
          size="lg"
          variant={i === 0 ? "primary" : "secondary"}
          loading={busy}
          onPress={() => subscribe(p.sku, p.live)}
        />
      ))}
      {plans.length && Platform.OS !== "ios" ? <Text style={[type.caption, { textAlign: "center" }]}>ট্রায়ালের পরেই বিল শুরু হয় · যেকোনো সময় Google Play-তে বাতিল করা যাবে।</Text> : null}
      {plans.length && Platform.OS === "ios" ? (
        // App Review 3.1.2: renewal terms + Terms of Use and Privacy Policy links next to the purchase buttons.
        <View style={{ gap: 4 }}>
          <Text style={[type.caption, { textAlign: "center" }]}>
            Payment is charged to your Apple ID. The subscription renews automatically unless cancelled at least 24 hours before the end of the current period. Manage or cancel in your App Store account settings.
          </Text>
          <Text style={[type.caption, { textAlign: "center" }]}>
            <Text accessibilityRole="link" style={{ textDecorationLine: "underline" }} onPress={() => Linking.openURL(legal.termsUrl)}>Terms of Use</Text>
            {legal.privacyUrl ? "  ·  " : ""}
            {legal.privacyUrl ? <Text accessibilityRole="link" style={{ textDecorationLine: "underline" }} onPress={() => Linking.openURL(legal.privacyUrl)}>Privacy Policy</Text> : null}
          </Text>
        </View>
      ) : null}
      {lifetime ? (
        <Button
          label={`${plans.length ? "অথবা লাইফটাইম" : "Pro আনলক করুন"} · ${lifetime}`}
          size="lg"
          variant={plans.length ? "ghost" : "primary"}
          loading={busy}
          onPress={() => buy("pro_unlock", !!liveLifetime)}
        />
      ) : null}
      {lifetime && plans.length ? (
        <Text style={[type.caption, { textAlign: "center" }]}>লাইফটাইম সব ফিচার আনলক করে; দিনে বড় AI কোটার জন্য সাবস্ক্রিপশন লাগে।</Text>
      ) : null}
      {!adsRemoved && noAds ? <Button label={`শুধু বিজ্ঞাপন সরান · ${noAds}`} variant="ghost" onPress={() => buy("remove_ads", !!liveNoAds)} /> : null}

      <Button label="কেনাকাটা পুনরুদ্ধার" variant="ghost" icon="refresh" style={{ borderWidth: 0 }} onPress={doRestore} />
      {notice ? (
        <View style={styles.notice}>
          <Text style={[type.caption, { textAlign: "center", color: palette.ink }]}>{notice}</Text>
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  hero: { alignSelf: "center", width: 72, height: 72, borderRadius: radius.lg, backgroundColor: palette.warning, alignItems: "center", justifyContent: "center" },
  perk: { flexDirection: "row", alignItems: "center", gap: space.md },
  tick: { width: 26, height: 26, borderRadius: 13, backgroundColor: palette.successSoft, alignItems: "center", justifyContent: "center" },
  notice: { backgroundColor: palette.primarySoft, borderRadius: radius.md, padding: space.md },
  freeNote: { flexDirection: "row", alignItems: "center", gap: space.sm, backgroundColor: palette.primarySoft, borderRadius: radius.md, padding: space.md },
});
