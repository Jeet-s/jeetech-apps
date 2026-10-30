import { useEffect, useRef, useState } from "react";
import { Image, Linking, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import monetization from "../../monetization.json";

const legal = (monetization as { legal?: { privacyUrl: string; termsUrl: string } }).legal ?? { privacyUrl: "", termsUrl: "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/" };
import { Button, Pill, Sheet, palette, radius, space, toast, type } from "../ui";
import { art } from "../art";
import { iap } from "../modules/iap";
import { useSettings } from "../modules/store";
import { analytics } from "../modules/analytics";

/** Free vs Pro, side by side (what's genuinely free stays obvious). */
const COMPARE: { feature: string; free: string; pro: string }[] = [
  { feature: "Practice every task", free: "Yes", pro: "Yes" },
  { feature: "AI-scored answers", free: "3 free + 2/day", pro: "Unlimited*" },
  { feature: "Mock tests", free: "1 preview", pro: "All mocks" },
  { feature: "Question packs", free: "Core bank", pro: "All packs" },
  { feature: "Ads", free: "Light banner", pro: "None" },
];

type CatalogPlan = { sku: string; period: "P1M" | "P1Y"; priceUsd: number; trialDays: number };
type CatalogItem = { sku: string; priceUsd: number };
const catalogPlans: CatalogPlan[] = ((monetization as { subscriptions?: CatalogPlan[] }).subscriptions ?? []);
const catalogLifetime = ((monetization as { iap?: CatalogItem[] }).iap ?? []).find((i) => i.sku === "pro_unlock") ?? null;

const usd = (n: number) => `$${n.toFixed(2)}`;
const periodLabel = (p: "P1M" | "P1Y", sku: string) => (p === "P1Y" ? "year" : sku === "pass_3month" ? "3 months" : "month");

// A small, honest tag per plan: the 3-month is the exam-date pass (a HOW-WE-WIN
// offer); the yearly is the lowest cost per month. Purely a visual marker.
const PLAN_BADGE: Record<string, string> = { pass_3month: "Exam-date pass", pro_yearly: "Best value" };

interface PlanRow {
  sku: string;
  price: string;
  period: "P1M" | "P1Y";
  trialDays: number;
}

/** The Pro offer: free-vs-Pro table, exam-date passes + yearly (with trial),
 *  lifetime unlock as an alternative, and Restore. No account required to buy.
 *  Plans/prices always render — from the store when loaded, otherwise from the
 *  configured catalog with a "confirms at checkout" note. */
export function ProSheet({ visible, from, onClose }: { visible: boolean; from: string; onClose: () => void }) {
  const { pro } = useSettings();
  // Only the SKU being purchased (or "restore") spins — so prices on the other
  // rows never flicker to a spinner while one action runs.
  const [busySku, setBusySku] = useState<string | null>(null);
  const [restoreMsg, setRestoreMsg] = useState<string | null>(null);
  useEffect(() => {
    if (visible) {
      analytics.track("paywall_view", { from });
      setRestoreMsg(null);
    }
  }, [visible, from]);
  useEffect(() => {
    if (pro && visible) onClose();
  }, [pro, visible, onClose]);

  const subscribe = async (sku: string) => {
    setBusySku(sku);
    analytics.track("plan_selected", { sku });
    await iap.subscribe(sku).catch(() => {});
    setBusySku(null);
  };
  const buy = async (sku: string) => {
    setBusySku(sku);
    await iap.purchase(sku).catch(() => {});
    setBusySku(null);
  };
  const restore = async () => {
    setBusySku("restore");
    setRestoreMsg(null);
    const n = await iap.restore().catch(() => 0);
    setBusySku(null);
    const msg = n ? "Purchases restored" : "No purchases found on this account.";
    setRestoreMsg(msg);
    toast(msg);
  };

  // Prefer the store's localized plans/prices; otherwise show the configured
  // catalog so the user always sees what Pro costs (prices confirm at checkout).
  // Cache the first non-empty plan set we see so prices stay stable (the store
  // can briefly return [] again between renders).
  const storePlans = iap.plans();
  const cachedStore = useRef<typeof storePlans>([]);
  if (storePlans.length) cachedStore.current = storePlans;
  const effectiveStore = storePlans.length ? storePlans : cachedStore.current;
  const usingStore = effectiveStore.length > 0;
  const plans: PlanRow[] = usingStore
    ? effectiveStore.map((p) => ({ sku: p.sku, price: p.price, period: p.period, trialDays: p.trialDays }))
    : catalogPlans.map((p) => ({ sku: p.sku, price: usd(p.priceUsd), period: p.period, trialDays: p.trialDays }));
  const lifetimePrice = iap.price("pro_unlock") ?? (catalogLifetime ? usd(catalogLifetime.priceUsd) : null);
  const pricesConfirmAtCheckout = !usingStore;

  return (
    <Sheet visible={visible} title="Go Pro" onClose={onClose}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: space.lg }} style={{ maxHeight: 560 }}>
        {/* Contain (not cover) + a transparent frame so the whole illustration shows —
            cover was clipping the halo above the mic at the top. */}
        <Image source={art.pro_hero} style={styles.hero} resizeMode="contain" accessibilityIgnoresInvertColors />

        <Text style={[type.body, { color: palette.inkSoft }]}>Unlimited AI scoring, full mock tests, weak-spot analytics, every question pack and no ads.</Text>

        {/* Free vs Pro */}
        <View style={styles.table}>
          <View style={[styles.tr, styles.trHead]}>
            <Text style={[type.caption, styles.cFeature, { color: palette.ink }]}>Feature</Text>
            <Text style={[type.caption, styles.cCol]}>Free</Text>
            <Text style={[type.caption, styles.cCol, { color: palette.primary }]}>Pro</Text>
          </View>
          {COMPARE.map((r) => (
            <View key={r.feature} style={styles.tr}>
              <Text style={[type.label, styles.cFeature, { color: palette.ink }]} numberOfLines={2}>{r.feature}</Text>
              <Text style={[type.caption, styles.cCol]}>{r.free}</Text>
              <Text style={[type.label, styles.cCol, { color: palette.primary }]}>{r.pro}</Text>
            </View>
          ))}
        </View>

        {/* Plans — always visible, with price, period, any free trial and an honest
            value tag (exam-date pass / best value) so the offer is clear at a glance. */}
        {plans.map((p, i) => (
          <View key={p.sku} style={styles.planWrap}>
            <Button
              label={`${p.trialDays ? `${p.trialDays}-day free trial, then ` : ""}${p.price} / ${periodLabel(p.period, p.sku)}`}
              size="lg"
              variant={i === 0 ? "primary" : "secondary"}
              loading={busySku === p.sku}
              disabled={!!busySku && busySku !== p.sku}
              onPress={() => subscribe(p.sku)}
            />
            {PLAN_BADGE[p.sku] ? (
              <View style={styles.planBadge} pointerEvents="none">
                <Pill label={PLAN_BADGE[p.sku]} tone="primary" />
              </View>
            ) : null}
          </View>
        ))}

        {lifetimePrice ? (
          <Button
            label={`${plans.length ? "Or unlock lifetime" : "Unlock Pro"} · ${lifetimePrice}`}
            size="lg"
            variant={plans.length ? "ghost" : "primary"}
            loading={busySku === "pro_unlock"}
            disabled={!!busySku && busySku !== "pro_unlock"}
            onPress={() => buy("pro_unlock")}
          />
        ) : null}

        {/* Cancel / trial / billing terms (shown before purchase — Play & App Store policy) */}
        <View style={{ gap: 4 }}>
          {pricesConfirmAtCheckout ? (
            <Text style={[type.caption, { textAlign: "center" }]}>Prices are confirmed at checkout in your {Platform.OS === "ios" ? "App Store" : "Google Play"} region.</Text>
          ) : null}
          {Platform.OS === "ios" ? (
            <Text style={[type.caption, { textAlign: "center" }]}>
              *Fair-use daily cap. Payment is charged to your Apple ID. Subscriptions renew automatically unless cancelled at least 24 hours before the period ends; a free trial converts to paid unless cancelled before it ends. Manage or cancel anytime in your App Store account.
            </Text>
          ) : (
            <Text style={[type.caption, { textAlign: "center" }]}>
              *Fair-use daily cap. Billed via Google Play. Subscriptions renew automatically; a free trial converts to paid unless cancelled before it ends. Cancel anytime in Google Play.
            </Text>
          )}
          {lifetimePrice && plans.length ? (
            <Text style={[type.caption, { textAlign: "center" }]}>Lifetime unlocks Pro features, mocks and no ads. For the highest daily AI-scoring quota, choose an exam-date pass.</Text>
          ) : null}
        </View>

        {/* Restore — always available whenever something can be bought (policy).
            Always resolves to a visible result, never a stuck spinner. */}
        <Button label="Restore purchases" variant="ghost" icon="refresh" loading={busySku === "restore"} disabled={!!busySku && busySku !== "restore"} onPress={restore} />
        {restoreMsg ? (
          <View style={styles.restoreResult}>
            <Text style={[type.caption, { textAlign: "center", color: palette.ink }]}>{restoreMsg}</Text>
          </View>
        ) : null}

        {Platform.OS === "ios" ? (
          <Text style={[type.caption, { textAlign: "center" }]}>
            <Text accessibilityRole="link" style={styles.link} onPress={() => Linking.openURL(legal.termsUrl)}>Terms of Use</Text>
            {legal.privacyUrl ? "  ·  " : ""}
            {legal.privacyUrl ? <Text accessibilityRole="link" style={styles.link} onPress={() => Linking.openURL(legal.privacyUrl)}>Privacy Policy</Text> : null}
          </Text>
        ) : null}
        <Text style={[type.caption, { textAlign: "center" }]}>Scores are estimates, not official. Independent app, not affiliated with the test owner.</Text>
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  hero: { width: "100%", height: 132, borderRadius: radius.lg },
  planWrap: { position: "relative" },
  // The value tag floats on the plan's top-right corner, clear of the label.
  planBadge: { position: "absolute", top: -9, right: 12 },
  table: { borderWidth: 1, borderColor: palette.border, borderRadius: radius.md, overflow: "hidden" },
  tr: { flexDirection: "row", alignItems: "center", paddingVertical: space.sm, paddingHorizontal: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border },
  trHead: { backgroundColor: palette.surfaceAlt, borderTopWidth: 0 },
  cFeature: { flex: 1.4 },
  cCol: { flex: 1, textAlign: "center" },
  link: { textDecorationLine: "underline" },
  restoreResult: { backgroundColor: palette.surfaceAlt, borderRadius: radius.md, paddingVertical: space.sm, paddingHorizontal: space.md },
});
