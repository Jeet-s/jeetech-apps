import { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import Animated, { LinearTransition } from "react-native-reanimated";
import {
  BarChart,
  Button,
  Card,
  EmptyState,
  HeroCard,
  Icon,
  IconButton,
  Screen,
  Segmented,
  Stat,
  Tappable,
  feedback,
  gradient,
  palette,
  radius,
  space,
  toast,
  type,
} from "../ui";
import { scoreColors } from "./widgets";
import { art } from "../art";
import { appStore, todayKey, useApp } from "../core/data";
import { deleteTake } from "../core/state";
import { hasBaseline } from "../core/metrics";
import type { Report } from "../core/types";
import { analytics } from "../modules/analytics";
import type { ScreenProps } from "../app/nav";

type Metric = "score" | "pace" | "fillers";

/** Progress: trends, personal bests, compare any two takes, and full history. */
export function ProgressScreen({ bottomInset, nav }: ScreenProps) {
  const app = useApp();
  const today = todayKey();
  const [metric, setMetric] = useState<Metric>("score");
  const [picks, setPicks] = useState<string[]>([]);

  const reports = app.reports;
  const done = reports.length;

  if (done === 0) {
    return (
      <Screen title="Progress" bottomInset={bottomInset}>
        <Card>
          <EmptyState
            art={art.empty_progress}
            title="Record 3 takes to see your trend"
            body="Your pace, fillers and confidence will chart here and compare against your own baseline."
            action={<Button label="Start a take" icon="mic" onPress={() => nav.go("home")} />}
          />
        </Card>
        <Card style={{ gap: space.md, opacity: 0.55 }}>
          <Text style={type.label}>SAMPLE TREND</Text>
          <BarChart data={[62, 65, 61, 70, 72, 78].map((v, i) => ({ label: `#${i + 1}`, value: v }))} highlight={5} showValues color={palette.primary} />
        </Card>
      </Screen>
    );
  }

  const best = Math.max(...reports.map((r) => r.overallScore));
  const avg = Math.round(app.baseline.overall.rollingMean);
  const baselineReady = hasBaseline(app.baseline.overall);
  const latest = reports[reports.length - 1];

  const series = reports.slice(-10);
  const data = series.map((r, i) => ({
    label: `#${done - series.length + i + 1}`,
    value: metric === "score" ? r.overallScore : metric === "pace" ? r.wpmOverall : r.fillersPerMin,
  }));

  const togglePick = (id: string) => {
    feedback("pop", "select");
    setPicks((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p.slice(-1), id]));
  };
  const cmp = picks.length === 2 ? picks.map((id) => reports.find((r) => r.id === id)!).filter(Boolean) : [];

  const removeTake = (r: Report) => {
    Alert.alert("Delete this take?", "This removes its recording, transcript and report from this phone. It can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          appStore.set((s) => deleteTake(s, r.takeId));
          analytics.track("recordings_deleted", { count: 1 });
          toast("Take deleted");
        },
      },
    ]);
  };

  return (
    <Screen title="Progress" subtitle={`${done} take${done === 1 ? "" : "s"}`} bottomInset={bottomInset}>
      <HeroCard
        overline={baselineReady ? "Your baseline average" : "Latest score"}
        value={`${baselineReady ? avg : latest.overallScore}`}
        caption={baselineReady ? "across your takes" : "Record 3 to set a baseline"}
        status={{ label: `Best ${best}`, tone: "success" }}
        right={
          <View style={{ alignItems: "center" }}>
            <Text style={[type.hero, { color: gradient.onHero }]}>{best}</Text>
            <Text style={[type.caption, { color: gradient.onHeroSoft }]}>personal best</Text>
          </View>
        }
      />

      <Card style={{ gap: space.md }}>
        <Segmented
          options={[{ value: "score", label: "Score" }, { value: "pace", label: "Pace" }, { value: "fillers", label: "Fillers" }]}
          value={metric}
          onChange={setMetric}
        />
        <BarChart
          data={data}
          highlight={data.length - 1}
          showValues
          color={metric === "fillers" ? palette.warning : palette.primary}
          format={(v) => (metric === "pace" ? `${v}` : metric === "fillers" ? `${v}` : `${v}`)}
        />
        <Text style={type.caption}>
          {metric === "score" ? "Overall score per take" : metric === "pace" ? "Words per minute per take" : "Fillers per minute per take (lower is better)"}
        </Text>
      </Card>

      <Tappable label="Open your streak and badges" onPress={() => nav.openAchievements()} scale={0.99}>
        <Card style={styles.statsCard}>
          <Stat value={`${done}`} label="takes" tone={palette.primary} />
          <Stat value={`${app.streak.currentCount}`} label="day streak" tone={palette.warning} />
          <Stat value={`${app.streak.longest}`} label="best streak" />
          <Icon name="chevronRight" size={20} color={palette.inkMuted} />
        </Card>
      </Tappable>

      {/* Compare any two takes */}
      {done >= 2 ? (
        <Card style={{ gap: space.md }}>
          <Text style={type.label}>COMPARE TWO TAKES</Text>
          <View style={styles.pickRow}>
            {reports.slice(-8).reverse().map((r) => {
              const on = picks.includes(r.id);
              const c = scoreColors(r.overallScore);
              return (
                <Tappable key={r.id} label={`Take scored ${r.overallScore}`} onPress={() => togglePick(r.id)} style={[styles.pickChip, { borderColor: on ? palette.primary : palette.border, backgroundColor: on ? palette.primarySoft : palette.surface }]}>
                  <Text style={[type.amount, { color: c.fg }]}>{r.overallScore}</Text>
                </Tappable>
              );
            })}
          </View>
          {cmp.length === 2 ? (
            <View style={styles.cmpRow}>
              <CompareCol report={cmp[0]} label="A" />
              <View style={styles.cmpDelta}>
                <Delta label="Score" a={cmp[0].overallScore} b={cmp[1].overallScore} higherBetter />
                <Delta label="WPM" a={cmp[0].wpmOverall} b={cmp[1].wpmOverall} />
                <Delta label="Fillers/min" a={cmp[0].fillersPerMin} b={cmp[1].fillersPerMin} higherBetter={false} />
              </View>
              <CompareCol report={cmp[1]} label="B" />
            </View>
          ) : (
            <Text style={type.caption}>Tap two takes to compare their scores and delivery.</Text>
          )}
        </Card>
      ) : null}

      {/* History */}
      <View style={styles.section}><Text style={[type.label, { textTransform: "uppercase", letterSpacing: 0.6 }]}>History</Text></View>
      <View style={{ gap: space.sm }}>
        {[...reports].reverse().map((r) => {
          const take = app.takes.find((t) => t.id === r.takeId);
          const c = scoreColors(r.overallScore);
          return (
            <Animated.View key={r.id} layout={LinearTransition.duration(220)} style={styles.histRow}>
              <Tappable label={`Take scored ${r.overallScore}, open report`} onPress={() => nav.openReport(r.id)} style={styles.histMain}>
                <View style={[styles.scoreChip, { backgroundColor: c.bg }]}>
                  <Text style={[type.number, { fontSize: 18, color: c.fg }]}>{r.overallScore}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={type.bodyStrong} numberOfLines={1}>{take?.promptText ?? "Take"}</Text>
                  <Text style={type.caption}>{r.createdAt} · {r.wpmOverall} wpm · {r.fillerTotal} fillers</Text>
                </View>
              </Tappable>
              <IconButton icon="trash" label="Delete take" size={40} onPress={() => removeTake(r)} />
            </Animated.View>
          );
        })}
      </View>
    </Screen>
  );
}

function CompareCol({ report, label }: { report: Report; label: string }) {
  const c = scoreColors(report.overallScore);
  return (
    <View style={styles.cmpCol}>
      <Text style={type.caption}>{label}</Text>
      <View style={[styles.scoreChip, { backgroundColor: c.bg, width: 44, height: 44 }]}>
        <Text style={[type.number, { fontSize: 18, color: c.fg }]}>{report.overallScore}</Text>
      </View>
    </View>
  );
}

function Delta({ label, a, b, higherBetter = true }: { label: string; a: number; b: number; higherBetter?: boolean }) {
  const diff = Math.round((b - a) * 10) / 10;
  const good = diff === 0 ? null : higherBetter ? diff > 0 : diff < 0;
  const color = good == null ? palette.inkMuted : good ? palette.success : palette.danger;
  return (
    <View style={styles.deltaRow}>
      <Text style={type.caption} numberOfLines={1}>{label}</Text>
      <Text style={[type.amount, { color, fontSize: 14 }]}>{diff > 0 ? "+" : ""}{diff}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  statsCard: { flexDirection: "row", gap: space.md, alignItems: "center" },
  section: { marginTop: space.sm },
  pickRow: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  pickChip: { minWidth: 44, height: 40, borderRadius: radius.md, borderWidth: 1.5, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 },
  cmpRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  cmpCol: { alignItems: "center", gap: 4 },
  cmpDelta: { flex: 1, gap: 4 },
  deltaRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space.sm },
  histRow: { flexDirection: "row", alignItems: "center", backgroundColor: palette.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: palette.border, paddingRight: space.xs },
  histMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md },
  scoreChip: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
});
