/**
 * Entitlement — honest billing + bulletproof restore (the #1 and #2 user
 * complaints we fix). A no-card 7-day trial (server-granted), monthly/annual
 * subscriptions, a lifetime unlock, a 48h pre-conversion reminder, one-tap
 * cancel, Restore, and grandfathering when plans change. All time is explicit
 * epoch-ms so it's testable; no hidden clock.
 */
import type { Entitlement, Plan } from "./types";

export const TRIAL_MS = 7 * 86_400_000;
export const MONTH_MS = 30 * 86_400_000;
export const YEAR_MS = 365 * 86_400_000;
export const TRIAL_REMINDER_MS = 48 * 3_600_000; // reminder window before conversion

export function freeEntitlement(): Entitlement {
  return { plan: "free", status: "none" };
}

/** True while the user has Pro access right now. */
export function isPro(e: Entitlement, now: number): boolean {
  if (e.plan === "lifetime") return true;
  if (e.status === "active") return true;
  if (e.status === "trialing") return (e.trialEndsAt ?? 0) > now;
  // Cancelled but inside the paid period → access continues until it ends.
  if (e.status === "cancelled") return (e.nextBillingDate ?? 0) > now;
  return false;
}

export function isTrialing(e: Entitlement, now: number): boolean {
  return e.status === "trialing" && (e.trialEndsAt ?? 0) > now;
}

/** Start a no-card trial on a subscription plan. Idempotent for an active Pro. */
export function startTrial(e: Entitlement, plan: "pro_monthly" | "pro_yearly", now: number): Entitlement {
  if (isPro(e, now)) return e; // already Pro — don't restart a trial
  const trialEndsAt = now + TRIAL_MS;
  return {
    ...e,
    plan,
    status: "trialing",
    trialEndsAt,
    nextBillingDate: trialEndsAt, // first charge is when the trial converts
    source: "trial",
    lastVerifiedAt: now,
  };
}

/** Complete a purchase (store receipt verified). Pro is active immediately. */
export function purchase(e: Entitlement, plan: Plan, now: number): Entitlement {
  if (plan === "lifetime") {
    return { ...e, plan, status: "active", source: "purchase", nextBillingDate: undefined, lastVerifiedAt: now };
  }
  const period = plan === "pro_yearly" ? YEAR_MS : MONTH_MS;
  return { ...e, plan, status: "active", source: "purchase", nextBillingDate: now + period, lastVerifiedAt: now };
}

/** Restore from an account/backup snapshot (reinstall or new phone). */
export function restore(snapshot: Entitlement, now: number): Entitlement {
  return { ...snapshot, source: "restore", lastVerifiedAt: now };
}

/** One-tap cancel: keep access until the paid period ends, then expire. */
export function cancel(e: Entitlement): Entitlement {
  if (e.plan === "lifetime" || e.plan === "free") return e;
  return { ...e, status: "cancelled" };
}

/** Advance the clock: expire a trial/cancelled sub once its end date passes. */
export function tick(e: Entitlement, now: number): Entitlement {
  if (e.status === "trialing" && (e.trialEndsAt ?? 0) <= now) {
    // No card on the trial → it lapses to free rather than silently charging.
    return { ...e, plan: "free", status: "expired", trialEndsAt: undefined, nextBillingDate: undefined };
  }
  if (e.status === "cancelled" && (e.nextBillingDate ?? Infinity) <= now) {
    return { ...e, plan: "free", status: "expired", nextBillingDate: undefined };
  }
  if (e.status === "active" && e.plan !== "lifetime" && (e.nextBillingDate ?? Infinity) <= now) {
    // Renewal: push the next billing date out one period.
    const period = e.plan === "pro_yearly" ? YEAR_MS : MONTH_MS;
    return { ...e, nextBillingDate: (e.nextBillingDate ?? now) + period };
  }
  return e;
}

/** Is the 48h pre-conversion reminder due (trial, not yet reminded by caller)? */
export function trialReminderDue(e: Entitlement, now: number): boolean {
  if (e.status !== "trialing" || !e.trialEndsAt) return false;
  return e.trialEndsAt - now <= TRIAL_REMINDER_MS && e.trialEndsAt > now;
}

/**
 * Grandfather an existing buyer when plans/prices change: record their current
 * plan so a later price hike never removes what they paid for.
 */
export function grandfather(e: Entitlement): Entitlement {
  if (e.plan === "free") return e;
  return { ...e, grandfatheredPlan: e.grandfatheredPlan ?? e.plan };
}
