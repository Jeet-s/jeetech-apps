/**
 * Turns an on-device transcript into the AI qualitative layer of a report
 * (tips + "Say it instead" rewrite) through the factory AI proxy. The numeric
 * metrics are computed on-device (src/core/metrics) and never sent for the AI
 * to recompute — this is what keeps scores stable. If the AI is unavailable the
 * report still stands with deterministic tips, so the app works fully offline.
 */
import { ai, type AiResult } from "../modules/ai";
import { MODEL_VERSION, type Metrics } from "../core/metrics";
import { trimToSentence } from "../core/text";
import type { AiQualitative, DiffSpan } from "../core/types";

/**
 * The coach never blocks the "Scoring…" screen for longer than this. If a proxy
 * call stalls (a slow/hanging connection — the same backend that can 502), the
 * take falls back to its deterministic report instead of freezing the UI with
 * no way out. Without this guard a hung request leaves the recorder stuck on
 * "Scoring…" (no back affordance) — which read as an ANR in the soak test.
 */
const AI_TIMEOUT_MS = 12_000;
const TIMED_OUT: AiResult = { ok: false, reason: "offline", message: "The coach took too long — try again when connected." };
function withTimeout(p: Promise<AiResult>): Promise<AiResult> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(TIMED_OUT), AI_TIMEOUT_MS);
    p.then((r) => { clearTimeout(timer); resolve(r); }, () => { clearTimeout(timer); resolve(TIMED_OUT); });
  });
}

export interface CoachResult {
  ai: AiQualitative | null;
  /** Daily AI limit reached — the UI should offer Pro (more AI takes). */
  quota: boolean;
  /** Couldn't reach the AI (offline/busy) — the UI should offer Retry. */
  offline: boolean;
}

type ReportJson = { tips?: string[]; clarityNote?: string; confidenceNote?: string; structureNotes?: string; onTopic?: boolean };
type RewriteJson = { rewriteText?: string; rewriteDiff?: DiffSpan[]; openerSuggestion?: string; closerSuggestion?: string };

const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);
const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/** A plain word-level diff so the rewrite always shows a side-by-side, even if
 * the model omits one. */
function fallbackDiff(original: string, rewrite: string): DiffSpan[] {
  if (!rewrite) return [];
  const o = original.trim();
  return o ? [{ kind: "removed", text: o }, { kind: "added", text: rewrite.trim() }] : [{ kind: "added", text: rewrite.trim() }];
}

export async function coachTake(input: {
  transcript: string;
  promptText: string;
  scenario: string;
  metrics: Metrics;
}): Promise<CoachResult> {
  const reportInput = JSON.stringify({
    transcript: input.transcript,
    prompt: input.promptText,
    metrics: {
      wpmOverall: input.metrics.wpmOverall,
      fillersPerMin: input.metrics.fillersPerMin,
      pauseStats: input.metrics.pauseStats,
      paceVerdict: input.metrics.paceVerdict,
      structure: input.metrics.structure,
    },
  });
  const rewriteInput = JSON.stringify({ transcript: input.transcript, scenario: input.scenario });

  const [report, rewrite] = await Promise.all([
    withTimeout(ai.run("speech_report", reportInput)),
    withTimeout(ai.run("say_it_instead", rewriteInput)),
  ]);

  const quota = (!report.ok && report.reason === "quota") || (!rewrite.ok && rewrite.reason === "quota");
  const offline =
    (!report.ok && (report.reason === "offline" || report.reason === "busy")) ||
    (!rewrite.ok && (rewrite.reason === "offline" || rewrite.reason === "busy"));

  // Nothing usable came back — let the deterministic report carry the take.
  if (!report.ok && !rewrite.ok) return { ai: null, quota, offline };

  const rj = (report.ok ? (report.json as ReportJson) : null) ?? {};
  const wj = (rewrite.ok ? (rewrite.json as RewriteJson) : null) ?? {};

  // Cap at a sentence boundary so a rewrite cut off by the model's token limit
  // never shows a dangling fragment (QA: "…a new city, I" read as broken).
  const rewriteText = trimToSentence(str(wj.rewriteText));
  const diff = Array.isArray(wj.rewriteDiff) && wj.rewriteDiff.length ? wj.rewriteDiff : fallbackDiff(input.transcript, rewriteText);

  const qualitative: AiQualitative = {
    tips: list(rj.tips).slice(0, 3),
    rewriteText,
    rewriteDiff: diff,
    openerSuggestion: str(wj.openerSuggestion),
    closerSuggestion: str(wj.closerSuggestion),
    clarityNote: str(rj.clarityNote),
    confidenceNote: str(rj.confidenceNote),
    onTopic: typeof rj.onTopic === "boolean" ? rj.onTopic : null,
    modelVersion: `${MODEL_VERSION}+ai`,
  };
  return { ai: qualitative, quota, offline };
}
