import { useState } from "react";
import { Image, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Animated, { FadeInRight, FadeOutLeft } from "react-native-reanimated";
import { Button, Card, FooterScreen, Icon, Segmented, Tappable, feedback, palette, radius, space, toast, type } from "../ui";
import { art } from "../art";
import { STARTER_TEMPLATES } from "../core/model";
import { createFromStarter, applyTemplate } from "../core/templates";
import { dateKey } from "../core/time";
import { blockDayStore } from "../core/data";
import { settingsStore } from "../core/data";
import { store } from "../modules/store";
import { analytics } from "../modules/analytics";
import { notify } from "../modules/notify";

type StarterChoice = "workday" | "study" | "empty";

/**
 * First run → first plan in under a minute, in ≤ 3 skippable screens:
 * what it is → pick a starting routine + block length → optional reminders.
 * Finishing lands on Today with the core action (add/start a block) one tap away.
 */
export function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [starter, setStarter] = useState<StarterChoice>("workday");
  const [dur, setDur] = useState(60);
  const [remind, setRemind] = useState(false);
  // Short phones (e.g. 360×640dp): the routine-picker step is the tallest, and a
  // full-height illustration pushed its last option card under the scroll fade.
  // Drop the decorative art and tighten gaps on short screens so every step fits
  // the viewport with no overflow (hence no fade covering a card).
  const { height } = useWindowDimensions();
  const short = height < 720;
  const gap = short ? space.md : space.lg;

  const next = () => {
    feedback("pop", "light");
    analytics.track("onboarding_step", { step: step + 1 });
    setStep((s) => s + 1);
  };

  const finish = (apply: boolean) => {
    settingsStore.set((s) => ({ ...s, defaultDurationMin: dur, remindersEnabled: remind }));
    if (apply && starter !== "empty") {
      const st = STARTER_TEMPLATES.find((t) => t.key === starter);
      if (st) {
        const today = dateKey(new Date());
        const made = createFromStarter(blockDayStore.get(), st, today);
        if (made.id) blockDayStore.set(applyTemplate(made.state, made.id, today, "merge", "auto", today).state);
      }
    }
    feedback("success", "success");
    store.set({ onboarded: true });
    analytics.track("onboarding_done");
    onDone();
  };

  const enableReminders = async () => {
    const granted = await notify.requestPermission();
    setRemind(granted);
    feedback(granted ? "success" : "pop", granted ? "success" : "warning");
    toast(granted ? "Reminders on — we’ll nudge you at each block" : "No problem — turn reminders on anytime in Settings");
  };

  const footer =
    step === 0 ? (
      <>
        <Button label="Get started" size="lg" onPress={next} />
        <Button label="Skip" variant="ghost" sound={null} onPress={() => finish(false)} style={styles.flat} />
      </>
    ) : step === 1 ? (
      <>
        <Button label="Continue" size="lg" onPress={next} />
        <Button label="Skip setup" variant="ghost" sound={null} onPress={() => finish(false)} style={styles.flat} />
      </>
    ) : (
      <>
        <Button label="Start planning" size="lg" icon="check" onPress={() => finish(true)} />
        <Button label="Maybe later" variant="ghost" sound={null} onPress={() => finish(true)} style={styles.flat} />
      </>
    );

  return (
    <FooterScreen
      top={
        <View style={styles.dots} accessibilityLabel={`Step ${step + 1} of 3`}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={[styles.dot, i === step && styles.dotOn]} />
          ))}
        </View>
      }
      footer={footer}
    >
      <Animated.View key={step} entering={FadeInRight.duration(240)} exiting={FadeOutLeft.duration(140)} style={[styles.body, { gap }]}>
        {step === 0 ? (
          <>
            <Image source={art.onboarding_1_drag_create} style={[styles.art, short && styles.artShort]} resizeMode="contain" accessibilityIgnoresInvertColors />
            <Text style={[type.display, styles.center]}>Plan your day{"\n"}in seconds</Text>
            <Text style={[type.body, styles.center, { color: palette.inkSoft }]}>
              A tactile timeline, not another to-do list — and it all works offline.
            </Text>
            <View style={styles.wins}>
              <WinRow icon="plus" title="Drag to create, stretch to resize" body="No forms — block out time with your thumb." />
              <WinRow icon="shift" title="Running late? Shift in one tap" body="Slide the rest of your day later, all at once." />
              <WinRow icon="flame" title="ADHD-friendly live cues" body="An Active Block banner counts you to the next switch." />
              <WinRow icon="lock" title="Offline, no account, no ads sneaking in" body="Your plan stays on your phone." />
            </View>
          </>
        ) : step === 1 ? (
          <>
            {short ? null : <Image source={art.onboarding_2_choose_defaults} style={styles.artSm} resizeMode="contain" accessibilityIgnoresInvertColors />}
            <Text style={[type.title, styles.center]}>Start with a routine</Text>
            <View style={{ gap: space.sm }}>
              <StarterRow label="Workday" sub="7 focused work blocks" active={starter === "workday"} color={palette.primary} onPress={() => setStarter("workday")} />
              <StarterRow label="Study day" sub="Study, practice & breaks" active={starter === "study"} color={palette.accent} onPress={() => setStarter("study")} />
              <StarterRow label="Start empty" sub="Build your day from scratch" active={starter === "empty"} color={palette.inkMuted} onPress={() => setStarter("empty")} />
            </View>
            <View style={{ gap: space.sm }}>
              <Text style={type.label}>Default block length</Text>
              <Segmented
                options={[{ value: "30", label: "30 min" }, { value: "45", label: "45 min" }, { value: "60", label: "60 min" }]}
                value={String(dur)}
                onChange={(v) => setDur(Number(v))}
              />
            </View>
          </>
        ) : (
          <>
            {short ? null : <Image source={art.onboarding_3_notifications} style={styles.artSm} resizeMode="contain" accessibilityIgnoresInvertColors />}
            <Text style={[type.title, styles.center]}>Never miss a block</Text>
            <Text style={[type.body, styles.center, { color: palette.inkSoft }]}>
              Optional reminders nudge you when a block starts, with a gentle heads-up before it ends. Your plan always works without them.
            </Text>
            <Button
              label={remind ? "Reminders enabled ✓" : "Enable reminders"}
              variant={remind ? "secondary" : "primary"}
              icon="bell"
              onPress={enableReminders}
            />
            <View style={styles.freeCard}>
              <View style={styles.freeHead}>
                <Icon name="check" size={16} color={palette.success} />
                <Text style={type.bodyStrong}>Free forever, no account</Text>
              </View>
              <Text style={[type.caption, styles.center, { color: palette.inkSoft }]}>
                Blocks, routines, reminders, insights, backup & offline use are all free. Pro (optional) adds advanced analytics, cloud sync & more AI — never the basics.
              </Text>
            </View>
          </>
        )}
      </Animated.View>
    </FooterScreen>
  );
}

function WinRow({ icon, title, body }: { icon: import("../ui").IconName; title: string; body: string }) {
  return (
    <View style={styles.winRow}>
      <View style={styles.winIcon}><Icon name={icon} size={18} color={palette.primary} /></View>
      <View style={{ flex: 1 }}>
        <Text style={type.bodyStrong}>{title}</Text>
        <Text style={type.caption}>{body}</Text>
      </View>
    </View>
  );
}

function StarterRow({ label, sub, active, color, onPress }: { label: string; sub: string; active: boolean; color: string; onPress: () => void }) {
  return (
    <Tappable label={label} role="checkbox" accessibilityState={{ checked: active }} sound="pop" onPress={onPress} style={[styles.starter, active && { borderColor: palette.primary, backgroundColor: palette.primarySoft }]}>
      <View style={[styles.starterBar, { backgroundColor: color }]} />
      <View style={{ flex: 1 }}>
        <Text style={type.bodyStrong}>{label}</Text>
        <Text style={type.caption}>{sub}</Text>
      </View>
      {active ? <Icon name="check" size={20} color={palette.primary} /> : null}
    </Tappable>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, justifyContent: "center", gap: space.lg },
  center: { textAlign: "center" },
  art: { width: "100%", height: 230, alignSelf: "center" },
  artShort: { height: 150 },
  artSm: { width: "100%", height: 150, alignSelf: "center" },
  dots: { flexDirection: "row", gap: 6, alignSelf: "center", paddingTop: space.sm },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: palette.border },
  dotOn: { width: 22, backgroundColor: palette.primary },
  wins: { gap: space.md, alignSelf: "stretch", backgroundColor: palette.surface, borderRadius: radius.lg, padding: space.lg },
  winRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  winIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: palette.primarySoft, alignItems: "center", justifyContent: "center" },
  starter: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, borderRadius: radius.lg, borderWidth: 1.5, borderColor: palette.border, backgroundColor: palette.surface },
  starterBar: { width: 6, height: 40, borderRadius: 3 },
  flat: { borderWidth: 0 },
  freeCard: { backgroundColor: palette.successSoft, borderRadius: radius.lg, padding: space.md, gap: 4 },
  freeHead: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm },
});
