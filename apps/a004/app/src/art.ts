/** Generated app art (assets/art/manifest.json has kind/usage/size for each). Use with expo Image or Skia useImage. */
export const art = {
  ill_onboard_snap_plate: require("../assets/art/ill_onboard_snap_plate.png"),
  ill_onboard_cuisine: require("../assets/art/ill_onboard_cuisine.png"),
  ill_onboard_insight: require("../assets/art/ill_onboard_insight.png"),
  ill_onboard_private: require("../assets/art/ill_onboard_private.png"),
  empty_history: require("../assets/art/empty_history.png"),
  empty_insights: require("../assets/art/empty_insights.png"),
  empty_meals: require("../assets/art/empty_meals.png"),
  hero_pro_sheet: require("../assets/art/hero_pro_sheet.png"),
  ui_logo_mark: require("../assets/art/ui_logo_mark.png"),
  ui_badge_streak: require("../assets/art/ui_badge_streak.png"),
} as const;
export type ArtId = keyof typeof art;
