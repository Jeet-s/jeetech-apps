import { useState } from "react";
import { Image, Share, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn } from "react-native-reanimated";
import {
  BarChart,
  Button,
  Card,
  EmptyState,
  Icon,
  IconButton,
  ListItem,
  Pill,
  ProgressBar,
  Screen,
  SectionHeader,
  Segmented,
  feedback,
  palette,
  space,
  toast,
  type,
} from "../ui";
import { ResultView } from "./ResultView";
import { art } from "../art";
import type { ScreenProps } from "./nav";
import { ai } from "../modules/ai";
import { analytics } from "../modules/analytics";
import { useSettings } from "../modules/store";
import { bandUpStore, useBandUp } from "../core/data";
import { CONSTRUCT_LABEL, scoredAttempts, type Attempt, type Construct, type TaskType } from "../core/model";
import { scoreTrend, hasTrend, constructStats, weakestConstruct, beforeAfter, startDrill, taskForConstruct, earnedBadges, BADGE_ORDER, BADGE_LABEL, BADGE_HINT, type BadgeId } from "../core/insights";
import type { ArtId } from "../art";
import type { IconName } from "../ui";
import { applyScore, queuedAttempts, validateScorePayload, type ScorePayload } from "../core/scoring";
import { canScore, consumeCredit } from "../core/credits";
import { questionById } from "../core/questions";

const dateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const SHORT: Record<Construct, string> = { fluency: "Flu", intelligibility: "Intel", repeat_accuracy: "Rep", language_use: "Lang", organization: "Org" };

/** Progress: estimated-score trend, construct breakdown + weak-spot drill,
 *  first-vs-latest before/after, the full filterable history, and the offline
 *  "score when online" queue. Tapping an attempt opens its full result. */
export function ProgressScreen({ bottomInset, onPro, onStart }: ScreenProps) {
  const data = useBandUp();
  const settings = useSettings();
  const today = dateKey(new Date());
  const [filter, setFilter] = useState<"all" | TaskType>("all");
  const [detail, setDetail] = useState<string | null>(null);

  const scored = scoredAttempts(data);
  const trend = scoreTrend(data);
  const stats = constructStats(data);
  const weak = weakestConstruct(data);
  const queued = queuedAttempts(data);

  const history = [...data.attempts]
    .filter((a) => filter === "all" || a.taskType === filter)
    .reverse();

  const startDrillNow = (construct: Construct) => {
    const r = startDrill(data, construct, today, 3, data.nextId + 11);
    const drillId = r.id;
    bandUpStore.set(r.state);
    const ids = r.state.drills.find((d) => d.id === drillId)?.questionIds ?? [];
    onStart(
      { title: `Drill: ${CONSTRUCT_LABEL[construct]}`, questionIds: ids, mode: "drill", summary: true },
      () => bandUpStore.set((s) => ({ ...s, drills: s.drills.map((d) => (d.id === drillId && !d.completedAt ? { ...d, completedAt: today } : d)) })),
    );
  };

  const scoreQueued = async () => {
    if (!ai.enabled) return toast("Connect to the internet to score saved answers.");
    let any = false;
    for (const a of queuedAttempts(bandUpStore.get())) {
      if (!canScore(bandUpStore.get(), today, settings.pro)) {
        onPro("queue");
        break;
      }
      const q = questionById(a.questionId);
      if (!q) continue;
      const input =
        q.taskType === "repeat"
          ? JSON.stringify({ target: q.targetSentence ?? q.promptText, transcript: a.transcript })
          : JSON.stringify({ question: q.promptText, transcript: a.transcript });
      const r = await ai.run(q.taskType === "repeat" ? "score_repeat" : "score_interview", input);
      if (r.ok && !validateScorePayload((r.json ?? safe(r.text)) as unknown, q.taskType)) {
        bandUpStore.set((s) => consumeCredit(applyScore(s, a.id, (r.json ?? safe(r.text)) as ScorePayload).state, today, settings.pro));
        analytics.track("attempt_scored", { task: q.taskType });
        any = true;
      } else if (!r.ok && r.reason === "quota") {
        onPro("queue");
        break;
      } else if (!r.ok) {
        break;
      }
    }
    toast(any ? "Saved answers scored" : "Couldn't score right now");
  };

  const shareCard = async () => {
    feedback("tap", "light");
    const best = Math.max(0, ...scored.map((a) => a.score30 ?? 0));
    try {
      await Share.share({
        message: `My speaking practice on Band Up: latest estimated ${trend[trend.length - 1]?.score30 ?? best}/30 across ${scored.length} scored answers. (Estimates only.)`,
      });
      analytics.track("share_progress", {});
    } catch {
      // user cancelled
    }
  };

  if (detail) {
    const a = data.attempts.find((x) => x.id === detail);
    const q = a ? questionById(a.questionId) : undefined;
    return <DetailOverlay attempt={a} question={q} speed={data.profile.playbackSpeed} onBack={() => setDetail(null)} onDrill={a ? () => { setDetail(null); startDrillNow(weak ?? "fluency"); } : undefined} />;
  }

  return (
    <Screen title="Progress" bottomInset={bottomInset} right={scored.length ? <IconButton icon="share" label="Share progress" onPress={shareCard} /> : undefined}>
      {/* Trend */}
      <SectionHeader title="Estimated score trend" />
      {hasTrend(data) ? (
        <Card>
          <BarChart
            data={trend.slice(-8).map((p, i) => ({ label: `#${trend.length - Math.min(8, trend.length) + i + 1}`, value: p.score30 }))}
            highlight={Math.min(8, trend.length) - 1}
            showValues
            height={150}
            color={palette.primary}
          />
          <Text style={[type.caption, { textAlign: "center", marginTop: space.sm }]}>Estimated 0–30 per scored answer · newest on the right</Text>
        </Card>
      ) : (
        <Card>
          <EmptyState art={art.empty_progress} title="Your score trend starts here" body="Score at least 2 answers to see your estimated band move over time." />
        </Card>
      )}

      {/* Construct breakdown + weak spot */}
      {stats.length ? (
        <>
          <SectionHeader title="By skill" />
          <Card>
            <View style={{ gap: space.md }}>
              {stats.map((s) => (
                <View key={s.construct} style={{ gap: 6 }}>
                  <View style={styles.rowBetween}>
                    <Text style={[type.label, { color: palette.ink }]}>{CONSTRUCT_LABEL[s.construct]}{s.construct === weak ? "  ·  weakest" : ""}</Text>
                    <Text style={[type.amount, { fontSize: 14 }]}>{s.avg.toFixed(1)}/6</Text>
                  </View>
                  <ProgressBar value={s.avg / 6} tone={s.construct === weak ? "warning" : "primary"} />
                </View>
              ))}
            </View>
            {weak ? (
              <Button label={`Drill ${CONSTRUCT_LABEL[weak]} (${taskForConstruct(weak) === "repeat" ? "Repeat" : "Interview"})`} icon="target" variant="secondary" onPress={() => startDrillNow(weak)} style={{ marginTop: space.lg }} />
            ) : null}
          </Card>
        </>
      ) : null}

      {/* Before / after */}
      {(["repeat", "interview"] as TaskType[]).some((t) => beforeAfter(data, t)) ? (
        <>
          <SectionHeader title="Before & after" />
          <View style={{ gap: space.sm }}>
            {(["repeat", "interview"] as TaskType[]).map((t) => {
              const ba = beforeAfter(data, t);
              if (!ba) return null;
              return (
                <Card key={t}>
                  <View style={styles.rowBetween}>
                    <Text style={type.bodyStrong}>{t === "repeat" ? "Listen & Repeat" : "Take an Interview"}</Text>
                    <Pill label={`${ba.delta >= 0 ? "+" : ""}${ba.delta}`} tone={ba.delta > 0 ? "success" : ba.delta < 0 ? "danger" : "neutral"} />
                  </View>
                  <View style={[styles.rowBetween, { marginTop: space.sm }]}>
                    <Text style={type.caption}>First {ba.first}/30</Text>
                    <Icon name="arrowRight" size={16} color={palette.inkMuted} />
                    <Text style={type.caption}>Latest {ba.latest}/30</Text>
                  </View>
                </Card>
              );
            })}
          </View>
        </>
      ) : null}

      {/* Milestone badges */}
      <Achievements earned={new Set(earnedBadges(data))} />

      {/* Offline queue */}
      {queued.length ? (
        <Card accent={palette.accent}>
          <View style={styles.rowBetween}>
            <View style={{ flex: 1 }}>
              <Text style={type.bodyStrong}>{queued.length} answer{queued.length === 1 ? "" : "s"} waiting to score</Text>
              <Text style={type.caption}>{ai.enabled ? "Score them now with the AI coach." : "We'll score them automatically once you're online."}</Text>
            </View>
          </View>
          {ai.enabled ? <Button label="Score now" icon="refresh" variant="secondary" onPress={scoreQueued} style={{ marginTop: space.md }} /> : null}
        </Card>
      ) : null}

      {/* History */}
      <SectionHeader title="History" />
      <Segmented<"all" | TaskType>
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: "All" },
          { value: "repeat", label: "Repeat" },
          { value: "interview", label: "Interview" },
        ]}
      />
      {history.length === 0 ? (
        <Card>
          <EmptyState art={art.empty_history} title="No answers yet" body="Your scored answers and recordings will appear here." />
        </Card>
      ) : (
        <Card padded={false} style={{ paddingHorizontal: space.lg }}>
          {history.slice(0, 60).map((a) => (
            <ListItem
              key={a.id}
              icon={a.taskType === "repeat" ? "headset" : "mic"}
              title={a.taskType === "repeat" ? "Listen & Repeat" : "Take an Interview"}
              subtitle={`${a.startedAt}${a.mode !== "practice" ? ` · ${a.mode}` : ""}`}
              trailing={
                typeof a.score30 === "number" ? (
                  <Text style={[type.amount]}>{a.score30}/30</Text>
                ) : (
                  <Pill label={a.status === "queued" ? "Queued" : "Not scored"} tone="warning" />
                )
              }
              onPress={() => { feedback("tap", "light"); setDetail(a.id); }}
            />
          ))}
        </Card>
      )}
    </Screen>
  );
}

function safe(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

const BADGE_ART: Partial<Record<BadgeId, ArtId>> = { streak_7: "badge_streak", band_up: "badge_band_up" };
const BADGE_ICON: Partial<Record<BadgeId, IconName>> = { first_attempt: "mic", ten_attempts: "flag", first_mock: "trophy" };

/** Milestone badges — a visible reward shelf (retention hook). Earned badges
 *  light up with their art; locked ones stay muted with the goal to reach. */
function Achievements({ earned }: { earned: Set<BadgeId> }) {
  return (
    <>
      <SectionHeader title={`Achievements · ${earned.size}/${BADGE_ORDER.length}`} />
      <Card>
        <View style={styles.badgeGrid}>
          {BADGE_ORDER.map((id) => {
            const got = earned.has(id);
            const artId = BADGE_ART[id];
            return (
              <View key={id} style={styles.badgeTile} accessible accessibilityLabel={`${BADGE_LABEL[id]}: ${got ? "earned" : `locked — ${BADGE_HINT[id]}`}`}>
                <View style={[styles.badgeCircle, { backgroundColor: got ? palette.primarySoft : palette.surfaceAlt }]}>
                  {artId ? (
                    <Image source={art[artId]} style={[styles.badgeImg, !got && styles.badgeLocked]} resizeMode="contain" accessibilityIgnoresInvertColors />
                  ) : (
                    <Icon name={(BADGE_ICON[id] ?? "star") as IconName} size={26} color={got ? palette.primary : palette.inkMuted} />
                  )}
                </View>
                <Text style={[type.label, { textAlign: "center", color: got ? palette.ink : palette.inkMuted }]} numberOfLines={1}>{BADGE_LABEL[id]}</Text>
                <Text style={[type.caption, { textAlign: "center" }]} numberOfLines={2}>{got ? "Earned" : BADGE_HINT[id]}</Text>
              </View>
            );
          })}
        </View>
      </Card>
    </>
  );
}

function DetailOverlay({ attempt, question, speed, onBack, onDrill }: { attempt?: Attempt; question?: ReturnType<typeof questionById>; speed: 0.75 | 1 | 1.5 | 2; onBack: () => void; onDrill?: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.overlay}>
      <View style={[styles.detailHead, { paddingTop: insets.top + space.sm }]}>
        <IconButton icon="chevronLeft" label="Back" onPress={onBack} />
        <Text style={[type.bodyStrong, { flex: 1 }]}>Attempt detail</Text>
      </View>
      <Animated.ScrollView entering={FadeIn.duration(200)} contentContainerStyle={styles.detailBody}>
        {attempt && question ? (
          <ResultView attempt={attempt} question={question} defaultSpeed={speed} onDrill={onDrill} estimated={attempt.estimated === true} />
        ) : (
          <EmptyState icon="trash" title="Attempt unavailable" body="This recording is no longer available, but your score is kept." />
        )}
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
  badgeGrid: { flexDirection: "row", flexWrap: "wrap", columnGap: space.sm, rowGap: space.lg },
  badgeTile: { flexBasis: "28%", flexGrow: 1, alignItems: "center", gap: 3 },
  badgeCircle: { width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center", marginBottom: 2 },
  badgeImg: { width: 46, height: 46 },
  badgeLocked: { opacity: 0.3 },
  overlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: palette.bg, zIndex: 20 },
  detailHead: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.lg, paddingBottom: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.border },
  detailBody: { padding: space.lg, paddingBottom: space.xxl, gap: space.lg, width: "100%", maxWidth: 640, alignSelf: "center" },
});
