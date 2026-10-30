import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, LinearTransition } from "react-native-reanimated";
import {
  Button,
  Card,
  EmptyState,
  Icon,
  IconButton,
  Screen,
  SectionHeader,
  Segmented,
  Tappable,
  TextField,
  feedback,
  palette,
  radius,
  space,
  toast,
  type,
} from "../ui";
import type { ScreenProps } from "./nav";
import { bandUpStore, useBandUp } from "../core/data";
import { TEMPLATES, QUIZZES, savePhrase, deletePhrase, restorePhrase, validatePhrase, checkQuiz, type PhraseError } from "../core/learn";
import type { SavedPhrase } from "../core/model";

const dateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
type View3 = "templates" | "phrases" | "quizzes";
const PHRASE_ERR: Record<PhraseError, string> = { empty: "Type a phrase first.", too_long: "Keep it under 280 characters.", duplicate: "You've already saved this phrase." };

/** Learn hub: answer templates & tips, linking phrases you can save, and quick
 *  quizzes. All offline from the bundled content. */
export function LearnScreen({ bottomInset }: ScreenProps) {
  const [view, setView] = useState<View3>("templates");
  return (
    <Screen title="Learn" subtitle="Templates · phrases · quizzes" bottomInset={bottomInset}>
      <Segmented<View3>
        value={view}
        onChange={setView}
        options={[
          { value: "templates", label: "Templates" },
          { value: "phrases", label: "Phrases" },
          { value: "quizzes", label: "Quizzes" },
        ]}
      />
      {view === "templates" ? <Templates /> : view === "phrases" ? <Phrases /> : <Quizzes />}
    </Screen>
  );
}

function Templates() {
  const items = TEMPLATES.filter((t) => t.category === "template" || t.category === "tip");
  const [open, setOpen] = useState<string | null>(items[0]?.id ?? null);
  return (
    <View style={{ gap: space.sm }}>
      <SectionHeader title="Answer templates & tips" />
      {items.map((t) => {
        const expanded = open === t.id;
        return (
          <Card key={t.id} padded={false}>
            <Tappable label={t.title} onPress={() => { feedback("pop", "light"); setOpen(expanded ? null : t.id); }} style={styles.tplHead}>
              <View style={[styles.tplIcon, { backgroundColor: t.category === "tip" ? palette.successSoft : palette.primarySoft }]}>
                <Icon name={t.category === "tip" ? "sparkle" : "doc"} size={18} color={t.category === "tip" ? palette.success : palette.primary} />
              </View>
              <Text style={[type.bodyStrong, { flex: 1 }]}>{t.title}</Text>
              <View style={{ transform: [{ rotate: expanded ? "90deg" : "0deg" }] }}>
                <Icon name="chevronRight" size={20} color={palette.inkMuted} />
              </View>
            </Tappable>
            {expanded ? (
              <Animated.View entering={FadeIn.duration(180)} style={styles.tplBody}>
                {t.body.split("\n").map((line, i) => (
                  <Text key={i} style={[type.body, { color: palette.inkSoft, marginBottom: 4 }]}>• {line}</Text>
                ))}
              </Animated.View>
            ) : null}
          </Card>
        );
      })}
    </View>
  );
}

function Phrases() {
  const data = useBandUp();
  const today = dateKey(new Date());
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const lists = TEMPLATES.filter((t) => t.category === "phrase");

  const add = (raw: string, category = "mine") => {
    const err = validatePhrase(data, raw);
    if (err) {
      feedback("error", "error");
      setError(PHRASE_ERR[err]);
      return false;
    }
    bandUpStore.set((s) => savePhrase(s, raw, category, today).state);
    feedback("success", "success");
    toast("Phrase saved");
    return true;
  };

  const remove = (p: SavedPhrase) => {
    const index = data.phrases.findIndex((x) => x.id === p.id);
    bandUpStore.set(deletePhrase(data, p.id));
    feedback("pop", "warning");
    toast("Phrase removed", { label: "Undo", onPress: () => bandUpStore.set((s) => restorePhrase(s, p, index)) });
  };

  return (
    <View style={{ gap: space.lg }}>
      {/* Your saved phrases */}
      <SectionHeader title={`Saved phrases${data.phrases.length ? ` · ${data.phrases.length}` : ""}`} />
      {data.phrases.length === 0 ? (
        <Card>
          <EmptyState icon="book" title="No saved phrases yet" body="Tap any phrase below to save it, or write your own to reuse in answers." />
        </Card>
      ) : (
        <View style={{ gap: space.sm }}>
          {data.phrases.map((p) => (
            <Animated.View key={p.id} layout={LinearTransition.duration(180)}>
              <Card padded={false} style={styles.savedRow}>
                <Text style={[type.body, { flex: 1 }]}>{p.text}</Text>
                <IconButton icon="trash" label="Remove phrase" tone="danger" size={40} onPress={() => remove(p)} />
              </Card>
            </Animated.View>
          ))}
        </View>
      )}

      {/* Add your own */}
      <Card>
        <TextField
          label="Add your own phrase"
          placeholder="e.g. That's a great question because…"
          value={text}
          error={error}
          onChangeText={(t) => { setText(t); setError(null); }}
          maxLength={280}
          returnKeyType="done"
          onSubmitEditing={() => { if (add(text)) setText(""); }}
        />
        <Button label="Save phrase" icon="plus" variant="secondary" onPress={() => { if (add(text)) setText(""); }} style={{ marginTop: space.md }} />
      </Card>

      {/* Bundled phrase lists */}
      <SectionHeader title="Useful phrases" />
      {lists.map((l) => (
        <Card key={l.id}>
          <Text style={type.bodyStrong}>{l.title}</Text>
          <View style={{ gap: space.sm, marginTop: space.sm }}>
            {l.body.split("\n").map((line, i) => {
              const clean = line.replace(/\s*\.\.\.$/, "").trim();
              const saved = data.phrases.some((p) => p.text.toLowerCase() === clean.toLowerCase());
              return (
                <Tappable key={i} label={`Save phrase ${clean}`} sound={null} onPress={() => !saved && add(clean, l.title)} style={styles.phraseLine}>
                  <Text style={[type.body, { flex: 1, color: palette.inkSoft }]}>{line}</Text>
                  <Icon name={saved ? "check" : "plus"} size={18} color={saved ? palette.success : palette.primary} />
                </Tappable>
              );
            })}
          </View>
        </Card>
      ))}
    </View>
  );
}

function Quizzes() {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const answer = (quizId: string, choice: number) => {
    if (answers[quizId] !== undefined) return;
    const r = checkQuiz(quizId, choice);
    feedback(r?.correct ? "success" : "error", r?.correct ? "success" : "warning");
    setAnswers((a) => ({ ...a, [quizId]: choice }));
  };
  const correctCount = QUIZZES.filter((q) => answers[q.id] === q.answer).length;
  return (
    <View style={{ gap: space.lg }}>
      <SectionHeader title={`Quick quiz · ${correctCount}/${QUIZZES.length} correct`} />
      {QUIZZES.map((q) => {
        const picked = answers[q.id];
        const answered = picked !== undefined;
        return (
          <Card key={q.id}>
            <Text style={type.bodyStrong}>{q.question}</Text>
            <View style={{ gap: space.sm, marginTop: space.md }}>
              {q.choices.map((c, i) => {
                const isCorrect = i === q.answer;
                const isPicked = picked === i;
                const show = answered && (isCorrect || isPicked);
                const bg = !answered ? palette.surface : isCorrect ? palette.successSoft : isPicked ? palette.dangerSoft : palette.surface;
                const border = show ? (isCorrect ? palette.success : palette.danger) : palette.border;
                return (
                  <Tappable key={i} label={c} sound={null} disabled={answered} onPress={() => answer(q.id, i)} style={[styles.choice, { backgroundColor: bg, borderColor: border }]}>
                    <Text style={[type.body, { flex: 1 }]}>{c}</Text>
                    {show ? <Icon name={isCorrect ? "check" : "close"} size={18} color={isCorrect ? palette.success : palette.danger} /> : null}
                  </Tappable>
                );
              })}
            </View>
            {answered ? (
              <Animated.View entering={FadeIn.duration(180)} style={styles.explain}>
                <Icon name="sparkle" size={16} color={palette.primary} />
                <Text style={[type.caption, { flex: 1 }]}>{checkQuiz(q.id, picked)?.explain}</Text>
              </Animated.View>
            ) : null}
          </Card>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tplHead: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.lg },
  tplIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  tplBody: { paddingHorizontal: space.lg, paddingBottom: space.lg },
  savedRow: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingLeft: space.lg, paddingRight: space.xs, paddingVertical: space.xs, minHeight: 56 },
  phraseLine: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 40, paddingVertical: 4 },
  choice: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 48, borderWidth: 1.5, borderRadius: radius.md, paddingHorizontal: space.md },
  explain: { flexDirection: "row", gap: space.sm, alignItems: "flex-start", marginTop: space.md },
});
