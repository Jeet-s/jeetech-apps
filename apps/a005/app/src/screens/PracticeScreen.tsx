import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  Button,
  Card,
  Chip,
  HeroCard,
  Icon,
  Pill,
  ProgressBar,
  ProgressRing,
  Screen,
  SectionHeader,
  Sheet,
  Tappable,
  feedback,
  gradient,
  palette,
  radius,
  shadowStrong,
  space,
  type,
} from "../ui";
import type { ScreenProps } from "./nav";
import { bandUpStore, useBandUp } from "../core/data";
import { useSettings } from "../modules/store";
import { daysUntilTest, scoredAttempts, FREE_DAILY_SCORES, type Construct, type TaskType } from "../core/model";
import { dailyPlan, countdownLabel } from "../core/plan";
import { creditInfo } from "../core/credits";
import { suggestDrillConstruct, weakestConstruct, startDrill, taskForConstruct } from "../core/insights";
import { CONSTRUCT_LABEL } from "../core/model";
import { pickQuestions, questionsByTask, topicsForTask, filterQuestions } from "../core/questions";

const dateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
// Exam-accurate set lengths: the 2026 Listen & Repeat task runs 7 items, the
// Interview 4. Both sequences are ordered to GET HARDER (see startTask).
const SET_COUNT: Record<TaskType, number> = { repeat: 7, interview: 4 };

// Illustrative rubric bars for the first-run "what your score looks like" preview.
const SAMPLE_RUBRIC: { label: string; value: number }[] = [
  { label: "Fluency", value: 0.8 },
  { label: "Intelligibility", value: 0.72 },
  { label: "Repeat accuracy", value: 0.86 },
];

/** Practice home: exam countdown + estimated band, the ~10-min daily plan, the
 *  two task cards (with topic filter), credits, and the weak-spot drill. */
export function PracticeScreen({ bottomInset, onPro, onStart, onTab }: ScreenProps) {
  const data = useBandUp();
  const settings = useSettings();
  const today = dateKey(new Date());
  const [picker, setPicker] = useState<TaskType | null>(null);

  const credits = creditInfo(data, today, settings.pro);
  const plan = dailyPlan(data, today, settings.pro);
  const scored = scoredAttempts(data);
  const latest = scored.length ? (scored[scored.length - 1].score30 ?? 0) : null;
  const daysLeft = daysUntilTest(data, today);
  const target = data.profile.targetScore;
  const ringValue = latest !== null ? latest / (target || 30) : 0;

  const startTask = (task: TaskType, topic?: string) => {
    const pool = topic ? filterQuestions({ task, topic: topic as never }) : questionsByTask(task);
    // A seeded pick, then ordered easy→hard so the set genuinely builds in
    // difficulty like the real exam (ties keep their picked order).
    const picked = pickQuestions(pool.length ? pool : questionsByTask(task), SET_COUNT[task], data.nextId + task.length + (topic?.length ?? 0));
    const ids = picked
      .map((q, i) => ({ q, i }))
      .sort((a, b) => a.q.difficulty - b.q.difficulty || a.i - b.i)
      .map((x) => x.q.id);
    setPicker(null);
    onStart({ title: task === "repeat" ? "Listen & Repeat" : "Take an Interview", questionIds: ids, mode: "practice", summary: SET_COUNT[task] > 1 });
  };

  const startDrillNow = (construct: Construct) => {
    const r = startDrill(data, construct, today, 3, data.nextId + 7);
    const drillId = r.id;
    bandUpStore.set(r.state);
    const ids = r.state.drills.find((d) => d.id === drillId)?.questionIds ?? [];
    onStart(
      { title: `Drill: ${CONSTRUCT_LABEL[construct]}`, questionIds: ids, mode: "drill", summary: true },
      () => bandUpStore.set((s) => ({ ...s, drills: s.drills.map((d) => (d.id === drillId && !d.completedAt ? { ...d, completedAt: today } : d)) })),
    );
  };

  const onPlanItem = (kind: string, construct?: Construct) => {
    feedback("tap", "light");
    if (kind === "repeat") startTask("repeat");
    else if (kind === "interview") startTask("interview");
    else if (kind === "drill") startDrillNow(construct ?? suggestDrillConstruct(data));
    else if (kind === "mock") onTab("mock");
    else if (kind === "review") onTab("progress");
  };

  const weak = scored.length >= 3 ? weakestConstruct(data) : null;
  const dateLabel = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  // A brand-new user (no scored answers yet) gets a FOCUSED first run: the hero is
  // itself the single primary call-to-action, the task cards are demoted to quiet
  // choices, and the empty "0 / 30" ring + "No test date set" chip (pure empty-state
  // noise) are gone — so there's one obvious next step, not five competing starts.
  const firstRun = scored.length === 0;

  return (
    <>
      {/* No top-right settings gear — Settings already lives in the bottom nav, so a
          second entry point here was redundant (reviewer note). */}
      <Screen
        title="Practice"
        subtitle={dateLabel}
        bottomInset={bottomInset}
      >
        {firstRun ? (
          // First run: the hero IS the primary CTA — the whole card is tappable and
          // carries one explicit "Start your first answer" action (no empty ring,
          // no "No test date set" chip), so the next step is unmistakable.
          <Tappable
            label="Start your first answer — Listen & Repeat"
            sound={null}
            onPress={() => { feedback("tap", "medium"); startTask("repeat"); }}
            scale={0.99}
          >
            <HeroCard
              overline="Welcome to Band Up"
              value="Speak to begin"
              caption="One answer → an instant estimated band, your transcript & fix-it tips."
            >
              <View style={styles.heroCta}>
                <Icon name="play" size={16} color={palette.primary} />
                <Text style={[type.button, { color: palette.primary }]}>Start your first answer</Text>
                <Icon name="arrowRight" size={18} color={palette.primary} />
              </View>
            </HeroCard>
          </Tappable>
        ) : (
          <HeroCard
            overline="Your estimated score"
            value={`${latest}`}
            caption={`of 30 · ${countdownLabel(daysLeft)}`}
            status={
              data.profile.streakCount > 0
                ? { label: `${data.profile.streakCount}-day streak${plan.completedToday ? " · done today" : ""}`, tone: plan.completedToday ? "success" : "warning" }
                : { label: countdownLabel(daysLeft), tone: "neutral" }
            }
            right={
              <ProgressRing
                value={Math.max(0, Math.min(1, ringValue))}
                size={92}
                stroke={9}
                color={gradient.onHero}
                track={gradient.pill}
                labelColor={gradient.onHero}
                label={`${latest}`}
                sublabel={target ? `/ ${target}` : "/ 30"}
              />
            }
          />
        )}

        {/* First run = ONE primary action only. The hero above is the single call to
            action; the two task cards and the daily plan are hidden until the user has
            a score. The old "what you'll get" benefits list is GONE — it just repeated
            the three onboarding points and made the first screen dense (the reviewer's
            note), pushing the one obvious action down. The sample-score preview below
            now does double duty: it grounds the screen AND shows the real payoff. */}

        {/* A preview of the payoff, so the bottom half of a brand-new home isn't
            empty: a clearly-labelled SAMPLE score report — the band ring and a couple
            of rubric bars a real answer produces — so a first-time user sees what one
            answer gets them before they start. Purely illustrative (a "Sample" pill),
            never a competing call to action. */}
        {firstRun ? (
          <Card style={{ marginTop: space.md }}>
            <View style={styles.sampleHead}>
              <Text style={type.bodyStrong}>Example score report</Text>
              <Pill label="Example only" tone="neutral" />
            </View>
            <View style={styles.sampleRow}>
              <ProgressRing value={24 / 30} size={76} stroke={8} color={palette.primary} track={palette.primarySoft} label="24" sublabel="/ 30" labelColor={palette.primary} />
              <View style={{ flex: 1, gap: space.sm }}>
                {SAMPLE_RUBRIC.map((b) => (
                  <View key={b.label} style={{ gap: 4 }}>
                    <Text style={type.caption} numberOfLines={1}>{b.label}</Text>
                    <ProgressBar value={b.value} tone="primary" />
                  </View>
                ))}
              </View>
            </View>
            <Text style={[type.caption, { marginTop: space.md }]}>
              Just an example — not your score. Every real answer gets its own band, transcript and one fix-it tip, estimated on your phone in seconds.
            </Text>
          </Card>
        ) : null}

        {/* First-run secondary entries — so the lower half of a brand-new home isn't
            empty (reviewer note). The hero above stays the ONE primary (Listen &
            Repeat); these are quiet, clearly-secondary ways to explore the other 2026
            task type, a full mock and the phrase lessons. */}
        {firstRun ? (
          <>
            <SectionHeader title="More ways to practise" />
            <Card padded={false} style={{ paddingHorizontal: space.lg }}>
              <MoreRow
                icon="mic"
                title="Take an Interview"
                subtitle="45-second spoken answers, AI-scored"
                onPress={() => { feedback("tap", "medium"); startTask("interview"); }}
              />
              <MoreRow
                icon="trophy"
                title="Mock test"
                subtitle="A full timed section + score report"
                onPress={() => { feedback("tap", "light"); onTab("mock"); }}
              />
              <MoreRow
                icon="book"
                title="Speaking phrases"
                subtitle="Quick vocab & phrase mini-lessons"
                onPress={() => { feedback("tap", "light"); onTab("learn"); }}
                last
              />
            </Card>
          </>
        ) : null}

        {/* Task cards — ONE tap starts a random set; the corner chip picks a topic.
            Shown once the user has a score, when they become the main way in. */}
        {!firstRun ? (
          <>
        <SectionHeader title="Practice a task" />
        <View style={styles.taskRow}>
          <TaskCard
            label="Listen & Repeat"
            sub="Hear it, say it back"
            icon="headset"
            onStart={() => { feedback("tap", "medium"); startTask("repeat"); }}
            onTopics={() => { feedback("tap", "light"); setPicker("repeat"); }}
          />
          <TaskCard
            label="Take an Interview"
            sub="45-second answers"
            icon="mic"
            onStart={() => { feedback("tap", "medium"); startTask("interview"); }}
            onTopics={() => { feedback("tap", "light"); setPicker("interview"); }}
          />
        </View>
          </>
        ) : null}

        {/* AI credits — surfaced only AFTER the first scored answer, so a brand-new
            user sees the free core practice first and the upsell never greets them
            before they've done anything. Newcomers still learn the credit model
            in-context on the result screen. */}
        {scored.length > 0 ? (
          <Card accent={credits.remaining > 0 || credits.pro ? palette.primary : palette.accent}>
            <View style={styles.creditRow}>
              <View style={{ flex: 1 }}>
                <Text style={type.bodyStrong}>{credits.pro ? "Pro — unlimited scoring" : `${credits.remaining} free AI score${credits.remaining === 1 ? "" : "s"} left`}</Text>
                {/* Spell out that only AI scoring spends a credit — recording, pacing
                    and samples are always free — so a newcomer knows what "one" buys. */}
                <Text style={type.caption}>
                  {credits.pro
                    ? `Up to ${credits.dailyRemaining} today · practice is unlimited`
                    : credits.lifetimeRemaining > 0
                      ? `Each scored answer uses one · then ${FREE_DAILY_SCORES} free a day. Practising is always free.`
                      : `Resets tomorrow · ${FREE_DAILY_SCORES} free a day. Recording, pacing & samples stay free.`}
                </Text>
              </View>
              {!credits.pro ? <Button label="Go Pro" size="sm" variant="secondary" icon="star" onPress={() => onPro("practice_credits")} /> : <Pill label="Pro" tone="primary" />}
            </View>
          </Card>
        ) : null}

        {/* Daily plan — hidden on first run (the hero is the single primary then);
            it's the returning user's at-a-glance ~10-minute routine. */}
        {!firstRun ? (
          <>
            <SectionHeader title={`Today's plan · ~${plan.totalMinutes} min`} action={plan.completedToday ? <Pill label="Done today" tone="success" /> : undefined} />
            <Card padded={false} style={{ paddingHorizontal: space.lg }}>
              {plan.items.map((it, i) => (
                <PlanRow key={`${it.kind}-${i}`} title={it.title} subtitle={it.subtitle} minutes={it.minutes} kind={it.kind} onPress={() => onPlanItem(it.kind, it.construct)} last={i === plan.items.length - 1} />
              ))}
            </Card>
          </>
        ) : null}

        {/* Weak-spot drill */}
        {weak ? (
          <Card accent={palette.accent}>
            <View style={styles.weakRow}>
              <View style={[styles.weakIcon]}>
                <Icon name="target" size={22} color={palette.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={type.bodyStrong}>Weakest: {CONSTRUCT_LABEL[weak]}</Text>
                <Text style={type.caption}>3 {taskForConstruct(weak) === "repeat" ? "Repeat" : "Interview"} items to close the gap</Text>
              </View>
            </View>
            <Button label="Drill this" icon="target" variant="secondary" onPress={() => startDrillNow(weak)} style={{ marginTop: space.md }} />
          </Card>
        ) : null}
      </Screen>

      <TopicPicker task={picker} onClose={() => setPicker(null)} onStart={startTask} />
    </>
  );
}

function TaskCard({ label, sub, icon, onStart, onTopics, primary = true }: { label: string; sub: string; icon: "headset" | "mic"; onStart: () => void; onTopics: () => void; primary?: boolean }) {
  return (
    <View style={styles.taskCard}>
      <Tappable label={`Start ${label}`} sound={null} onPress={onStart} style={styles.taskStart}>
        <View style={styles.taskIcon}>
          <Icon name={icon} size={24} color={palette.primary} />
        </View>
        <Text style={[type.bodyStrong]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{label}</Text>
        <Text style={type.caption} numberOfLines={1}>{sub}</Text>
        {/* A filled pill is the unmistakable primary "Start" once the user has a
            score; on first run it's a quiet outline so the hero stays the one primary. */}
        <View style={[styles.startPill, !primary && styles.startPillGhost]}>
          <Icon name="play" size={13} color={primary ? palette.onPrimary : palette.primary} />
          <Text style={[type.label, { color: primary ? palette.onPrimary : palette.primary }]}>Start</Text>
        </View>
      </Tappable>
      {/* Topics is its own row below a divider — never overlapping the Start area. */}
      <Tappable label={`${label} — choose a topic`} sound="pop" onPress={onTopics} style={styles.taskTopics} scale={0.97}>
        <Icon name="target" size={14} color={palette.inkSoft} />
        <Text style={[type.caption, { color: palette.inkSoft }]} numberOfLines={1}>Choose a topic</Text>
      </Tappable>
    </View>
  );
}

/** A quiet secondary entry row (first-run "More ways to practise") — icon + two
 *  lines + chevron, visually calmer than the filled task cards so the hero stays
 *  the one primary. */
function MoreRow({ icon, title, subtitle, onPress, last = false }: { icon: "mic" | "trophy" | "book"; title: string; subtitle: string; onPress: () => void; last?: boolean }) {
  return (
    <Tappable label={title} onPress={onPress} scale={0.99} style={[styles.planRow, !last && styles.planBorder]}>
      <View style={styles.planIcon}>
        <Icon name={icon} size={18} color={palette.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={type.bodyStrong} numberOfLines={1}>{title}</Text>
        <Text style={type.caption} numberOfLines={1}>{subtitle}</Text>
      </View>
      <Icon name="chevronRight" size={20} color={palette.inkMuted} />
    </Tappable>
  );
}

function PlanRow({ title, subtitle, minutes, kind, onPress, last }: { title: string; subtitle: string; minutes: number; kind: string; onPress: () => void; last: boolean }) {
  const icon = kind === "drill" ? "target" : kind === "mock" ? "trophy" : kind === "review" ? "chart" : kind === "interview" ? "mic" : "headset";
  return (
    <Tappable label={title} onPress={onPress} scale={0.99} style={[styles.planRow, !last && styles.planBorder]}>
      <View style={styles.planIcon}>
        <Icon name={icon as never} size={18} color={palette.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={type.bodyStrong} numberOfLines={1}>{title}</Text>
        <Text style={type.caption} numberOfLines={1}>{subtitle}</Text>
      </View>
      <Text style={[type.caption, { fontVariant: ["tabular-nums"] }]}>{minutes}m</Text>
      <Icon name="chevronRight" size={20} color={palette.inkMuted} />
    </Tappable>
  );
}

function TopicPicker({ task, onClose, onStart }: { task: TaskType | null; onClose: () => void; onStart: (task: TaskType, topic?: string) => void }) {
  const [topic, setTopic] = useState<string | null>(null);
  const topics = task ? topicsForTask(task) : [];
  return (
    <Sheet visible={!!task} title={task === "repeat" ? "Listen & Repeat" : "Take an Interview"} onClose={onClose}>
      <Text style={type.caption}>Pick a topic, or go random. {task === "repeat" ? "7" : "4"} items, getting harder.</Text>
      <View style={styles.chips}>
        <Chip label="Random" selected={topic === null} onPress={() => setTopic(null)} />
        {topics.map((t) => (
          <Chip key={t} label={t} selected={topic === t} onPress={() => setTopic(t)} />
        ))}
      </View>
      <Button label="Start" size="lg" icon="arrowRight" onPress={() => task && onStart(task, topic ?? undefined)} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  creditRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  taskRow: { flexDirection: "row", gap: space.md },
  taskCard: { flex: 1, backgroundColor: palette.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: palette.border, minHeight: 150, overflow: "hidden" },
  taskStart: { flex: 1, padding: space.lg, gap: 4, justifyContent: "flex-start" },
  startPill: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", marginTop: space.sm, paddingHorizontal: 12, height: 32, borderRadius: radius.pill, backgroundColor: palette.primary },
  startPillGhost: { backgroundColor: "transparent", borderWidth: 1, borderColor: palette.primary },
  // A SOLID white pill with teal text — a strong, high-contrast primary tap target
  // (the translucent white-on-teal version read as faint/disabled to the reviewer).
  heroCta: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: space.md, height: 52, borderRadius: radius.pill, backgroundColor: gradient.onHero, ...shadowStrong },
  taskTopics: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 40, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border, backgroundColor: palette.surfaceAlt },
  taskIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: palette.primarySoft, alignItems: "center", justifyContent: "center", marginBottom: space.xs },
  planRow: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 60, paddingVertical: space.sm },
  planBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.border },
  planIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: palette.primarySoft, alignItems: "center", justifyContent: "center" },
  sampleHead:{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm, marginBottom: space.md },
  sampleRow: { flexDirection: "row", alignItems: "center", gap: space.lg },
  weakRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  weakIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: `${palette.accent}1F`, alignItems: "center", justifyContent: "center" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
});
