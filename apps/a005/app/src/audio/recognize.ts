import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { useSharedValue, type SharedValue } from "react-native-reanimated";
import type { ExpoSpeechRecognitionErrorCode } from "expo-speech-recognition";
import { qa } from "../modules/qa";

/**
 * STARTUP SAFETY: the expo-speech-recognition package runs
 * `requireNativeModule("ExpoSpeechRecognition")` at IMPORT time, which THROWS if
 * the native module isn't present in this build. This file sits on the app's
 * startup import graph (App -> AttemptSession -> here), so an eager static import
 * of the package would crash bundle evaluation before the first frame — a frozen
 * splash, never reaching JS. We load it through a try/catch instead: if the
 * module is missing or fails to initialise, `SR` is null and the whole app
 * degrades to the typed-answer fallback rather than failing to launch.
 */
type SpeechModule = typeof import("expo-speech-recognition");
const SR: SpeechModule | null = (() => {
  try {
    // require() (not a static import) so a throw here is catchable and never
    // aborts module evaluation on the launch path.
    return require("expo-speech-recognition") as SpeechModule;
  } catch {
    return null;
  }
})();

/** Event subscription that is a safe no-op when the native module is absent.
 *  `SR` is a module-level constant, so the resolved function never changes
 *  between renders — calling it unconditionally respects the rules of hooks. */
const useRecognitionEvent: SpeechModule["useSpeechRecognitionEvent"] =
  SR?.useSpeechRecognitionEvent ?? (((_name, _listener) => {}) as SpeechModule["useSpeechRecognitionEvent"]);

/**
 * On-device speech-to-text for the speaking practice (expo-speech-recognition).
 *
 * PRIVACY: we request RECORD_AUDIO only, run the recognizer on-device when the
 * phone supports it (requiresOnDeviceRecognition), and NEVER send audio anywhere
 * — only the recognised TEXT is passed to ai.run for scoring. There is always a
 * typed-answer fallback (used when the mic is denied or no recognizer exists,
 * e.g. the QA emulator which has no microphone).
 */
export type RecognizerStatus = "idle" | "listening" | "stopped" | "error";

/** Why the recogniser isn't usable, so the UI can fall back to typing cleanly.
 *  "denied" = refused but we can ask again; "blocked" = refused for good, so the
 *  only way back is the system settings (we surface an "Open settings" action). */
export type RecognizerBlock = "unsupported" | "denied" | "blocked" | null;

export interface Recognizer {
  status: RecognizerStatus;
  /** Best-so-far transcript (interim while listening, final after stop). */
  transcript: string;
  /** 0–1 smoothed input level for the live meter. A reanimated SharedValue (NOT
   *  React state) so the ~10/sec volume events drive the meter on the UI thread
   *  WITHOUT re-rendering the recording / mic-check screens each time — those
   *  high-frequency re-renders (reconciling a screenful of Skia-canvas icons) were
   *  the soak-test ANR. Read it in a worklet (useAnimatedStyle / useAnimatedReaction). */
  level: SharedValue<number>;
  /** Set when recognition fails mid-flight (friendly, already mapped). */
  error: string | null;
  /** True once start() confirmed the recogniser is running. */
  listening: boolean;
  /** Request mic + begin listening. Returns a block reason, or null on success. */
  start: (opts?: { contextualStrings?: string[] }) => Promise<RecognizerBlock>;
  stop: () => void;
  reset: () => void;
}

/** Is an on-device/system recogniser available at all on this device? (false on most emulators) */
export function speechSupported(): boolean {
  // Factory QA speech hook (src/modules/qa.ts): the emulator can't hear, so QA simulates recognition.
  if (qa.speechSample()) return true;
  if (Platform.OS === "web" || !SR) return false;
  try {
    return SR.ExpoSpeechRecognitionModule.isRecognitionAvailable();
  } catch {
    return false;
  }
}

/** Current mic permission WITHOUT prompting — lets the UI label the first button
 *  "Allow microphone" (so the tap clearly triggers the system prompt) vs
 *  "Start speaking" once already granted, and spot a permanently-denied mic. */
export type MicPermission = { granted: boolean; canAskAgain: boolean };
export async function micPermission(): Promise<MicPermission> {
  if (!SR) return { granted: false, canAskAgain: true };
  try {
    const p = await SR.ExpoSpeechRecognitionModule.getPermissionsAsync();
    return { granted: !!p.granted, canAskAgain: p.canAskAgain !== false };
  } catch {
    return { granted: false, canAskAgain: true };
  }
}

/**
 * SINGLE-FLIGHT permission request. Android allows only ONE permission dialog at
 * a time: a second requestPermissionsAsync() fired while the first is still up
 * (rapid user taps, or the automated soak/monkey test hammering the mic button)
 * stacks native callbacks and can wedge the recognizer's main-thread handler —
 * the unexplained soak-test ANR. Collapsing concurrent requests onto one shared
 * promise means the native layer only ever sees a single in-flight request, and
 * every caller resolves off the same dialog result. */
let permFlight: Promise<MicPermission> | null = null;
export function requestMicPermission(): Promise<MicPermission> {
  if (permFlight) return permFlight;
  if (!SR) return Promise.resolve({ granted: false, canAskAgain: true });
  permFlight = (async () => {
    try {
      const p = await SR.ExpoSpeechRecognitionModule.requestPermissionsAsync();
      return { granted: !!p.granted, canAskAgain: p.canAskAgain !== false };
    } catch {
      return { granted: false, canAskAgain: true };
    }
  })();
  // Clear the latch once it settles, so a later, deliberate re-ask still works.
  void permFlight.finally(() => {
    permFlight = null;
  });
  return permFlight;
}

function messageFor(code: ExpoSpeechRecognitionErrorCode): string {
  switch (code) {
    case "no-speech":
    case "speech-timeout":
      return "Didn't catch that — tap the mic and speak, or type your answer.";
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone access is off. Type your answer, or enable the mic in settings.";
    case "network":
      return "Speech needs a moment — try again, or type your answer.";
    case "audio-capture":
      return "Couldn't reach the microphone. Type your answer instead.";
    default:
      return "Speech recognition stopped — type your answer instead.";
  }
}

/**
 * Component hook driving one recording session. Subscribes to the native
 * recognition events (result / volume / error / end) and exposes a simple
 * start/stop/reset API. Call start() from a button the user pressed.
 */
export function useSpeechRecognizer(): Recognizer {
  const [status, setStatus] = useState<RecognizerStatus>("idle");
  const [transcript, setTranscript] = useState("");
  // Input level lives in a SharedValue, not state: the volume event fires ~10/sec
  // and writing `level.value` never triggers a React render (the meters read it in
  // a worklet). This is what keeps recording / the mic check off the ANR path.
  const level = useSharedValue(0);
  const [error, setError] = useState<string | null>(null);
  const runningRef = useRef(false);
  // QA speech hook: timer that plays the sample transcript in (see src/modules/qa.ts).
  const simRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const clearSim = () => {
    if (simRef.current) clearInterval(simRef.current);
    simRef.current = null;
  };

  // Never leave the mic running if the screen unmounts mid-recording.
  useEffect(
    () => () => {
      clearSim();
      if (runningRef.current) {
        try {
          SR?.ExpoSpeechRecognitionModule.abort();
        } catch {
          // ignore
        }
      }
    },
    [],
  );

  useRecognitionEvent("result", (e) => {
    const best = e.results?.[0]?.transcript ?? "";
    if (best) setTranscript(best);
  });
  useRecognitionEvent("volumechange", (e) => {
    // value ranges roughly -2..10; treat <0 as silence. Scale so normal speech fills the meter.
    // Writes to the SharedValue only — no setState, so no re-render per event.
    level.value = Math.max(0, Math.min(1, e.value / 5));
  });
  useRecognitionEvent("error", (e) => {
    runningRef.current = false;
    level.value = 0;
    setStatus("error");
    setError(messageFor(e.error));
  });
  useRecognitionEvent("end", () => {
    runningRef.current = false;
    level.value = 0;
    setStatus((s) => (s === "listening" ? "stopped" : s));
  });

  const start = useCallback(async (opts: { contextualStrings?: string[] } = {}): Promise<RecognizerBlock> => {
    const sample = qa.speechSample();
    if (sample) {
      // QA speech hook: same permission flow, then "hear" the sample answer word by word (~4 words/s) with a live
      // level, and end on its own a moment after the last word — like the real continuous recognizer going quiet.
      clearSim();
      const perm = await requestMicPermission();
      if (!perm.granted) return perm.canAskAgain === false ? "blocked" : "denied";
      const words = sample.split(" ");
      let n = 0;
      let quiet = 0;
      setTranscript("");
      setError(null);
      setStatus("listening");
      runningRef.current = true;
      simRef.current = setInterval(() => {
        if (n < words.length) {
          n += 1;
          level.value = 0.35 + Math.random() * 0.55;
          setTranscript(words.slice(0, n).join(" "));
        } else if (++quiet > 8) {
          clearSim();
          runningRef.current = false;
          level.value = 0;
          setStatus((st) => (st === "listening" ? "stopped" : st));
        } else level.value = 0.05;
      }, 250);
      return null;
    }
    if (!SR || !speechSupported()) return "unsupported";
    // Never stack two live recognizer sessions: a re-entrant start() (rapid taps
    // / soak monkey) tears the current one down first. Android's SpeechRecognizer
    // is effectively a singleton on the main thread, so overlapping starts were a
    // prime soak-ANR suspect.
    if (runningRef.current) {
      runningRef.current = false;
      try {
        SR.ExpoSpeechRecognitionModule.abort();
      } catch {
        // ignore
      }
    }
    // Single-flight the permission dialog (see requestMicPermission) so concurrent
    // callers can't open two system prompts at once.
    const perm = await requestMicPermission();
    if (!perm.granted) return perm.canAskAgain === false ? "blocked" : "denied";
    setTranscript("");
    setError(null);
    level.value = 0;
    setStatus("listening");
    runningRef.current = true;
    let onDevice = false;
    try {
      onDevice = SR.ExpoSpeechRecognitionModule.supportsOnDeviceRecognition();
    } catch {
      onDevice = false;
    }
    try {
      SR.ExpoSpeechRecognitionModule.start({
        lang: "en-US",
        interimResults: true,
        continuous: true,
        requiresOnDeviceRecognition: onDevice,
        addsPunctuation: true,
        volumeChangeEventOptions: { enabled: true, intervalMillis: 100 },
        contextualStrings: opts.contextualStrings?.slice(0, 50),
      });
    } catch {
      runningRef.current = false;
      setStatus("error");
      setError("Couldn't start the microphone — type your answer instead.");
      return "unsupported";
    }
    return null;
  }, []);

  const stop = useCallback(() => {
    clearSim();
    if (!runningRef.current) return;
    runningRef.current = false;
    level.value = 0;
    setStatus((s) => (s === "listening" ? "stopped" : s));
    try {
      SR?.ExpoSpeechRecognitionModule.stop();
    } catch {
      // ignore — the end event (or its absence) is harmless
    }
  }, []);

  const reset = useCallback(() => {
    clearSim();
    if (runningRef.current) {
      try {
        SR?.ExpoSpeechRecognitionModule.abort();
      } catch {
        // ignore
      }
    }
    runningRef.current = false;
    setStatus("idle");
    setTranscript("");
    level.value = 0;
    setError(null);
  }, []);

  return { status, transcript, level, error, listening: status === "listening", start, stop, reset };
}
