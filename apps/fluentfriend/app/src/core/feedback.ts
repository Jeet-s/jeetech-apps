/**
 * Parse the AI proxy's feedback into typed, clamped data the app can trust —
 * pure, so validate.ts and sim.ts can feed it fixed sample outputs (the app
 * never trusts raw model JSON on screen). Also parses a conversation reply.
 */
export interface Correction {
  original: string;
  corrected: string;
  explanationBn: string;
}

export interface Feedback {
  fluency: number; // 0..100
  clarity: number;
  grammar: number;
  pace: number;
  corrections: Correction[]; // ≤ 5
}

export const MAX_CORRECTIONS = 5;

const clampScore = (n: unknown): number => {
  const v = typeof n === "number" && isFinite(n) ? n : 0;
  return Math.max(0, Math.min(100, Math.round(v)));
};

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** Accepts the parsed JSON (object) or a JSON string; never throws. */
export function parseFeedback(raw: unknown): Feedback {
  let obj: Record<string, unknown> = {};
  try {
    obj = typeof raw === "string" ? JSON.parse(raw) : (raw as Record<string, unknown>) ?? {};
  } catch {
    obj = {};
  }
  const corrs = Array.isArray(obj.corrections) ? obj.corrections : [];
  const corrections: Correction[] = corrs
    .map((c) => {
      const o = (c ?? {}) as Record<string, unknown>;
      return { original: str(o.original), corrected: str(o.corrected), explanationBn: str(o.explanationBn) };
    })
    .filter((c) => c.corrected && c.explanationBn)
    .slice(0, MAX_CORRECTIONS);
  return {
    fluency: clampScore(obj.fluency),
    clarity: clampScore(obj.clarity),
    grammar: clampScore(obj.grammar),
    pace: clampScore(obj.pace),
    corrections,
  };
}

export interface Reply {
  reply: string;
  hintBn: string;
  suggestions: string[]; // tap-to-reply chips
}

export function parseReply(raw: unknown): Reply {
  let obj: Record<string, unknown> = {};
  try {
    obj = typeof raw === "string" ? JSON.parse(raw) : (raw as Record<string, unknown>) ?? {};
  } catch {
    obj = {};
  }
  const sugg = Array.isArray(obj.suggestions) ? obj.suggestions.map(str).filter(Boolean).slice(0, 3) : [];
  return {
    reply: str(obj.reply) || "Okay.",
    hintBn: str(obj.hintBn),
    suggestions: sugg,
  };
}
