/** Generated app art (assets/art/manifest.json has kind/usage/size for each). Use with expo Image or Skia useImage. */
export const art = {
  app_icon: require("../assets/art/app_icon.png"),
  logo_mark: require("../assets/art/logo_mark.png"),
  onboarding_1_drag_create: require("../assets/art/onboarding_1_drag_create.png"),
  onboarding_2_choose_defaults: require("../assets/art/onboarding_2_choose_defaults.png"),
  onboarding_3_notifications: require("../assets/art/onboarding_3_notifications.png"),
  empty_day_timeline: require("../assets/art/empty_day_timeline.png"),
  empty_templates: require("../assets/art/empty_templates.png"),
  empty_stats: require("../assets/art/empty_stats.png"),
  pro_hero: require("../assets/art/pro_hero.png"),
  achievement_streak_badge: require("../assets/art/achievement_streak_badge.png"),
} as const;
export type ArtId = keyof typeof art;
