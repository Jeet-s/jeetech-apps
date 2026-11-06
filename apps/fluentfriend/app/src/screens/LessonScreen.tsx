import { useMemo, useState } from "react";
import { Alert, Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn } from "react-native-reanimated";
import { Button, Confetti, FooterScreen, Icon, ProgressBar, Tappable, feedback, palette, play, radius, shadow, space, toast, type } from "../ui";
import { PhraseCard, ReportSheet, ScoreBadge, StackHeader } from "../components";
import { SpeakingPanel } from "./SpeakingPanel";
import { QuizView } from "./QuizView";
import { art } from "../art";
import { appStore, useApp, todayKey } from "../core/data";
import { getCourse, getLesson, getPhrase, quizForLesson } from "../core/catalog";
import { courseProgress, saveStep } from "../core/courses";
import { completeLesson, setReminder, type LessonDone } from "../core/state";
import { analytics } from "../modules/analytics";
import { review } from "../modules/review";
import { notify } from "../modules/notify";
import { scheduleDaily } from "../reminders";
import { useNav } from "../nav";
import type { Phrase } from "../core";
import { bn } from "../util";

type Step = "phrases" | "speak" | "quiz" | "done";
const STEPS: Step[] = ["phrases", "speak", "quiz", "done"];

/** Lesson: learn the phrases → say one aloud → 5-question quiz → day complete. */
export function LessonScreen({ lessonId }: { lessonId: string }) {
  const nav = useNav();
  const insets = useSafeAreaInsets();
  const s = useApp();
  const lesson = getLesson(lessonId);
  const [step, setStep] = useState<Step>("phrases");
  const [reporting, setReporting] = useState<Phrase | null>(null);
  const [done, setDone] = useState<LessonDone | null>(null);

  const phrases = useMemo(() => (lesson ? lesson.phraseIds.map(getPhrase).filter(Boolean) as Phrase[] : []), [lesson]);
  const speakPhrase = lesson ? getPhrase(lesson.speakingPhraseId) : undefined;
  const quiz = useMemo(() => (lesson ? quizForLesson(lesson.id) : []), [lesson]);

  if (!lesson || !speakPhrase) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + space.lg }]}>
        <StackHeader title="পাঠ" onClose={() => nav.back()} closeIcon="close" />
      </View>
    );
  }

  const idx = STEPS.indexOf(step);
  const confirmClose = () => {
    if (step === "done") return nav.back();
    Alert.alert("পাঠ বন্ধ করবেন?", "আপনার অগ্রগতি সংরক্ষণ করা হবে, পরে একই জায়গা থেকে শুরু করতে পারবেন।", [
      { text: "চালিয়ে যান", style: "cancel" },
      {
        text: "বন্ধ করুন",
        style: "destructive",
        onPress: () => {
          appStore.set((st) => ({ ...st, progress: saveStep(st.progress, lesson.id, idx) }));
          nav.back();
        },
      },
    ]);
  };

  const finishQuiz = (score: number) => {
    const res = completeLesson(appStore.get(), lesson.id, score, todayKey());
    appStore.set(() => res.state);
    setDone(res);
    setStep("done");
    play(res.completedCourse ? "unlock" : "success", 0.7);
    analytics.track("core_action", { feature: "lesson_day" });
    analytics.track("lesson_completed", { day: lesson.day });
    review.actionCompleted();
  };

  const STEP_LABELS: { key: Step; label: string; icon: "book" | "mic" | "check" }[] = [
    { key: "phrases", label: "বাক্য", icon: "book" },
    { key: "speak", label: "বলা", icon: "mic" },
    { key: "quiz", label: "কুইজ", icon: "check" },
  ];
  const goStep = (next: Step) => {
    if (next === step) return;
    feedback("pop", "select");
    setStep(next);
  };
  const header = (
    <View style={{ gap: space.sm }}>
      <StackHeader title={lesson.title_bn} subtitle={`৩০ দিনের পথ · দিন ${bn(lesson.day)}`} onClose={confirmClose} closeIcon="close" />
      {step !== "done" ? (
        <>
          <ProgressBar value={(idx + 1) / (STEPS.length - 1)} tone="primary" />
          {/* Real tappable tabs — tap বাক্য / বলা / কুইজ to jump straight to that step (QA: the Speak
              tab looked like a tab but was inert, so the speaking exercise could not be reached). The
              footer button still drives the natural phrases→speak→quiz flow for those who follow it. */}
          <View style={styles.stepStrip} accessibilityRole="tablist">
            {STEP_LABELS.map((st, i) => {
              const state = st.key === step ? "now" : i < idx ? "done" : "upcoming";
              return (
                <Tappable
                  key={st.key}
                  label={st.label}
                  role="tab"
                  accessibilityState={{ selected: state === "now" }}
                  sound={null}
                  scale={0.95}
                  onPress={() => goStep(st.key)}
                  style={[styles.stepItem, state === "now" && styles.stepItemNow]}
                >
                  <View style={[styles.stepDot, state === "now" && styles.stepDotNow, state === "done" && styles.stepDotDone]}>
                    <Icon name={state === "done" ? "check" : st.icon} size={13} color={state === "upcoming" ? palette.inkMuted : palette.onPrimary} />
                  </View>
                  <Text style={[type.caption, { color: state === "now" ? palette.primary : palette.inkMuted }]} numberOfLines={1}>{st.label}</Text>
                </Tappable>
              );
            })}
          </View>
        </>
      ) : null}
    </View>
  );

  if (step === "done" && done) {
    return <DayComplete lesson={lesson} score={done.state.progress[lesson.id]?.score ?? 0} result={done} onClose={() => nav.back()} />;
  }

  if (step === "quiz") {
    return <QuizView items={quiz} onDone={finishQuiz} top={header} />;
  }

  return (
    <>
      <FooterScreen
        top={header}
        footer={
          step === "phrases" ? (
            <Button label="শিখেছি — এগিয়ে যান" size="lg" icon="arrowRight" onPress={() => setStep("speak")} />
          ) : (
            <Button label="কুইজে যান" size="lg" icon="arrowRight" onPress={() => setStep("quiz")} />
          )
        }
      >
        {step === "phrases" ? (
          <>
            <Text style={type.title}>আজকের বাক্য</Text>
            <Text style={[type.body, { color: palette.inkSoft }]}>প্রতিটি বাক্য শুনুন — স্বাভাবিক ও আস্তে গতিতে।</Text>
            {phrases.map((p) => (
              <PhraseCard key={p.id} phrase={p} onReport={setReporting} accent={palette.primary} />
            ))}
            {/* Preview the next step so "বলা" never feels hidden: a calm nudge toward the speaking exercise. */}
            <View style={styles.nextPreview}>
              <View style={styles.nextMic}>
                <Icon name="mic" size={20} color={palette.onPrimary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={type.bodyStrong} numberOfLines={1}>পরের ধাপ: নিজে বলুন</Text>
                <Text style={type.caption} numberOfLines={2}>শুনে নিয়ে “{speakPhrase.en}” বলুন — শব্দে শব্দে মিলিয়ে দেখবে।</Text>
              </View>
            </View>
          </>
        ) : (
          <>
            <Text style={type.title}>এবার বলুন</Text>
            <Text style={[type.body, { color: palette.inkSoft }]}>শুনে নিয়ে নিজে বলুন — শব্দে শব্দে মিলিয়ে দেখবে।</Text>
            <View style={styles.voiceNote}>
              <Icon name="lock" size={14} color={palette.primary} />
              <Text style={[type.caption, { color: palette.inkSoft, flex: 1 }]}>আপনার কণ্ঠ ফোনেই থাকে — শুধু লেখা টেক্সট মিলিয়ে দেখা হয়।</Text>
            </View>
            <SpeakingPanel phrase={speakPhrase} slow={s.profile.slowAudio} onPass={() => {}} />
          </>
        )}
      </FooterScreen>
      <ReportSheet phrase={reporting} onClose={() => setReporting(null)} />
    </>
  );
}

function DayComplete({ lesson, score, result, onClose }: { lesson: ReturnType<typeof getLesson>; score: number; result: LessonDone; onClose: () => void }) {
  const nav = useNav();
  const insets = useSafeAreaInsets();
  const s = useApp();
  const [remindSet, setRemindSet] = useState(false);
  if (!lesson) return null;
  const cp = courseProgress(s.progress, lesson.courseId);
  const course = getCourse(lesson.courseId);
  const nextLesson = cp.nextLessonId ? getLesson(cp.nextLessonId) : null;
  // Ask for notification permission HERE — after a win — not at install (QA + Play policy).
  const showRemind = !result.completedCourse && !s.profile.notificationsOn && !remindSet && !!nextLesson;
  const enableReminder = () => {
    appStore.set((st) => setReminder(st, "19:00"));
    setRemindSet(true);
    play("success", 0.6);
    void notify.ask().then((granted) => { if (granted) void scheduleDaily("19:00", appStore.get().streak.current); });
    toast("সন্ধ্যা ৭টায় রোজ মনে করিয়ে দেব 🔔");
  };

  return (
    <View style={styles.root}>
      <Confetti trigger={1} />
      <ScrollView contentContainerStyle={[styles.doneScroll, { paddingTop: insets.top + space.xl, paddingBottom: insets.bottom + space.xl }]}>
      <View style={styles.doneBody}>
        <Image source={art.ui_splash_bondhu} style={styles.doneArt} resizeMode="contain" accessibilityIgnoresInvertColors />
        <Text style={[type.display, styles.center]}>দিন {bn(lesson.day)} সম্পূর্ণ!</Text>
        <Text style={[type.body, styles.center, { color: palette.inkSoft }]}>{lesson.title_bn} — দারুণ করেছেন।</Text>
        <ScoreBadge score={score} size={96} />
        <View style={styles.doneStats}>
          <Animated.View entering={FadeIn.delay(150)} style={styles.doneStat}>
            <Icon name="flame" size={22} color={palette.accent} />
            <Text style={type.number}>{bn(s.streak.current)}</Text>
            <Text style={type.caption}>দিনের ধারা</Text>
          </Animated.View>
          <Animated.View entering={FadeIn.delay(300)} style={styles.doneStat}>
            <Icon name="checkCircle" size={22} color={palette.success} />
            <Text style={type.number}>{bn(cp.done)}/{bn(cp.total)}</Text>
            <Text style={type.caption}>দিন সম্পূর্ণ</Text>
          </Animated.View>
        </View>
        {result.newBadges.length ? (
          <View style={styles.badgePop}>
            <Icon name="award" size={18} color={palette.accent} />
            <Text style={[type.label, { color: palette.ink }]}>নতুন ব্যাজ খুলেছে!</Text>
          </View>
        ) : null}
      </View>
      <View style={{ gap: space.sm }}>
        {showRemind ? (
          <Animated.View entering={FadeIn.delay(450)} style={styles.remindCard}>
            <View style={styles.remindIcon}>
              <Icon name="bell" size={20} color={palette.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={type.bodyStrong} numberOfLines={1}>কাল: {nextLesson!.title_bn}</Text>
              <Text style={type.caption} numberOfLines={2}>রোজ একটি মৃদু রিমাইন্ডার — ধারা বাঁচিয়ে রাখুন।</Text>
            </View>
            <Button label="৭টা" size="sm" icon="bell" onPress={enableReminder} />
          </Animated.View>
        ) : null}
        {result.completedCourse ? (
          <Button label="সার্টিফিকেট দেখুন" size="lg" icon="award" onPress={() => nav.go({ name: "certificate", courseId: result.completedCourse! })} />
        ) : nextLesson ? (
          <Button label={`দিন ${bn(nextLesson.day)}: ${nextLesson.title_bn}`} size="lg" icon="arrowRight" onPress={() => nav.go({ name: "lesson", lessonId: nextLesson.id })} />
        ) : null}
        {lesson.scenarioId ? (
          <Button label="AI রোল-প্লে করুন" variant="secondary" icon="chat" onPress={() => nav.go({ name: "conversation", scenarioId: lesson.scenarioId! })} />
        ) : null}
        <Button label="বাড়ি ফিরুন" variant="ghost" onPress={onClose} />
      </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
  doneScroll: { flexGrow: 1, justifyContent: "space-between", paddingHorizontal: space.xl, gap: space.lg },
  doneBody: { alignItems: "center", gap: space.md, paddingVertical: space.lg },
  doneArt: { width: 160, height: 160 },
  center: { textAlign: "center" },
  doneStats: { flexDirection: "row", gap: space.lg, marginTop: space.sm },
  doneStat: { alignItems: "center", gap: 2, backgroundColor: palette.surface, borderRadius: radius.lg, paddingVertical: space.md, paddingHorizontal: space.xl, ...shadow },
  badgePop: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: palette.warningSoft, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 6, marginTop: space.sm },
  remindCard: { flexDirection: "row", alignItems: "center", gap: space.md, backgroundColor: palette.surface, borderRadius: radius.lg, padding: space.md, ...shadow },
  remindIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: palette.warningSoft, alignItems: "center", justifyContent: "center" },
  stepStrip: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingTop: 2 },
  stepItem: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 40, paddingHorizontal: space.sm, borderRadius: radius.pill, borderWidth: 1.5, borderColor: "transparent" },
  stepItemNow: { backgroundColor: palette.primarySoft, borderColor: palette.primary },
  stepDot: { width: 24, height: 24, borderRadius: 12, backgroundColor: palette.surfaceAlt, alignItems: "center", justifyContent: "center" },
  stepDotNow: { backgroundColor: palette.primary },
  stepDotDone: { backgroundColor: palette.success },
  voiceNote: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: palette.primarySoft, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.sm },
  nextPreview: { flexDirection: "row", alignItems: "center", gap: space.md, backgroundColor: palette.primarySoft, borderRadius: radius.lg, padding: space.md, marginBottom: space.md },
  nextMic: { width: 40, height: 40, borderRadius: 20, backgroundColor: palette.primary, alignItems: "center", justifyContent: "center" },
});
