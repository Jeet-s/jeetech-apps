import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  Button,
  Card,
  HeroCard,
  Icon,
  Pill,
  ProgressBar,
  Screen,
  Sheet,
  Tappable,
  gradient,
  palette,
  radius,
  space,
  tones,
  type,
} from "../ui";
import { PairDrillSheet } from "./PairDrillSheet";
import { MouthGuide } from "../ui/MouthGuide";
import { SpeakSheet, type SpeakMode } from "./SpeakSheet";
import { tts } from "../modules/speech";
import { useGym } from "../core/data";
import { getMastery } from "../core/mastery";
import { MASTERED_AT } from "../core/mastery";
import { L1_NAME, SOUND_BY_ID, pairsForSound, revealsL1 } from "../core/sounds";
import { sentenceForSound } from "../core/sentences";
import { ipaForSound } from "../core/accent";
import { pro as isProNow } from "../core/state";

/**
 * Sounds: the mother-tongue plan (weakest first), each sound openable into a
 * coach card with the tip, a mouth-position cue, example words, IPA and
 * minimal-pair drills — the headline "how we win" over BoldVoice.
 */
export function SoundsScreen({ bottomInset, onPro }: { bottomInset: number; onPro: (from: string) => void }) {
  const gym = useGym();
  const accent = gym.profile.targetAccent;
  const l1 = gym.profile.nativeLanguage;
  const pro = isProNow(gym, Date.now());
  const [drill, setDrill] = useState<string | null>(null);
  const [openSound, setOpenSound] = useState<string | null>(null);
  const [mode, setMode] = useState<SpeakMode | null>(null);
  const [speaking, setSpeaking] = useState(false);

  const mastered = gym.plan.filter((id) => getMastery(gym.mastery, id).mastered).length;

  const practiceSound = (soundId: string) => {
    const s = sentenceForSound(soundId, pro);
    if (!s) return;
    setOpenSound(null);
    setMode({ kind: "practice", sentenceId: s.id, text: s.text, soundTags: s.soundTags, title: SOUND_BY_ID[soundId]?.name });
    setSpeaking(true);
  };
  const drillSound = (soundId: string) => {
    setOpenSound(null);
    setDrill(soundId);
  };

  const sound = openSound ? SOUND_BY_ID[openSound] : null;

  return (
    <>
      <Screen title="Sounds" subtitle={`Your ${L1_NAME[l1]} plan`} bottomInset={bottomInset}>
        <HeroCard
          overline="Your personal sound plan"
          value={`${mastered}/${gym.plan.length}`}
          caption="sounds mastered"
          status={{ label: "Weakest first", tone: "primary" }}
          right={<View style={styles.icon}><Icon name="target" size={38} color={gradient.onHero} /></View>}
        />
        {gym.plan.map((id) => {
          const s = SOUND_BY_ID[id];
          if (!s) return null;
          const m = getMastery(gym.mastery, id);
          const done = m.mastered;
          const tone = done ? "success" : m.score >= 70 ? "primary" : m.score >= 50 ? "warning" : "danger";
          return (
            <Card key={id} accent={tones[tone].fg}>
              <Tappable label={`${s.name}, ${m.score} percent`} sound="pop" onPress={() => setOpenSound(id)} style={styles.soundHead}>
                <View style={[styles.ipaBadge, { backgroundColor: tones[tone].bg }]}>
                  <Text style={[type.phonetic, { color: tones[tone].fg }]}>/{ipaForSound(id, accent)}/</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={type.bodyStrong}>{s.name}</Text>
                  <Text style={type.caption}>{s.examples.slice(0, 3).join(" · ")}</Text>
                </View>
                {done ? <Icon name="star" size={20} color={palette.success} /> : revealsL1(id, l1) ? <Pill label={"Focus sound"} tone="warning" /> : null}
              </Tappable>
              <Text style={[type.caption, { marginVertical: space.sm }]}>{s.mouthTip}</Text>
              <View style={styles.measure}><Text style={type.caption}>Sound clarity estimate</Text><Text style={type.amount}>{m.score}/100</Text></View>
              <ProgressBar value={m.score / 100} tone={tone === "danger" ? "danger" : tone === "warning" ? "warning" : done ? "success" : "primary"} />
              <View style={styles.actions}>
                <Button label="Practice" icon="mic" size="sm" variant={id === gym.plan[0] ? "primary" : "secondary"} onPress={() => practiceSound(id)} />
                <Button label="Listen & choose" icon="target" size="sm" variant="ghost" onPress={() => drillSound(id)} />
              </View>
            </Card>
          );
        })}
        <Text style={[type.caption, { textAlign: "center" }]}>Mastered sounds reach {MASTERED_AT}%+ and stay there. Keep practising to lock them in.</Text>
      </Screen>

      <Sheet visible={!!sound} title={sound?.name} onClose={() => setOpenSound(null)}>
        {sound ? (
          <View style={{ gap: space.md }}>
            <View style={styles.detailHead}>
              <View style={styles.detailIpa}><Text style={[type.phonetic, { fontSize: 24, color: palette.onPrimary }]}>/{ipaForSound(sound.id, accent)}/</Text></View>
              <Text style={[type.body, { flex: 1 }]}>{sound.examples.join(" · ")}</Text>
            </View>
            <Card accent={palette.primary}>
              <Text style={type.bodyStrong}>How to make it</Text>
              <Text style={type.body}>{sound.tip}</Text>
              <MouthGuide soundId={sound.id} />
              <View style={styles.mouth}>
                <Icon name="target" size={16} color={palette.primary} />
                <Text style={[type.caption, { flex: 1, color: palette.inkSoft }]}>Mouth: {sound.mouthTip}</Text>
              </View>
              <Button label="Hear an example" icon="play" size="sm" variant="secondary" onPress={() => tts.speak(sound.examples[0], accent, { slow: true })} />
            </Card>
            <Text style={type.label}>MINIMAL PAIRS — don't mix these up</Text>
            {pairsForSound(sound.id).filter((p) => p.level === "word").slice(0, 4).map((p, i) => (
              <View key={i} style={styles.pairRow}>
                <Tappable label={`Hear ${p.a}`} sound={null} onPress={() => tts.speak(p.a, accent)} style={[styles.pairChip, { borderColor: palette.success }]}>
                  <Icon name="play" size={14} color={palette.success} />
                  <Text style={[type.bodyStrong, { color: palette.success }]}>{p.a}</Text>
                </Tappable>
                <Text style={type.caption}>not</Text>
                <Tappable label={`Hear ${p.b}`} sound={null} onPress={() => tts.speak(p.b, accent)} style={[styles.pairChip, { borderColor: palette.border }]}>
                  <Icon name="play" size={14} color={palette.inkMuted} />
                  <Text style={type.bodyStrong}>{p.b}</Text>
                </Tappable>
              </View>
            ))}
            <Button label="Start listening drill" icon="target" onPress={() => drillSound(sound.id)} />
            <Button label="Practice in a sentence" icon="mic" variant="secondary" onPress={() => practiceSound(sound.id)} />
          </View>
        ) : null}
      </Sheet>

      <PairDrillSheet soundId={drill} onClose={() => setDrill(null)} />
      <SpeakSheet visible={speaking} mode={mode} onPro={onPro} onClose={() => setSpeaking(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  measure: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: space.xs },
  icon: { width: 60, height: 60, borderRadius: 30, backgroundColor: gradient.pill, alignItems: "center", justifyContent: "center" },
  soundHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  ipaBadge: { minWidth: 44, paddingHorizontal: 8, height: 40, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.md },
  detailHead: { flexDirection: "row", alignItems: "center", gap: space.md },
  detailIpa: { backgroundColor: palette.primary, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.sm },
  mouth: { flexDirection: "row", alignItems: "center", gap: space.xs, marginVertical: space.sm },
  pairRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  pairChip: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1.5, borderRadius: radius.pill, paddingHorizontal: 14, minHeight: 40 },
});
