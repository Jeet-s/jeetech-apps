import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { Button, Card, Pill, Sheet, feedback, palette, space, type } from "../ui";
import { tts } from "../modules/speech";
import { analytics } from "../modules/analytics";
import { review } from "../modules/review";
import { gymStore, useGym } from "../core/data";
import { completeDrill } from "../core/state";
import { pairsForSound, SOUND_BY_ID } from "../core/sounds";
import { pairQuestion } from "../core/practice";
import { dateKey } from "../core/dates";
import { MouthGuide } from "../ui/MouthGuide";

export function PairDrillSheet({ soundId, onClose }: { soundId: string | null; onClose: () => void }) {
  const gym = useGym();
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState<string | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  useEffect(() => { setIndex(0); setAnswer(null); setCorrectCount(0); }, [soundId]);
  const pairs = pairsForSound(soundId ?? "").filter(p => p.level === "word" && p.b);
  const question = pairQuestion(pairs, index);
  const sound = SOUND_BY_ID[soundId ?? ""];
  const total = Math.min(3, pairs.length);
  const finished = index >= total;
  const hear = () => question && tts.speak(question.correct, gym.profile.targetAccent);
  const choose = (word: string) => {
    if (answer || !question || !soundId) return;
    setAnswer(word);
    const correct = word === question.correct;
    feedback(correct ? "success" : "pop", correct ? "success" : "warning");
    const count = correctCount + (correct ? 1 : 0);
    setCorrectCount(count);
    if (index + 1 === total) {
      gymStore.set(s => completeDrill(s, soundId, count / total, dateKey(new Date())));
      analytics.track("core_action", { feature: "minimal_pair_drill" });
      if (count === total) review.actionCompleted();
    }
  };
  return (
    <Sheet visible={!!soundId} title={`${sound?.name ?? "Sound"} · listening drill`} onClose={() => { tts.stop(); onClose(); }}>
      {finished ? (
        <Card accent={palette.success}>
          <Text style={type.title}>Drill complete · {correctCount}/{total}</Text>
          <Text style={type.body}>Your listening result is saved to your sound plan.</Text>
          <Button label="Practise again" onPress={() => { setIndex(0); setAnswer(null); setCorrectCount(0); }} />
          <Button label="Done" variant="ghost" onPress={onClose} />
        </Card>
      ) : question ? (
        <View style={{ gap: space.md }}>
          <Pill label={`Question ${index + 1} of ${total} · always free`} tone="primary" />
          <Text style={type.heading}>Which word do you hear?</Text>
          <Button label="Play the word" icon="play" onPress={hear} />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.md }}>
            {[question.a, question.b].map(word => <Button key={word} label={word} variant="secondary" disabled={!!answer} onPress={() => choose(word)} />)}
          </View>
          <View style={{ minHeight: 92, gap: space.sm }} accessibilityLiveRegion="polite">
            {answer ? <><Text style={[type.bodyStrong, { color: answer === question.correct ? palette.success : palette.ink }]}>{answer === question.correct ? "You heard it!" : `You chose ${answer}. The word was ${question.correct}.`}</Text><Button label={index + 1 === total ? "See saved result" : "Next pair"} variant="secondary" onPress={() => { setIndex(i => i + 1); setAnswer(null); }} /></> : <Text style={type.caption}>Listen, then choose. Replay as often as you like.</Text>}
          </View>
          {soundId ? <MouthGuide soundId={soundId} /> : null}
        </View>
      ) : <Text style={type.body}>Choose a sound with a word pair from Sounds.</Text>}
    </Sheet>
  );
}
