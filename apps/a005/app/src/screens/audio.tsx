import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button, Segmented, palette, space } from "../ui";
import { PLAYBACK_SPEEDS, type PlaybackSpeed } from "../core/model";
import { speak, stopSpeech, subscribeSpeech, type SpeechState } from "../audio/speech";
import { haptic } from "../audio/sfx";

/** Live TTS state (so a Play button can flip to Stop while a voice is talking).
 *  Exported so the answer card can tell when the sentence is actually PLAYING —
 *  the hero must not say "Your turn" while the native voice is still speaking. */
export function useSpeechState(): SpeechState {
  const [s, setS] = useState<SpeechState>("idle");
  useEffect(() => subscribeSpeech(setS), []);
  return s;
}

/**
 * "Hear it" button — plays `text` with the native voice at `rate`. While any
 * voice is talking it becomes a Stop button, so two players never overlap.
 *
 * The playing state is also held for a short MINIMUM window after a tap, so the
 * button visibly reacts even on a device whose TTS engine finishes or errors
 * instantly (e.g. the QA emulator) — the tap is never a silent no-op.
 */
export function PlayButton({
  text,
  rate = 1,
  label = "Play",
  variant = "secondary",
  size = "md",
  onPlayed,
}: {
  text: string;
  rate?: number;
  label?: string;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  /** Fired when the user starts a playback — lets a caller gate "listen first"
   *  flows (e.g. only start the response timer / reveal the sentence after a listen). */
  onPlayed?: () => void;
}) {
  const state = useSpeechState();
  const [holding, setHolding] = useState(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playing = state === "speaking" || holding;

  useEffect(
    () => () => {
      if (holdTimer.current) clearTimeout(holdTimer.current);
    },
    [],
  );

  const onPress = () => {
    haptic("light");
    if (holdTimer.current) clearTimeout(holdTimer.current);
    if (playing) {
      stopSpeech();
      setHolding(false);
      return;
    }
    speak(text, rate);
    onPlayed?.();
    // Guarantee a visible "Playing…" state for ~1.6s even if TTS reports done
    // immediately, so the control always confirms the tap landed.
    setHolding(true);
    holdTimer.current = setTimeout(() => setHolding(false), 1600);
  };

  return (
    <Button
      // While a voice is talking the button becomes a concise "Stop" CONTROL — the
      // "Playing…" status lives once, on the PlaybackWave in the Hear card, so the
      // playback state isn't announced two or three times over (reviewer).
      label={playing ? "Stop" : label}
      icon={playing ? "pause" : "play"}
      variant={variant}
      size={size}
      sound={null}
      onPress={onPress}
    />
  );
}

/** Playback-speed selector (0.75x / 1x / 1.5x / 2x). */
export function SpeedPicker({ value, onChange }: { value: PlaybackSpeed; onChange: (v: PlaybackSpeed) => void }) {
  return (
    <Segmented
      value={String(value)}
      onChange={(v) => onChange(Number(v) as PlaybackSpeed)}
      options={PLAYBACK_SPEEDS.map((s) => ({ value: String(s), label: `${s}x` }))}
    />
  );
}

/** Play control + speed picker side by side (used on the Compare tabs). */
export function AudioRow({ text, speed, onSpeed }: { text: string; speed: PlaybackSpeed; onSpeed: (v: PlaybackSpeed) => void }) {
  return (
    <View style={styles.row}>
      <View style={{ width: 120 }}>
        <PlayButton text={text} rate={speed} label="Listen" />
      </View>
      <View style={{ flex: 1 }}>
        <SpeedPicker value={speed} onChange={onSpeed} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.sm },
});

export { palette };
