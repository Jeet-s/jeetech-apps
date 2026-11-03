import { useEffect, useState } from "react";
import { Image, Linking, Platform, StyleSheet, Text, View } from "react-native";
import monetization from "../../monetization.json";

const legal = (monetization as { legal?: { privacyUrl: string; termsUrl: string } }).legal ?? { privacyUrl: "", termsUrl: "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/" };
import { Button, Icon, Sheet, feedback, palette, radius, space, type } from "../ui";
import { art } from "../art";
import { iap } from "../modules/iap";
import { useSettings } from "../modules/store";
import { analytics } from "../modules/analytics";

const PERKS = [
  "Advanced analytics & player comparisons",
  "AI match reports & form insights",
  "Bulk CSV / PDF export & custom themes",
  "Organizer tools for clubs & leagues",
  "No ads, ever — Pro only",
];

// What every user keeps for free, forever — shown first so no one fears being gated (the CricHeroes complaint).
const FREE = [
  "Ball-by-ball scoring & unlimited undo",
  "Full scorecards & career stats",
  "Charts & basic points tables",
  "Share cards to your group",
];

/** The Pro offer. Pro sells power features only — stats, scorecards and points tables stay free forever. */
export function ProSheet({ visible, from, onClose }: { visible: boolean; from: string; onClose: () => void }) {
  const { pro, adsRemoved } = useSettings();
  const [busy, setBusy] = useState(false);
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
  const [restoreMsg, setRestoreMsg] = useState<string | null>(null);
  const buy = async (sku: string) => { setBusy(true); await iap.purchase(sku).catch(() => {}); setBusy(false); };
  const subscribe = async (sku: string) => { setBusy(true); analytics.track("trial_started", { sku }); await iap.subscribe(sku).catch(() => {}); setBusy(false); };
  const restore = async () => {
    setRestoreMsg("Checking your purchases…");
    try {
      const n = await iap.restore();
      setRestoreMsg(n > 0 ? "Purchases restored ✓" : "No previous purchases found on this account.");
    } catch {
      setRestoreMsg("Couldn't reach the store — check your connection and try again.");
    }
  };

  const plans = iap.plans();
  const lifetime = iap.price("pro_unlock");
  const noAds = iap.price("remove_ads");
  const storeLoaded = plans.length > 0 || !!lifetime || !!noAds;

  // Catalog fallback (prices from monetization.json) so a reviewer or anyone on a flaky connection / test device
  // still sees exactly what Pro costs and can Restore — never a bare "not available" with no price.
  const usd = (n: number) => `$${n.toFixed(2)}`;
  const subCatalog = ((monetization as { subscriptions?: { sku: string; period: "P1Y" | "P1M"; priceUsd: number; trialDays: number }[] }).subscriptions ?? []);
  const lifetimeUsd = (monetization.iap.find((p) => p.sku === "pro_unlock")?.priceUsd ?? 0);
  const noAdsUsd = (monetization.iap.find((p) => p.sku === "remove_ads")?.priceUsd ?? 0);

  return (
    <Sheet visible={visible} title="Gully Score Pro" onClose={onClose}>
      <Image source={art.hero_pro_sheet} style={styles.hero} resizeMode="contain" accessibilityIgnoresInvertColors />
      <Text style={[type.body, { color: palette.inkSoft }]}>
        Your stats, scorecards and basic points tables are <Text style={type.bodyStrong}>free forever</Text> — Pro just adds power features and removes ads. Your data always stays, even if Pro lapses.
      </Text>

      {/* Lead with what's always free so no one fears losing access — the #1 reason people won't switch scorers. */}
      <View style={styles.freeBox}>
        <Text style={[type.overline, { color: palette.success }]}>Always free</Text>
        {FREE.map((f) => (
          <View key={f} style={styles.freeRow}>
            <Icon name="check" size={15} color={palette.success} />
            <Text style={[type.caption, { flex: 1, color: palette.ink }]}>{f}</Text>
          </View>
        ))}
      </View>

      <Text style={[type.label, { marginTop: space.xs }]}>Pro adds</Text>
      <View style={{ gap: space.sm }}>
        {PERKS.map((p) => (
          <View key={p} style={styles.perk}>
            <View style={styles.tick}><Icon name="check" size={16} color={palette.success} /></View>
            <Text style={[type.body, { flex: 1 }]}>{p}</Text>
          </View>
        ))}
      </View>

      {storeLoaded ? (
        <>
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
          {plans.length && Platform.OS !== "ios" ? <Text style={[type.caption, { textAlign: "center" }]}>7-day free trial, then billed yearly. Cancel anytime in Google Play.</Text> : null}
          {plans.length && Platform.OS === "ios" ? (
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
            <Button label={`${plans.length ? "Or buy lifetime" : "Unlock Pro"} · ${lifetime}`} size="lg" variant={plans.length ? "ghost" : "primary"} loading={busy} onPress={() => buy("pro_unlock")} />
          ) : null}
          {!adsRemoved && !pro && noAds ? <Button label={`Just remove ads · ${noAds}`} variant="ghost" onPress={() => buy("remove_ads")} /> : null}
          {plans.length ? <Text style={[type.caption, { textAlign: "center" }]}>Lifetime unlocks every Pro feature; the higher AI quota needs a subscription.</Text> : null}
        </>
      ) : (
        // Store products haven't loaded (no Play/App Store account, offline, or a test device). Still show the plans and
        // prices from the catalog, and an always-visible Restore — never a dead "not available" with no price.
        <View style={styles.catalog}>
          {subCatalog.map((p) => (
            <View key={p.sku} style={styles.priceRow}>
              <Text style={[type.body, { flex: 1 }]} numberOfLines={1}>
                Pro{p.period === "P1Y" ? " · yearly" : " · monthly"}{p.trialDays ? ` · ${p.trialDays}-day free trial` : ""}
              </Text>
              <Text style={type.bodyStrong}>{usd(p.priceUsd)}/{p.period === "P1Y" ? "yr" : "mo"}</Text>
            </View>
          ))}
          {lifetimeUsd ? (
            <View style={styles.priceRow}>
              <Text style={[type.body, { flex: 1 }]} numberOfLines={1}>Pro · lifetime (one-time)</Text>
              <Text style={type.bodyStrong}>{usd(lifetimeUsd)}</Text>
            </View>
          ) : null}
          {noAdsUsd ? (
            <View style={styles.priceRow}>
              <Text style={[type.body, { flex: 1 }]} numberOfLines={1}>Remove ads only (one-time)</Text>
              <Text style={type.bodyStrong}>{usd(noAdsUsd)}</Text>
            </View>
          ) : null}
          <Text style={[type.caption, { textAlign: "center" }]}>
            {Platform.OS === "ios" ? "Sign in to the App Store to subscribe. Cancel anytime in your Apple account." : "Connect a Google Play account to subscribe. Cancel anytime in Google Play."} Your data always stays, even without Pro.
          </Text>
        </View>
      )}

      {/* Restore is ALWAYS available (policy) — with an inline result the user can see. */}
      <Button label="Restore purchases" variant={storeLoaded ? "ghost" : "secondary"} icon="undo" onPress={restore} />
      {restoreMsg ? <Text style={[type.caption, { textAlign: "center" }]} accessibilityLiveRegion="polite">{restoreMsg}</Text> : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  hero: { width: "100%", height: 150, borderRadius: radius.lg },
  freeBox: { backgroundColor: palette.successSoft, borderRadius: radius.lg, padding: space.md, gap: 6 },
  freeRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  perk: { flexDirection: "row", alignItems: "center", gap: space.md },
  tick: { width: 26, height: 26, borderRadius: 13, backgroundColor: palette.successSoft, alignItems: "center", justifyContent: "center" },
  catalog: { gap: space.sm, backgroundColor: palette.surfaceAlt, borderRadius: radius.lg, borderWidth: 1, borderColor: palette.border, padding: space.md },
  priceRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
});
