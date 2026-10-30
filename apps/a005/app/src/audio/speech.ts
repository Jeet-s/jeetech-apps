import * as Speech from "expo-speech";

/**
 * Text-to-speech for the "native voice" — hearing a Listen & Repeat item and
 * playing the sample / improved answers back. Output only (no microphone, no
 * permission). Rate maps to the app's playback-speed control (0.75x–2x).
 *
 * Only one utterance plays at a time: a new speak() stops the previous one so
 * tapping Play again (or switching tabs) never overlaps two voices.
 */
export type SpeechState = "idle" | "speaking";

let listeners = new Set<(s: SpeechState) => void>();
let current: SpeechState = "idle";

function set(s: SpeechState) {
  if (s === current) return;
  current = s;
  listeners.forEach((l) => l(s));
}

export function subscribeSpeech(l: (s: SpeechState) => void): () => void {
  listeners.add(l);
  l(current);
  return () => listeners.delete(l);
}

/** Speak text at the given rate (1 = normal). Stops anything already playing. */
export function speak(text: string, rate = 1): void {
  try {
    Speech.stop();
    if (!text.trim()) return;
    set("speaking");
    Speech.speak(text, {
      // expo-speech rate is roughly 0.1–2.0; the UI exposes 0.75/1/1.5/2.
      rate: Math.max(0.1, Math.min(2, rate)),
      pitch: 1,
      onDone: () => set("idle"),
      onStopped: () => set("idle"),
      onError: () => set("idle"),
    });
  } catch {
    set("idle");
  }
}

export function stopSpeech(): void {
  try {
    Speech.stop();
  } catch {
    // ignore
  }
  set("idle");
}
