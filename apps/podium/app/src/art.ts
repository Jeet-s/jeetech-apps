/** Generated app art (assets/art/manifest.json has kind/usage/size for each). Use with expo Image or Skia useImage. */
export const art = {
  app_icon: require("../assets/art/app_icon.png"),
  onboarding_private_practice: require("../assets/art/onboarding_private_practice.png"),
  onboarding_instant_feedback: require("../assets/art/onboarding_instant_feedback.png"),
  onboarding_say_it_better: require("../assets/art/onboarding_say_it_better.png"),
  empty_recordings: require("../assets/art/empty_recordings.png"),
  empty_progress: require("../assets/art/empty_progress.png"),
  empty_scenarios_saved: require("../assets/art/empty_scenarios_saved.png"),
  hero_pro_sheet: require("../assets/art/hero_pro_sheet.png"),
  badge_first_take: require("../assets/art/badge_first_take.png"),
} as const;
export type ArtId = keyof typeof art;
