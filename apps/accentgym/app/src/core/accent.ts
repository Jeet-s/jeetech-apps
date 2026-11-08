/**
 * Accent-specific pronunciation rules. The same sentence is scored against the
 * chosen accent, so the EXPECTED pronunciation differs: UK RP is non-rhotic
 * (coda /r/ is dropped), US English flaps intervocalic /t/. These rules let the
 * app "re-score the same sentence and update the IPA when the accent changes"
 * (a must-have the PRD calls out against American-only competitors).
 */
import type { Accent } from "./types";
import { SOUND_BY_ID } from "./sounds";

/** The IPA symbol shown for a catalog sound, per accent. */
export function ipaForSound(soundId: string, accent: Accent): string {
  // Non-rhotic RP shows a dropped coda /r/ as a schwa-ish off-glide marker.
  if (soundId === "r") return accent === "uk" ? "ɾ/∅" : "ɹ";
  return soundId;
}

export interface AccentRule {
  id: string;
  label: string;
  accent: Accent;
}

export const ACCENT_RULES: AccentRule[] = [
  { id: "non_rhotic_r", label: "Drop the R after a vowel (car → 'cah')", accent: "uk" },
  { id: "rhotic_r", label: "Pronounce every R, including at the end (car)", accent: "us" },
  { id: "t_flap", label: "T between vowels sounds like a soft D (water → 'wader')", accent: "us" },
  { id: "clear_t", label: "Pronounce a crisp T between vowels (water)", accent: "uk" },
];

export function rulesFor(accent: Accent): AccentRule[] {
  return ACCENT_RULES.filter((r) => r.accent === accent);
}

/** True if this sound's expected realization changes between US and UK. */
export function accentSensitive(soundId: string): boolean {
  return soundId === "r" || soundId === "t";
}

/**
 * Which sound tags in a sentence are affected by an accent swap — used to flag
 * "changing accent re-scores" and to decide a re-score is warranted.
 */
export function accentAffectedSounds(soundTags: string[]): string[] {
  return soundTags.filter(accentSensitive);
}

export const ACCENT_NAME: Record<Accent, string> = { us: "American (US)", uk: "British (UK RP)" };

export function soundLabel(soundId: string): string {
  return SOUND_BY_ID[soundId]?.name ?? soundId;
}
