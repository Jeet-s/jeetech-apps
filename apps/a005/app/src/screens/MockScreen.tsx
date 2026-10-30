import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  AiReport,
  Button,
  Card,
  EmptyState,
  HeroCard,
  Icon,
  Pill,
  ProgressBar,
  ProgressRing,
  Screen,
  SectionHeader,
  feedback,
  gradient,
  palette,
  space,
  toast,
  type,
} from "../ui";
import { art } from "../art";
import type { ScreenProps } from "./nav";
import { ai } from "../modules/ai";
import { analytics } from "../modules/analytics";
import { useSettings } from "../modules/store";
import { bandUpStore, useBandUp } from "../core/data";
import {
  CONSTRUCT_LABEL,
  CONSTRUCTS,
  MOCK_INTERVIEW_ITEMS,
  MOCK_REPEAT_ITEMS,
  MOCK_TOTAL_ITEMS,
  type Construct,
  type MockSession,
} from "../core/model";
import { startMock, finishMock, resumableMock, completedMocks, canStartMock } from "../core/mock";
import { attemptById } from "../core/model";

const dateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const RULES = [
  { icon: "headset", text: `${MOCK_REPEAT_ITEMS} Listen & Repeat items, then ${MOCK_INTERVIEW_ITEMS} Interview questions` },
  { icon: "clock", text: "Exam timing, no prep time, no pausing between items" },
  { icon: "chart", text: "One section report with your estimated score and a study plan" },
  { icon: "lock", text: "Runs offline — scoring is queued if you're not online" },
] as const;

/** Mock speaking test: rules → full run (via the attempt flow) → section report. */
export function MockScreen({ bottomInset, onPro, onStart }: ScreenProps) {
  const data = useBandUp();
  const settings = useSettings();
  const today = dateKey(new Date());
  const [report, setReport] = useState<{ summary: string; plan: string[] } | null>(null);

  const resumable = resumableMock(data);
  const done = completedMocks(data);
  const last = done[done.length - 1];
  const canStart = canStartMock(data, settings.pro);

  const run = (mockId: string, ids: string[]) => {
    onStart(
      { title: "Mock test", questionIds: ids, mode: "mock", mockId, summary: false },
      () => {
        bandUpStore.set((s) => finishMock(s, mockId, today));
        analytics.track("mock_completed", {});
        feedback("unlock", "success");
        void buildReport(mockId);
      },
    );
  };

  const begin = () => {
    feedback("tap", "medium");
    const r = startMock(data, settings.pro, today, data.nextId + 3);
    if (r.error === "locked") return onPro("mock");
    if (!r.id) return;
    const mockId = r.id;
    bandUpStore.set(r.state);
    const ids = r.state.mocks.find((m) => m.id === mockId)?.questionIds ?? [];
    analytics.track("mock_started", {});
    setReport(null);
    run(mockId, ids);
  };

  const resume = () => {
    if (!resumable) return;
    feedback("tap", "medium");
    const remaining = resumable.questionIds.slice(resumable.attemptIds.length);
    run(resumable.id, remaining.length ? remaining : resumable.questionIds);
  };

  /** AI section report (summary + plan). Falls back silently; the score itself
   *  is computed on-device so the report is useful even offline. */
  const buildReport = async (mockId: string) => {
    const m = bandUpStore.get().mocks.find((x) => x.id === mockId);
    if (!m) return;
    const scores = m.attemptIds
      .map((id) => attemptById(bandUpStore.get(), id))
      .filter((a): a is NonNullable<typeof a> => !!a && a.status === "scored")
      .map((a) => ({ taskType: a.taskType, band6: a.band6, constructs: a.constructs }));
    if (!scores.length || !ai.enabled) return;
    const r = await ai.run("mock_report", JSON.stringify({ scores }));
    if (r.ok) {
      const j = (r.json ?? safe(r.text)) as { summary?: string; plan?: string[] } | null;
      if (j && typeof j.summary === "string" && Array.isArray(j.plan)) {
        setReport({ summary: j.summary, plan: j.plan.filter((p) => typeof p === "string") });
      }
    }
  };

  return (
    <Screen title="Mock test" subtitle="Full speaking section" bottomInset={bottomInset}>
      {resumable ? (
        <Card accent={palette.accent}>
          <View style={styles.rowBetween}>
            <View style={{ flex: 1 }}>
              <Text style={type.bodyStrong}>Mock in progress</Text>
              <Text style={type.caption}>{resumable.attemptIds.length} of {MOCK_TOTAL_ITEMS} items answered</Text>
            </View>
            <Pill label="Resume" tone="warning" />
          </View>
          <Button label="Resume mock" icon="arrowRight" onPress={resume} style={{ marginTop: space.md }} />
        </Card>
      ) : null}

      {last ? <MockReport mock={last} report={report} /> : null}

      {!resumable ? (
        <>
          <HeroCard
            overline="Mock speaking test"
            value={`${MOCK_TOTAL_ITEMS} items`}
            caption="Simulates the real section end to end"
            status={{ label: settings.pro ? "Pro · unlimited mocks" : canStart ? "First mock free" : "Pro unlocks more mocks", tone: settings.pro ? "primary" : canStart ? "success" : "warning" }}
            right={<Icon name="trophy" size={60} color={gradient.onHero} />}
          />
          <Card>
            <SectionHeader title="How it works" />
            <View style={{ gap: space.md, marginTop: space.sm }}>
              {RULES.map((r, i) => (
                <View key={i} style={styles.rule}>
                  <View style={styles.ruleIcon}><Icon name={r.icon as never} size={18} color={palette.primary} /></View>
                  <Text style={[type.body, { flex: 1 }]}>{r.text}</Text>
                </View>
              ))}
            </View>
          </Card>

          {canStart ? (
            <Button label={last ? "Start another mock" : "Start mock test"} size="lg" icon="trophy" onPress={begin} />
          ) : (
            <Card accent={palette.accent}>
              <EmptyState
                art={art.empty_queue}
                title="Unlock full mocks with Pro"
                body="You've used your free mock preview. Pro unlocks unlimited mock tests, section reports and all question packs."
                action={<Button label="See Pro plans" icon="star" onPress={() => onPro("mock")} />}
              />
            </Card>
          )}
        </>
      ) : null}
    </Screen>
  );
}

function MockReport({ mock, report }: { mock: MockSession; report: { summary: string; plan: string[] } | null }) {
  const data = useBandUp();
  const attempts = mock.attemptIds.map((id) => data.attempts.find((a) => a.id === id)).filter(Boolean) as NonNullable<ReturnType<typeof data.attempts.find>>[];
  const scored = attempts.filter((a) => typeof a.band6 === "number");
  const perConstruct: { c: Construct; avg: number }[] = CONSTRUCTS.map((c) => {
    const vals = scored.map((a) => a.constructs[c]).filter((v): v is number => typeof v === "number");
    return { c, avg: vals.length ? vals.reduce((x, y) => x + y, 0) / vals.length : 0 };
  }).filter((x) => x.avg > 0);
  const weakest = perConstruct.length ? perConstruct.reduce((lo, x) => (x.avg < lo.avg ? x : lo)) : null;
  const plan = report?.plan?.length
    ? report.plan
    : [
        weakest ? `Drill ${CONSTRUCT_LABEL[weakest.c]} — your lowest skill this mock.` : "Keep practicing both task types.",
        "Repeat the mock after a few drills to see your estimated band move.",
        "Review each answer's improved version and say it out loud.",
      ];
  return (
    <>
      <HeroCard
        overline="Your last mock · estimated"
        value={mock.sectionScore30 !== null ? `${mock.sectionScore30}` : "—"}
        caption={mock.sectionScore30 !== null ? "of 30 · estimate, not an official score" : "Scoring pending — reconnect to finish"}
        status={{ label: `${scored.length}/${MOCK_TOTAL_ITEMS} scored`, tone: scored.length === MOCK_TOTAL_ITEMS ? "success" : "warning" }}
        right={
          <ProgressRing
            value={(mock.sectionScore30 ?? 0) / 30}
            size={92}
            stroke={9}
            color={gradient.onHero}
            track={gradient.pill}
            labelColor={gradient.onHero}
            label={mock.sectionScore30 !== null ? `${mock.sectionScore30}` : "—"}
            sublabel="/ 30"
          />
        }
      />
      {report?.summary ? (
        <Card>
          <SectionHeader title="Summary" />
          <Text style={[type.body, { marginTop: space.sm }]}>{report.summary}</Text>
        </Card>
      ) : null}
      {perConstruct.length ? (
        <Card>
          <SectionHeader title="By skill" />
          <View style={{ gap: space.md, marginTop: space.sm }}>
            {perConstruct.map((x) => (
              <View key={x.c} style={{ gap: 6 }}>
                <View style={styles.rowBetween}>
                  <Text style={[type.label, { color: palette.ink }]}>{CONSTRUCT_LABEL[x.c]}</Text>
                  <Text style={[type.amount, { fontSize: 14 }]}>{x.avg.toFixed(1)}/6</Text>
                </View>
                <ProgressBar value={x.avg / 6} tone={weakest && x.c === weakest.c ? "warning" : "primary"} />
              </View>
            ))}
          </View>
        </Card>
      ) : null}
      <Card>
        <SectionHeader title="Your study plan" />
        <View style={{ gap: space.sm, marginTop: space.sm }}>
          {plan.map((p, i) => (
            <View key={i} style={styles.rule}>
              <View style={styles.ruleIcon}><Text style={[type.label, { color: palette.primary }]}>{i + 1}</Text></View>
              <Text style={[type.body, { flex: 1 }]}>{p}</Text>
            </View>
          ))}
        </View>
      </Card>
      {report ? <AiReport feature="mock_report" /> : null}
    </>
  );
}

function safe(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

const styles = StyleSheet.create({
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
  rule: { flexDirection: "row", alignItems: "center", gap: space.md },
  ruleIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: palette.primarySoft, alignItems: "center", justifyContent: "center" },
});
