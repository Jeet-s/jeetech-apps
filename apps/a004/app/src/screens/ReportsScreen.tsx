import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { Button, Card, EmptyState, Segmented, Toggle, feedback, palette, space, toast, type } from "../ui";
import { art } from "../art";
import { useSugar } from "../core/data";
import { buildReport, emptyRangeHint, reportSummaryLines, type ReportFields } from "../core/report";
import { liveReadings, liveMeals, liveMedLogs } from "../core/model";
import { MS_DAY } from "../core/dates";
import { analytics } from "../modules/analytics";
import { SubScreen, nowTs } from "./shared";
import { sharePdf, shareCsv } from "./export";

type Range = "7" | "30" | "90" | "all";

export function ReportsScreen({ bottomInset, onBack }: { bottomInset: number; onBack: () => void }) {
  const data = useSugar();
  const [range, setRange] = useState<Range>("30");
  const [fields, setFields] = useState<ReportFields>({ readings: true, meals: true, medications: true });
  const [busy, setBusy] = useState<null | "pdf" | "csv">(null);

  const now = nowTs();
  const from = useMemo(() => {
    if (range !== "all") return now - Number(range) * MS_DAY;
    const all = [...liveReadings(data), ...liveMeals(data), ...liveMedLogs(data)].map((x) => x.ts);
    return all.length ? Math.min(...all) : now - 30 * MS_DAY;
  }, [range, now, data]);

  const report = useMemo(() => buildReport(data, { from, to: now, fields }), [data, from, now, fields]);
  const lines = reportSummaryLines(report);
  const hint = emptyRangeHint(report);

  const run = async (kind: "pdf" | "csv") => {
    setBusy(kind);
    try {
      const result = kind === "pdf" ? await sharePdf(report) : await shareCsv(report);
      feedback("success", "success");
      analytics.track("report_exported");
      toast(result === "shared" ? `${kind.toUpperCase()} ready to share` : `${kind.toUpperCase()} saved to the app folder`);
    } catch {
      feedback("error", "error");
      toast("Couldn't create the file — try again");
    } finally {
      setBusy(null);
    }
  };

  return (
    <SubScreen title="Doctor report" subtitle="PDF & CSV · free, offline" onBack={onBack} bottomInset={bottomInset}>
      <Text style={type.label}>DATE RANGE</Text>
      <Segmented
        options={[{ value: "7", label: "7 days" }, { value: "30", label: "30 days" }, { value: "90", label: "90 days" }, { value: "all", label: "All" }]}
        value={range}
        onChange={(r) => setRange(r as Range)}
      />

      <Text style={[type.label, { marginTop: space.sm }]}>INCLUDE</Text>
      <Card padded={false} style={{ paddingHorizontal: space.lg }}>
        <Toggle label="Readings" value={fields.readings} onChange={(v) => setFields((f) => ({ ...f, readings: v }))} />
        <Toggle label="Meals" value={fields.meals} onChange={(v) => setFields((f) => ({ ...f, meals: v }))} />
        <Toggle label="Medication" value={fields.medications} onChange={(v) => setFields((f) => ({ ...f, medications: v }))} />
      </Card>

      <Text style={[type.label, { marginTop: space.sm }]}>PREVIEW</Text>
      <Card>
        {report.hasData ? (
          <View style={{ gap: 4 }}>
            {lines.map((l, i) => (
              <Text key={i} style={i === 0 ? type.bodyStrong : [type.caption, { color: palette.inkSoft }]}>{l}</Text>
            ))}
          </View>
        ) : (
          <EmptyState art={art.empty_meals} title="No entries in range" body={hint ?? "Try a wider date range."} />
        )}
      </Card>

      <Button label="Share PDF report" size="lg" icon="doc" loading={busy === "pdf"} disabled={!report.hasData || busy !== null} onPress={() => run("pdf")} />
      <Button label="Share CSV (spreadsheet)" variant="secondary" icon="download" loading={busy === "csv"} disabled={!report.hasData || busy !== null} onPress={() => run("csv")} />
      <Text style={[type.caption, { textAlign: "center" }]}>Includes averages by category, time-in-range and your A1C estimate with the formula. Wellness summary — not a medical opinion.</Text>
    </SubScreen>
  );
}
