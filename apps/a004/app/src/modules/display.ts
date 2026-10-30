import { Linking, Platform } from "react-native";

/**
 * Android's Display settings (dark theme, font size). Apps follow the phone's theme and text size
 * (src/ui/theme.ts): Settings shows "Theme · Follows your phone" and "Text size · Follows your phone" rows that open
 * this — a real control, never a dead-end row. On iOS (no per-app display intent) we open the app's
 * Settings page instead.
 */
export async function openDisplaySettings(): Promise<void> {
  if (Platform.OS === "android") {
    try {
      await Linking.sendIntent("android.settings.DISPLAY_SETTINGS");
      return;
    } catch {
      // fall through to the generic settings page
    }
  }
  await Linking.openSettings().catch(() => {});
}
