/**
 * Speech-to-text wrapper for the speaking exercise and the AI role-play.
 *
 * On a REAL device the learner's voice is transcribed ON THE DEVICE by
 * expo-speech-recognition (Android's built-in recognizer; on-device when the
 * phone supports it, otherwise the system recognizer). Audio NEVER leaves the
 * phone and is never recorded or uploaded — only the finished transcript text
 * is later sent to the AI proxy. The only extra permission is RECORD_AUDIO.
 *
 * QA SPEECH HOOK (factory-owned, src/modules/qa.ts): the test emulator can't
 * hear, so when qa.speechSample() returns text this wrapper reports speech as
 * SUPPORTED and SIMULATES the recognizer — a mic-permission beat, a rising
 * level meter, interim words at ~4 words/s, a final transcript, then it ends
 * ~1.8 s after the last word, exactly like the real engine. Everything after
 * recognition (scoring, UI, storage) runs for real. Harmless outside QA.
 *
 * There is ALWAYS a typed / keyboard-dictation fallback in the UI for when no
 * recognizer is available or the mic is denied, so the core job never dead-ends.
 */
import { ExpoSpeechRecognitionModule } from "expo-speech-recognition";
import type { EventSubscription } from "expo-modules-core";
import { qa } from "./modules/qa";

export interface SpeechHandlers {
  onReady?: () => void; // mic granted / listening started
  onLevel?: (level: number) => void; // 0..1 input volume
  onInterim?: (text: string) => void;
  onFinal: (text: string) => void;
  onError?: (reason: "unsupported" | "denied" | "error") => void;
}

export interface SpeechSession {
  /** Ask the recogniser to finish and deliver its final transcript via onFinal. */
  stop(): void;
  /** Abandon silently (unmount / screen blur) — no onFinal, no onError. */
  cancel(): void;
}

/** Current mic-permission state (without prompting). */
export type MicStatus = "granted" | "denied" | "undetermined";

const QA_ACTIVE = () => qa.speechSample() !== null;

/**
 * True when the app can turn speech into text here: the QA hook is active, OR a
 * native on-device/system recogniser is available. False → the UI uses the
 * typed / keyboard-dictation fallback (never a dead end).
 */
export function speechSupported(): boolean {
  if (QA_ACTIVE()) return true;
  try {
    return ExpoSpeechRecognitionModule.isRecognitionAvailable();
  } catch {
    return false;
  }
}

/** Does the recogniser run fully on-device (no network)? */
function supportsOnDevice(): boolean {
  try {
    return ExpoSpeechRecognitionModule.supportsOnDeviceRecognition();
  } catch {
    return false;
  }
}

/** The mic-permission status, without showing a dialog. QA → always granted. */
export async function micStatus(): Promise<MicStatus> {
  if (QA_ACTIVE()) return "granted";
  try {
    const p = await ExpoSpeechRecognitionModule.getPermissionsAsync();
    if (p.granted) return "granted";
    return p.canAskAgain ? "undetermined" : "denied";
  } catch {
    return "denied";
  }
}

/**
 * Ask for the mic permission (shows the OS dialog once). Call AFTER an
 * in-context Bangla primer. QA → granted without touching the native dialog.
 */
export async function requestMic(): Promise<boolean> {
  if (QA_ACTIVE()) return true;
  try {
    return !!(await ExpoSpeechRecognitionModule.requestPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

// -2..10 from the native volume event → a calm 0..1 for the meter.
const normalize = (raw: number) => Math.max(0, Math.min(1, (raw + 2) / 12));

const mapError = (code?: string): "unsupported" | "denied" | "error" => {
  switch (code) {
    case "not-allowed":
      return "denied";
    case "service-not-allowed":
    case "language-not-supported":
    case "bad-grammar":
      return "unsupported";
    default:
      return "error";
  }
};

/**
 * Start "listening". `simulate` is the text the QA hook should hear (callers
 * pass qa.speechSample() ?? target) — it is IGNORED on a real device, which
 * transcribes the learner's actual voice. Returns a session with stop()/cancel().
 */
export function startListening(simulate: string, h: SpeechHandlers): SpeechSession {
  if (QA_ACTIVE()) return startSimulation(simulate, h);
  return startNative(h);
}

// --- Real device: expo-speech-recognition (on-device, en-IN, interim on, single utterance) ---
function startNative(h: SpeechHandlers): SpeechSession {
  let done = false;
  let finalText = "";
  let interimText = "";
  const subs: EventSubscription[] = [];
  const clear = () => {
    subs.forEach((s) => s.remove());
    subs.length = 0;
  };

  const finalize = () => {
    if (done) return;
    done = true;
    clear();
    h.onLevel?.(0);
    h.onFinal((finalText || interimText).trim());
  };

  const fail = (reason: "unsupported" | "denied" | "error") => {
    if (done) return;
    done = true;
    clear();
    h.onLevel?.(0);
    h.onError?.(reason);
  };

  try {
    subs.push(
      ExpoSpeechRecognitionModule.addListener("start", () => {
        if (!done) h.onReady?.();
      }),
      ExpoSpeechRecognitionModule.addListener("result", (e) => {
        const t = (e.results?.[0]?.transcript ?? "").trim();
        if (!t) return;
        // continuous:false → the final event carries the whole utterance.
        if (e.isFinal) finalText = t;
        else interimText = t;
        h.onInterim?.(e.isFinal ? finalText : interimText);
      }),
      ExpoSpeechRecognitionModule.addListener("volumechange", (e) => h.onLevel?.(normalize(e.value))),
      ExpoSpeechRecognitionModule.addListener("error", (e) => {
        const code = e.error;
        if (code === "aborted") return; // our own cancel()
        if (code === "no-speech") return finalize(); // heard nothing → let the learner retry / type
        fail(mapError(code));
      }),
      ExpoSpeechRecognitionModule.addListener("end", () => finalize()),
    );
    ExpoSpeechRecognitionModule.start({
      lang: "en-IN",
      interimResults: true,
      continuous: false,
      requiresOnDeviceRecognition: supportsOnDevice(),
      volumeChangeEventOptions: { enabled: true, intervalMillis: 150 },
    });
  } catch {
    fail("error");
  }

  return {
    stop() {
      if (done) return;
      try {
        // Asks the engine to finish → fires `end`/final `result` → finalize().
        ExpoSpeechRecognitionModule.stop();
      } catch {
        finalize();
      }
    },
    cancel() {
      if (done) return;
      done = true;
      clear();
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch {
        /* ignore */
      }
    },
  };
}

// --- QA simulation (no mic hardware): "hear" the sample word by word ---
function startSimulation(simulate: string, h: SpeechHandlers): SpeechSession {
  const words = simulate.trim().split(/\s+/).filter(Boolean);
  let i = 0;
  let done = false;
  const timers: ReturnType<typeof setTimeout>[] = [];
  const t = (fn: () => void, ms: number) => timers.push(setTimeout(fn, ms));
  const clear = () => {
    for (const id of timers) clearTimeout(id);
    timers.length = 0;
  };

  // Mic-permission beat, then listening starts.
  t(() => !done && h.onReady?.(), 180);

  const emitWord = () => {
    if (done) return;
    i += 1;
    h.onInterim?.(words.slice(0, i).join(" "));
    h.onLevel?.(0.35 + 0.5 * Math.abs(Math.sin(i * 1.7))); // lively but bounded
    if (i < words.length) {
      t(emitWord, 250); // ~4 words / second
    } else {
      // End ~1.8 s after the last word, like the engine's end-of-speech timeout.
      t(() => {
        if (done) return;
        done = true;
        h.onLevel?.(0);
        h.onFinal(words.join(" "));
      }, 1800);
    }
  };
  t(emitWord, 400);

  return {
    stop() {
      if (done) return;
      done = true;
      clear();
      h.onLevel?.(0);
      // A manual stop still yields whatever was heard so the learner isn't stuck mid-utterance.
      h.onFinal(words.slice(0, Math.max(0, i)).join(" "));
    },
    cancel() {
      if (done) return;
      done = true;
      clear();
    },
  };
}
