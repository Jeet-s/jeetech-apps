import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, CONTENT_MAX, Card, Icon, IconButton, Pill, palette, radius, space, type } from "../ui";
import { useApp } from "../core/data";
import { getLesson } from "../core/content";
import type { AppNav } from "../app/nav";

/** A short guided lesson: a few steps, then a take scored on that skill. Any
 * lesson can be started without finishing earlier ones (no locked gates). */
export function LessonScreen({ lessonId, nav, onClose }: { lessonId: string; nav: AppNav; onClose: () => void }) {
  const app = useApp();
  const insets = useSafeAreaInsets();
  const lesson = getLesson(lessonId);
  const progress = app.lessons.find((l) => l.lessonId === lessonId);

  if (!lesson) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.bar}><IconButton icon="chevronLeft" label="Back" onPress={onClose} /><Text style={type.heading}>Lesson</Text><View style={{ width: 48 }} /></View>
      </View>
    );
  }

  const start = () =>
    nav.record({
      mode: "lesson",
      packId: lesson.id,
      promptId: `${lesson.id}_take`,
      promptText: lesson.focusPrompt,
      scenario: lesson.title,
      title: lesson.title,
      lessonId: lesson.id,
    });

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.bar}>
        <IconButton icon="chevronLeft" label="Back" onPress={onClose} />
        <Text style={type.heading} numberOfLines={1}>{lesson.title}</Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 96 }]}>
        <View style={styles.headRow}>
          <Pill label={`Focus · ${lesson.skill}`} tone="primary" />
          {progress?.completed ? <Pill label={`Best ${progress.bestScore}`} tone="success" /> : null}
        </View>

        <Card style={{ gap: space.md }}>
          <Text style={type.label}>WHAT YOU'LL LEARN</Text>
          {lesson.steps.map((s, i) => (
            <View key={i} style={styles.step}>
              <View style={styles.stepNum}><Text style={[type.label, { color: palette.primary }]}>{i + 1}</Text></View>
              <Text style={[type.body, { flex: 1 }]}>{s}</Text>
            </View>
          ))}
        </Card>

        <Card style={{ gap: space.sm }} accent={palette.primary}>
          <View style={styles.sayHead}>
            <Icon name="mic" size={18} color={palette.primary} />
            <Text style={type.bodyStrong}>Your take</Text>
          </View>
          <Text style={type.body}>{lesson.focusPrompt}</Text>
        </Card>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
        <Button label={progress?.completed ? "Practise again" : "Start the take"} icon="mic" size="lg" onPress={start} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
  bar: { flexDirection: "row", alignItems: "center", paddingHorizontal: space.sm, paddingVertical: space.sm, gap: space.sm },
  body: { paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.lg, width: "100%", maxWidth: CONTENT_MAX, alignSelf: "center" },
  headRow: { flexDirection: "row", gap: space.sm },
  step: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
  stepNum: { width: 24, height: 24, borderRadius: 12, backgroundColor: palette.primarySoft, alignItems: "center", justifyContent: "center", marginTop: 1 },
  sayHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: space.lg, paddingTop: space.md, backgroundColor: palette.bg, borderTopWidth: 1, borderTopColor: palette.border },
});
