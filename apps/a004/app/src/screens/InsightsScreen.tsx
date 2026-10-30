import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  AiReport, BarChart, Button, Card, DonutChart, EmptyState, HeroCard, Icon, Legend, Pill, ProgressBar, ProgressRing,
  Screen, SectionHeader, Sheet, Skeleton, TextField, feedback, gradient, palette, radius, space, toast, type,
  type IconName,
} from "../ui";
import { art } from "../art";
import { useSugar, sugarStore } from "../core/data";
import { useSettings } from "../modules/store";
import { analytics } from "../modules/analytics";
import { ai } from "../modules/ai";
import { activeProfile, liveReadings, CONTEXTS, CONTEXT_LABEL, SLOT_LABEL } from "../core/model";
import { classify } from "../core/readings";
import {
  a1cForWindow, averagesByContext, timeInRange, daySeries, bestWorstMeals, compareDinnerStaple,
  insightsReady, overallAverage, A1C_FORMULA,
} from "../core/insights";
import { addSwapGoal } from "../core/profiles";
import { consumeAi, canUseAi, aiRemainingAt } from "../core/pro";
import { dayKey } from "../core/dates";
import { formatValue, UNIT_LABEL } from "../core/units";
import { nowTs, levelColor } from "./shared";

type Win = 7 | 30 | 90;

/** Insights: A1C estimate, time-in-range, averages, trend, personal food insights, AI narrative. */
export function InsightsScreen({ bottomInset, onPro, onLogMeal }: { bottomInset: number; onPro: (from: string) => void; onLogMeal: (snap?: boolean) => void }) {
  const data = useSugar();
  const settings = useSettings();
  const profile = activeProfile(data);
  const unit = profile.unit;
  // `now` is pinned for the screen's lifetime (it only refreshes when the data changes), NOT read
  // fresh on every render: nowTs() ticks each minute, which would otherwise keep invalidating the
  // window memos below and re-run every full-store scan — a soak-test main-thread hog.
  const now = useMemo(() => nowTs(), [data]);
  const [win, setWin] = useState<Win>(30);
  const [coach, setCoach] = useState(false);

  useEffect(() => { analytics.track("insight_viewed"); }, []);

  const a1c = useMemo(() => a1cForWindow(data, now, win), [data, now, win]);
  const tir = useMemo(() => timeInRange(data, now, win), [data, now, win]);
  const avgs = useMemo(() => averagesByContext(data, now, win), [data, now, win]);
  // Memoised like the others — these scan the whole log, so they must not re-run on every render
  // (e.g. while the monkey/soak test scrolls or toggles coaching).
  const overall = useMemo(() => overallAverage(data, now, win), [data, now, win]);
  const series = useMemo(() => daySeries(data, now, 7), [data, now]);
  const bw = useMemo(() => bestWorstMeals(data, 3), [data]);
  const ready = useMemo(() => insightsReady(data, 3), [data]);
  // Time-in-range only means something with a few readings — never a misleading
  // "100% in range" from a single reading. Below 3 we show the count instead.
  const tirReady = tir.total >= 3;
  const compare = useMemo(() => compareDinnerStaple(data, "rice", "roti", "rice", "roti"), [data]);
  const hasData = useMemo(() => liveReadings(data).length > 0, [data]);

  const fmt = (mgdl: number | null) => (mgdl == null ? "—" : formatValue(mgdl, unit));
  const chartData = series.map((d) => ({ label: d.day.slice(8), value: d.avgMgdl == null ? 0 : Math.round(unit === "mmol" ? (d.avgMgdl / 18.0182) : d.avgMgdl) }));
  const todayIdx = series.length - 1;

  const adoptSwap = (text: string) => {
    sugarStore.set(addSwapGoal(data, { text, targetCount: 3 }, now).state);
    feedback("success", "success");
    analytics.track("swap_adopted");
    toast("Swap goal added — try it 3× this week");
  };

  // Plain-text summary of the user's own log for the AI narrative (no raw ids, device data).
  const summaryText = () => {
    const lines = [
      `Window: last ${win} days. Unit: ${UNIT_LABEL[unit]}.`,
      `Overall average: ${fmt(overall.avgMgdl)} ${UNIT_LABEL[unit]} (n=${overall.n}).`,
      `Estimated A1C: ${a1c.a1c == null ? "n/a" : a1c.a1c + "%"} from ${a1c.n} readings.`,
      `Time in range ${tir.pctInRange}%, high ${tir.pctHigh}%, low ${tir.pctLow}%.`,
    ];
    for (const c of CONTEXTS) if (avgs[c].n) lines.push(`${CONTEXT_LABEL[c]} average ${fmt(avgs[c].avgMgdl)} (n=${avgs[c].n}).`);
    if (bw.sample) {
      if (bw.best[0]) lines.push(`Steadiest meal: ${bw.best[0].label} (after ${formatValue(bw.best[0].postMgdl, unit)}).`);
      if (bw.worst[0]) lines.push(`Biggest rise: ${bw.worst[0].label} (after ${formatValue(bw.worst[0].postMgdl, unit)}).`);
    }
    if (compare.enough) lines.push(compare.note);
    return lines.join("\n");
  };

  // A real first-run empty state (not a stack of "no data yet" cards): one calm illustration and a
  // clear next step, so the screen never looks broken or flat before the user has logged anything.
  if (!hasData) {
    return (
      <Screen title="Insights" subtitle="From your own log" bottomInset={bottomInset}>
        <Card>
          <EmptyState
            art={art.empty_insights}
            title="Your insights start with one reading"
            body="Log a glucose reading or a meal and this screen fills in: your estimated A1C, time in range, averages by meal context, a 7-day trend and which of your meals are steadiest."
          />
        </Card>
        <Card>
          <Text style={[type.label, { marginBottom: space.xs }]}>WHAT YOU'LL SEE</Text>
          <Preview icon="insights" label="Estimated A1C — works without 3 readings a day" />
          <Preview icon="check" label="Time in range, with averages by fasting / post-meal" />
          <Preview icon="meal" label="Your steadiest and biggest-rise meals, ranked" />
        </Card>
        <Text style={[type.caption, { textAlign: "center" }]}>
          Wellness information only — not medical, dosing or treatment advice.
        </Text>
      </Screen>
    );
  }

  return (
    <>
      <Screen
        title="Insights"
        subtitle="From your own log"
        bottomInset={bottomInset}
      >
        <View style={styles.segWrap}>
          {([7, 30, 90] as Win[]).map((w) => (
            <Button key={w} label={`${w} days`} size="sm" variant={w === win ? "primary" : "ghost"} onPress={() => setWin(w)} style={{ flex: 1 }} />
          ))}
        </View>

        <HeroCard
          overline={`Estimated A1C · ${win} days`}
          value={a1c.a1c == null ? "—" : `${a1c.a1c}%`}
          caption={a1c.a1c == null ? "Log a few readings to see your estimate." : `Avg ${fmt(a1c.avgMgdl)} ${UNIT_LABEL[unit]} · ${a1c.n} reading${a1c.n === 1 ? "" : "s"}`}
          status={
            tirReady
              ? { label: `${tir.pctInRange}% in range`, tone: tir.pctInRange >= 70 ? "success" : "warning" }
              : tir.total
                ? { label: `${tir.total} reading${tir.total === 1 ? "" : "s"} so far`, tone: "neutral" }
                : undefined
          }
          right={
            <ProgressRing
              value={tirReady ? tir.pctInRange / 100 : Math.min(tir.total, 3) / 3}
              size={92}
              stroke={10}
              color={gradient.onHero}
              track={gradient.pill}
              labelColor={gradient.onHero}
              label={tirReady ? `${tir.pctInRange}%` : tir.total ? String(tir.total) : "—"}
              sublabel={tirReady ? "in range" : "readings"}
            />
          }
        />
        <Card>
          <Text style={type.caption}>{A1C_FORMULA}</Text>
          <Text style={[type.caption, { marginTop: 4 }]}>{a1c.confidence}</Text>
        </Card>

        {/* Time in range */}
        <SectionHeader title="Time in range" />
        <Card>
          {tir.total === 0 ? (
            <Text style={[type.body, { color: palette.inkSoft }]}>No readings in this window yet.</Text>
          ) : !tirReady ? (
            <Text style={[type.body, { color: palette.inkSoft }]}>
              Your time-in-range breakdown appears once you have at least 3 readings — you have {tir.total} so far.
            </Text>
          ) : (
            <View style={styles.tirRow}>
              <DonutChart
                size={132}
                stroke={20}
                label={`${tir.pctInRange}%`}
                sublabel="in range"
                data={[
                  { label: "In range", value: tir.inRange, color: palette.success },
                  { label: "High", value: tir.high, color: palette.warning },
                  { label: "Low", value: tir.low, color: palette.danger },
                ]}
              />
              <View style={{ flex: 1 }}>
                <Legend
                  items={[
                    { label: "In range", value: `${tir.pctInRange}%`, color: palette.success },
                    { label: "High", value: `${tir.pctHigh}%`, color: palette.warning },
                    { label: "Low", value: `${tir.pctLow}%`, color: palette.danger },
                  ]}
                />
              </View>
            </View>
          )}
        </Card>

        {/* Averages by category */}
        <SectionHeader title="Averages by category" />
        <Card padded={false} style={{ paddingHorizontal: space.lg }}>
          <Row label="Overall" value={fmt(overall.avgMgdl)} unit={unit} n={overall.n} />
          {CONTEXTS.map((c) => {
            const a = avgs[c];
            const lvl = a.avgMgdl != null ? classify(a.avgMgdl, c, profile) : null;
            return <Row key={c} label={CONTEXT_LABEL[c]} value={fmt(a.avgMgdl)} unit={unit} n={a.n} color={lvl ? levelColor(lvl.level) : undefined} />;
          })}
        </Card>

        {/* Trend */}
        <SectionHeader title="Last 7 days" />
        <Card>
          {series.every((d) => d.avgMgdl == null) ? (
            <Text style={[type.body, { color: palette.inkSoft }]}>Daily averages appear here as you log.</Text>
          ) : (
            <BarChart data={chartData} highlight={todayIdx} showValues color={palette.primary} format={(v) => (v ? String(v) : "")} />
          )}
          <Text style={[type.caption, { marginTop: space.sm }]}>Daily average {UNIT_LABEL[unit]}.</Text>
        </Card>

        {/* Personal food insights */}
        <SectionHeader title="What your meals do" />
        <Text style={[type.caption, { color: palette.inkSoft, marginBottom: space.xs }]}>
          Your meal rankings and rice-vs-roti comparisons are free forever. Pro only adds the AI narrative and cloud sync.
        </Text>
        {!ready.ready ? (
          <>
            <Card style={{ gap: space.sm }}>
              <View style={styles.readyHead}>
                <View style={styles.readyIcon}><Icon name="meal" size={18} color={palette.primary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={type.bodyStrong}>Almost there</Text>
                  <Text style={[type.caption, { color: palette.inkSoft }]} numberOfLines={2}>
                    Link {ready.need} more meal{ready.need === 1 ? "" : "s"} with an after-meal reading to rank your steadiest and biggest-rise plates.
                  </Text>
                </View>
              </View>
              <ProgressBar value={ready.have / 3} tone="primary" />
              <Text style={[type.caption, { textAlign: "center" }]}>{ready.have} of 3 linked meals</Text>
              <Button label="Link a meal to a reading" variant="secondary" icon="meal" onPress={() => onLogMeal(false)} />
            </Card>

            {/* A clearly-labelled EXAMPLE so a first-week user can see the payoff that's coming — never
                mistaken for their own data (the "Example" pill + the explicit footnote make that plain). */}
            <Card style={{ gap: space.xs }}>
              <View style={styles.exampleHead}>
                <Text style={type.label}>WHAT'S COMING</Text>
                <Pill label="Example" tone="neutral" />
              </View>
              <Text style={type.bodyStrong}>Rice vs roti dinners</Text>
              <Text style={[type.body, { color: palette.inkSoft }]}>
                Mornings after rice dinners averaged {fmt(128)} {UNIT_LABEL[unit]}, vs {fmt(112)} after roti — roti looked a little gentler for you.
              </Text>
              <Text style={[type.caption, { color: palette.inkMuted }]}>
                A preview from sample data. Your own comparison fills in once you've linked 3 meals.
              </Text>
            </Card>
          </>
        ) : (
          <>
            <Card padded={false} style={{ paddingHorizontal: space.lg }}>
              <Text style={[type.label, { paddingTop: space.md }]}>STEADIEST ({bw.sample} linked)</Text>
              {bw.best.map((m) => (
                <MealRankRow key={m.mealId} label={m.label} slot={SLOT_LABEL[m.slot]} value={formatValue(m.postMgdl, unit)} unit={unit} tone="success" />
              ))}
              <Text style={[type.label, { paddingTop: space.md }]}>BIGGEST RISES</Text>
              {bw.worst.map((m) => (
                <MealRankRow key={m.mealId} label={m.label} slot={SLOT_LABEL[m.slot]} value={formatValue(m.postMgdl, unit)} unit={unit} tone="warning" />
              ))}
            </Card>
            <Card>
              <Text style={[type.label, { marginBottom: space.xs }]}>RICE VS ROTI DINNERS</Text>
              <Text style={[type.body, { color: palette.inkSoft }]}>{compare.note}</Text>
            </Card>
          </>
        )}

        {bw.worst[0] ? (
          <Button
            label="Set a swap goal from your biggest rise"
            variant="secondary"
            icon="insights"
            onPress={() => adoptSwap(`Swap or shrink ${bw.worst[0].label.split(",")[0]} this week`)}
          />
        ) : null}

        {/* AI narrative + coach (Pro) */}
        <SectionHeader title="AI coach" />
        <AiNarrative data={data} pro={settings.pro} onPro={onPro} summary={summaryText} />
        <Button label="Ask the meal coach" variant="secondary" icon="meal" onPress={() => (settings.pro ? setCoach(true) : onPro("ai_coach"))} />
        <Text style={[type.caption, { textAlign: "center" }]}>
          Wellness information only — not medical, dosing or treatment advice.
        </Text>
      </Screen>

      {coach ? <CoachSheet data={data} onPro={onPro} onClose={() => setCoach(false)} /> : null}
    </>
  );

  function MealRankRow({ label, slot, value, unit, tone }: { label: string; slot: string; value: string; unit: string; tone: "success" | "warning" }) {
    return (
      <View style={styles.rankRow}>
        <View style={[styles.rankDot, { backgroundColor: (tone === "success" ? palette.success : palette.warning) + "22" }]}>
          <Icon name={tone === "success" ? "check" : "arrowUp"} size={14} color={tone === "success" ? palette.success : palette.warning} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={type.bodyStrong} numberOfLines={1}>{label}</Text>
          <Text style={type.caption}>{slot} · after-meal</Text>
        </View>
        <Text style={[type.amount]}>{value} {unit === "mmol" ? "mmol/L" : "mg/dL"}</Text>
      </View>
    );
  }
}

/** A single "what you'll see" preview row for the first-run empty state. */
function Preview({ icon, label }: { icon: IconName; label: string }) {
  return (
    <View style={styles.previewRow}>
      <View style={styles.previewIcon}><Icon name={icon} size={16} color={palette.primary} /></View>
      <Text style={[type.body, { flex: 1, color: palette.inkSoft }]}>{label}</Text>
    </View>
  );
}

function Row({ label, value, unit, n, color }: { label: string; value: string; unit: string; n: number; color?: string }) {
  return (
    <View style={styles.avgRow}>
      {color ? <View style={[styles.avgDot, { backgroundColor: color }]} /> : <View style={styles.avgDotEmpty} />}
      <Text style={[type.body, { flex: 1 }]}>{label}</Text>
      <Text style={type.caption}>n={n}</Text>
      <Text style={[type.amount, { minWidth: 72, textAlign: "right" }]}>{value === "—" ? "—" : `${value} ${unit === "mmol" ? "mmol/L" : "mg/dL"}`}</Text>
    </View>
  );
}

// ── AI weekly narrative (Pro) ──────────────────────────────────────────────────────
function AiNarrative({ data, pro, onPro, summary }: { data: ReturnType<typeof useSugar>; pro: boolean; onPro: (from: string) => void; summary: () => string }) {
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    if (!pro) return onPro("ai_weekly_narrative");
    if (!canUseAi(data, true, dayKey(nowTs()))) return onPro("ai_quota");
    setBusy(true);
    setErr(null);
    const res = await ai.run("weekly_narrative", summary());
    setBusy(false);
    if (!res.ok) {
      if (res.reason === "quota") return onPro("ai_quota");
      feedback("error", "error");
      return setErr(res.reason === "offline" ? "You're offline — try again when connected." : "Couldn't write a summary right now.");
    }
    sugarStore.set(consumeAi(data, dayKey(nowTs())));
    feedback("success", "success");
    setText(res.text.trim());
  };

  return (
    <Card>
      <View style={styles.proHead}>
        <Text style={type.bodyStrong}>Weekly summary</Text>
        {!pro ? <Pill label="Pro" tone="primary" /> : null}
      </View>
      {busy ? (
        <View style={{ gap: 8, marginTop: space.xs }} accessibilityLabel="Writing your summary">
          <Skeleton width="100%" height={14} />
          <Skeleton width="92%" height={14} />
          <Skeleton width="58%" height={14} />
        </View>
      ) : text ? (
        <>
          <Text style={[type.body, { color: palette.inkSoft }]}>{text}</Text>
          <AiReport feature="weekly_narrative" />
        </>
      ) : (
        <Text style={type.caption}>A warm, plain-language summary of your week with one question to bring to your doctor.</Text>
      )}
      {err ? <Text style={[type.caption, { color: palette.danger }]}>{err}</Text> : null}
      <Button label={text ? "Refresh summary" : pro ? "Write my summary" : "Unlock weekly summary"} variant={pro ? "secondary" : "primary"} loading={busy} onPress={run} style={{ marginTop: space.sm }} />
    </Card>
  );
}

// ── AI meal coach chat (Pro) ───────────────────────────────────────────────────────
function CoachSheet({ data, onPro, onClose }: { data: ReturnType<typeof useSugar>; onPro: (from: string) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [a, setA] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const ask = async () => {
    const input = q.trim();
    if (!input) return;
    if (!canUseAi(data, true, dayKey(nowTs()))) return onPro("ai_quota");
    setBusy(true); setErr(null);
    const res = await ai.run("meal_coach", input);
    setBusy(false);
    if (!res.ok) {
      if (res.reason === "quota") return onPro("ai_quota");
      feedback("error", "error");
      return setErr(res.reason === "offline" ? "You're offline — try again when connected." : "The coach is unavailable right now.");
    }
    sugarStore.set(consumeAi(data, dayKey(nowTs())));
    feedback("success", "success");
    setA(res.text.trim());
  };

  return (
    <Sheet visible title="Meal coach" onClose={onClose}>
      <Text style={[type.caption]}>Ask about food choices, portions and swaps for your cuisine. Wellness only — no dosing or treatment advice.</Text>
      {busy ? (
        <Card>
          <View style={{ gap: 8 }} accessibilityLabel="Thinking">
            <Skeleton width="100%" height={14} />
            <Skeleton width="85%" height={14} />
            <Skeleton width="55%" height={14} />
          </View>
        </Card>
      ) : a ? (
        <Card>
          <Text style={type.body}>{a}</Text>
          <AiReport feature="meal_coach" />
        </Card>
      ) : null}
      <TextField label="Your question" placeholder="e.g. Is millet roti gentler than wheat?" value={q} onChangeText={(t) => { setQ(t); setErr(null); }} error={err} multiline />
      <Button label="Ask" size="lg" icon="insights" loading={busy} onPress={ask} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  segWrap: { flexDirection: "row", gap: space.sm, backgroundColor: palette.surfaceAlt, borderRadius: radius.md, padding: 3 },
  tirRow: { flexDirection: "row", alignItems: "center", gap: space.lg },
  avgRow: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 44, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.border },
  avgDot: { width: 10, height: 10, borderRadius: 5 },
  avgDotEmpty: { width: 10, height: 10 },
  rankRow: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 52, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.border },
  rankDot: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  proHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: space.xs },
  previewRow: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 40 },
  previewIcon: { width: 28, height: 28, borderRadius: 8, backgroundColor: palette.primarySoft, alignItems: "center", justifyContent: "center" },
  readyHead: { flexDirection: "row", alignItems: "center", gap: space.md },
  readyIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: palette.primarySoft, alignItems: "center", justifyContent: "center" },
  exampleHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
});
