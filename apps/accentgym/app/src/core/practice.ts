/** Transcript checks are recognition checks, never acoustic measurements. */
export const MAX_COACHING_WORDS = 18;
/** Prefer complete sentences, then breath/clause boundaries. Never cut every six words. */
export function coachingPhrases(transcript: string): string[] {
  return (transcript.match(/[^.!?]+[.!?]*/g) ?? []).flatMap(sentence => {
    const words = sentence.trim().split(/\s+/).filter(Boolean);
    const phrases: string[] = [];
    while (words.length > MAX_COACHING_WORDS) {
      let cut = 0;
      for (let i = 4; i <= MAX_COACHING_WORDS; i++) if (/[,;:]$/.test(words[i - 1])) cut = i;
      if (!cut) for (let i = 6; i < MAX_COACHING_WORDS; i++) if (/^(and|but|because|when|which|while|so)$/i.test(words[i])) cut = i;
      if (!cut) {
        cut = MAX_COACHING_WORDS;
        while (cut > 6 && /^(a|an|the|to|of|with|for|in|on|at|my|your|our|is|are)$/i.test(words[cut - 1])) cut--;
      }
      phrases.push(words.splice(0, cut).join(" "));
    }
    if (words.length) phrases.push(words.join(" "));
    return phrases;
  });
}

export function transcriptMatch(expected: string, heard: string): { accepted: boolean; coverage: number; missing: string[]; matched: number; total: number } {
  const words = (s: string) => s.toLowerCase().replace(/[’']/g, "").replace(/[^a-z\s]/g, " ").trim().split(/\s+/).filter(Boolean);
  const target = words(expected);
  const actual = words(heard);
  // Ordered alignment catches repeats and shuffled sentences, allowing small recognition errors.
  const dp = Array.from({ length: target.length + 1 }, () => Array(actual.length + 1).fill(0) as number[]);
  for (let i = 1; i <= target.length; i++) for (let j = 1; j <= actual.length; j++)
    dp[i][j] = target[i - 1] === actual[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  const matched = dp[target.length][actual.length];
  const coverage = target.length ? matched / Math.max(target.length, actual.length) : 0;
  const remaining = [...actual];
  const missing = target.filter(w => { const i = remaining.indexOf(w); if (i < 0) return true; remaining.splice(i, 1); return false; });
  return { accepted: target.length > 0 && coverage >= 0.7, coverage, missing, matched, total: target.length };
}

export function pairQuestion(pairs: { a: string; b: string }[], index: number) {
  const pair = pairs[index % Math.max(1, pairs.length)];
  if (!pair) return null;
  const correct = index % 2 === 0 ? pair.a : pair.b;
  return { ...pair, correct };
}

export function mouthPose(id: string) {
  return {
    wide: id === "æ",
    round: id === "w" || id === "r" || id === "ʃ",
    closed: id === "p" || id === "b",
    lipBite: id === "v",
    tongue: id === "θ" || id === "ð" ? "between" : id === "l" || id === "iː" || id === "s" || id === "z" ? "up" : id === "r" || id === "ŋ" ? "back" : "low",
    label: id === "æ" ? "Drop your jaw" : id === "θ" || id === "ð" ? "Tongue between teeth" : id === "v" ? "Teeth meet lower lip" : id === "p" || id === "b" ? "Close, then release lips" : id === "w" ? "Round your lips" : id === "ɪ" ? "Relax and keep it short" : id === "iː" ? "Smile and hold" : id === "r" ? "Curl tongue back" : id === "l" ? "Tongue behind teeth" : id === "ŋ" ? "Raise back of tongue" : "Guide the airflow",
  };
}
