/**
 * Fixed sample transcripts + AI output for tests and the journey bots. The real
 * app feeds AI results through the same core functions as plain data, so these
 * stand in for a recording without needing a mic or the network.
 */
import type { AiQualitative, Word } from "./types";

/** Lay words out on a timeline. `gapAfter` injects a pause (ms) after an index. */
export function makeWords(
  texts: string[],
  opts: { wpm?: number; gaps?: Record<number, number>; startMs?: number } = {},
): Word[] {
  const perWord = 60_000 / (opts.wpm ?? 140);
  const words: Word[] = [];
  let t = opts.startMs ?? 0;
  texts.forEach((text, i) => {
    const dur = Math.max(120, perWord * 0.9);
    words.push({ text, startMs: Math.round(t), endMs: Math.round(t + dur), isFiller: false, isPause: false, userCorrected: false });
    t += perWord + (opts.gaps?.[i] ?? 0);
  });
  return words;
}

const GOOD_TEXT =
  "Good morning everyone today I want to share one clear idea that changed how our team works we used to plan for hours but now we decide in minutes and ship faster the result is happier customers and a calmer team thank you".split(" ");

const FILLER_TEXT =
  "um so basically like I was going to um talk about you know the project and uh actually it is like really um important so yeah".split(" ");

const FAST_TEXT = Array.from({ length: 120 }, (_, i) => (i % 2 ? "quickly" : "words")); // ~240 wpm over 30s

/** A clean, well-paced 60s take → high score. */
export const SAMPLE_GOOD: Word[] = makeWords(GOOD_TEXT, { wpm: 135 });
/** A filler-heavy, hesitant take → lower score, lots of fillers to correct. */
export const SAMPLE_FILLERS: Word[] = makeWords(FILLER_TEXT, { wpm: 120, gaps: { 4: 1800, 9: 900 } });
/** A rushed take → "fast" pace verdict. */
export const SAMPLE_FAST: Word[] = makeWords(FAST_TEXT, { wpm: 240 });
/** Essentially silence → "couldn't hear you", no allowance used. */
export const SAMPLE_SILENT: Word[] = makeWords(["um"], { wpm: 100 });

export const SAMPLE_AI: AiQualitative = {
  tips: [
    "Open with your one key idea in the first sentence.",
    "Trade 'um' for a short, confident pause.",
    "End on the benefit to the listener.",
  ],
  rewriteText: "Here's one idea that changed how our team works: we decide in minutes, not hours — so we ship faster and customers are happier.",
  rewriteDiff: [
    { kind: "removed", text: "Good morning everyone today I want to share" },
    { kind: "added", text: "Here's" },
    { kind: "same", text: " one" },
  ],
  openerSuggestion: "Here's the one idea that changed everything for us.",
  closerSuggestion: "That's how we move faster — and it starts today.",
  clarityNote: "Clear and easy to follow.",
  confidenceNote: "Steady and assured.",
  onTopic: true,
  modelVersion: "podium-ai-test-1",
};

/** An off-topic answer (ignored the prompt) → the report caps its score and
 * shows the "didn't answer the prompt" banner. Used to test that path. */
export const SAMPLE_AI_OFFTOPIC: AiQualitative = { ...SAMPLE_AI, onTopic: false };
