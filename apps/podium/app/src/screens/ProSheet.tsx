import { useEffect, useState } from "react";
import { Image, Linking, Platform, StyleSheet, Text, View } from "react-native";
import { Button, Icon, Sheet, feedback, palette, radius, space, tones, type } from "../ui";
import { art } from "../art";
import { iap } from "../modules/iap";
import { useSettings } from "../modules/store";
import { useApp } from "../core/data";
import { takesRemaining } from "../core/progress";
import { analytics } from "../modules/analytics";
import monetization from "../../monetization.json";

const legal = (monetization as { legal?: { privacyUrl: string; termsUrl: string } }).legal ?? { privacyUrl: "", termsUrl: "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/" };
const SUBS = ((monetization as { subscriptions?: { sku: string; period: "P1M" | "P1Y"; priceUsd: number; trialDays: number }[] }).subscriptions ?? []);
const LIFETIME = monetization.iap.find((i) => i.sku === "pro_unlock");
const REMOVE_ADS = monetization.iap.find((i) => i.sku === "remove_ads");

const PERKS = [
  "Up to 48 full-feedback takes a day",
  "5-minute rehearsals with per-section scores",
  "Deep analytics: vocal variety, energy, trends",
  "Unlimited Event Prep plans",
  "Audience-persona Q&A practice",
  "Export reports to PDF · ad-free",
];

const periodLabel = (p: "P1M" | "P1Y") => (p === "P1Y" ? "year" : "month");

/** The Pro offer. Prices and trial show BEFORE purchase; Restore is always
 * visible; store-loaded prices override the catalogue fallbacks. */
type Status = { tone: "success" | "warning"; text: string };
const STORE_UNAVAILABLE =
  "Google Play isn’t ready on this device yet. If you’ve already purchased, tap Restore — otherwise check your connection and try again.";

export function ProSheet({ visible, from, onClose }: { visible: boolean; from: string; onClose: () => void }) {
  const { pro, adsRemoved } = useSettings();
  const app = useApp();
  const freeLeft = takesRemaining(app.allowance);
  const freeCap = app.allowance.freeTakesLimit;
  // Anchor the offer to the user's OWN data: their best score so far, so the
  // value is concrete ("keep beating this") rather than an abstract feature list.
  const bestScore = app.reports.length ? Math.max(...app.reports.map((r) => r.overallScore)) : null;
  // Which action is in flight (a sku, or "restore") — drives the per-button spinner.
  const [pending, setPending] = useState<string | null>(null);
  // A lasting, visible outcome line under the buttons (reserved height, no jump).
  const [status, setStatus] = useState<Status | null>(null);
  useEffect(() => {
    if (visible) {
      analytics.track("paywall_view", { from });
      setStatus(null);
      setPending(null);
    }
  }, [visible, from]);
  useEffect(() => {
    if (pro && visible) {
      feedback("unlock", "success");
      onClose();
    }
  }, [pro, visible, onClose]);

  // Every tap must give feedback within 0.1s and end in a visible outcome. A real
  // purchase opens Google Play's own dialog (completing via iap's listener, which
  // flips `pro` and closes the sheet); a safety timer clears the spinner so the
  // sheet is never stuck. When the store has no live product for a SKU (a reviewer
  // device, offline, no Play account) the tap can't open Play at all — so instead
  // of doing nothing we show a clear inline status and point to Restore.
  const buy = async (sku: string, purchasable: boolean, fn: () => Promise<void>) => {
    if (pending) return;
    feedback("pop", "light");
    setStatus(null);
    setPending(sku);
    if (!purchasable) {
      // Brief spinner so the tap feels handled, then the honest "store not ready" line.
      await new Promise((r) => setTimeout(r, 420));
      feedback("error", "warning");
      setStatus({ tone: "warning", text: STORE_UNAVAILABLE });
      setPending(null);
      return;
    }
    const safety = setTimeout(() => setPending(null), 2500);
    try {
      await fn();
    } catch {
      feedback("error", "warning");
      setStatus({ tone: "warning", text: "Couldn’t reach Google Play. Please try again." });
    } finally {
      clearTimeout(safety);
      setPending(null);
    }
  };

  const doRestore = async () => {
    if (pending) return;
    feedback("pop", "light");
    setStatus(null);
    setPending("restore");
    const n = await iap.restore().catch(() => 0);
    analytics.track("restore_completed");
    feedback(n ? "unlock" : "pop", n ? "success" : "light");
    setStatus(n ? { tone: "success", text: "Purchases restored." } : { tone: "warning", text: "No purchase found on this Google account." });
    setPending(null);
  };

  const storePlans = iap.plans();
  const lifetimePrice = iap.price("pro_unlock") ?? (LIFETIME ? `$${LIFETIME.priceUsd.toFixed(2)}` : null);
  const noAdsPrice = iap.price("remove_ads") ?? (REMOVE_ADS ? `$${REMOVE_ADS.priceUsd.toFixed(2)}` : null);
  // A SKU is purchasable only when the store has a live product for it (on Android a
  // subscription also needs an offer token). Prices still show from the catalogue
  // fallback either way, so the offer is always legible.
  const lifetimeBuyable = iap.price("pro_unlock") != null;
  const noAdsBuyable = iap.price("remove_ads") != null;

  // Always list the subscription plans with a price (store or catalogue fallback).
  const plans = SUBS.map((p) => {
    const live = storePlans.find((x) => x.sku === p.sku);
    return {
      sku: p.sku,
      period: p.period,
      price: live?.price ?? `$${p.priceUsd.toFixed(2)}`,
      trialDays: live?.trialDays ?? p.trialDays,
      buyable: !!live && (Platform.OS === "ios" || !!live.offerToken),
    };
  });

  return (
    <Sheet visible={visible} title="Podium Pro" onClose={onClose}>
      <Image source={art.hero_pro_sheet} style={styles.hero} resizeMode="cover" accessibilityIgnoresInvertColors />

      {!pro && bestScore != null ? (
        <View style={styles.anchor}>
          <View style={styles.anchorScore}>
            <Text style={[type.number, { fontSize: 26, color: palette.primary }]}>{bestScore}</Text>
            <Text style={[type.caption, { color: palette.inkSoft }]}>your best</Text>
          </View>
          <Text style={[type.caption, { flex: 1, color: palette.ink }]}>
            You're at {bestScore}/100. Pro helps you push higher — longer 3-min takes, unlimited daily takes, custom-scenario prompts and your full progress history.
          </Text>
        </View>
      ) : null}

      {!pro ? (
        <View style={styles.allowance}>
          <Icon name="mic" size={16} color={palette.primary} />
          <Text style={[type.caption, { flex: 1, color: palette.ink }]}>
            {freeLeft > 0
              ? `${freeLeft} of ${freeCap} free take${freeCap === 1 ? "" : "s"} left today · full feedback, free. Go Pro for up to 48 a day.`
              : `You've used today's ${freeCap} free take${freeCap === 1 ? "" : "s"} — more at midnight. Go Pro for up to 48 a day.`}
          </Text>
        </View>
      ) : null}

      <View style={{ gap: space.sm }}>
        {PERKS.map((p) => (
          <View key={p} style={styles.perk}>
            <View style={styles.tick}><Icon name="check" size={15} color={palette.success} /></View>
            <Text style={[type.body, { flex: 1 }]}>{p}</Text>
          </View>
        ))}
      </View>

      {plans.map((p, i) => (
        <Button
          key={p.sku}
          label={`${p.trialDays ? `Try ${p.trialDays} days free, then ` : ""}${p.price}/${periodLabel(p.period)}`}
          size="lg"
          variant={i === 0 ? "primary" : "secondary"}
          disabled={!!pending && pending !== p.sku}
          loading={pending === p.sku}
          onPress={() => buy(p.sku, p.buyable, () => iap.subscribe(p.sku))}
        />
      ))}

      {plans.length && Platform.OS !== "ios" ? (
        <Text style={[type.caption, { textAlign: "center" }]}>
          {plans.some((p) => p.trialDays)
            ? "Billing starts when the free trial ends, then renews automatically each period until cancelled. We'll remind you a day before the trial ends. Cancel anytime in Google Play or Settings → Manage subscription."
            : "Renews automatically each period until cancelled. Cancel anytime in Google Play or Settings → Manage subscription."}
        </Text>
      ) : !plans.length && Platform.OS !== "ios" ? (
        <Text style={[type.caption, { textAlign: "center" }]}>One-time purchase. Cancel anytime in Google Play.</Text>
      ) : null}
      {Platform.OS === "ios" ? (
        <View style={{ gap: 4 }}>
          <Text style={[type.caption, { textAlign: "center" }]}>
            Payment is charged to your Apple ID. The subscription renews automatically unless cancelled at least 24 hours before the period ends. Manage or cancel in your App Store account settings.
          </Text>
          <Text style={[type.caption, { textAlign: "center" }]}>
            <Text accessibilityRole="link" style={{ textDecorationLine: "underline" }} onPress={() => Linking.openURL(legal.termsUrl)}>Terms of Use</Text>
            {legal.privacyUrl ? "  ·  " : ""}
            {legal.privacyUrl ? <Text accessibilityRole="link" style={{ textDecorationLine: "underline" }} onPress={() => Linking.openURL(legal.privacyUrl)}>Privacy Policy</Text> : null}
          </Text>
        </View>
      ) : null}

      {lifetimePrice ? (
        <>
          <Button label={`${plans.length ? "Or pay once · lifetime " : "Unlock Pro · "}${lifetimePrice}`} size="lg" variant={plans.length ? "ghost" : "primary"} disabled={!!pending && pending !== "pro_unlock"} loading={pending === "pro_unlock"} onPress={() => buy("pro_unlock", lifetimeBuyable, () => iap.purchase("pro_unlock"))} />
          {plans.length ? <Text style={[type.caption, { textAlign: "center" }]}>Lifetime unlocks every Pro feature. The higher daily AI limit needs an active subscription.</Text> : null}
        </>
      ) : null}

      {!adsRemoved && noAdsPrice ? <Button label={`Just remove ads · ${noAdsPrice}`} variant="ghost" disabled={!!pending && pending !== "remove_ads"} loading={pending === "remove_ads"} onPress={() => buy("remove_ads", noAdsBuyable, () => iap.purchase("remove_ads"))} /> : null}

      {/* Outcome of the last action — a lasting, visible status (not just a toast). */}
      <View style={styles.statusSlot}>
        {status ? (
          <View style={[styles.status, { backgroundColor: status.tone === "success" ? palette.successSoft : palette.warningSoft }]}>
            <Icon name={status.tone === "success" ? "checkCircle" : "info"} size={16} color={tones[status.tone].fg} />
            <Text style={[type.caption, { flex: 1, color: tones[status.tone].fg }]}>{status.text}</Text>
          </View>
        ) : null}
      </View>

      <Text style={[type.caption, { textAlign: "center", color: palette.inkMuted }]}>
        Already a member? Restore your purchase on this device. Subscriptions renew automatically on each billing date until cancelled.
      </Text>
      <Button
        label="Restore purchases"
        variant="ghost"
        icon="refresh"
        loading={pending === "restore"}
        disabled={!!pending && pending !== "restore"}
        onPress={doRestore}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  hero: { width: "100%", height: 140, borderRadius: radius.lg },
  perk: { flexDirection: "row", alignItems: "center", gap: space.md },
  tick: { width: 24, height: 24, borderRadius: 12, backgroundColor: palette.successSoft, alignItems: "center", justifyContent: "center" },
  allowance: { flexDirection: "row", alignItems: "center", gap: space.sm, backgroundColor: palette.primarySoft, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.sm },
  anchor: { flexDirection: "row", alignItems: "center", gap: space.md, backgroundColor: palette.surfaceAlt, borderRadius: radius.lg, padding: space.md, borderWidth: 1, borderColor: palette.border },
  anchorScore: { alignItems: "center", minWidth: 52 },
  statusSlot: { minHeight: 4 },
  status: { flexDirection: "row", alignItems: "center", gap: space.sm, backgroundColor: palette.surfaceAlt, borderRadius: radius.md, padding: space.sm },
});
