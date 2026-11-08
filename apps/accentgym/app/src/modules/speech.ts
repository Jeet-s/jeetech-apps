import { useCallback, useEffect, useRef, useState } from "react";
import { useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition";
import * as Speech from "expo-speech";
import { qa } from "./qa";
import type { Accent } from "../core/types";

/**
 * On-device speech → text for the pronunciation scorer. The raw audio NEVER leaves
 * the phone (expo-speech-recognition, Android's built-in recognizer / iOS SFSpeech);
 * only the transcript is sent to ai.run. The QA emulator can't hear, so when
 * qa.speechSample() returns text we SIMULATE recognition of that sentence (listening
 * → interim words ~4/s + a live level → final transcript, ending ~2s after the last
 * word) exactly like the real recognizer. A typed fallback always exists for denied
 * permission or a device with no recognizer.
 */
export type DictationStatus = "idle" | "listening" | "done" | "denied" | "error";

export interface Dictation {
  status: DictationStatus;
  transcript: string;
  finalText: string | null;
  recordingUri: string | null;
  /** Reanimated 0..1 input level — bind the mic/waveform to this, never React state. */
  level: SharedValue<number>;
  start: () => Promise<void>;
  stop: () => void;
  reset: () => void;
}

const bcp47 = (accent: Accent): string => (accent === "uk" ? "en-GB" : "en-US");

export function useDictation(accent: Accent = "us"): Dictation {
  const [recordingUri, setRecordingUri] = useState<string | null>(null);
  const [status, setStatus] = useState<DictationStatus>("idle");
  const [transcript, setTranscript] = useState("");
  const [finalText, setFinalText] = useState<string | null>(null);
  const level = useSharedValue(0);
  const finalRef = useRef("");
  const simTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const simulating = useRef(false);
  const generation = useRef(0);
  const liveRef = useRef(false); // a real recognition session is running

  const clearSim = () => {
    simTimers.current.forEach(clearTimeout);
    simTimers.current = [];
  };
  useEffect(() => () => clearSim(), []);

  const finalize = useCallback(
    (text: string) => {
      clearSim();
      simulating.current = false;
      liveRef.current = false;
      finalRef.current = text;
      setTranscript(text);
      setFinalText(text);
      setStatus(text.trim() ? "done" : "error");
      level.value = withTiming(0, { duration: 200 });
    },
    [level],
  );

  useSpeechRecognitionEvent("audiostart", e => { if (!simulating.current && e.uri) setRecordingUri(e.uri); });
  useSpeechRecognitionEvent("audioend", e => { if (!simulating.current && e.uri) setRecordingUri(e.uri); });

  // ── Real recognizer events (ignored while simulating) ──
  useSpeechRecognitionEvent("result", (e) => {
    if (simulating.current || !liveRef.current) return;
    const t = e.results?.[0]?.transcript ?? "";
    finalRef.current = t;
    setTranscript(t);
    if (e.isFinal) finalize(t);
  });
  useSpeechRecognitionEvent("end", () => {
    if (simulating.current || !liveRef.current) return;
    finalize(finalRef.current);
  });
  useSpeechRecognitionEvent("error", (e) => {
    if (simulating.current || !liveRef.current) return;
    liveRef.current = false;
    clearSim();
    setStatus(e.error === "not-allowed" ? "denied" : "error");
    level.value = withTiming(0, { duration: 200 });
  });
  useSpeechRecognitionEvent("volumechange", (e) => {
    if (simulating.current || !liveRef.current) return;
    // value is roughly -2..10; map inaudible→0, loud→1.
    const v = Math.max(0, Math.min(1, (e.value ?? 0) / 8));
    level.value = withTiming(v, { duration: 90 });
  });

  const runSimulation = useCallback(
    (sample: string) => {
      simulating.current = true;
      const words = sample.split(/\s+/).filter(Boolean);
      let i = 0;
      const step = () => {
        i += 1;
        const interim = words.slice(0, i).join(" ");
        finalRef.current = interim;
        setTranscript(interim);
        level.value = withTiming(0.35 + ((i * 7) % 6) / 10, { duration: 160 });
        if (i < words.length) {
          simTimers.current.push(setTimeout(step, 250)); // ~4 words/s
        } else {
          simTimers.current.push(setTimeout(() => finalize(sample), 2000)); // end ~2s after the last word
        }
      };
      simTimers.current.push(setTimeout(step, 250));
    },
    [finalize, level],
  );

  const start = useCallback(async () => {
    const run = ++generation.current;
    clearSim();
    finalRef.current = "";
    setTranscript("");
    setFinalText(null);
    setRecordingUri(null);
    setStatus("listening");
    const sample = qa.speechSample();
    // Run the real permission flow either way (QA expects the normal prompt).
    const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync().catch(() => null);
    if (run !== generation.current) return;
    if (sample != null) {
      runSimulation(sample); // QA: simulate hearing the sample regardless of the emulator's mic
      return;
    }
    if (!perm?.granted) {
      setStatus("denied");
      return;
    }
    try {
      liveRef.current = true;
      const onDevice = ExpoSpeechRecognitionModule.supportsOnDeviceRecognition?.() ?? false;
      ExpoSpeechRecognitionModule.start({
        lang: bcp47(accent),
        interimResults: true,
        recordingOptions: { persist: true },
        continuous: false,
        requiresOnDeviceRecognition: onDevice,
        volumeChangeEventOptions: { enabled: true, intervalMillis: 120 },
      });
    } catch {
      liveRef.current = false;
      setStatus("error");
    }
  }, [accent, runSimulation]);

  const stop = useCallback(() => {
    if (simulating.current) {
      finalize(finalRef.current);
      return;
    }
    if (liveRef.current) {
      try {
        ExpoSpeechRecognitionModule.stop();
      } catch {
        finalize(finalRef.current);
      }
    } else {
      generation.current += 1;
      finalize("");
    }
  }, [finalize]);

  const reset = useCallback(() => {
    generation.current += 1;
    clearSim();
    simulating.current = false;
    liveRef.current = false;
    try {
      ExpoSpeechRecognitionModule.abort();
    } catch {
      // ignore
    }
    finalRef.current = "";
    setTranscript("");
    setFinalText(null);
    setRecordingUri(null);
    setStatus("idle");
    level.value = withTiming(0, { duration: 160 });
  }, [level]);

  return { status, transcript, finalText, recordingUri, level, start, stop, reset };
}

type PlaybackOptions = {
  slow?: boolean;
  onStart?: () => void;
  onDone?: () => void;
  onStopped?: () => void;
  onError?: () => void;
};
let playbackId = 0;
let stopped: (() => void) | undefined;
/** Model audio reports actual engine events, not a timer or the tap itself. */
export const tts = {
  speak(text: string, accent: Accent, opts: PlaybackOptions = {}): void {
    tts.stop();
    const id = playbackId;
    stopped = opts.onStopped;
    const finish = (callback?: () => void) => {
      if (id !== playbackId) return;
      stopped = undefined;
      callback?.();
    };
    try {
      Speech.speak(text, {
        language: bcp47(accent), rate: opts.slow ? 0.45 : 0.92, pitch: 1.0,
        onStart: () => { if (id === playbackId) opts.onStart?.(); },
        onDone: () => finish(opts.onDone),
        onStopped: () => finish(opts.onStopped),
        onError: () => finish(opts.onError),
      });
    } catch { finish(opts.onError); }
  },
  stop(): void {
    playbackId += 1;
    const previous = stopped;
    stopped = undefined;
    previous?.();
    void Speech.stop().catch(() => {});
  },
};
