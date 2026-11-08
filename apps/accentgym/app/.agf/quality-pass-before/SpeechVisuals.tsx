import { memo } from "react";
import { Text, View, type TextStyle } from "react-native";
import Animated, { useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import Svg, { Ellipse, Path, Rect } from "react-native-svg";
import { mouthPose } from "../core/practice";
import { SOUND_BY_ID } from "../core/sounds";
import { isDark, palette, type } from "./theme";

/** Transparent, token-coloured articulation art, shared by practice and sound guides. */
export const MouthIllustration = memo(function MouthIllustration({ soundId, size = 112 }: { soundId: string; size?: number }) {
  const pose = mouthPose(soundId);
  return <Svg width={size} height={size * 0.8} viewBox="0 0 140 112" accessibilityLabel={`${SOUND_BY_ID[soundId]?.name ?? "Sound"}: ${pose.label}`}>
    <Ellipse cx={70} cy={52} rx={pose.round ? 29 : 57} ry={pose.wide ? 42 : pose.closed ? 9 : 28} fill={palette.primarySoft} stroke={palette.primaryDark} strokeWidth={4} />
    {pose.lipBite ? <>
      <Path d="M17 56 Q35 85 70 83 Q105 85 123 56 Q100 45 70 47 Q40 45 17 56 Z" fill={palette.accent} stroke={palette.primaryDark} strokeWidth={2} />
      <Path d="M30 32 Q70 23 110 32 L108 50 Q70 59 32 50 Z" fill={palette.surface} stroke={palette.primaryDark} strokeWidth={2} />
      <Path d="M52 30 V53 M70 29 V55 M88 30 V53" stroke={palette.border} strokeWidth={2} />
      <Path d="M39 92 Q49 85 57 92 M62 98 Q70 91 78 98 M83 92 Q91 85 101 92" stroke={palette.primaryDark} strokeWidth={3} fill="none" strokeLinecap="round" />
    </> : <>
      {!pose.round && !pose.closed ? <Rect x={35} y={pose.wide ? 17 : 28} width={70} height={12} rx={3} fill={palette.surface} stroke={palette.inkSoft} strokeWidth={2} /> : null}
      {!pose.closed ? <Path d={pose.round ? "M50 70 Q70 56 90 70" : pose.tongue === "between" ? "M45 65 Q43 29 70 35 Q97 29 95 65 Z" : pose.tongue === "up" ? "M35 72 Q40 26 59 43 Q65 66 105 72 Z" : pose.tongue === "back" ? "M35 72 Q65 82 86 47 Q100 28 107 72 Z" : "M32 76 Q70 49 108 76"} fill={palette.accent} stroke={palette.primaryDark} strokeWidth={2} /> : null}
      <Path d="M51 99 L51 89 M70 103 L70 89 M89 99 L89 89" stroke={palette.primary} strokeWidth={3} strokeLinecap="round" />
    </>}
  </Svg>;
});

/** Visual reading cue only; never presented as detected pronunciation errors. */
export function FocusSentence({ text, soundId, style, highlight = isDark ? palette.ink : palette.primaryDark }: { text: string; soundId?: string; style?: TextStyle; highlight?: string }) {
  const pattern = soundId === "v" ? /(v)/gi : soundId === "w" ? /(w)/gi : soundId === "θ" || soundId === "ð" ? /(th)/gi : null;
  return <Text style={[type.title, style]}>{pattern ? text.split(pattern).map((part, i) => <Text key={i} style={i % 2 ? { color: highlight, textDecorationLine: "underline" } : undefined}>{part}</Text>) : text}</Text>;
}

function LevelBar({ level, index }: { level: SharedValue<number>; index: number }) {
  const animated = useAnimatedStyle(() => ({ transform: [{ scaleY: 0.15 + level.value * (0.4 + (index % 5) * 0.15) }] }));
  return <Animated.View style={[{ width: 4, height: 36, borderRadius: 2, backgroundColor: palette.primary }, animated]} />;
}

/** Live input indication runs on the UI thread, without store or screen re-renders. */
export function InputMeter({ level }: { level: SharedValue<number> }) {
  return <View accessibilityLabel="Microphone input level" style={{ height: 42, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 }}>
    {Array.from({ length: 23 }, (_, i) => <LevelBar key={i} index={i} level={level} />)}
  </View>;
}
