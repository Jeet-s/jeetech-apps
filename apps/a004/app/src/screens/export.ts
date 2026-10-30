/**
 * File export/import side-effects for Reports and Backup. Pure report/CSV data
 * comes from src/core/report; this layer only renders HTML→PDF, writes files and
 * opens the share sheet / document picker (expo-print / -sharing / -file-system).
 */
import * as FileSystem from "expo-file-system/legacy";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import { type Report, reportSummaryLines, toCSV, REPORT_DISCLAIMER } from "../core/report";
import { CONTEXT_LABEL, SLOT_LABEL, GI_LABEL } from "../core/model";
import { formatValue, UNIT_LABEL } from "../core/units";
import { dayKey, timeLabel } from "../core/dates";
import { mealLabel } from "../core/insights";

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] ?? c));

function reportHtml(r: Report): string {
  const unit = UNIT_LABEL[r.unit];
  const summary = reportSummaryLines(r).map((l) => `<div class="s">${esc(l)}</div>`).join("");
  const readingRows = r.readings
    .slice()
    .sort((a, b) => a.ts - b.ts)
    .map((x) => `<tr><td>${dayKey(x.ts)} ${timeLabel(x.ts)}</td><td>${CONTEXT_LABEL[x.context]}</td><td class="n">${formatValue(x.valueMgdl, r.unit)} ${unit}</td><td>${esc(x.note)}</td></tr>`)
    .join("");
  const mealRows = r.meals
    .map((m) => `<tr><td>${dayKey(m.ts)} ${timeLabel(m.ts)}</td><td>${SLOT_LABEL[m.slot]}</td><td>${esc(mealLabel(m))}</td><td class="n">${m.carbsTotalG} g · ${GI_LABEL[m.giBand]} GI</td></tr>`)
    .join("");
  const medRows = r.medLogs
    .map((l) => `<tr><td>${dayKey(l.ts)} ${timeLabel(l.ts)}</td><td>${esc(l.name)}</td><td class="n">${l.dose} ${esc(l.doseUnit)}</td><td>${esc(l.note)}</td></tr>`)
    .join("");
  const table = (title: string, head: string[], rows: string) =>
    rows ? `<h2>${title}</h2><table><thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>` : "";
  return `<!doctype html><html><head><meta charset="utf-8"/><style>
    body{font-family:-apple-system,Roboto,'Helvetica Neue',sans-serif;color:#0F172A;padding:28px;font-size:13px}
    h1{font-size:22px;margin:0 0 2px;color:#0F766E}
    .sub{color:#64748B;margin-bottom:14px}
    .card{background:#F1F6F5;border-radius:10px;padding:14px;margin-bottom:16px}
    .s{padding:2px 0}
    h2{font-size:15px;margin:18px 0 6px;color:#0F766E}
    table{width:100%;border-collapse:collapse;margin-bottom:8px}
    th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #E3E4E6;font-size:12px}
    th{color:#64748B;font-weight:600}
    .n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
    .disc{color:#64748B;font-size:11px;margin-top:18px;border-top:1px solid #E3E4E6;padding-top:10px}
  </style></head><body>
    <h1>Sugar Plate — Wellness Summary</h1>
    <div class="sub">${esc(r.profileName)} · ${dayKey(r.from)} to ${dayKey(r.to)}</div>
    <div class="card">${summary}</div>
    ${table("Readings", ["When", "Context", "Value", "Note"], readingRows)}
    ${table("Meals", ["When", "Meal", "Dishes", "Carbs"], mealRows)}
    ${table("Medication", ["When", "Name", "Dose", "Note"], medRows)}
    <div class="disc">${esc(REPORT_DISCLAIMER)}</div>
  </body></html>`;
}

async function share(uri: string, mimeType: string, dialogTitle: string): Promise<"shared" | "saved"> {
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType, dialogTitle, UTI: mimeType === "application/pdf" ? "com.adobe.pdf" : "public.comma-separated-values-text" });
    return "shared";
  }
  return "saved";
}

export async function sharePdf(r: Report): Promise<"shared" | "saved"> {
  const { uri } = await Print.printToFileAsync({ html: reportHtml(r) });
  return share(uri, "application/pdf", "Sugar Plate report");
}

export async function shareCsv(r: Report): Promise<"shared" | "saved"> {
  const uri = `${FileSystem.cacheDirectory}sugar-plate-${dayKey(r.from)}_${dayKey(r.to)}.csv`;
  await FileSystem.writeAsStringAsync(uri, toCSV(r), { encoding: FileSystem.EncodingType.UTF8 });
  return share(uri, "text/csv", "Sugar Plate CSV");
}

/** Write the full app state to a shareable JSON backup file (counts included for verification). */
export async function exportBackupFile(serialized: string, label: string): Promise<"shared" | "saved"> {
  const uri = `${FileSystem.cacheDirectory}sugar-plate-backup-${label}.json`;
  await FileSystem.writeAsStringAsync(uri, serialized, { encoding: FileSystem.EncodingType.UTF8 });
  return share(uri, "application/json", "Sugar Plate backup");
}

/** Pick a backup file and return its text, or null if cancelled. */
export async function pickBackupText(): Promise<string | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: ["application/json", "text/*", "*/*"], copyToCacheDirectory: true });
  if (res.canceled || !res.assets?.length) return null;
  return FileSystem.readAsStringAsync(res.assets[0].uri);
}
