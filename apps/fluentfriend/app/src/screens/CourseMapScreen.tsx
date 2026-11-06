import { memo, useCallback, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Card, Icon, ProgressBar, Segmented, Tappable, feedback, palette, radius, space, toast, type } from "../ui";
import { StackHeader } from "../components";
import { useBannerHeight } from "../modules/layout";
import { useApp } from "../core/data";
import { lessonsForCourse, getCourse } from "../core/catalog";
import { courseProgress, displayStatus, lockReasonBn, type ProgressMap } from "../core/courses";
import type { Lesson } from "../core";
import { useNav } from "../nav";
import { bn } from "../util";

/** Course map: the 7-day and 30-day paths with per-day status (done / open / locked).
 *  The day list is a virtualized FlatList with memoized rows so a 30-day course scrolls smoothly
 *  on low-end phones (QA performance: "profile the lesson list, FlatList + memoized rows"). */
export function CourseMapScreen() {
  const nav = useNav();
  const s = useApp();
  const insets = useSafeAreaInsets();
  const banner = useBannerHeight();
  const [courseId, setCourseId] = useState<string>("c30");
  const course = getCourse(courseId)!;
  const lessons = lessonsForCourse(courseId);
  const cp = courseProgress(s.progress, courseId);

  const openLesson = useCallback(
    (l: Lesson) => {
      const locked = displayStatus(s.progress, l.id) === "locked";
      if (locked) {
        feedback("pop", "warning");
        const reason = lockReasonBn(s.progress, l.id);
        if (reason) toast(reason);
      } else {
        nav.go({ name: "lesson", lessonId: l.id });
      }
    },
    [s.progress, nav],
  );

  const renderItem = useCallback(
    ({ item }: { item: Lesson }) => <DayRow lesson={item} progress={s.progress} onOpen={openLesson} />,
    [s.progress, openLesson],
  );

  return (
    <View style={styles.root}>
      <View style={{ paddingTop: insets.top + space.md, paddingHorizontal: space.lg }}>
        <StackHeader title="কোর্স ম্যাপ" subtitle={`${bn(cp.done)}/${bn(cp.total)} দিন সম্পূর্ণ`} onClose={() => nav.back()} />
      </View>
      <FlatList
        data={lessons}
        keyExtractor={(l) => l.id}
        renderItem={renderItem}
        initialNumToRender={10}
        windowSize={9}
        removeClippedSubviews
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: insets.bottom + banner + space.xl, gap: space.sm }}
        ListHeaderComponent={
          <View style={{ gap: space.sm, paddingBottom: space.sm }}>
            <Segmented
              options={[
                { value: "c7", label: "৭ দিন" },
                { value: "c30", label: "৩০ দিন" },
              ]}
              value={courseId}
              onChange={setCourseId}
            />
            <Card style={{ gap: space.sm }}>
              <View style={styles.rowBetween}>
                <Text style={type.bodyStrong}>{course.title_bn}</Text>
                <Text style={type.label}>{bn(Math.round(cp.pct * 100))}%</Text>
              </View>
              <ProgressBar value={cp.pct} />
            </Card>
          </View>
        }
      />
    </View>
  );
}

/** One day row — memoized so unrelated state changes don't re-render the whole 30-day list. */
const DayRow = memo(function DayRow({ lesson, progress, onOpen }: { lesson: Lesson; progress: ProgressMap; onOpen: (l: Lesson) => void }) {
  const st = displayStatus(progress, lesson.id);
  const locked = st === "locked";
  const reason = lockReasonBn(progress, lesson.id);
  return (
    <Tappable label={`দিন ${lesson.day}: ${lesson.title_bn}${locked ? " (বন্ধ)" : ""}`} sound={locked ? null : "tap"} onPress={() => onOpen(lesson)}>
      <Card accent={st === "done" ? palette.success : st === "locked" ? palette.border : palette.primary} style={styles.dayRow}>
        <View style={[styles.dayNum, st === "done" ? { backgroundColor: palette.successSoft } : locked ? { backgroundColor: palette.surfaceAlt } : { backgroundColor: palette.primarySoft }]}>
          {st === "done" ? (
            <Icon name="check" size={18} color={palette.success} />
          ) : locked ? (
            <Icon name="lock" size={16} color={palette.inkMuted} />
          ) : (
            <Text style={[type.bodyStrong, { color: palette.primary }]}>{bn(lesson.day)}</Text>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[type.bodyStrong, locked && { color: palette.inkMuted }]} numberOfLines={1}>{lesson.title_bn}</Text>
          <Text style={type.caption} numberOfLines={1}>{locked && reason ? reason : lesson.title_en}</Text>
        </View>
        {!locked ? <Icon name={st === "done" ? "refresh" : "play"} size={18} color={palette.inkMuted} /> : null}
      </Card>
    </Tappable>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  dayRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  dayNum: { width: 40, height: 40, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
});
