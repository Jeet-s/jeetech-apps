import { Linking } from "react-native";

/**
 * Android's Display settings (dark theme, font size). Apps follow the phone's theme and text size
 * (src/ui/theme.ts): Settings shows "Theme · Follows your phone" and "Text size · Follows your phone" rows that open
 * this — a real control, never a dead-end row.
 */
export async function openDisplaySettings(): Promise<void> {
  try {
    await Linking.sendIntent("android.settings.DISPLAY_SETTINGS");
  } catch {
    await Linking.openSettings().catch(() => {});
  }
}
