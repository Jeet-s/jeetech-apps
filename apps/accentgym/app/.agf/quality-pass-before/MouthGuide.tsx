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
