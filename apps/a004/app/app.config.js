// Extends app.json with the monetization plugins. The AdMob app id comes from
// monetization.json (written per app by the factory from its Play slot).
const monetization = require("./monetization.json");
const cloud = require("./cloud.json");
// Plain-HTTP cloud only for a LOCAL App Cloud (emulator → this Mac, http://10.0.2.2…); real cloud URLs are HTTPS.
const localCloud = /^http:\/\/(10\.0\.2\.2|localhost|127\.0\.0\.1)(:|\/|$)/.test(cloud.apiUrl || "");

const { withAndroidManifest } = require("expo/config-plugins");

// android.blockedPermissions only removes <uses-permission>; a LIBRARY manifest can also declare <uses-permission-sdk-23>
// (react-native-ble-plx declares location that way — Sugar Plate's release still requested ACCESS_FINE/COARSE_LOCATION,
// 2026-10-30). Add a tools:node="remove" sdk-23 entry for every blocked permission so the manifest merger drops those too.
const withBlockedSdk23 = (config) =>
  withAndroidManifest(config, (c) => {
    const blocked = c.android?.blockedPermissions ?? [];
    const m = c.modResults.manifest;
    if (!blocked.length) return c;
    m.$ = { ...m.$, "xmlns:tools": m.$?.["xmlns:tools"] ?? "http://schemas.android.com/tools" };
    const sdk23 = (m["uses-permission-sdk-23"] ?? []).filter((p) => !blocked.includes(p.$?.["android:name"]));
    m["uses-permission-sdk-23"] = [...sdk23, ...blocked.map((name) => ({ $: { "android:name": name, "tools:node": "remove" } }))];
    return c;
  });

module.exports = ({ config }) => ({
  ...config,
  plugins: [
    withBlockedSdk23,
    [
      "react-native-google-mobile-ads",
      {
        androidAppId: monetization.admob.appId,
        // The factory's iOS build swaps the iOS AdMob app's ids into monetization.json (lib/appstore/build-ios.ts).
        iosAppId: monetization.admob.appId,
        // Consent (UMP) is gathered before the SDK starts serving.
        delayAppMeasurementInit: true,
      },
    ],
    // Pin Google Play Billing (no store flavors to pick at build time).
    ["expo-iap", { android: { store: "play" } }],
    [
      "expo-build-properties",
      {
        android: {
          minSdkVersion: 24,
          usesCleartextTraffic: localCloud,
          // Release builds are minified (R8). Room/WorkManager (pulled in by the
          // AdMob SDK) load generated *_Impl classes by reflection — without
          // these rules the app crashes on launch.
          extraProguardRules: [
            "-keep class * extends androidx.room.RoomDatabase { <init>(); }",
            "-keep class androidx.work.impl.** { *; }",
            "-keep class androidx.startup.** { *; }",
            "-dontwarn androidx.work.**",
          ].join("\n"),
        },
      },
    ],
  ],
});
