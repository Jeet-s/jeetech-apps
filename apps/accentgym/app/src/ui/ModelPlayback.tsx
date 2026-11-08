import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { tts } from "../modules/speech";
import type { Accent } from "../core/types";
import { Button } from "./Button";
import { Segmented } from "./Controls";
import { palette, space, type } from "./theme";

/** One model control, with engine-confirmed playback and completion feedback. */
export function ModelPlayback({ text, accent, onComplete }: { text: string; accent: Accent; onComplete?: () => void }) {
  const [status, setStatus] = useState<"idle" | "starting" | "playing" | "done" | "stopped" | "error">("idle");
  const [speed, setSpeed] = useState("normal");
  useEffect(() => {
    setStatus("idle");
    return () => tts.stop();
  }, [text, accent]);
  const playing = status === "playing" || status === "starting";
  return <View style={{ gap: space.sm }}>
    <Segmented value={speed} options={[{ value: "normal", label: "Normal" }, { value: "slow", label: "Slow" }]} onChange={v => { tts.stop(); setSpeed(v); }} />
    <Button label={playing ? "Stop model audio" : status === "done" ? "Play model again" : "Hear the model"}
      icon={playing ? "stop" : "play"} variant="secondary" onPress={() => {
        if (playing) { tts.stop(); return; }
        setStatus("starting");
        tts.speak(text, accent, { slow: speed === "slow", onStart: () => setStatus("playing"),
          onDone: () => { setStatus("done"); onComplete?.(); }, onStopped: () => setStatus("stopped"), onError: () => setStatus("error") });
      }} />
    <Text style={[type.caption, { color: palette.inkSoft, minHeight: 36 }]} accessibilityLiveRegion="polite">
      {status === "playing" ? "Playing model… Listen, then say it aloud." : status === "starting" ? "Starting model audio…" : status === "done" ? "✓ Model finished. Your turn — say the phrase aloud." : status === "stopped" ? "Playback stopped. Play again whenever you’re ready." : status === "error" ? "Model audio could not play. Check your media volume or read the phrase aloud." : "Listen once, then say the phrase at your own pace."}
    </Text>
  </View>;
}
