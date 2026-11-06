import { Platform, Settings } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as StoreReview from "expo-store-review";
import { analytics } from "./analytics";

/**
 * In-app review — factory-owned (owner, 2026-10-25).
 *
 * Uses the official Google Play In-App Review API (expo-store-review → Play's ReviewManager; SKStoreReviewController
 * on iOS). Play decides whether the card is actually shown and enforces its own quota; the call returns either way.
 *
 * APPS: call review.actionCompleted() right after analytics.track("core_action") each time the user SUCCESSFULLY
 * finishes the app's core job (a habit checked off, an entry saved…). It asks only when
 *   - at least MIN_ACTIONS completed actions have been counted on this install (persisted),
 *   - the last ask was more than COOLDOWN_DAYS ago (timestamp persisted in AsyncStorage),
 *   - and never in factory QA (iOS -AGFQA) or on an emulator (the factory's QA AVDs ship the Play Store, so the API
 *     is not guaranteed to be a no-op there — a review card must never cover the screen the AI tester is using).
 *
 * Google Play policy: never gate a feature on reviewing, never ask for a specific rating ("rate us 5 stars"), never
 * reward/incentivize a review, never show your own "do you like this app?" pre-prompt before it. Just call this.
 */
const MIN_ACTIONS = 5;
const COOLDOWN_DAYS = 30;
const DELAY_MS = 1200; // let the success feedback (haptic, check animation, toast) land first
const KEY = "agf_review_v1";

interface ReviewState { lastAsk: number; asks: number; actions: number }

const iosQa = Platform.OS === "ios" && !!(Settings.get?.("AGFQA") as unknown);

/** Android emulators (incl. the Play-Store AVDs the factory QA runs on): sdk_gphone*, generic*, emulator builds. */
function isEmulator(): boolean {
  if (Platform.OS !== "android") return false;
  const c = Platform.constants;
  const id = `${c.Fingerprint ?? ""} ${c.Model ?? ""} ${c.Brand ?? ""}`;
  return /generic|emulator|sdk_gphone|google_sdk|emu64|ranchu|goldfish|vbox/i.test(id);
}

/** True while the factory's QA (or an emulator) runs the app: the review flow must stay out of its way. */
export function reviewBlocked(): boolean {
  return iosQa || isEmulator();
}

let busy = false;

async function load(): Promise<ReviewState> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) return { lastAsk: 0, asks: 0, actions: 0, ...(JSON.parse(raw) as Partial<ReviewState>) };
  } catch {
    // unreadable → treat as never asked
  }
  return { lastAsk: 0, asks: 0, actions: 0 };
}

async function onAction(): Promise<void> {
  if (busy || reviewBlocked()) return;
  busy = true;
  try {
    const s = await load();
    s.actions += 1;
    const due = s.actions >= MIN_ACTIONS && Date.now() - s.lastAsk >= COOLDOWN_DAYS * 86_400_000;
    // Without the native module isAvailableAsync() is false; requestReview() would otherwise fall back to opening the
    // store page (leaving the app) — never do that.
    const ok = due && (await StoreReview.isAvailableAsync().catch(() => false));
    if (ok) {
      s.lastAsk = Date.now();
      s.asks += 1;
    }
    await AsyncStorage.setItem(KEY, JSON.stringify(s)).catch(() => {});
    if (!ok) return;
    await new Promise((r) => setTimeout(r, DELAY_MS));
    if (reviewBlocked()) return;
    analytics.track("review_prompt", { actions: s.actions });
    await StoreReview.requestReview().catch(() => {});
  } catch {
    // reviews must never affect the app
  } finally {
    busy = false;
  }
}

export const review = {
  /** The user just completed the core job (natural positive moment). Fire-and-forget; never await it in UI code. */
  actionCompleted(): void {
    void onAction();
  },
};
