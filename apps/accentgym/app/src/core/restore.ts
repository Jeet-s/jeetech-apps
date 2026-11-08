/** Normalize native OpenIAP/Expo error spellings before deciding recovery. */
export function restoreFailure(error: unknown): { retry: boolean; message: string } {
  const raw = error && typeof error === "object" && "code" in error ? String(error.code) : "unknown";
  const code = raw.replace(/^E[_-]/i, "").toLowerCase().replace(/_/g, "-");
  if (code === "item-not-owned") return { retry: false, message: "No previous purchases found on this store account." };
  if (["billing-unavailable", "iap-not-available", "init-connection"].includes(code)) return { retry: false, message: "The store cannot check purchases on this device. Sign in to the store account you bought with, then return and retry. Your saved access stays unchanged." };
  return { retry: ["not-prepared", "connection-closed", "service-unavailable", "service-disconnected", "network-error", "service-error", "service-timeout", "sync-error"].includes(code), message: "The store did not finish checking purchases. Your saved access stays unchanged. Sign in to your store account and try Restore again." };
}

export type SavedAccess = { pro: boolean; adsRemoved: boolean; proSource?: "lifetime" | "subscription" };
export type OwnedItem = { productId: string; purchaseState: string; isSuspendedAndroid?: boolean | null };
/** Only a successful ownership query can expire a subscription or confirm an empty account. */
export function restoredAccess(current: SavedAccess, owned: OwnedItem[], subscriptionSkus: string[]): { access: SavedAccess; count: number } {
  const active = owned.filter(p => p.purchaseState === "purchased" && !p.isSuspendedAndroid);
  const lifetime = (current.pro && current.proSource !== "subscription") || active.some(p => p.productId === "pro_unlock");
  const subscription = active.some(p => subscriptionSkus.includes(p.productId));
  const pro = lifetime || subscription;
  const adsRemoved = pro || active.some(p => p.productId === "remove_ads") || (current.adsRemoved && current.proSource !== "subscription");
  return { access: { pro, adsRemoved, proSource: lifetime ? "lifetime" : subscription ? "subscription" : undefined },
    count: new Set(active.filter(p => ["pro_unlock", "remove_ads", ...subscriptionSkus].includes(p.productId)).map(p => p.productId)).size };
}
