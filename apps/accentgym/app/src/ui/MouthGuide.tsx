import { memo } from "react";
import { Text, View } from "react-native";
import { MouthIllustration } from "./SpeechVisuals";
import { mouthPose } from "../core/practice";
import { SOUND_BY_ID } from "../core/sounds";
import { palette, radius, space, type } from "./theme";

/** Front-view articulation diagram. Teeth, tongue and lip shape vary by sound. */
export const MouthGuide = memo(function MouthGuide({ soundId }: { soundId: string }) {
  const pose = mouthPose(soundId);
  const sound = SOUND_BY_ID[soundId];
  if (soundId === "v" || soundId === "w") return (
    <View style={{ backgroundColor: palette.primarySoft, borderRadius: radius.md, padding: space.sm, gap: space.xs }}>
      <View style={{ flexDirection: "row", gap: space.sm }}>
        {(["v", "w"] as const).map(id => <View key={id} style={{ flex: 1, alignItems: "center", gap: space.xs }}>
          <Text style={[type.phonetic, { color: palette.ink }]}>{`/${id}/`}</Text>
          <MouthIllustration soundId={id} size={104} />
          <Text style={[type.caption, { textAlign: "center", color: palette.ink }]}>{id === "v" ? "Teeth touch lip" : "Lips round forward"}</Text>
        </View>)}
      </View>
      <Text style={[type.caption, { textAlign: "center" }]}>Arrows: airflow · curves: voice on</Text>
    </View>
  );
  return (
    <View style={{ backgroundColor: palette.primarySoft, borderRadius: radius.md, padding: space.md, gap: space.sm }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
        <MouthIllustration soundId={soundId} size={88} />
        <View style={{ flex: 1 }}>
          <Text style={type.bodyStrong}>{pose.label}</Text>
          <Text style={[type.caption, { color: palette.inkSoft }]}>{sound?.mouthTip}</Text>
        </View>
      </View>
      <Text style={type.caption}>Front view · accent colour = tongue / lower lip</Text>
    </View>
  );
});
