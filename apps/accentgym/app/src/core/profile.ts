/**
 * User profile + settings defaults. Comments OFF by default (the PRD requires an
 * opt-out of robotic per-word voice comments); IPA on; follows the phone theme;
 * voice-data opt-in defaults OFF (recordings stay on device unless the user opts
 * in). Accent defaults from locale (handled in the UI; core defaults to US).
 */
import type { Accent, L1, LearnGoal, ThemePref, UserProfile } from "./types";

export const MAX_CUSTOM_TEXT = 200; // type-any-text: longer is split into sentences
export const DAILY_MINUTES = [3, 5, 10] as const;

export function defaultProfile(createdAt: string): UserProfile {
  return {
    nativeLanguage: "other",
    targetAccent: "us",
    dailyMinutes: 5,
    commentsOn: false,
    ipaOn: true,
    theme: "system",
    voiceDataOptIn: false,
    createdAt,
  };
}

export function setLanguage(p: UserProfile, l1: L1): UserProfile {
  return { ...p, nativeLanguage: l1 };
}
export function setAccent(p: UserProfile, accent: Accent): UserProfile {
  return { ...p, targetAccent: accent };
}
export function setGoal(p: UserProfile, goal: LearnGoal): UserProfile {
  return { ...p, goal };
}
export function setTheme(p: UserProfile, theme: ThemePref): UserProfile {
  return { ...p, theme };
}

/** "HH:MM" 24h, or undefined to turn reminders off. */
export function setReminder(p: UserProfile, time?: string): UserProfile {
  if (time !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return p; // ignore bad input
  return { ...p, reminderTime: time };
}

/** Split a typed paragraph into practisable sentences (type-any-text edge case). */
export function splitIntoSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20);
}

/** Validate custom practice text. */
export type TextError = "empty" | "too_long" | "unsupported";
export function validateCustomText(raw: string): TextError | null {
  const t = raw.trim();
  if (!t) return "empty";
  if (t.length > MAX_CUSTOM_TEXT) return "too_long";
  if (!/[A-Za-z]/.test(t)) return "unsupported"; // needs some Latin letters to pronounce
  return null;
}
