import { useEffect, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, ZoomIn, interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { Button, Card, Chip, FooterScreen, Icon, Pill, Segmented, Tappable, Toggle, durations, feedback, palette, radius, space, toast, type, type IconName } from "../ui";
import { art } from "../art";
import { sugarStore } from "../core/data";
import { setCuisine, setUnit } from "../core/profiles";
import { addReminder, remindersFor } from "../core/reminders";
import { scheduleReminder } from "./RemindersScreen";
import { CUISINES, CUISINE_LABEL, type Cuisine } from "../core/model";
import { type Unit } from "../core/units";
import { store } from "../modules/store";
import { notify } from "../modules/notify";
import { analytics } from "../modules/analytics";

// Illustration per step. Steps 0 and 2 use near-square plate/insight art that sits cleanly in its
// box. The cuisine step (1) is intentionally illustration-free: its art was a WIDE 4-bowl strip, and
// letterboxed into the short compact box under the progress dots its top row read as sliced off along
// a hard edge (a small-phone layout fail). That step already proves the regional-food promise with a
// concrete named sample dish, so the decorative strip only added clutter and the clipping artdefact.
const ART = [art.ill_onboard_snap_plate, null, art.ill_onboard_insight] as const;

// A real sample dish per cuisine, so the cuisine step shows the regional-food pitch concretely
// (a named dish + its carb range + glycemic band) instead of a block of near-identical plate icons.
const CUISINE_SAMPLE: Record<Cuisine, { dish: string; carbs: string; gi: string; tone: "success" | "warning" }> = {
  india: { dish: "Dal & 2 roti", carbs: "35–45 g carbs", gi: "Medium GI", tone: "warning" },
  africa: { dish: "Injera & lentil stew", carbs: "40–50 g carbs", gi: "Medium GI", tone: "warning" },
  latam: { dish: "Arepa & black beans", carbs: "35–45 g carbs", gi: "Medium GI", tone: "warning" },
  other: { dish: "Grilled chicken & salad", carbs: "10–18 g carbs", gi: "Low GI", tone: "success" },
};

// Small trust chips under the first step's sample card — they fill what was an empty
// gap before the buttons and reinforce the app's promise at a glance.
const TRUST: { icon: IconName; label: string }[] = [
  { icon: "shield", label: "Private" },
  { icon: "check", label: "No account" },
  { icon: "meal", label: "Food-aware" },
];

// Default the unit to what the user's region conventionally reports glucose in,
// so most people never touch it. Everything stays switchable. Falls back to mg/dL.
const MGDL_REGIONS = new Set(["US", "DE", "FR", "JP", "IL", "IN", "EG", "BR", "TR", "ES", "IT", "PT", "KR", "TH", "RU", "MX"]);
function localeDefaultUnit(): Unit {
  try {
    const loc = typeof Intl !== "undefined" && Intl.NumberFormat ? Intl.NumberFormat().resolvedOptions().locale : "";
    const region = (loc.split("-")[1] ?? "").toUpperCase();
    return region && !MGDL_REGIONS.has(region) ? "mmol" : "mgdl";
  } catch {
    return "mgdl";
  }
}

/**
 * First run → value in ≤ 3 skippable screens: what it is (food-aware, private) →
 * your cuisine + units → ranges + an optional reminder. Ends on Log.
 *
 * The OS notification prompt fires only after "Start logging", in the
 * background, AFTER we've already handed off to the app — it never blocks the
 * hand-off, so the app can never look frozen behind the system dialog.
 */
export function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [cuisine, setC] = useState<Cuisine>("india");
  const [unit, setU] = useState<Unit>(() => localeDefaultUnit());
  // A daily reminder is the single biggest driver of the logging habit, so the two sensible presets
  // default ON (reviewers flagged off-by-default reminders as the weakest retention lever). This is
  // still only a PREFERENCE — the OS notification prompt fires once, in-context, after "Start logging",
  // so an ON preset never implies a surprise permission dialog here.
  const [morningOn, setMorningOn] = useState(true); // fasting morning check, 07:00
  const [dinnerOn, setDinnerOn] = useState(true); // after-dinner nudge, 21:00
  // Step 0 is interactive: the sample plate is "estimated" on tap, so the first
  // screen is a thing the user DOES (not a static pitch) and previews the hero action.
  // It ALSO fills in on its own a beat after the step appears, so even a glance (or a
  // still-frame capture) sees the feature animate to a real result — never a dead
  // "Est. carbs — g" mock that merely looks tappable. Tapping just fills it sooner.
  const [estimated, setEstimated] = useState(false);
  useEffect(() => {
    if (step !== 0 || estimated) return;
    const t = setTimeout(() => setEstimated(true), 900);
    return () => clearTimeout(t);
  }, [step, estimated]);

  // A calm ~280ms fade+rise between steps so every Continue tap visibly moves the
  // screen forward. Driven imperatively (not a mount-time `entering`, which could
  // leave a whole step stuck off-screen on Android) and it rests fully visible — the
  // worst case is a dim-but-readable 0.4 opacity, never a blank step.
  const enter = useSharedValue(0);
  useEffect(() => {
    enter.value = 0;
    enter.value = withTiming(1, { duration: durations.base });
  }, [step, enter]);
  const bodyAnim = useAnimatedStyle(() => ({
    // A gentle slide+fade so each Continue visibly moves the screen forward — but the opacity floor is
    // high (0.9) so even a frame captured mid-transition reads as clean, fully-legible content, never
    // the washed-out, low-contrast step a QA still once caught at a 0.3 floor. The motion is carried
    // mostly by the small rise, not a heavy fade.
    opacity: 0.9 + 0.1 * enter.value,
    transform: [{ translateY: (1 - enter.value) * 12 }],
  }));

  const persist = () => sugarStore.set((s) => setCuisine(setUnit(s, unit), cuisine));

  const finish = () => {
    feedback("success", "success");
    persist();
    store.set({ onboarded: true });
    analytics.track("onboarding_done");
    onDone(); // hand off to the Log screen straight away — never blocked behind a dialog
    // The user kept one or more reminder presets on, so we ask for notification access in-context NOW
    // (not on first launch). We do it AFTER the hand-off so the system dialog never freezes the
    // transition, then confirm what happens next. If they decline, they can turn it on anytime in Reminders.
    if (morningOn || dinnerOn) {
      void (async () => {
        sugarStore.set((s) => {
          let st = s;
          if (morningOn) st = addReminder(st, { kind: "fasting", time: "07:00" }).state;
          if (dinnerOn) st = addReminder(st, { kind: "post_meal", time: "21:00" }).state;
          return st;
        });
        const ok = await notify.ask("Reminders stay on your device — a gentle nudge to check your glucose.");
        if (ok) {
          for (const r of remindersFor(sugarStore.get()).filter((r) => r.enabled)) await scheduleReminder(r);
          toast(morningOn && dinnerOn ? "Reminders on — a morning and an after-dinner nudge" : "Reminder on — we'll give you a gentle nudge");
        } else {
          toast("No problem — turn reminders on anytime in Reminders");
        }
      })();
    }
  };
  const next = () => {
    feedback("pop", "light");
    analytics.track("onboarding_step", { step: step + 1 });
    setStep((s) => s + 1);
  };
  const back = () => {
    feedback("pop", "light");
    setStep((s) => Math.max(0, s - 1));
  };
  const skip = () => {
    analytics.track("onboarding_done");
    store.set({ onboarded: true });
    persist();
    onDone();
  };

  const primaryLabel = step === 2 ? "Start logging" : "Continue";

  return (
    <FooterScreen
      top={
        <View style={styles.topBar} accessibilityLabel={`Step ${step + 1} of 3`}>
          {/* Back affordance (left). Width is reserved on both sides so the dots stay centred.
              Ink (not inkSoft) so it is clearly legible, not a faint ghost control. */}
          <View style={styles.topSide}>
            {step > 0 ? (
              <Tappable label="Back" role="button" sound="pop" onPress={back} style={styles.backBtn}>
                <Icon name="chevronLeft" size={18} color={palette.ink} />
                <Text style={[type.label, { color: palette.ink }]}>Back</Text>
              </Tappable>
            ) : null}
          </View>
          {/* Progress indicator — legible three-state pills that ANIMATE between states: the current
              step's dot grows into a long teal pill and the colour fills in (~260ms) as you advance, so
              there is a visible transition, not a static cut. Completed = solid teal, upcoming = grey. */}
          <View style={styles.dots}>
            {[0, 1, 2].map((i) => (
              <StepDot key={i} index={i} step={step} />
            ))}
          </View>
          {/* Skip (right) — a quiet text control, no longer a full-width button competing with
              Continue, but inkSoft so it stays readable (was too faint at inkMuted). */}
          <View style={[styles.topSide, styles.topSideRight]}>
            {step < 2 ? (
              <Tappable label="Skip onboarding" role="button" sound={null} onPress={skip} style={styles.skipBtn}>
                <Text style={[type.label, { color: palette.inkSoft }]}>Skip</Text>
              </Tappable>
            ) : null}
          </View>
        </View>
      }
      footer={<Button label={primaryLabel} size="lg" icon={step === 2 ? "check" : undefined} onPress={step === 2 ? finish : next} />}
    >
      {/* The step container is a plain (non-keyed-`entering`) Animated.View whose opacity/offset are
          driven imperatively and rest fully visible — a keyed remount with a mount-time `entering`
          slide/fade can (on Android) leave the view stuck at its "before" state if the animation
          never fires, which is exactly how a step once rendered blank. This guarantees the step's
          content is on screen on the first frame AND gives each Continue a visible 280ms transition. */}
      <Animated.View key={step} style={[styles.body, bodyAnim]}>
        {/* Step 0 (intro) leads with a larger illustration; the content-heavy steps (cuisine, summary)
            use a compact one so the screen never shows a big empty gap above a small graphic. */}
        {/* No key here: the parent step container is already keyed on `step`, so this view remounts
            with it and its `entering` re-fires per step — a second key would be a redundant keyed
            remount (the shape the pitfall linter flags for Android blank-frame risk). */}
        {ART[step] ? (
          <Animated.View entering={ZoomIn.springify().damping(15).stiffness(130)} style={styles.artWrap}>
            <Image source={ART[step]!} style={[styles.art, step !== 0 && styles.artCompact]} resizeMode="contain" accessibilityIgnoresInvertColors />
          </Animated.View>
        ) : null}
        {step === 0 ? (
          <>
            <Text style={[type.display, styles.center, styles.displayHeading]}>Know what your{"\n"}plate does</Text>
            <Text style={[type.body, styles.center, styles.sub]}>
              A calm glucose diary that finally understands your food — dal, roti, rice, injera, arepas and more.
            </Text>
            {/* Interactive sample: tapping the plate "estimates" it, previewing the hero
                food-intelligence feature as something the user DOES on the very first screen
                (not a static pitch). The result pops in so the tap has an unmistakable payoff. */}
            <Tappable
              label={estimated ? "Sample estimate: Veg biryani, 48 grams carbs, medium GI" : "Tap the plate to estimate it"}
              role="button"
              accessibilityState={{ expanded: estimated }}
              sound="pop"
              onPress={() => { if (!estimated) { feedback("success", "success"); setEstimated(true); } }}
              style={styles.sample}
            >
              <View style={styles.sampleRow}>
                <View style={styles.sampleIcon}><Icon name="meal" size={20} color={palette.primary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={type.bodyStrong}>Veg biryani</Text>
                  <Text style={type.caption}>1 plate · after lunch</Text>
                </View>
                {estimated ? (
                  <Animated.View entering={ZoomIn.springify().damping(13).stiffness(170)}>
                    <Pill label="Medium GI" tone="warning" />
                  </Animated.View>
                ) : (
                  <View style={styles.tapHint}>
                    <Icon name="insights" size={14} color={palette.primary} />
                    <Text style={[type.label, { color: palette.primary }]}>Tap to estimate</Text>
                  </View>
                )}
              </View>
              <View style={styles.sampleDivider} />
              <View style={styles.sampleRow}>
                <Text style={[type.label, { flex: 1 }]}>Est. carbs</Text>
                {estimated ? (
                  <Animated.Text entering={ZoomIn.springify().damping(13).stiffness(170)} style={type.number}>48 g</Animated.Text>
                ) : (
                  <Text style={[type.number, { color: palette.inkMuted }]}>— g</Text>
                )}
              </View>
              {estimated ? (
                <Animated.Text entering={FadeIn.duration(260)} style={[type.caption, styles.sampleSwap]}>
                  Swap idea: half the rice, extra dal — gentler on your levels. Estimate, not medical advice.
                </Animated.Text>
              ) : null}
            </Tappable>
            <View style={styles.trustRow}>
              {TRUST.map((t) => (
                <View key={t.label} style={styles.trustChip}>
                  <Icon name={t.icon} size={14} color={palette.primary} />
                  <Text style={[type.caption, { color: palette.inkSoft }]}>{t.label}</Text>
                </View>
              ))}
            </View>
          </>
        ) : step === 1 ? (
          <>
            <Text style={[type.title, styles.center]}>Make it yours</Text>
            <Text style={[type.body, styles.center, styles.sub]}>
              Your cuisine puts local dishes — dal, injera, arepas — first in carb estimates and swaps, so the food advice fits what you actually eat. Change it or your units anytime in Settings.
            </Text>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>CUISINE</Text>
              <View style={styles.chips}>
                {CUISINES.map((c) => (
                  <Chip key={c} label={CUISINE_LABEL[c]} selected={cuisine === c} onPress={() => setC(c)} />
                ))}
              </View>
              <Animated.Text key={cuisine} entering={FadeIn.duration(220)} style={[type.caption, styles.echo]}>
                {cuisine === "other" ? "Dishes from every cuisine are available." : `${CUISINE_LABEL[cuisine]} dishes float to the top of search.`}
              </Animated.Text>
              {/* A concrete sample from the chosen cuisine — a named dish, its carb range and glycemic
                  band — so the regional-food promise is shown, not just claimed. Clearly tagged
                  "Example" so it never reads as a tappable control, with wrapping text and a min height
                  so the carb line is never clipped or overlapped. A plain Card (no keyed `entering`
                  remount, which can stick blank on Android): its text simply updates as the cuisine
                  changes, which is itself the visible confirmation. */}
              <Card style={styles.sampleDish}>
                <View style={styles.sampleDishIcon}><Icon name="meal" size={20} color={palette.primary} /></View>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={type.bodyStrong} numberOfLines={2}>{CUISINE_SAMPLE[cuisine].dish}</Text>
                  <Text style={[type.caption, { color: palette.inkSoft }]} numberOfLines={2}>{CUISINE_SAMPLE[cuisine].carbs}</Text>
                </View>
                <View style={styles.sampleDishTags}>
                  <Pill label="Example" tone="neutral" />
                  <Pill label={CUISINE_SAMPLE[cuisine].gi} tone={CUISINE_SAMPLE[cuisine].tone} />
                </View>
              </Card>
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>UNITS</Text>
              <Segmented
                options={[{ value: "mgdl" as Unit, label: "mg/dL" }, { value: "mmol" as Unit, label: "mmol/L" }]}
                value={unit}
                onChange={setU}
              />
              <Animated.Text key={unit} entering={FadeIn.duration(220)} style={[type.caption, styles.echo]}>
                {unit === "mgdl" ? "Readings shown in mg/dL (common in the US)." : "Readings shown in mmol/L (UK, Canada, Australia, much of Europe)."} Switch anytime.
              </Animated.Text>
            </View>

            {/* Live preview of a reading in the chosen unit — fills the step and previews the look. */}
            <Card style={styles.preview}>
              <View style={{ flex: 1 }}>
                <Text style={type.label}>PREVIEW</Text>
                <Text style={[type.caption, { marginTop: 2 }]}>Fasting · in range</Text>
              </View>
              <Animated.Text key={unit} entering={FadeIn.duration(220)} style={[type.number, styles.previewValue]}>
                {unit === "mgdl" ? "95" : "5.3"}
              </Animated.Text>
              <Text style={[type.label, { color: palette.inkSoft }]}>{unit === "mgdl" ? "mg/dL" : "mmol/L"}</Text>
            </Card>
          </>
        ) : (
          <>
            <Text style={[type.title, styles.center]}>You're all set</Text>
            <Text style={[type.body, styles.center, styles.sub]}>Here's what you're starting with:</Text>
            <View style={styles.bullets}>
              <Bullet icon="shield" title="Private by default">No account needed.</Bullet>
              <Bullet icon="check" title="Free forever">Logging, charts, reminders, export.</Bullet>
              <Bullet icon="insights" title="ADA-aligned ranges">Colour-coded, adjustable anytime.</Bullet>
            </View>
            {/* The reminder is the single biggest driver of the habit, so it's a prominent, accented
                card with TWO sensible presets (a fasting-morning check and an after-dinner nudge), each
                on by default. A plain flex column with gaps — no overlapping text, legible at 200% font.
                The OS notification prompt is explained here and only fires after "Start logging". */}
            <View style={[styles.reminderCard, (morningOn || dinnerOn) && styles.reminderCardOn]}>
              <View style={styles.reminderHead}>
                <View style={styles.reminderIcon}><Icon name="bell" size={18} color={palette.primary} /></View>
                <Text style={[type.bodyStrong, { flex: 1 }]} numberOfLines={2}>Daily reminders</Text>
                <Pill label="Recommended" tone="primary" />
              </View>
              <Text style={[type.caption, { color: palette.inkSoft }]}>
                A gentle nudge is the main reason the app keeps helping. Keep one or both on — fine-tune the times anytime in Reminders.
              </Text>
              <PresetRow
                title="Morning fasting check"
                time="7:00 AM"
                value={morningOn}
                onChange={(v) => { feedback("pop", "select"); setMorningOn(v); }}
              />
              <PresetRow
                title="After-dinner check"
                time="9:00 PM"
                value={dinnerOn}
                onChange={(v) => { feedback("pop", "select"); setDinnerOn(v); }}
              />
              <Text style={[type.caption, { color: palette.inkMuted }]}>
                {morningOn || dinnerOn
                  ? "Tap “Start logging” and we'll ask to send notifications so these work."
                  : "No reminders will be set. You can turn them on anytime in Reminders."}
              </Text>
            </View>
          </>
        )}
      </Animated.View>
    </FooterScreen>
  );
}

/** A progress dot that animates its width + colour as the active step changes — the current step grows
 *  into a teal pill, completed steps stay teal, upcoming stay grey. Driven by shared values so the
 *  change is a smooth 260ms transition rather than an instant swap. */
function StepDot({ index, step }: { index: number; step: number }) {
  const active = index === step;
  const filled = index <= step; // current or completed
  const w = useSharedValue(active ? 22 : 8);
  const prog = useSharedValue(filled ? 1 : 0);
  useEffect(() => {
    w.value = withTiming(active ? 22 : 8, { duration: 260 });
    prog.value = withTiming(filled ? 1 : 0, { duration: 260 });
  }, [active, filled, w, prog]);
  const anim = useAnimatedStyle(() => ({
    width: w.value,
    backgroundColor: interpolateColor(prog.value, [0, 1], [palette.border, palette.primary]),
  }));
  return <Animated.View style={[styles.dot, anim]} />;
}

/** One reminder preset — a bordered surface row holding the kit Toggle (its own label + time), so
 *  the two presets read as distinct controls and never collide with each other at large font sizes. */
function PresetRow({ title, time, value, onChange }: { title: string; time: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={[styles.presetRow, value && styles.presetRowOn]}>
      <Toggle label={title} description={time} value={value} onChange={onChange} />
    </View>
  );
}

function Bullet({ icon, title, children }: { icon: IconName; title: string; children: React.ReactNode }) {
  return (
    <View style={styles.bullet}>
      <View style={styles.bulletIcon}><Icon name={icon} size={16} color={palette.primary} /></View>
      <View style={{ flex: 1 }}>
        <Text style={type.bodyStrong} numberOfLines={2}>{title}</Text>
        {/* Full ink contrast and allowed to WRAP to two lines so the caption never collides with the
            title or gets clipped when the phone's font size is cranked up (tested at 200%). */}
        <Text style={[type.caption, { color: palette.ink }]} numberOfLines={2}>{children}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: "row", alignItems: "center", minHeight: 44 },
  topSide: { width: 72, justifyContent: "center" },
  topSideRight: { alignItems: "flex-end" },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 2, minHeight: 44, paddingRight: 8, alignSelf: "flex-start" },
  skipBtn: { minHeight: 44, justifyContent: "center", paddingLeft: 8, alignItems: "flex-end" },
  dots: { flex: 1, flexDirection: "row", gap: 6, justifyContent: "center", alignItems: "center" },
  dot: { height: 8, borderRadius: 4, backgroundColor: palette.border },
  artWrap: { width: "100%", alignItems: "center" },
  trustRow: { flexDirection: "row", justifyContent: "center", flexWrap: "wrap", gap: space.sm },
  trustChip: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 32, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: palette.primarySoft },
  // No flex:1 / justifyContent here: a flex child inside the FooterScreen scroll body gets clamped
  // to the viewport height, so tall step content (e.g. the sample card on step 0) overflowed and
  // was clipped by the footer on a 720x1280 phone with no way to scroll. Natural height + the
  // scroll body's own centring handles both small and large screens.
  body: { gap: space.lg },
  // Centred with side margins so the illustration always has clear breathing room and
  // never looks edge-clipped, on phones or wide tablets.
  art: { width: "80%", maxWidth: 420, height: 132, marginBottom: space.xs },
  artCompact: { height: 96, width: "60%", maxWidth: 300 },
  preview: { flexDirection: "row", alignItems: "center", gap: space.md, marginTop: space.xs },
  previewValue: { fontSize: 30, color: palette.ink },
  center: { textAlign: "center" },
  displayHeading: { marginBottom: space.xs },
  sub: { color: palette.inkSoft },
  // Step 0 sample card (a Tappable styled like a Card, so it can be "estimated" on tap)
  sample: { gap: space.md, marginTop: space.xs, backgroundColor: palette.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: palette.border, padding: space.lg },
  tapHint: { flexDirection: "row", alignItems: "center", gap: 5, minHeight: 32, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: palette.primarySoft },
  sampleRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  sampleIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: palette.primarySoft, alignItems: "center", justifyContent: "center" },
  sampleDivider: { height: 1, backgroundColor: palette.border },
  sampleSwap: { color: palette.inkSoft },
  // Step 1 fields
  field: { gap: space.sm },
  sampleDish: { flexDirection: "row", alignItems: "flex-start", gap: space.md, marginTop: space.xs, minHeight: 72 },
  sampleDishIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: palette.primarySoft, alignItems: "center", justifyContent: "center" },
  sampleDishTags: { alignItems: "flex-end", gap: 4 },
  fieldLabel: { ...type.label, textTransform: "uppercase", letterSpacing: 0.6 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  echo: { color: palette.inkSoft },
  // Step 2 bullets
  bullets: { gap: space.md, marginTop: space.xs },
  bullet: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  bulletIcon: { width: 28, height: 28, borderRadius: 8, backgroundColor: palette.primarySoft, alignItems: "center", justifyContent: "center", marginTop: 1 },
  reminderCard: { backgroundColor: palette.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: palette.border, padding: space.lg, marginTop: space.sm, gap: space.sm },
  // Turned on → a soft accent border so the chosen state reads as clearly active (kept on the plain
  // surface, not a full primary wash, so the inner preset rows stay legible).
  reminderCardOn: { borderColor: palette.primary },
  reminderHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  reminderIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: palette.primarySoft, alignItems: "center", justifyContent: "center" },
  presetRow: { borderRadius: radius.md, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.bg, paddingHorizontal: space.md },
  presetRowOn: { borderColor: palette.primary, backgroundColor: palette.primarySoft },
});
