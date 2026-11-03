import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { BarChart, Card, DonutChart, Legend, LineChart, SectionHeader, categorical, palette, space, type } from "../ui";
import { overByOver, replay } from "../core/scoring";
import type { NameOf } from "../core/format";
import type { Match } from "../core/types";

/** Worm, run-rate, over-by-over (manhattan) and extras charts. Free for everyone. Memoised (Skia charts + log replay). */
export const ChartsView = memo(function ChartsView({ match, teamName }: { match: Match; teamName: NameOf }) {
  const scored = match.innings.filter((inn) => !inn.scoreOnly && inn.events.length > 0);
  if (!scored.length) {
    return (
      <Card>
        <Text style={type.caption}>Charts appear once a few balls are scored.</Text>
      </Card>
    );
  }

  // Worm: cumulative runs by over, one line per innings (starts at 0 before the first over).
  const wormSeries = scored.map((inn, idx) => ({
    label: teamName(inn.battingTeamId),
    color: categorical[idx % categorical.length],
    values: [0, ...overByOver(inn, match.rules).map((b) => b.cumulative)],
  }));

  return (
    <View style={{ gap: space.md }}>
      {wormSeries.some((s) => s.values.length > 1) ? (
        <Card style={{ gap: space.sm }}>
          <Text style={type.label}>Worm · cumulative runs</Text>
          <LineChart series={wormSeries} />
          <Legend items={wormSeries.map((s) => ({ label: s.label, value: String(s.values[s.values.length - 1]), color: s.color }))} />
        </Card>
      ) : null}

      {scored.map((inn, idx) => {
        const sum = replay(inn, match.rules);
        const buckets = overByOver(inn, match.rules);
        const color = categorical[idx % categorical.length];
        const e = sum.extras;
        const extrasData = [
          { label: "Wides", value: e.wides },
          { label: "No-balls", value: e.noballs },
          { label: "Byes", value: e.byes },
          { label: "Leg-byes", value: e.legbyes },
        ].filter((x) => x.value > 0);
        return (
          <View key={inn.id} style={{ gap: space.sm }}>
            <SectionHeader title={`${teamName(inn.battingTeamId)} · ${sum.runs}/${sum.wickets}`} />
            <Card style={{ gap: space.sm }}>
              <Text style={type.label}>Runs per over</Text>
              <BarChart
                data={buckets.map((b) => ({ label: String(b.over), value: b.runs }))}
                color={color}
                highlight={buckets.length - 1}
                showValues
              />
            </Card>
            {extrasData.length ? (
              <Card style={styles.share}>
                <DonutChart data={extrasData} size={120} stroke={18} label={String(e.total)} sublabel="extras" />
                <View style={{ flex: 1 }}>
                  <Legend items={extrasData.map((x) => ({ label: x.label, value: String(x.value) }))} />
                </View>
              </Card>
            ) : null}
          </View>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  share: { flexDirection: "row", alignItems: "center", gap: space.lg },
});
