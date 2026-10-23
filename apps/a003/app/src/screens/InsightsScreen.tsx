import { useEffect, useMemo, useState } from "react";
import { Share, StyleSheet, Text, View } from "react-native";
import {
  BarChart,
  Button,
  Card,
  DonutChart,
  EmptyState,
  HeroCard,
  Icon,
  Legend,
  Pill,
  ProgressBar,
  Screen,
  Segmented,
  SectionHeader,
  Stat,
  categorical,
  palette,
  space,
  toast,
  type,
} from "../ui";
import { art } from "../art";
import {
  advancedInsights,
  blocksInRange,
  blocksToCSV,
  distributionByColor,
  distributionByTag,
  dayStreak,
  plannedVsDone,
} from "../core/stats";
import { addDays, dateKey, fmtDuration, weekdayLabel } from "../core/time";
import { duration } from "../core/blocks";
import { useBlockDay } from "../core/data";
import { useSettings } from "../modules/store";
import { analytics } from "../modules/analytics";

type Range = "7" | "30" | "90";

/** Insights: where did my time go? Free distribution/streaks + Pro advanced analytics. */
export function InsightsScreen({ bottomInset, onPro }: { bottomInset: number; onPro: (from: string) => void }) {
  const data = useBlockDay();
  const { pro } = useSettings();
  const today = dateKey(new Date());
  const [range, setRange] = useState<Range>("7");
  const [groupBy, setGroupBy] = useState<"color" | "tag">("color");
  const days = Number(range);

  useEffect(() => {
    analytics.track("insights_view", { range: days });
  }, [days]);

  const from = addDays(today, -(days - 1));
  const blocks = useMemo(() => blocksInRange(data, from, today), [data, from, today]);
  const doneBlocks = blocks.filter((b) => b.status === "done");
  const totalDone = doneBlocks.reduce((s, b) => s + (b.actualMin ?? duration(b)), 0);
  const pvd = plannedVsDone(blocks);
  const streak = dayStreak(data, today);

  // Distribution: show completed time once blocks are done; until then fall back
  // to the PLANNED split so the chart (and its colour/tag filter) is live from
  // day one instead of a dead "finish some blocks" placeholder.
  const plannedBlocks = blocks.filter((b) => b.status !== "skipped");
  const plannedTotal = plannedBlocks.reduce((s, b) => s + duration(b), 0);
  const basis: "planned" | "done" = totalDone > 0 ? "done" : "planned";
  const distTotal = basis === "done" ? totalDone : plannedTotal;
  const rawDist = (groupBy === "color" ? distributionByColor(blocks, basis) : distributionByTag(blocks, basis)).slice(0, 6);
  const distData = rawDist.map((s, i) => ({
    label: groupBy === "tag" ? `#${s.label}` : s.label,
    value: s.minutes,
    color: groupBy === "color" ? s.key : categorical[i % categorical.length],
  }));

  const last7 = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(today, -6 + i);
    const mins = data.blocks.filter((b) => b.date === day && b.status === "done").reduce((s, b) => s + (b.actualMin ?? duration(b)), 0);
    return { label: weekdayLabel(day).slice(0, 1), value: Math.round((mins / 60) * 10) / 10 };
  });

  const advanced = advancedInsights(data, today, days, pro);

  const exportCsv = async () => {
    if (!blocks.length) return toast("Nothing to export yet");
    analytics.track("export_csv");
    try { await Share.share({ message: blocksToCSV(blocks) }); } catch { /* cancelled */ }
  };

  const empty = plannedBlocks.length === 0;

  return (
    <Screen title="Insights" subtitle={`Last ${days} days`} bottomInset={bottomInset}>
      <Segmented
        options={[{ value: "7", label: "7 days" }, { value: "30", label: "30 days" }, { value: "90", label: "90 days" }]}
        value={range}
        onChange={setRange}
      />

      <HeroCard
        overline={basis === "done" ? "Time completed" : "Time planned"}
        value={fmtDuration(basis === "done" ? totalDone : plannedTotal)}
        caption={
          basis === "done"
            ? `${doneBlocks.length} block${doneBlocks.length === 1 ? "" : "s"} done · ${Math.round(pvd.completion * 100)}% of planned`
            : `${plannedBlocks.length} block${plannedBlocks.length === 1 ? "" : "s"} planned · finish them to track completed time`
        }
        status={streak > 0 ? { label: `${streak}-day streak`, tone: "warning" } : undefined}
      />

      {/* Focus streak — the day-complete streak that rewards realistic planning
          (offline, no account). Always shown so the win is visible from day one. */}
      <Card style={styles.streakCard}>
        <View style={styles.streakIcon}><Icon name="flame" size={22} color={palette.warning} /></View>
        <View style={{ flex: 1 }}>
          <Text style={type.bodyStrong}>{streak > 0 ? `${streak}-day focus streak` : "Start a focus streak"}</Text>
          <Text style={type.caption}>
            {streak > 0 ? "Finish at least one block each day to keep it going." : "Finish one block today to light your first day."}
          </Text>
        </View>
        {pvd.planned > 0 ? <Pill label={`${Math.round(pvd.completion * 100)}% done`} tone={pvd.completion >= 0.85 ? "success" : "primary"} /> : null}
      </Card>

      {empty ? (
        <Card>
          <EmptyState
            art={art.empty_stats}
            title="Plan a few blocks to see your time"
            body="Add blocks on Today and your time distribution, streaks and trends appear here — planned first, then completed as you finish them."
          />
        </Card>
      ) : (
        <>
          <Card style={{ gap: space.md }}>
            <SectionHeader title="Planned vs completed" />
            <View style={styles.row}>
              <Stat value={fmtDuration(pvd.planned)} label="planned" tone={palette.primary} />
              <Stat value={fmtDuration(pvd.done)} label="completed" tone={palette.success} />
              <Stat value={`${Math.round(pvd.completion * 100)}%`} label="completion" />
            </View>
            <ProgressBar value={pvd.completion} />
          </Card>

          {/* Time distribution — filter by colour or tag; shows planned until blocks are done. */}
          <Card style={{ gap: space.md }}>
            <SectionHeader
              title="Where your time goes"
              action={<Pill label={basis === "done" ? "Completed" : "Planned"} tone={basis === "done" ? "success" : "primary"} />}
            />
            <Segmented
              options={[{ value: "color", label: "By colour" }, { value: "tag", label: "By tag" }]}
              value={groupBy}
              onChange={setGroupBy}
            />
            {distData.length ? (
              <View style={styles.donutCard}>
                <DonutChart data={distData} size={132} stroke={20} label={fmtDuration(distTotal)} sublabel={basis === "done" ? "done" : "planned"} />
                <View style={{ flex: 1 }}>
                  <Legend items={distData.map((d) => ({ label: d.label, value: fmtDuration(d.value), color: d.color }))} />
                </View>
              </View>
            ) : (
              <Text style={[type.caption, { textAlign: "center", paddingVertical: space.md }]}>
                {groupBy === "tag" ? "Add tags to your blocks to break time down by tag." : "No time to show for this range yet."}
              </Text>
            )}
          </Card>

          <Card style={{ gap: space.md }}>
            <SectionHeader title="Completed per day" action={<Text style={type.caption}>hours</Text>} />
            <BarChart data={last7} highlight={6} showValues color={palette.primary} format={(v) => (v ? `${v}h` : "")} />
          </Card>

          {/* Advanced (Pro) */}
          {pro && advanced ? (
            <Card style={{ gap: space.md }}>
              <SectionHeader title="Advanced analytics" action={<Pill label="Pro" tone="primary" />} />
              <View style={styles.row}>
                <Stat value={`${Math.round(advanced.overrunRate * 100)}%`} label="ran over plan" tone={palette.warning} />
                <Stat value={fmtDuration(advanced.totalDoneMin)} label="total completed" />
              </View>
              <Text style={type.label}>Average per weekday</Text>
              <BarChart
                data={advanced.byWeekday.map((w) => ({ label: w.weekday.slice(0, 1), value: Math.round(w.minutes / 60 * 10) / 10 }))}
                showValues
                format={(v) => (v ? `${v}h` : "")}
                color={palette.accent}
              />
            </Card>
          ) : !pro ? (
            <Card style={styles.upsell}>
              <Text style={type.heading}>Unlock advanced analytics</Text>
              <Text style={[type.body, { color: palette.inkSoft }]}>Overrun rates, weekday patterns and trends over 7/30/90 days — one upgrade, plus cloud sync and more AI.</Text>
              <Button label="See Pro" icon="sparkle" onPress={() => onPro("insights")} />
            </Card>
          ) : null}

          <Button label="Export as CSV" variant="secondary" icon="share" onPress={exportCsv} />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  streakCard: { flexDirection: "row", alignItems: "center", gap: space.md },
  streakIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: palette.warningSoft, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", gap: space.md },
  donutCard: { flexDirection: "row", alignItems: "center", gap: space.lg },
  upsell: { gap: space.md, backgroundColor: palette.primarySoft, shadowOpacity: 0, elevation: 0 },
});
