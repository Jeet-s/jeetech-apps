import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, LinearTransition } from "react-native-reanimated";
import { Button, FooterScreen, Icon, Tappable, feedback, palette, radius, shadow, space, type } from "../ui";
import { AudioButton } from "../components";
import { checkAnswer, gradeQuiz } from "../core/quiz";
import type { QuizItem } from "../core";
import { bn } from "../util";

/**
 * A 5-question quiz with instant right/wrong feedback and a Bangla reason. The
 * single advance control ("পরবর্তী" / "মিলিয়ে দেখুন" / "ফলাফল দেখুন") lives in a
 * PINNED FOOTER — never a button buried at the bottom of a scrolling card — so
 * after every answer there is one obvious, always-visible next tap (QA: the quiz
 * "did not change for 5 taps" because the Next button sat below the fold among
 * inert, disabled option rows). Order-the-words is a tap-to-arrange; the rest are
 * single-choice. No ads between questions.
 */
export function QuizView({ items, onDone, top }: { items: QuizItem[]; onDone: (score: number) => void; top: React.ReactNode }) {
  const [i, setI] = useState(0);
  const [results, setResults] = useState<boolean[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [order, setOrder] = useState<string[]>([]);
  const [checked, setChecked] = useState<ReturnType<typeof checkAnswer> | null>(null);

  const item = items[i];
  const isLast = i + 1 >= items.length;

  const grade = (res: ReturnType<typeof checkAnswer>) => {
    setChecked(res);
    feedback(res.correct ? "success" : "error", res.correct ? "success" : "warning");
  };

  const choose = (opt: string) => {
    if (checked) return;
    setPicked(opt);
    grade(checkAnswer(item, opt));
  };

  const submitOrder = () => {
    if (checked) return;
    const given = order.map((k) => item.options[Number(k)]).join(" ");
    grade(checkAnswer(item, given));
  };

  const next = () => {
    if (!checked) return;
    const nextResults = [...results, checked.correct];
    if (isLast) {
      onDone(gradeQuiz(nextResults).score);
      return;
    }
    setResults(nextResults);
    setI(i + 1);
    setPicked(null);
    setOrder([]);
    setChecked(null);
  };

  const footer = checked ? (
    <Button label={isLast ? "ফলাফল দেখুন" : "পরবর্তী"} size="lg" icon="arrowRight" onPress={next} />
  ) : item.type === "order_words" ? (
    <Button label="মিলিয়ে দেখুন" size="lg" icon="check" disabled={order.length !== item.options.length} onPress={submitOrder} />
  ) : (
    <Button label="একটি উত্তর বেছে নিন" size="lg" disabled />
  );

  return (
    <FooterScreen top={top} footer={footer} contentStyle={styles.body}>
      <View key={item.id} style={{ gap: space.lg }}>
        <View style={styles.counterRow}>
          <Text style={type.label}>প্রশ্ন {bn(i + 1)}/{bn(items.length)}</Text>
          <View style={styles.pips}>
            {items.map((_, k) => (
              <View key={k} style={[styles.pip, k < results.length && styles.pipDone, k === i && styles.pipNow]} />
            ))}
          </View>
        </View>
        {item.type === "order_words" ? (
          <OrderQuestion item={item} order={order} checked={checked} onToggle={(k) => !checked && setOrder((o) => (o.includes(k) ? o.filter((x) => x !== k) : [...o, k]))} />
        ) : (
          <ChoiceQuestion item={item} picked={picked} checked={checked} onChoose={choose} />
        )}
      </View>
    </FooterScreen>
  );
}

const PROMPT_BN: Record<QuizItem["type"], string> = {
  translate: "এর বাংলা অর্থ কী?",
  listen_pick: "শুনে বলুন — কোনটা শুনলেন?",
  fill_gap: "শূন্যস্থান পূরণ করুন",
  order_words: "শব্দগুলো সাজিয়ে বাক্য বানান",
};

function Feedback({ checked, order }: { checked: ReturnType<typeof checkAnswer>; order?: boolean }) {
  return (
    <Animated.View entering={FadeIn.duration(200)} style={styles.feedbackBox}>
      <Text style={[type.bodyStrong, { color: checked.correct ? palette.success : palette.danger }]}>
        {checked.correct ? "ঠিক আছে! 🎉" : `${order ? "সঠিক ক্রম" : "সঠিক উত্তর"}: ${checked.answer}`}
      </Text>
      <Text style={[type.body, { color: palette.inkSoft }]}>{checked.explanationBn}</Text>
      <View style={styles.nextHint}>
        <Icon name="arrowDown" size={14} color={palette.primary} />
        <Text style={[type.caption, { color: palette.primary }]}>নিচের বোতামে চেপে এগিয়ে যান</Text>
      </View>
    </Animated.View>
  );
}

function ChoiceQuestion({
  item,
  picked,
  checked,
  onChoose,
}: {
  item: QuizItem;
  picked: string | null;
  checked: ReturnType<typeof checkAnswer> | null;
  onChoose: (opt: string) => void;
}) {
  return (
    <View style={{ gap: space.md }}>
      <Text style={type.overline}>{PROMPT_BN[item.type]}</Text>
      {item.type === "listen_pick" ? (
        <View style={styles.listenPrompt}>
          <AudioButton label="শুনুন" size={56} />
          <Text style={[type.body, { color: palette.inkSoft }]}>ট্যাপ করে আবার শুনুন</Text>
        </View>
      ) : (
        <Text style={type.title}>{item.prompt}</Text>
      )}
      <View style={{ gap: space.sm }}>
        {item.options.map((opt) => {
          const isPicked = picked === opt;
          const isAnswer = opt === item.answer;
          const show = checked != null && (isPicked || isAnswer);
          const tone = show ? (isAnswer ? palette.success : palette.danger) : palette.border;
          return (
            <Tappable
              key={opt}
              label={opt}
              sound={null}
              disabled={checked != null}
              onPress={() => onChoose(opt)}
              style={[styles.opt, { borderColor: tone }, show && { backgroundColor: isAnswer ? palette.successSoft : palette.dangerSoft }]}
            >
              <Text style={[type.body, { flex: 1 }]}>{opt}</Text>
              {show ? <Icon name={isAnswer ? "checkCircle" : "close"} size={20} color={isAnswer ? palette.success : palette.danger} /> : null}
            </Tappable>
          );
        })}
      </View>
      {checked ? <Feedback checked={checked} /> : <View style={styles.hintSlot} />}
    </View>
  );
}

function OrderQuestion({
  item,
  order,
  checked,
  onToggle,
}: {
  item: QuizItem;
  order: string[];
  checked: ReturnType<typeof checkAnswer> | null;
  onToggle: (k: string) => void;
}) {
  const remaining = item.options.map((t, idx) => ({ t, idx })).filter((o) => !order.includes(`${o.idx}`));
  return (
    <View style={{ gap: space.md }}>
      <Text style={type.overline}>{PROMPT_BN.order_words}</Text>
      <Text style={type.title}>{item.prompt}</Text>

      {/* Answer line — taps here remove a word (and it animates back to the bank). */}
      <Animated.View layout={LinearTransition.duration(220)} style={styles.answerLine}>
        {order.length === 0 ? (
          <Text style={[type.body, { color: palette.inkMuted }]}>নিচের শব্দে ট্যাপ করুন…</Text>
        ) : (
          order.map((k, pos) => (
            <Animated.View key={`${k}-${pos}`} layout={LinearTransition.duration(220)}>
              <Tappable label={`${item.options[Number(k)]} সরান`} sound="pop" hitSlop={10} disabled={!!checked} onPress={() => onToggle(k)} style={styles.token}>
                <Text style={[type.bodyStrong, { color: palette.onPrimary }]}>{item.options[Number(k)]}</Text>
                {!checked ? <Icon name="close" size={15} color={palette.onPrimary} /> : null}
              </Tappable>
            </Animated.View>
          ))
        )}
      </Animated.View>

      {/* Word bank — big, obvious tap targets. Tapping moves a word up into the answer. */}
      <Text style={[type.caption, { color: palette.inkMuted }]}>শব্দের ঘর</Text>
      <Animated.View layout={LinearTransition.duration(220)} style={styles.bank}>
        {remaining.length === 0 ? (
          <Text style={[type.label, { color: palette.success }]}>সব শব্দ বসানো হয়েছে — নিচে “মিলিয়ে দেখুন” চাপুন ✓</Text>
        ) : (
          remaining.map((o) => (
            <Animated.View key={o.idx} layout={LinearTransition.duration(220)}>
              {/* Big, forgiving tap targets with hitSlop so a tap landing in the GAP between two chips
                  still registers (QA feature_tour: taps "between chips" did nothing for 5 actions). */}
              <Tappable
                label={`${o.t} — যোগ করুন`}
                sound="pop"
                scale={0.94}
                hitSlop={10}
                disabled={!!checked}
                onPress={() => onToggle(`${o.idx}`)}
                style={styles.tokenGhost}
              >
                <Text style={type.bodyStrong}>{o.t}</Text>
                <Icon name="arrowUp" size={15} color={palette.primary} />
              </Tappable>
            </Animated.View>
          ))
        )}
      </Animated.View>
      {checked ? <Feedback checked={checked} order /> : <View style={styles.hintSlot} />}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { justifyContent: "flex-start" },
  counterRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  pips: { flexDirection: "row", gap: 5 },
  pip: { width: 18, height: 6, borderRadius: 3, backgroundColor: palette.border },
  pipDone: { backgroundColor: palette.success },
  pipNow: { backgroundColor: palette.primary },
  listenPrompt: { flexDirection: "row", alignItems: "center", gap: space.md },
  opt: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 56, paddingHorizontal: space.lg, borderRadius: radius.md, borderWidth: 1.5, backgroundColor: palette.surface },
  feedbackBox: { backgroundColor: palette.surface, borderRadius: radius.lg, padding: space.lg, gap: space.sm, ...shadow },
  nextHint: { flexDirection: "row", alignItems: "center", gap: 6 },
  hintSlot: { minHeight: 8 },
  answerLine: { flexDirection: "row", flexWrap: "wrap", gap: space.md, minHeight: 64, alignItems: "center", borderBottomWidth: 2, borderBottomColor: palette.border, paddingBottom: space.md },
  token: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: palette.primary, borderRadius: radius.pill, paddingHorizontal: 22, minHeight: 56, justifyContent: "center" },
  tokenGhost: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: palette.surface, borderWidth: 1.5, borderColor: palette.primarySoft, borderRadius: radius.pill, paddingHorizontal: 22, minHeight: 56, justifyContent: "center", ...shadow },
  bank: { flexDirection: "row", flexWrap: "wrap", gap: space.md, minHeight: 56, alignItems: "center" },
});
