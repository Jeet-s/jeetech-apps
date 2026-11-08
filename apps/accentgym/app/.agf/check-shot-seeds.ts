import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import { parseScoreResult } from "../src/core/scoring";
import { clarityScore } from "../src/core/assessment";
import { dateKey, keyFromMs } from "../src/core/dates";
import type { AppState } from "../src/core/state";

// Evaluate the actual pure fixture section; never maintain a second seed copy.
const source = readFileSync(new URL("../src/screenshots.tsx", import.meta.url), "utf8");
const imports = [...source.matchAll(/import[\s\S]*?from "[^"]+";/g)].map(m => m[0]).filter(s => s.includes('"./core/'));
const fixture = source.slice(source.indexOf("const SHOT_PHONEMES"), source.indexOf("/** Reuse the exact"));
const compiled = ts.transpileModule(imports.join("\n") + fixture + "\nexports.seedGym = seedGym; exports.raw = FEEDBACK_RAW; exports.phones = SHOT_PHONEMES;", { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const values: { seedGym?: (pro: boolean) => AppState; raw?: unknown; phones?: Record<string, string[]> } = {};
new Function("require", "exports", compiled)(createRequire(new URL("../src/screenshots.tsx", import.meta.url)), values);
const assert = (ok: unknown, message: string) => { if (!ok) throw Error(message); };
for (const pro of [false, true]) {
  const s = values.seedGym!(pro);
  assert(s.plan[0] === "v", "V should remain the recommended next exercise");
  assert(s.attempts.length >= 60, "Incomplete three-week practice history");
  assert(s.sessionProgress?.index === 2 && s.sessionProgress.total === 6, "Session must resume at 2/6");
  assert(s.streak.current >= 14, "Practice streak unexpectedly reset");
  for (const item of s.srs) {
    const sounds = values.phones![item.text.toLowerCase()];
    assert(sounds, `Unknown saved word: ${item.text}`);
    for (const sound of item.soundTags) assert(sounds.includes(sound), `Wrong word-to-sound mapping: ${item.text} /${sound}/`);
  }
  const score = clarityScore([...s.diagnostics, ...s.attempts]);
  const today = dateKey(new Date());
  const current = s.attempts.filter(a => keyFromMs(a.timestamp) === today);
  const daily = clarityScore(current);
  assert(Math.abs(score - daily) <= 5, "Headline and daily estimates diverge");
  console.log(JSON.stringify({ pro, attempts: s.attempts.length, streak: s.streak.current, session: s.sessionProgress, score, daily, mastered: s.plan.filter(id => s.mastery[id]?.mastered).length, due: s.srs.filter(i => i.dueAt <= today).map(i => `${i.text}: ${i.soundTags.join('/')}`) }));
}
assert(parseScoreResult(values.raw), "Feedback contract is invalid");
const shots = JSON.parse(readFileSync(new URL("../shots.json", import.meta.url), "utf8"));
assert(shots.scenes.length >= 4 && shots.scenes.length <= 6, "Expected 4–6 scenes");
for (const scene of shots.scenes) {
  assert(scene.caption.split(/\s+/).length <= 6, `Caption too long: ${scene.id}`);
  assert(scene.id === 'practice' || source.includes(`case "${scene.id}":`), `Missing scene: ${scene.id}`);
}
console.log(`Actual screenshot seeds, IPA mappings, feedback contract and all ${shots.scenes.length} scenes verified`);
