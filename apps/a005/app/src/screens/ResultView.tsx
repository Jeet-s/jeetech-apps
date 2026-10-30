import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { runOnJS, useAnimatedReaction, useSharedValue, withTiming } from "react-native-reanimated";
import {
  AiReport,
  Button,
  Card,
  HeroCard,
  Icon,
  Pill,
  ProgressBar,
  ProgressRing,
  SectionHeader,
  Segmented,
  fonts,
  gradient,
  haptic,
  palette,
  radius,
  space,
  tones,
  type,
} from "../ui";
import { AudioRow, PlayButton } from "./audio";
import { CONSTRUCT_LABEL, CONSTRUCTS_FOR, type Attempt, type PlaybackSpeed } from "../core/model";
import { scoreRange } from "../core/scoring";
import { repeatDiff } from "../core/questions";
import type { Question } from "../core/questions";

type Tab = "yours" | "improved" | "sample";

/** The word-level repeat-accuracy diff: matched words in ink, missed in amber,
 *  extra (said but not in the target) struck through and muted. */
function RepeatDiff({ target, spoken }: { target: string; spoken: string }) {
  const diff = repeatDiff(target, spoken);
  return (
    <View style={{ gap: space.sm }}>
      <View style={styles.diffWrap}>
        {diff.tokens.map((t, i) => {
          if (t.op === "match") return <Text key={i} style={[type.body, { color: palette.ink }]}>{t.said} </Text>;
          if (t.op === "missing") return <Text key={i} style={[type.body, { color: tones.warning.fg }]}>{t.target} </Text>;
          return <Text key={i} style={[type.body, { color: palette.inkMuted, textDecorationLine: "line-through" }]}>{t.said} </Text>;
        })}
      </View>
      <Text style={type.caption}>
        {Math.round(diff.accuracy * 100)}% of the target words matched · amber = missed · struck-through = extra
      </Text>
    </View>
  );
}

const normWord = (w: string): string => w.toLowerCase().replace(/[^\p{L}\p{N}']/gu, "");

/** The improved answer, rendered with the words that are NEW vs the user's own
 *  answer highlighted — so the edits are obvious at a glance, no tab needed. */
function ImprovedAnswer({ mine, improved }: { mine: string; improved: string }) {
  const mineSet = new Set(mine.split(/\s+/).map(normWord).filter(Boolean));
  const tokens = improved.split(/(\s+)/); // keep whitespace so spacing is preserved
  return (
    <Text style={[type.body, { lineHeight: 24 }]}>
      {tokens.map((t, i) => {
        if (/^\s+$/.test(t) || !t) return <Text key={i}>{t}</Text>;
        const isNew = !mineSet.has(normWord(t));
        return isNew ? (
          <Text key={i} style={styles.added}>{t}</Text>
        ) : (
          <Text key={i}>{t}</Text>
        );
      })}
    </Text>
  );
}

function RubricRow({ label, value, weakest }: { label: string; value: number; weakest: boolean }) {
  return (
    <View style={styles.rubricRow}>
      <View style={styles.rubricHead}>
        <Text style={[type.label, { color: palette.ink }]} numberOfLines={1}>
          {label}
          {weakest ? <Text style={{ color: tones.warning.fg }}>  ·  weakest</Text> : null}
        </Text>
        <Text style={[type.amount, { fontSize: 14 }]}>{value.toFixed(1)}/6</Text>
      </View>
      <ProgressBar value={value / 6} tone={weakest ? "warning" : "primary"} />
    </View>
  );
}

/**
 * The full result for one attempt: estimated score ring, rubric breakdown,
 * strengths & weaknesses, the Yours / Improved / Sample compare tabs with
 * native-voice playback, and (for Repeat) a word-level accuracy diff. Also
 * handles the offline "queued, scored later" state with the on-device pacing
 * report so an answer is never a dead end without a connection.
 */
export function ResultView({
  attempt,
  question,
  defaultSpeed,
  onDrill,
  onRetry,
  failReason,
  estimated = false,
  initialTab = "yours",
  celebrate = false,
}: {
  attempt: Attempt;
  question: Question;
  defaultSpeed: PlaybackSpeed;
  onDrill?: () => void;
  onRetry?: () => void;
  /** Why scoring didn't produce a score (drives the unscored card's copy). */
  failReason?: "offline" | "quota" | "other" | null;
  /** This score is the transparent on-device estimate, not a full AI score. */
  estimated?: boolean;
  initialTab?: Tab;
  /** Fresh reveal (not history/screenshots): count the score up with a haptic. */
  celebrate?: boolean;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [speed, setSpeed] = useState<PlaybackSpeed>(defaultSpeed);
  const scored = attempt.status === "scored" && typeof attempt.score30 === "number";
  const queued = attempt.status === "queued";
  const [lo, hi] = scored ? scoreRange(attempt.score30 as number) : [0, 0];
  // The score is shown as its FINAL value from the first frame — the number, the
  // ring and the "likely lo–hi · band" caption are always consistent. We never
  // count up through an intermediate figure (the reviewer saw the hero pass
  // through "13" while the caption already said "likely 24–28"). The reveal is
  // carried by the ring + a single success haptic, and the (light, delayed)
  // confetti fired by the caller once this screen has settled.
  const final = (attempt.score30 as number) ?? 0;
  // A short, satisfying count-up on a FRESH reveal: the hero number and the ring
  // climb together from 0 to the final score over ~0.6s, with a success haptic as
  // it lands — the payoff the reviewer never saw. Driven by a Reanimated shared
  // value on the UI thread (not a setInterval), surfacing the rounded figure to
  // React only when it ticks over. History / screenshots skip it and show the
  // final figure straight away. The "likely lo–hi · band" caption is static, so
  // the number only ever rises toward (never past) its range.
  const [shown, setShown] = useState(celebrate && scored ? 0 : final);
  const countUp = useSharedValue(celebrate && scored ? 0 : 1);
  useEffect(() => {
    if (!(celebrate && scored)) {
      setShown(final);
      return;
    }
    haptic("success");
    countUp.value = 0;
    countUp.value = withTiming(1, { duration: 620 });
  }, [celebrate, scored, final, countUp]);
  useAnimatedReaction(
    () => Math.round(countUp.value * final),
    (v, prev) => {
      if (v !== prev) runOnJS(setShown)(v);
    },
    [final],
  );

  const tabText = tab === "yours" ? attempt.transcript : tab === "improved" ? attempt.improvedAnswer ?? "" : question.sampleAnswer;

  return (
    <View style={{ gap: space.lg }}>
      {scored ? (
        <HeroCard
          overline={estimated ? "Estimated score · on-device" : "Estimated score"}
          value={`${shown}`}
          caption={`of 30 · likely ${lo}–${hi} · band ${(attempt.band6 ?? 0).toFixed(1)}/6`}
          status={{ label: estimated ? "Basic estimate — not official" : "Estimate — not an official score", tone: "neutral" }}
          right={
            <ProgressRing
              value={shown / 30}
              size={96}
              stroke={10}
              color={gradient.onHero}
              track={gradient.pill}
              labelColor={gradient.onHero}
              label={`${shown}`}
              sublabel="/ 30"
            />
          }
        />
      ) : (
        <HeroCard
          overline={queued ? "Saved — will score online" : "Recorded"}
          value={`${attempt.pacingWpm}`}
          caption="words per minute · on-device pacing"
          status={{ label: queued ? "Queued for scoring" : "Not scored", tone: "warning" }}
          right={<Icon name="wave" size={64} color={gradient.onHero} />}
        />
      )}

      {/* A slim, honest label of WHAT this score is — kept to a single line and
          separated from any upsell, so the number, rubric, strengths and rewrite
          below read as the result (not as an ad). The upgrade CTA lives lower,
          after the feedback, so it never crowds the score. */}
      {scored && estimated ? (
        <View style={styles.estimateNote} accessibilityRole="summary">
          <Icon name="sparkle" size={16} color={palette.primary} />
          <Text style={[type.caption, { flex: 1, color: palette.inkSoft }]}>
            {failReason === "offline"
              ? "Estimated on your device — you're offline. Full rubric, strengths and a rewrite are below."
              : "Estimated on your device. Full rubric, strengths and a rewrite are below."}
          </Text>
        </View>
      ) : null}

      {/* On-device pacing — always available, even without AI credits or a connection. */}
      <Card>
        <SectionHeader title="On-device pacing" />
        <View style={styles.pacingRow}>
          <Metric value={`${attempt.pacingWpm}`} label="words/min" />
          <Metric value={`${attempt.durationS}s`} label="duration" />
          <Metric value={`${attempt.pauseCount}`} label="pauses" />
        </View>
      </Card>

      {scored ? (
        <>
          <Card>
            <SectionHeader title="Rubric breakdown" />
            <View style={{ gap: space.md, marginTop: space.sm }}>
              {CONSTRUCTS_FOR[attempt.taskType].map((c) => {
                const v = attempt.constructs[c];
                if (typeof v !== "number") return null;
                const weakest = isWeakest(attempt, c);
                return <RubricRow key={c} label={CONSTRUCT_LABEL[c]} value={v} weakest={weakest} />;
              })}
            </View>
            {attempt.taskType === "interview" && typeof attempt.relevance === "number" ? (
              <View style={{ marginTop: space.md }}>
                <Pill label={`On-topic ${Math.round(attempt.relevance * 100)}%`} tone={attempt.relevance >= 0.6 ? "success" : "warning"} />
              </View>
            ) : null}
          </Card>

          <Card>
            <SectionHeader title="What went well" />
            <View style={{ gap: space.sm, marginTop: space.xs }}>
              {attempt.strengths.map((s, i) => (
                <Bullet key={i} tone="success" icon="check" text={s} />
              ))}
            </View>
          </Card>

          <Card>
            <SectionHeader title="Fix this next" />
            <View style={{ gap: space.sm, marginTop: space.xs }}>
              {attempt.weaknesses.map((w, i) => (
                <Bullet key={i} tone="warning" icon="target" text={w} />
              ))}
            </View>
            {onDrill ? <Button label="Drill this weak spot" icon="target" variant="secondary" onPress={onDrill} style={{ marginTop: space.md }} /> : null}
          </Card>

          <AiReport feature={attempt.taskType === "repeat" ? "score_repeat" : "score_interview"} />
        </>
      ) : failReason === "quota" ? (
        // The out-of-credits card (with Watch-ad / Go Pro) is shown by the caller;
        // here we only reassure that the free pacing report is ready.
        <Card accent={palette.warning}>
          <Text style={type.bodyStrong}>You're out of AI scores for now</Text>
          <Text style={[type.caption, { marginTop: 4 }]}>
            Your on-device pacing report above is ready. Add a score below to unlock the full rubric and improved answer.
          </Text>
        </Card>
      ) : (
        <Card accent={failReason === "other" ? palette.danger : palette.warning}>
          <Text style={type.bodyStrong}>
            {failReason === "other"
              ? "Couldn't score this time"
              : queued || failReason === "offline"
                ? "Saved — we'll score it when you're online"
                : "Scoring unavailable"}
          </Text>
          <Text style={[type.caption, { marginTop: 4 }]}>
            {failReason === "other"
              ? "Your answer and pacing report above are saved — no credit was used. Give it another try."
              : "Your pacing report above is ready now. The full rubric score, strengths and an improved answer appear once scoring runs."}
          </Text>
          {onRetry ? (
            <Button
              label={failReason === "other" ? "Retry" : "Try scoring again"}
              icon="refresh"
              variant="secondary"
              onPress={onRetry}
              style={{ marginTop: space.md }}
            />
          ) : null}
        </Card>
      )}

      {/* Improved answer — surfaced directly (not behind a tab) with edits highlighted. */}
      {scored && attempt.improvedAnswer ? (
        <>
        <Card accent={palette.success}>
          <SectionHeader title="Your answer, levelled up" />
          <Text style={[type.caption, { marginTop: space.xs }]}>
            Rewritten at the next band from your own words — <Text style={styles.added}>highlighted</Text> words are what we changed or added.
          </Text>
          <View style={[styles.answerBox, { marginTop: space.sm, borderColor: palette.success }]}>
            <ImprovedAnswer mine={attempt.transcript} improved={attempt.improvedAnswer} />
          </View>
          <View style={{ marginTop: space.sm }}>
            <AudioRow text={attempt.improvedAnswer} speed={speed} onSpeed={setSpeed} />
          </View>
        </Card>
        <AiReport feature="improve_answer" />
        </>
      ) : null}

      {/* Upgrade CTA — separated from the score and placed AFTER the feedback, so a
          user has seen the real estimate, rubric, strengths and rewrite first. Only
          shown for an on-device estimate that can be upgraded to a full AI score. */}
      {scored && estimated && onRetry ? (
        <Card accent={palette.accent}>
          <View style={styles.estimateHead}>
            <Icon name="sparkle" size={18} color={palette.accent} />
            <Text style={[type.bodyStrong, { flex: 1 }]}>Want the full AI score?</Text>
          </View>
          <Text style={[type.caption, { marginTop: 4 }]}>
            Get a per-construct AI breakdown and a rewrite built from your own words — free scored attempts included.
          </Text>
          <Button label="Get the full AI score" icon="sparkle" variant="secondary" onPress={onRetry} style={{ marginTop: space.md }} />
        </Card>
      ) : null}

      {/* Repeat accuracy diff */}
      {attempt.taskType === "repeat" && question.targetSentence ? (
        <Card>
          <SectionHeader title="Word accuracy" />
          <View style={{ marginTop: space.sm }}>
            <RepeatDiff target={question.targetSentence} spoken={attempt.transcript} />
          </View>
        </Card>
      ) : null}

      {/* Compare tabs: Yours / Improved / Sample with native-voice playback */}
      <Card>
        <SectionHeader title="Compare answers" />
        <View style={{ marginTop: space.sm, gap: space.md }}>
          <Segmented<Tab>
            value={tab}
            onChange={setTab}
            options={[
              { value: "yours", label: "Yours" },
              { value: "improved", label: "Improved" },
              { value: "sample", label: "Sample" },
            ]}
          />
          {tab === "improved" && !attempt.improvedAnswer ? (
            <Text style={type.caption}>An improved version appears once this answer is scored.</Text>
          ) : (
            <>
              <View style={[styles.answerBox, tab === "improved" && { borderColor: palette.success, backgroundColor: palette.successSoft }]}>
                <Text style={type.body}>{tabText || "—"}</Text>
              </View>
              {tab === "sample" && question.whyScoresHigh ? (
                <View style={styles.why}>
                  <Icon name="sparkle" size={16} color={palette.primary} />
                  <Text style={[type.caption, { flex: 1 }]}>Why it scores high: {question.whyScoresHigh}</Text>
                </View>
              ) : null}
              {tabText ? <AudioRow text={tabText} speed={speed} onSpeed={setSpeed} /> : null}
            </>
          )}
        </View>
      </Card>

      {/* The question itself, hearable again */}
      <Card>
        <SectionHeader title={attempt.taskType === "repeat" ? "The sentence" : "The question"} />
        <Text style={[type.body, { marginTop: space.sm }]}>{question.promptText}</Text>
        <View style={{ marginTop: space.md, alignSelf: "flex-start" }}>
          <PlayButton text={question.promptText} rate={speed} label="Hear again" variant="ghost" size="sm" />
        </View>
      </Card>
    </View>
  );
}

function isWeakest(a: Attempt, c: string): boolean {
  const entries = Object.entries(a.constructs).filter(([, v]) => typeof v === "number") as [string, number][];
  if (!entries.length) return false;
  const min = Math.min(...entries.map(([, v]) => v));
  const lowest = entries.filter(([, v]) => v === min).map(([k]) => k);
  return lowest[0] === c;
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ flex: 1 }} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={[type.number, { fontSize: 22 }]}>{value}</Text>
      <Text style={type.caption}>{label}</Text>
    </View>
  );
}

function Bullet({ text, tone, icon }: { text: string; tone: "success" | "warning"; icon: "check" | "target" }) {
  return (
    <View style={styles.bullet}>
      <View style={[styles.bulletDot, { backgroundColor: tones[tone].bg }]}>
        <Icon name={icon} size={14} color={tones[tone].fg} />
      </View>
      <Text style={[type.body, { flex: 1 }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pacingRow: { flexDirection: "row", gap: space.md, marginTop: space.sm },
  rubricRow: { gap: 6 },
  rubricHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  bullet: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
  bulletDot: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", marginTop: 1 },
  diffWrap: { flexDirection: "row", flexWrap: "wrap", alignItems: "center" },
  answerBox: { borderWidth: 1, borderColor: palette.border, borderRadius: radius.md, padding: space.md, backgroundColor: palette.surfaceAlt },
  added: { color: palette.success, fontFamily: fonts.semibold, backgroundColor: palette.successSoft },
  why: { flexDirection: "row", gap: space.sm, alignItems: "flex-start" },
  estimateHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  // A slim one-line "what this is" note — tinted with the brand teal, never the
  // off-palette amber warning box, and visually lighter than a full Card.
  estimateNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    backgroundColor: palette.primarySoft,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
});
