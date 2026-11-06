/**
 * On-device speech recognition wrapper for the recorder. Audio is transcribed
 * ON THE DEVICE (expo-speech-recognition / Android's built-in recognizer) and
 * NEVER leaves the phone — only the transcript text is later sent to the AI
 * proxy. The only extra permission is RECORD_AUDIO.
 *
 * It honours the factory QA speech hook (src/modules/qa.ts): when
 * qa.speechSample() returns text (the emulator can't hear), we SIMULATE the
 * recognizer — listening → interim words (~4/s) → a final transcript, ending on
 * its own ~2s after the last word — so the whole record→report flow is tested
 * for real. Everything after recognition (metrics, UI, storage) is identical.
 *
 * There is ALWAYS a typed-answer fallback in the UI for when no recognizer is
 * available or the mic is denied, so the core job never dead-ends.
 */
import { ExpoSpeechRecognitionModule, AudioEncodingAndroid } from "expo-speech-recognition";
import type { EventSubscription } from "expo-modules-core";
import { qa } from "../modules/qa";
import type { Word } from "../core/types";

export interface SpeechEvents {
  /** Normalised input level 0..1 (for the live meter). */
  onVolume?: (level: number) => void;
  /** Partial transcript as the user speaks. */
  onInterim?: (text: string) => void;
  /** The recogniser produced its final transcript. */
  onFinal?: (text: string) => void;
  /** Recognition ended (on its own, or after stop()). */
  onEnd?: (finalText: string) => void;
  onError?: (code: string) => void;
}

let subs: EventSubscription[] = [];
let timers: ReturnType<typeof setTimeout>[] = [];
let active = false;
let finalText = "";
let cb: SpeechEvents = {};

function clearAll() {
  subs.forEach((s) => s.remove());
  subs = [];
  timers.forEach((t) => clearTimeout(t));
  timers = [];
}

/** Split a transcript into evenly-timed Words spanning [0, durationMs]. Fillers
 * and pauses are (re)classified downstream by src/core from the timings. */
export function wordsFromTranscript(text: string, durationMs: number): Word[] {
  const texts = text.trim().split(/\s+/).filter(Boolean);
  if (!texts.length) return [];
  const per = Math.max(1, durationMs) / texts.length;
  return texts.map((t, i) => ({
    text: t,
    startMs: Math.round(i * per),
    endMs: Math.round(i * per + Math.max(90, per * 0.82)),
    isFiller: false,
    isPause: false,
    userCorrected: false,
  }));
}

const QA_WORDS_PER_SEC = 4;
const normalize = (raw: number) => Math.max(0, Math.min(1, (raw + 2) / 12));

export const speech = {
  /** QA speech hook is active for this session. */
  isQa: () => qa.speechSample() !== null,

  /** Does this device have a usable recogniser? (false → typed fallback) */
  available(): boolean {
    if (qa.speechSample() !== null) return true;
    try {
      return ExpoSpeechRecognitionModule.isRecognitionAvailable();
    } catch {
      return false;
    }
  },

  async getPermission(): Promise<boolean> {
    if (qa.speechSample() !== null) return true;
    try {
      return !!(await ExpoSpeechRecognitionModule.getPermissionsAsync()).granted;
    } catch {
      return false;
    }
  },

  async requestPermission(): Promise<boolean> {
    if (qa.speechSample() !== null) return true;
    try {
      return !!(await ExpoSpeechRecognitionModule.requestPermissionsAsync()).granted;
    } catch {
      return false;
    }
  },

  start(events: SpeechEvents): void {
    if (active) return;
    active = true;
    finalText = "";
    cb = events;

    const sample = qa.speechSample();
    if (sample !== null) return startSimulation(sample);

    try {
      subs.push(
        ExpoSpeechRecognitionModule.addListener("result", (e) => {
          const t = (e.results?.[0]?.transcript ?? "").trim();
          if (!t) return;
          if (e.isFinal) {
            finalText = finalText ? `${finalText} ${t}` : t;
            cb.onInterim?.(finalText);
          } else {
            cb.onInterim?.(finalText ? `${finalText} ${t}` : t);
          }
        }),
        ExpoSpeechRecognitionModule.addListener("volumechange", (e) => cb.onVolume?.(normalize(e.value))),
        ExpoSpeechRecognitionModule.addListener("error", (e) => {
          cb.onError?.(e.error ?? "error");
        }),
        ExpoSpeechRecognitionModule.addListener("end", () => finish()),
      );
      ExpoSpeechRecognitionModule.start({
        lang: "en-US",
        interimResults: true,
        continuous: true,
        requiresOnDeviceRecognition: safeOnDevice(),
        volumeChangeEventOptions: { enabled: true, intervalMillis: 120 },
      });
    } catch (e) {
      active = false;
      cb.onError?.(e instanceof Error ? e.message : "start_failed");
    }
  },

  /**
   * Transcribe an audio FILE on the device (imported talk) instead of the live
   * mic. Same on-device recogniser, same pipeline — the file's audio never
   * leaves the phone; only its transcript text is later sent to the AI proxy.
   * Honours the QA speech hook (the emulator can't read audio) so the import
   * flow is exercised end-to-end. onInterim streams text as it's recognised;
   * onDone fires the final transcript; onError covers an unreadable file
   * (unsupported format/codec, no recogniser) so the UI can offer the paste
   * fallback instead of dead-ending.
   */
  transcribeFile(uri: string, events: { onInterim?: (t: string) => void; onDone: (finalText: string) => void; onError: (code: string) => void }): void {
    if (active) return;
    active = true;
    finalText = "";
    cb = { onInterim: events.onInterim, onEnd: (t) => events.onDone(t), onError: events.onError };

    // QA (no audio hardware): simulate recognition from the sample text, so the
    // whole import → report flow is covered exactly like a live take.
    const sample = qa.speechSample();
    if (sample !== null) return startSimulation(sample);

    try {
      subs.push(
        ExpoSpeechRecognitionModule.addListener("result", (e) => {
          const t = (e.results?.[0]?.transcript ?? "").trim();
          if (!t) return;
          if (e.isFinal) {
            finalText = finalText ? `${finalText} ${t}` : t;
            cb.onInterim?.(finalText);
          } else {
            cb.onInterim?.(finalText ? `${finalText} ${t}` : t);
          }
        }),
        ExpoSpeechRecognitionModule.addListener("error", (e) => {
          cb.onError?.(e.error ?? "error");
        }),
        ExpoSpeechRecognitionModule.addListener("end", () => finish()),
      );
      ExpoSpeechRecognitionModule.start({
        lang: "en-US",
        interimResults: true,
        continuous: true,
        requiresOnDeviceRecognition: safeOnDevice(),
        audioSource: {
          uri,
          audioChannels: 1,
          audioEncoding: AudioEncodingAndroid.ENCODING_PCM_16BIT,
          sampleRate: 16_000,
        },
      });
    } catch (e) {
      active = false;
      clearAll();
      cb.onError?.(e instanceof Error ? e.message : "file_failed");
    }
  },

  /** Ask the recogniser to finish and return a final result. */
  stop(): void {
    if (!active) return;
    if (qa.speechSample() !== null) return stopSimulation();
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      finish();
    }
  },

  /** Cancel without a result (user backed out). */
  abort(): void {
    if (!active) return;
    const wasQa = qa.speechSample() !== null;
    active = false;
    clearAll();
    if (!wasQa) {
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch {
        /* ignore */
      }
    }
    cb = {};
  },
};

function safeOnDevice(): boolean {
  try {
    return ExpoSpeechRecognitionModule.supportsOnDeviceRecognition();
  } catch {
    return false;
  }
}

function finish() {
  if (!active) return;
  active = false;
  clearAll();
  const text = finalText;
  const end = cb.onEnd;
  cb.onFinal?.(text);
  cb = {};
  end?.(text);
}

// --- QA simulation (no mic) ---
let qaWords: string[] = [];
let qaIndex = 0;

function startSimulation(sample: string) {
  qaWords = sample.trim().split(/\s+/).filter(Boolean);
  qaIndex = 0;
  const step = () => {
    if (!active) return;
    qaIndex++;
    finalText = qaWords.slice(0, qaIndex).join(" ");
    cb.onInterim?.(finalText);
    // A gently varying level while "hearing" each word.
    cb.onVolume?.(0.45 + 0.4 * Math.abs(Math.sin(qaIndex)));
    if (qaIndex < qaWords.length) {
      timers.push(setTimeout(step, 1000 / QA_WORDS_PER_SEC));
    } else {
      // End on its own ~2s after the last word, like the real recogniser.
      timers.push(setTimeout(() => finish(), 2000));
    }
  };
  timers.push(setTimeout(step, 1000 / QA_WORDS_PER_SEC));
}

function stopSimulation() {
  finalText = qaWords.slice(0, Math.max(1, qaIndex)).join(" ");
  finish();
}
