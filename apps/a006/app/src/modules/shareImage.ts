import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import type { RefObject } from "react";
import { analytics } from "./analytics";
import { share } from "./share";

/**
 * Share a rendered card (scorecard / result / POTM) as a PNG IMAGE — the viral
 * loop wants a picture in the WhatsApp group, not a wall of text. We snapshot a
 * laid-out <View> with react-native-view-shot, then hand the file to the native
 * share sheet via expo-sharing (which wires up the Android FileProvider for us).
 *
 * Capture happens WHILE the preview sheet is still mounted (the ref must point at
 * a live, on-screen view), then the caller closes the sheet and shares the file.
 * If capture or sharing isn't available (older device, no share targets), we fall
 * back to the plain-text summary via share.app() so the action is never a dead end.
 */

/** Snapshot a view ref to a temporary PNG file. Returns the file URI, or null if it couldn't.
 *  Raced against a timeout so a stalled snapshot (seen on some emulators / headless GPUs, where captureRef can
 *  hang indefinitely) never wedges the share flow — we fall back to sharing the text summary instead. */
export async function captureCard(ref: RefObject<unknown>): Promise<string | null> {
  try {
    const shot = captureRef(ref as never, { format: "png", quality: 1, result: "tmpfile" });
    const uri = await Promise.race<string | null>([
      shot as Promise<string>,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500)),
    ]);
    return typeof uri === "string" ? uri : null;
  } catch {
    return null;
  }
}

export type ShareKind = "image" | "text" | "none";

/**
 * Open the OS share sheet with the captured image; fall back to text.
 * `uri` is the file from captureCard() (may be null → straight to text).
 */
export async function shareCardImage(uri: string | null, opts: { from: string; text: string }): Promise<ShareKind> {
  analytics.track("share_open", { from: opts.from });
  try {
    if (uri && (await Sharing.isAvailableAsync())) {
      await Sharing.shareAsync(uri, { mimeType: "image/png", UTI: "public.png", dialogTitle: "Share card" });
      analytics.track("share", { from: opts.from });
      return "image";
    }
  } catch {
    // fall through to the text summary
  }
  const ok = await share.app(opts.from, opts.text);
  return ok ? "text" : "none";
}
