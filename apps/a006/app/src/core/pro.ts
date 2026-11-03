/**
 * Pro gating. The promise: personal stats, scorecards, charts and the basic
 * points table are FREE FOREVER and never gated. Pro sells power features only,
 * and a lapsed subscriber keeps all their data and free features.
 */
export type Feature =
  // free forever — listed so tests can assert they are NOT gated
  | "scoring"
  | "scorecard"
  | "charts"
  | "career_stats"
  | "team_stats"
  | "basic_points_table"
  | "tournaments"
  | "share_image"
  | "live_link"
  | "local_export"
  | "cloud_backup"
  // pro power features
  | "advanced_analytics"
  | "player_comparison"
  | "head_to_head_deep"
  | "bulk_export"
  | "custom_themes"
  | "organizer_tools"
  | "ai_summary"
  | "ad_free";

export const FREE_FOREVER: Feature[] = [
  "scoring",
  "scorecard",
  "charts",
  "career_stats",
  "team_stats",
  "basic_points_table",
  "tournaments",
  "share_image",
  "live_link",
  "local_export",
  "cloud_backup",
];

export const PRO_FEATURES: Feature[] = [
  "advanced_analytics",
  "player_comparison",
  "head_to_head_deep",
  "bulk_export",
  "custom_themes",
  "organizer_tools",
  "ai_summary",
  "ad_free",
];

/** Whether a feature requires Pro. Core/stats features are never gated. */
export function isGated(feature: Feature): boolean {
  return PRO_FEATURES.includes(feature);
}

/** Can the user use this feature right now? */
export function canUse(feature: Feature, pro: boolean): boolean {
  return pro || !isGated(feature);
}

/**
 * AI daily quota. Lifetime Pro unlocks AI features, but the HIGHER daily quota
 * needs a subscription (lifetime users keep the free taste).
 */
export function aiDailyQuota(opts: { subscriber: boolean }): number {
  return opts.subscriber ? 50 : 2;
}

export function aiQuotaLeft(used: number, opts: { subscriber: boolean }): number {
  return Math.max(0, aiDailyQuota(opts) - used);
}
