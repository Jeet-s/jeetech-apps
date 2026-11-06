/** Small view-layer helpers (no domain logic — that lives in src/core). */
import type { IconName } from "./ui";
import type { Topic } from "./core";

const BN_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];

/** Western digits → Bangla numerals, for a Bangla-first UI (e.g. "দিন ৭")। */
export function bn(n: number | string): string {
  return String(n).replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]);
}

/**
 * Store-screenshot mode flag. The factory captures real screens on an emulator; a full-bleed Skia <Canvas>
 * (e.g. the celebratory Confetti) on top can read back as an opaque BLACK layer in Android screenshot capture
 * and blank the whole scene (seen in Gully Score QA). Set true by the screenshot host so such overlays are
 * skipped only during capture — the real app still shows them.
 */
let SHOT_MODE = false;
export function setShotMode(v: boolean): void {
  SHOT_MODE = v;
}
export function isShotMode(): boolean {
  return SHOT_MODE;
}

/**
 * One visual identity per scenario/phrase topic — a distinct icon AND a distinct colour — shared by the
 * Talk picker and the Learn grid so a topic reads the same everywhere. Replaces the old all-teal squares
 * (and the doctor/pharmacy BOTH using the heart icon) the design director flagged. Colours are hand-picked
 * teal/amber/violet/coral/green hues that sit on a soft tinted tile (`${color}1F`).
 */
export const TOPIC_VISUAL: Record<Topic, { icon: IconName; color: string }> = {
  daily: { icon: "chat", color: "#0F766E" },
  shopping: { icon: "home", color: "#F59E0B" },
  travel: { icon: "globe", color: "#2563EB" },
  interview: { icon: "person", color: "#8B5CF6" },
  jobs: { icon: "award", color: "#0EA5A4" },
  health: { icon: "heart", color: "#E11D73" },
  bank: { icon: "lock", color: "#7C3AED" },
  phone: { icon: "volume", color: "#D97706" },
};
