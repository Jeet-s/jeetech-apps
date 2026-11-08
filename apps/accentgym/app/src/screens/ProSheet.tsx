import { useEffect, useState } from "react";
import { Linking, Platform, StyleSheet, Text, View } from "react-native";
import monetization from "../../monetization.json";
import { Button, Icon, Sheet, feedback, palette, radius, space, type } from "../ui";
import { restorePurchases } from "../modules/restore-purchases";
import { iap } from "../modules/iap";
import { useSettings } from "../modules/store";
import { analytics } from "../modules/analytics";

const legal = (monetization as { legal?: { privacyUrl: string; termsUrl: string } }).legal ?? { privacyUrl: "", termsUrl: "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/" };

const PERKS = [
  "134 AI requests daily with a subscription",
  "Coaching, IPA and tailored tips share that allowance",
  "All sentence packs + ad-free practice",
];

type SubDef = { sku: string; period: "P1M" | "P1Y"; priceUsd: number; trialDays: number };
const SUBS: SubDef[] = (monetization as { subscriptions?: SubDef[] }).subscriptions ?? [];
const IAPS = monetization.iap as { sku: string; priceUsd: number }[];
const usd = (n: number) => `$${n.toFixed(2)}`;
const periodWord = (p: "P1M" | "P1Y") => (p === "P1Y" ? "year" : "month");

/**
 * The Pro offer for Accent Gym. Shows the subscription plans (monthly + annual,
 * 7-day trial, no card) and the lifetime unlock with their PRICES even when the
 * store can't load products (QA device, offline, no Play account) — falling back
 * to monetization.json — plus an always-visible Restore with an inline result,
 * so a reviewer or a user on a flaky connection always sees cost + how to restore.
 */
export function ProSheet({ visible, from, onClose }: { visible: boolean; from: string; onClose: () => void }) {
  const { pro, adsRemoved } = useSettings();
  const [pending, setPending] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      analytics.track("paywall_view", { from });
      setStatus(null);
      setPending(null);
    }
  }, [visible, from]);
  useEffect(() => {
    if (pro && visible && pending && pending !== "restore") {
      feedback("unlock", "success");
      setStatus("Pro is active. Your access is saved. Enjoy your practice!");
    }
  }, [pro, visible, pending]);

  const livePlans = iap.plans();
  const lifetimeDef = IAPS.find((i) => i.sku === "pro_unlock");
  const noAdsDef = IAPS.find((i) => i.sku === "remove_ads");
  // Live store price when loaded, else the catalog price so the cost is always visible.
  const lifetimePrice = iap.price("pro_unlock") ?? (Platform.OS !== "ios" && lifetimeDef ? usd(lifetimeDef.priceUsd) : null);
  const noAdsPrice = iap.price("remove_ads") ?? (Platform.OS !== "ios" && noAdsDef ? usd(noAdsDef.priceUsd) : null);


  const planRows = SUBS.filter(def => Platform.OS !== "ios" || livePlans.some(p => p.sku === def.sku)).map((def) => {
    const live = livePlans.find((p) => p.sku === def.sku);
    return {
      sku: def.sku,
      price: live?.price ?? usd(def.priceUsd),
      period: def.period,
      trialDays: live ? live.trialDays : def.trialDays,
    };
  });

  const run = async (sku: string, fn: () => Promise<void>) => {
    if (!iap.price(sku)) {
      setStatus("The store could not load this plan. Connect to your store account and restart the app to retry. Prices and Restore remain available.");
      return;
    }
    const subscription = iap.plans().find(p => p.sku === sku);
    if (subscription && Platform.OS !== "ios" && !subscription.offerToken) { setStatus("The store did not return an eligible subscription offer. Try again after restarting the app, or choose lifetime Pro."); return; }
    setPending(sku);
    setStatus("Opening your store checkout… Nothing is charged until you confirm there.");
    try { await fn(); setStatus("Finish in the store checkout. If you closed it, no purchase was made. You can try again."); }
    catch { setStatus("Purchase did not finish. Nothing was unlocked; please try again or restore an existing purchase."); }
    setPending(null);
  };
  const restore = async () => {
    setPending("restore");
    setStatus("Checking the store account for past purchases…");
    setStatus(await restorePurchases());
    setPending(null);
  };

  return (
    <Sheet visible={visible} title={pro ? "Your Pro access" : "Go Pro"} onClose={onClose} footer={<View style={{ gap: space.sm }}>
      <View style={{ minHeight: 94, padding: space.md, borderRadius: radius.md, backgroundColor: palette.surfaceAlt }}>
        <Text style={type.bodyStrong} accessibilityLiveRegion="polite">{pending === "restore" ? "Checking purchases…" : status ? "Purchase check result" : "Free practice stays yours"}</Text>
        <Text style={[type.caption, { color: palette.ink }]} accessibilityLiveRegion="polite">{status ?? "Your five daily free lines, model audio and listening drills stay free."}</Text>
      </View>

      <Button
        label={pending === "restore" ? "Restoring purchases…" : "Restore purchases"}
        variant="ghost"
        size="sm"
        disabled={!!pending}
        onPress={restore}
      /></View>}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
        <View style={styles.hero}><Icon name="mic" size={28} color={palette.onPrimary} /></View>
        <View style={{ flex: 1 }}><Text style={type.heading}>More room to practise</Text><Text style={type.caption}>Choose a plan. Keep your free practice.</Text></View>
      </View>

      <View style={{ gap: space.sm }}>
        {PERKS.map((p) => (
          <View key={p} style={styles.perk}>
            <View style={styles.tick}><Icon name="check" size={16} color={palette.success} /></View>
            <Text style={[type.body, { flex: 1 }]}>{p}</Text>
          </View>
        ))}
      </View>

      {planRows.map((p, i) => (
        <View key={p.sku} style={{ gap: space.xs }}><Button
          label={`${p.period === "P1Y" ? "Annual" : "Monthly"} · ${p.price}/${periodWord(p.period)}${p.trialDays ? ` · ${p.trialDays} days free` : ""}`}
          size="lg"
          variant={i === 0 ? "primary" : "secondary"}

          disabled={!!pending}
          onPress={() => run(p.sku, () => iap.subscribe(p.sku))}
        />
        {p.period === "P1Y" ? <Text style={[type.caption, { textAlign: "center" }]}>{livePlans.find(l => l.sku === p.sku) ? `${p.price} billed once per year` : `${usd((SUBS.find(d => d.sku === p.sku)?.priceUsd ?? 0) / 12)}/month equivalent · ${p.price} billed yearly`}</Text> : null}
        </View>
      ))}
      {planRows.length ? (
        <Text style={[type.caption, { textAlign: "center" }]}>
          The free tier needs no card. Eligible store trials renew at the displayed price after 7 days unless cancelled. {Platform.OS === "ios" ? "Cancel anytime in your App Store subscriptions." : "Cancel anytime in Google Play."}
        </Text>
      ) : null}

      {Platform.OS === "ios" && planRows.length ? (
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

      {lifetimePrice ? (
        <Button
          label={`Unlock Pro · lifetime · ${lifetimePrice}`}
          size="lg"
          variant={planRows.length ? "ghost" : "primary"}

          disabled={!!pending}
          onPress={() => run("pro_unlock", () => iap.purchase("pro_unlock"))}
        />
      ) : null}
      {planRows.length ? (
        <Text style={[type.caption, { textAlign: "center" }]}>Lifetime: all sentence packs and ad-free practice, permanently. AI stays at the free allowance; 134 daily requests require a subscription. Model audio and listening drills are unlimited on every plan.</Text>
      ) : null}

      {!adsRemoved && noAdsPrice ? (
        <Button
          label={`Remove Ads · ${noAdsPrice}`}
          variant="ghost"

          disabled={!!pending}
          onPress={() => run("remove_ads", () => iap.purchase("remove_ads"))}
        />
      ) : null}


    </Sheet>
  );
}

const styles = StyleSheet.create({
  hero: { width: 52, height: 52, borderRadius: radius.sm, backgroundColor: palette.primaryDark, alignItems: "center", justifyContent: "center" },
  perk: { flexDirection: "row", alignItems: "center", gap: space.md },
  tick: { width: 26, height: 26, borderRadius: 13, backgroundColor: palette.successSoft, alignItems: "center", justifyContent: "center" },
});
