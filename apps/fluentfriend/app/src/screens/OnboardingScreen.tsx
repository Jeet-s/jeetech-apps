import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, PixelRatio, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Animated, { Easing, FadeInDown, LinearTransition, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { Button, Chip, FooterScreen, Icon, IconButton, Tappable, durations, feedback, palette, radius, shadow, space, type } from "../ui";
import { bn } from "../util";
import { SpeakingPanel } from "./SpeakingPanel";
import { art } from "../art";
import { appStore } from "../core/data";
import { dateKey } from "../core/dates";
import { PLACEMENT_QUESTIONS, scorePlacement, skippedPlacement, type PlacementAnswers } from "../core/placement";
import { applyPlacement, markFirstPhrase, setReminder } from "../core/state";
import { getPhrase } from "../core/catalog";
import { store } from "../modules/store";
import { analytics } from "../modules/analytics";
import { review } from "../modules/review";
import { notify } from "../modules/notify";
import { scheduleDaily } from "../reminders";

const AHA_PHRASE = getPhrase("p_daily_001")!; // "My name is Rahul." — the name is swappable (below)
// The first spoken line shouldn't force a stranger's name on the learner (QA): offer a chip of common
// Bangladeshi + Indian names that substitutes into the phrase, so the first-minute moment is personal.
const NAMES: { en: string; bn: string }[] = [
  { en: "Rahul", bn: "রাহুল" },
  { en: "Riya", bn: "রিয়া" },
  { en: "Sadia", bn: "সাদিয়া" },
  { en: "Tanvir", bn: "তানভির" },
];
/** AHA_PHRASE with the chosen name swapped into the English, Bangla meaning and romanized lines. */
function phraseForName(name: { en: string; bn: string }) {
  return { ...AHA_PHRASE, en: `My name is ${name.en}.`, bn: `আমার নাম ${name.bn}।`, romanBn: `মাই নেম ইজ ${name.bn}` };
}
const REMINDER_TIMES = [
  { label: "সকাল ৮টা", value: "08:00" },
  { label: "দুপুর ১টা", value: "13:00" },
  { label: "সন্ধ্যা ৭টা", value: "19:00" },
  { label: "রাত ৯টা", value: "21:00" },
];

type Step = "welcome" | "placement" | "aha" | "reminder";
const ORDER: Step[] = ["welcome", "placement", "aha", "reminder"];
const GOAL_Q = PLACEMENT_QUESTIONS[0];
// Single, short labels — a two-line Bangla caption under a small icon got its 2nd line clipped
// by the scroll's soft bottom fade on a 720x1280 phone (QA layout_small). One line never clips.
const PICK_PREVIEW = [
  { icon: "chat" as const, label: "AI বন্ধু" },
  { icon: "volume" as const, label: "ধীর অডিও" },
  { icon: "download" as const, label: "অফলাইন" },
];

/**
 * First run → the aha moment with no login or permission wall: Bangla welcome →
 * 3-tap placement (skippable) → say your first phrase aloud → (after the win) an
 * optional daily reminder. Lands on Home.
 */
export function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<Step>("welcome");
  const [goal, setGoal] = useState<string | null>(null);
  const [spoke, setSpoke] = useState(false);
  const [name, setName] = useState(NAMES[0]); // the name spoken in the first phrase (swappable chip)
  const corePosted = useRef(false);

  const idx = ORDER.indexOf(step);
  const goTo = (s: Step) => {
    analytics.track("onboarding_step", { step: ORDER.indexOf(s) });
    setStep(s);
  };
  // A back affordance so a wrong goal (or any step) can be undone (QA onboarding: "no back
  // affordance, users can't undo a wrong goal").
  const goBack = () => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    if (idx > 0) goTo(ORDER[idx - 1]);
  };

  // The first phrase said aloud IS the app's core job — fire it the moment it passes so a
  // first-time user reaches "core_action" inside onboarding (not after a whole lesson quiz).
  const onFirstPhrase = () => {
    if (!corePosted.current) {
      corePosted.current = true;
      analytics.track("core_action", { feature: "speak_phrase" });
      review.actionCompleted();
    }
    setSpoke(true);
  };

  // One calm question in onboarding — the goal tap. The optional listen-and-pick level probes
  // live in the re-takeable "স্তর যাচাই" screen (Settings), so first-run stays light and fast.
  const placementComplete = !!goal;

  // Tapping a goal selects it and auto-advances after a short beat (so the choice is visible),
  // cutting the extra "Next" tap the QA flagged. The footer button stays as a fallback.
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (advanceTimer.current) clearTimeout(advanceTimer.current); }, []);
  const pickGoal = (value: string) => {
    setGoal(value);
    feedback("pop", "select");
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    // Advance almost immediately (QA: "a visible delay before auto-advance" felt laggy at ~560ms).
    // The filled on-state + check still flash before the step slides on, but the tap feels instant.
    advanceTimer.current = setTimeout(() => goTo("aha"), 140);
  };

  const finish = (reminder?: string) => {
    const answers: PlacementAnswers = { goal: (goal as PlacementAnswers["goal"]) ?? null, probes: [] };
    appStore.set((s) => {
      let next = applyPlacement(s, goal ? scorePlacement(answers) : skippedPlacement());
      if (spoke) next = markFirstPhrase(next, dateKey(new Date()));
      if (reminder) next = setReminder(next, reminder);
      return next;
    });
    if (reminder) {
      void notify.ask().then((ok) => {
        if (ok) void scheduleDaily(reminder, appStore.get().streak.current);
      });
      analytics.track("reminder_set");
    }
    feedback("success", "success");
    store.set({ onboarded: true });
    analytics.track("onboarding_done");
    onDone();
  };

  // Header: a back arrow + a labelled "ধাপ N/4" step counter over the progress dots, so a learner
  // always knows how far setup goes and can undo a wrong choice (QA onboarding fixes).
  const header = (
    <View style={styles.headerRow}>
      <IconButton icon="chevronLeft" label="পেছনে যান" onPress={goBack} />
      <View style={styles.headerCenter} accessibilityLabel={`ধাপ ${idx + 1} / ${ORDER.length}`}>
        <View style={styles.dots}>
          {ORDER.map((s, i) => (
            <Animated.View key={s} layout={LinearTransition.duration(260)} style={[styles.dot, i === idx && styles.dotOn, i < idx && styles.dotDone]} />
          ))}
        </View>
        <Text style={[type.caption, { color: palette.inkSoft }]}>ধাপ {bn(idx + 1)}/{bn(ORDER.length)}</Text>
      </View>
      <View style={styles.headerSpacer} />
    </View>
  );

  if (step === "welcome") {
    // The welcome must FIT above the pinned "শুরু করুন" button on a 360x640dp (720x1280 @ 320dpi)
    // phone — the previous pass merely shrank the art to 200 and still totalled ~1px over the scroll
    // box, so FooterScreen's centred body clipped the feature-promise row with no visible scroll
    // affordance (QA layout_small, repeat). Fix = size the illustration and vertical rhythm to the
    // actual window height so the whole column (art → headline → body → 3 promises) clears the footer
    // with real breathing room, and top-anchor the body so a near-full column can never centre-clip.
    return <WelcomeStep onStart={() => goTo("placement")} />;
  }

  if (step === "placement") {
    return (
      <FooterScreen
        top={header}
        footer={
          // Tapping a goal auto-advances — no "Next" button at all (QA: the Next appeared late and
          // contradicted the "proceeds automatically" hint). After a pick we show a calm "moving on"
          // indicator; before a pick, a hint + a clearly-visible secondary Skip button.
          placementComplete ? (
            // A real "moving on" transition state (spinner) so the step never looks frozen between
            // the tap and the next screen — QA saw the question screen repeat with no feedback.
            <View style={styles.ctaHint} accessibilityLabel="এগিয়ে যাচ্ছি">
              <ActivityIndicator size="small" color={palette.success} />
              <Text style={[type.label, { color: palette.success, flexShrink: 1 }]}>বেছে নেওয়া হয়েছে — এগিয়ে যাচ্ছি…</Text>
            </View>
          ) : (
            <>
              <View style={styles.ctaHint}>
                <Icon name="arrowRight" size={16} color={palette.inkSoft} />
                <Text style={[type.label, { color: palette.inkSoft, flexShrink: 1 }]}>উপরের একটি বেছে নিন — নিজে থেকেই এগিয়ে যাবে</Text>
              </View>
              <Button label="এড়িয়ে যান" variant="ghost" onPress={() => goTo("aha")} />
            </>
          )
        }
      >
        <StepFade step={step}>
          <View style={styles.placeHero}>
            <Text style={[type.title, styles.center]}>একটা ছোট্ট প্রশ্ন</Text>
            <Text style={[type.body, styles.center, { color: palette.inkSoft }]}>আপনার জন্য ঠিক পাঠ বেছে নিতে — শুধু একটা ট্যাপ।</Text>
          </View>

          <View style={styles.qCard}>
            <Text style={[type.heading, styles.center]}>{GOAL_Q.prompt_bn}</Text>
            {/* Full-width option rows (not wrapping pills, which left the 3rd chip dangling below).
                Tapping an option auto-advances after a short beat, so the goal step is a single tap. */}
            <View style={{ gap: space.sm }}>
              {GOAL_Q.options.map((o) => (
                <GoalOption key={o.value} label={o.label_bn} selected={goal === o.value} onPress={() => pickGoal(o.value)} />
              ))}
            </View>
          </View>
        </StepFade>
      </FooterScreen>
    );
  }

  if (step === "aha") {
    return (
      <FooterScreen
        top={header}
        contentStyle={styles.topAnchor}
        footer={
          // The hero action here is the MIC above — so before the first phrase we show a clearly
          // tappable "skip for now" (never a greyed, broken-looking "পরবর্তী" the QA flagged as
          // "looks disabled"), and after the win it flips to one enabled primary. Both are a single
          // full-width button, so the footer height never jumps.
          spoke ? (
            <Button label="দারুণ! এগিয়ে চলুন" size="lg" icon="arrowRight" onPress={() => goTo("reminder")} />
          ) : (
            <Button label="আপাতত এড়িয়ে যান" variant="ghost" icon="arrowRight" onPress={() => goTo("reminder")} />
          )
        }
      >
        <StepFade step={step}>
          <Text style={type.title}>নিজের পরিচয় দিন</Text>
          <Text style={[type.body, { color: palette.inkSoft }]}>আগে শুনুন, তারপর মাইকে চেপে নিজে বলুন। আপনার কণ্ঠ ফোনেই থাকে।</Text>
          {/* Pick the name you'll say — so the very first English sentence is about YOU, not a stranger
              called Rahul (QA). Swapping a chip rebuilds the phrase (and resets the panel via key). */}
          <View style={styles.nameRow}>
            <Text style={[type.label, { color: palette.inkSoft }]}>নাম বেছে নিন:</Text>
            <View style={styles.nameChips}>
              {NAMES.map((n) => (
                <Chip key={n.en} label={n.en} selected={name.en === n.en} onPress={() => { feedback("pop", "select"); setName(n); }} />
              ))}
            </View>
          </View>
          <SpeakingPanel key={name.en} phrase={phraseForName(name)} slow={false} onPass={onFirstPhrase} />
          {spoke ? (
            <Animated.View entering={FadeInDown.duration(durations.base)} style={styles.wonCard}>
              <View style={styles.wonIcon}>
                <Icon name="checkCircle" size={24} color={palette.success} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[type.bodyStrong, { color: palette.success }]}>দারুণ! প্রথম বাক্য বলা হয়ে গেছে 🎉</Text>
                <Text style={[type.caption, { color: palette.inkSoft }]}>নিচের বোতামে চেপে এগিয়ে চলুন।</Text>
              </View>
            </Animated.View>
          ) : null}
        </StepFade>
      </FooterScreen>
    );
  }

  return <ReminderStep header={header} onSkip={() => finish()} onSet={(t) => finish(t)} />;
}

/**
 * First-run welcome. Everything is sized to the live window so the art + headline + body + the three
 * app-promise icons always clear the pinned Start button — no scroll, no clipping — on a 360x640dp
 * small phone, while scaling up generously on tall phones and tablets.
 */
function WelcomeStep({ onStart }: { onStart: () => void }) {
  const { height } = useWindowDimensions();
  // Short phones (≈640dp tall) can't afford a 200px illustration above a two-line Bangla headline,
  // body paragraph and promise row AND the pinned footer — scale the art and the gap to the height.
  const compact = height < 720;
  // A bigger hero on tall phones so the welcome fills the screen instead of leaving a large void
  // between the promises and the CTA (QA: "a large empty gap … looks unfinished").
  const artSize = compact ? 120 : 232;
  const gap = compact ? space.md : space.lg;
  const titleLh = Math.round((compact ? 36 : 44) * Math.max(1, PixelRatio.getFontScale()));
  return (
    <FooterScreen
      // Tall phones: CENTRE the column so it sits balanced with no void above the pinned Start button.
      // Short phones: top-anchor so a near-full column reads top-down and the last promise row can
      // never centre-clip behind the footer (QA layout_small).
      contentStyle={{ ...styles.welcomeBody, gap, justifyContent: compact ? "flex-start" : "center" }}
      footer={<Button label="শুরু করুন" size="lg" icon="arrowRight" onPress={onStart} />}
    >
      <Image source={art.ill_onb_01_speak_from_day_one} style={{ width: artSize, height: artSize }} resizeMode="contain" accessibilityIgnoresInvertColors />
      <Text style={[type.display, styles.center, { lineHeight: titleLh }, compact && { fontSize: 28 }]}>আজই ইংরেজিতে{"\n"}কথা বলুন</Text>
      <Text style={[type.body, styles.center, { color: palette.inkSoft }]}>
        বাংলায় বুঝে, AI বন্ধুর সাথে কথা বলে ইংরেজি শিখুন। কোনো সাইন-আপ নেই — ৬০ সেকেন্ডেই প্রথম বাক্য বলুন।
      </Text>
      {/* The three app promises live HERE, attached to the welcome (QA: they floated unattached in
          empty space on the goal screen). A tidy row that reassures before the first question. */}
      <View style={styles.previewRow}>
        {PICK_PREVIEW.map((p) => (
          <View key={p.label} style={styles.previewItem}>
            <View style={styles.previewIcon}>
              <Icon name={p.icon} size={18} color={palette.primary} />
            </View>
            <Text style={[type.caption, styles.center, { color: palette.inkSoft }]} numberOfLines={1}>{p.label}</Text>
          </View>
        ))}
      </View>
    </FooterScreen>
  );
}

function ReminderStep({ header, onSkip, onSet }: { header: React.ReactNode; onSkip: () => void; onSet: (t: string) => void }) {
  const [time, setTime] = useState<string | null>(null);
  return (
    <FooterScreen
      top={header}
      contentStyle={styles.topAnchor}
      footer={
        <>
          <Button label="মনে করিয়ে দাও" size="lg" icon="bell" disabled={!time} onPress={() => time && onSet(time)} />
          <Button label="এখন নয়" variant="ghost" sound={null} style={{ borderWidth: 0 }} onPress={onSkip} />
        </>
      }
    >
      <StepFade step="reminder">
        <View style={styles.reminderHero}>
          <View style={styles.flame}>
            <Icon name="flame" size={30} color={palette.accent} />
          </View>
          <Text style={[type.title, styles.center]}>প্রতিদিন ৫ মিনিট</Text>
          <Text style={[type.body, styles.center, { color: palette.inkSoft }]}>
            আপনার সুবিধামতো একটা সময় বেছে নিন — দিনে মাত্র একটি মৃদু রিমাইন্ডার। যখন খুশি বন্ধ করা যাবে।
          </Text>
        </View>
        <View style={styles.optWrap}>
          {REMINDER_TIMES.map((r) => (
            <Chip key={r.value} label={r.label} selected={time === r.value} onPress={() => setTime(r.value)} />
          ))}
        </View>
      </StepFade>
    </FooterScreen>
  );
}

/**
 * A gentle rise between onboarding steps (QA: "content snaps between steps"). It starts at 0.92
 * opacity — NEVER low enough to read as a washed-out / ghosted transition frame (QA caught the old
 * 0.55 mid-fade and called it ghosted) — and animates step CONTENT inside the stable FooterScreen
 * (the route/step container itself stays a plain View). Keyed by step so each step replays the
 * motion; no `entering=` so it never sticks blank on Android.
 */
function StepFade({ step, children }: { step: string; children: React.ReactNode }) {
  return <StepFadeInner key={step}>{children}</StepFadeInner>;
}
function StepFadeInner({ children }: { children: React.ReactNode }) {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withTiming(1, { duration: durations.base, easing: Easing.out(Easing.cubic) });
  }, [v]);
  // Opacity-only (no translateY) so the title never shifts position between steps — QA caught a
  // ~10px vertical jump (y 117 vs 107) when content animated in.
  const anim = useAnimatedStyle(() => ({ opacity: 0.92 + 0.08 * v.value }));
  return <Animated.View style={[{ gap: space.lg }, anim]}>{children}</Animated.View>;
}

/**
 * Full-width selectable goal row — a RADIO tile, not a navigation row: a leading radio dot (filled +
 * checked when chosen), a clear filled on-state, and NO trailing chevron (the chevron read as "opens
 * another screen" — QA). role="radio" so assistive tech announces single-choice selection.
 */
function GoalOption({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Tappable
      label={label}
      role="radio"
      accessibilityState={{ selected }}
      sound={null}
      scale={0.96}
      ripple
      onPress={onPress}
      style={[styles.goalRow, selected && styles.goalRowOn]}
    >
      <View style={[styles.radio, selected && styles.radioOn]}>
        {selected ? <Icon name="check" size={14} color={palette.onPrimary} /> : null}
      </View>
      <Text style={[type.bodyStrong, { flex: 1, color: selected ? palette.onPrimary : palette.ink }]} numberOfLines={1}>{label}</Text>
    </Tappable>
  );
}

const styles = StyleSheet.create({
  // Top-anchored + a little top breathing room so the welcome column reads top-down and the promise
  // row never falls under the pinned footer on a short phone (gap is set responsively at the call site).
  welcomeBody: { alignItems: "center", justifyContent: "flex-start", paddingTop: space.sm },
  center: { textAlign: "center" },
  // Extra leading so the two-line Bangla headline never overlaps itself or the body (QA: "headline
  // text overlaps body text"). Bangla conjuncts need more vertical room than the Latin default.
  welcomeTitle: { lineHeight: 44 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
  headerCenter: { flex: 1, alignItems: "center", gap: 6 },
  headerSpacer: { width: 48 }, // balances the back IconButton so the step counter stays centred
  dots: { flexDirection: "row", gap: 6, alignSelf: "center" },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: palette.border },
  dotOn: { width: 22, backgroundColor: palette.primary },
  dotDone: { backgroundColor: palette.primary },
  // Top-anchor every FooterScreen step so the body doesn't float to the vertical centre on short
  // steps (placement/reminder) while tall steps (aha) sit at the top — QA: "vertical anchoring is
  // inconsistent between screens".
  topAnchor: { justifyContent: "flex-start" },
  placeHero: { gap: space.xs, alignItems: "center" },
  qCard: { backgroundColor: palette.surface, borderRadius: radius.lg, padding: space.lg, gap: space.md, ...shadow },
  goalRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: 50,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  goalRowOn: { backgroundColor: palette.primary, borderColor: palette.primary },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: palette.border, alignItems: "center", justifyContent: "center", backgroundColor: palette.surface },
  radioOn: { backgroundColor: palette.success, borderColor: palette.success },
  nameRow: { gap: space.sm },
  nameChips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  previewRow: { flexDirection: "row", gap: space.sm, paddingHorizontal: space.xs, alignSelf: "stretch", marginTop: space.xs },
  previewItem: { flex: 1, alignItems: "center", gap: 6 },
  previewIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: palette.primarySoft, alignItems: "center", justifyContent: "center" },
  optWrap: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  ctaHint: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 56, paddingHorizontal: space.lg },
  wonCard: { flexDirection: "row", alignItems: "center", gap: space.md, backgroundColor: palette.successSoft, borderRadius: radius.lg, padding: space.md },
  wonIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: palette.surface, alignItems: "center", justifyContent: "center" },
  reminderHero: { alignItems: "center", gap: space.sm },
  flame: { width: 64, height: 64, borderRadius: 32, backgroundColor: palette.warningSoft, alignItems: "center", justifyContent: "center" },
});
