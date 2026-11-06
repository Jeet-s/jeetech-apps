import { Share } from "react-native";
import app from "../../app.json";
import { analytics } from "./analytics";

/**
 * Share the app — factory-owned (owner, 2026-10-25). Opens the native share sheet (React Native's built-in Share,
 * no extra dependency) with a short line + the Google Play link. The package comes from app.json (written by the
 * factory per app), never hardcoded; the referrer tags installs as utm_source=share / utm_medium=app.
 *
 * Use it from a visible, labelled "Share" row/button the user pressed (Settings) — never automatically, and never
 * reward it (no Pro days, credits or unlocks for sharing).
 */
const pkg = app.expo.android.package;

export const playStoreUrl = `https://play.google.com/store/apps/details?id=${encodeURIComponent(pkg)}&referrer=utm_source%3Dshare%26utm_medium%3Dapp`;

export const share = {
  /** `from` = where the button lives (analytics only), e.g. "settings". Resolves true if the user shared. */
  async app(from: string, message = `I've been using ${app.expo.name} and thought you'd like it:`): Promise<boolean> {
    analytics.track("share_open", { from });
    try {
      const r = await Share.share({ title: app.expo.name, message: `${message} ${playStoreUrl}` });
      const done = r.action === Share.sharedAction;
      if (done) analytics.track("share", { from });
      return done;
    } catch {
      return false;
    }
  },
};
