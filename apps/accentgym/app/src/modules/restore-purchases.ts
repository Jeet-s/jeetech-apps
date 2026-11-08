import { getAvailablePurchases, initConnection, restorePurchases as syncPurchases } from "expo-iap";
import { Platform } from "react-native";
import monetization from "../../monetization.json";
import { iap } from "./iap";
import { store } from "./store";
import { cloud } from "./cloud";
import { restoredAccess, restoreFailure } from "../core/restore";

let active: Promise<string> | undefined;
let initializing: Promise<void> | undefined;
async function storeRequest<T>(request: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([request, new Promise<never>((_, reject) => { timer = setTimeout(() => reject({ code: "service-timeout" }), 10000); })]);
  } finally { if (timer) clearTimeout(timer); }
}
export function initializePurchases(): Promise<void> {
  return initializing ??= iap.init();
}

async function checkOwnership(): Promise<string> {
  // Reconnect on EVERY explicit restore: product loading at launch is not proof
  // that billing is still connected, and a missing catalog is not an empty account.
  const connected = await storeRequest(initConnection()).catch(error => {
    if (error?.code === "already-prepared") return true;
    throw error;
  });
  if (!connected) throw { code: "billing-unavailable" };
  if (Platform.OS === "ios") await storeRequest(syncPurchases());
  // Keep the factory's normal restore/verification path. A failed product fetch
  // can leave its private connection flag false; in that case query ownership
  // directly through the same SDK, without depending on any loaded products.
  const owned = await storeRequest(getAvailablePurchases({ onlyIncludeActiveItemsIOS: true, includeSuspendedAndroid: false }));
  await storeRequest(iap.restore()).catch(() => undefined);
  const planSkus = monetization.subscriptions.map(p => p.sku);
  const { access, count } = restoredAccess(store.get(), owned, planSkus);
  store.set(access);
  for (const p of owned) {
    if (p.purchaseState !== "purchased" || !["pro_unlock", "remove_ads", ...planSkus].includes(p.productId) || !p.purchaseToken) continue;
    void cloud.verifyPurchase({ token: p.purchaseToken, sku: p.productId, kind: planSkus.includes(p.productId) ? "subscription" : "one_time" });
  }
  return count > 0 ? "Purchases restored. Your access is updated." : access.pro ? "No additional purchases found. Your saved Pro access is still active." : "No previous purchases found on this store account. Your free practice is ready.";
}

/** Single-flight, bounded restore; only a real store query can say “none found”. */
export function restorePurchases(): Promise<string> {
  if (active) return active;
  active = (async () => {
    await storeRequest(initializePurchases()).catch(() => undefined);
    for (let attempt = 0; attempt < 2; attempt++) {
      try { return await checkOwnership(); }
      catch (error) {
        const failure = restoreFailure(error);
        if (attempt === 0 && failure.retry) continue;
        return failure.message;
      }
    }
    return "Please try Restore again.";
  })().finally(() => { active = undefined; });
  return active;
}
