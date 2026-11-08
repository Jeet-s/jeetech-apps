import { Platform } from "react-native";
import monetization from "../../monetization.json";
import { iap } from "./iap";

/** iOS offers appear only after StoreKit returns approved products. */
export function canOfferPro(): boolean {
  return Platform.OS === "ios" ? iap.items().length > 0 || iap.plans().length > 0 : monetization.iap.length > 0 || monetization.subscriptions.length > 0;
}
