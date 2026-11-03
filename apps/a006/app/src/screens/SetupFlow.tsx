import { memo, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button, Card, Chip, FooterScreen, Icon, IconButton, Pill, SectionHeader, TextField, Toggle, Tappable, feedback, palette, radius, space, toast, type } from "../ui";
import { Avatar, Stepper, appStore, useApp } from "./common";
import { useNav } from "../nav";
import { analytics } from "../modules/analytics";
import { PRESETS, makeRules, maxWickets, validateRules, type RulesError } from "../core/rules";
import { firstBattingTeam } from "../core/match";
import { addTeam, resolveRoster, savePreset, startMatch } from "../core/app";
import { colorFor } from "./common";
import type { Rules, Id, Team } from "../core/types";

// Realistic, team-DISTINCT auto-squad names so a quick-start match reads as a real team sheet, not a
// placeholder ("Home 1 / Away 1" looked unfinished in QA). The two pools never overlap, so resolveRoster
// (which dedupes players by name) can't accidentally put the same player on both sides.
const SQUAD_NAMES: Record<"A" | "B", string[]> = {
  A: ["Aarav", "Rohan", "Kabir", "Ishaan", "Arjun", "Dev", "Karan", "Nikhil", "Veer", "Ansh", "Ravi"],
  B: ["Sameer", "Omar", "Zain", "Rehan", "Imran", "Bilal", "Danish", "Faraz", "Noman", "Aqib", "Tariq"],
};

// Plain-language reason a rule set is invalid, so a disabled Save/Next is never a silent dead end (QA: the
// "Save as preset" button sat dimmed with no explanation because wickets exceeded what the squad allows).
function rulesErrorText(e: RulesError, r: Rules): string {
  switch (e) {
    case "overs": return "Overs must be a whole number (0–200). 0 = unlimited.";
    case "balls_per_over": return "Balls per over must be between 1 and 12.";
    case "players": return "Players per side must be between 1 and 16.";
    case "wickets": return `With ${r.playersPerSide} a side${r.lastManBats || r.oneBatter ? "" : " (last man out)"}, wickets can be at most ${maxWickets(r)}.`;
    case "wide_runs": return "Wide runs must be between 0 and 10.";
    case "no_ball_runs": return "No-ball runs must be between 0 and 10.";
    case "boundary": return "The six value must be at least the four value.";
  }
}

const splitNames = (t: string): string[] => t.split(/[\n,]/).map((x) => x.trim()).filter(Boolean);
const uniqNames = (names: string[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of names) {
    const k = n.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(n.trim());
  }
  return out;
};

type Side = "A" | "B";

/** Match setup: format & teams → players → toss → openers → straight to scoring (or Quick start to skip it all). */
export function SetupFlow({ tournamentId, fixtureId }: { tournamentId?: Id; fixtureId?: Id }) {
  const nav = useNav();
  const app = useApp();

  // Prefill from a tournament fixture if provided.
  const fixture = fixtureId ? app.fixtures.find((f) => f.id === fixtureId) : undefined;
  const fixtureTeam = (id?: Id | null) => app.teams.find((t) => t.id === id);
  const fTeamA = fixtureTeam(fixture?.teamAId);
  const fTeamB = fixtureTeam(fixture?.teamBId);
  const namesOf = (t?: { playerIds: Id[] }): string[] =>
    (t?.playerIds ?? []).map((pid) => app.players.find((p) => p.id === pid)?.name).filter((n): n is string => !!n);

  const [step, setStep] = useState(0);
  // Step 0 opens as a clean hub: just the Quick-start CTA. The format/teams fields stay collapsed behind
  // "Set up manually" so they don't compete with the primary action (QA: step 0 was too busy).
  const [manualOpen, setManualOpen] = useState(false);
  const [presetId, setPresetId] = useState("gully");
  const [rules, setRules] = useState<Rules>(PRESETS.find((p) => p.id === "gully")!.rules);
  // Team names are blank by default (friendly placeholder shows) so the fields read as editable, not pre-filled data.
  // Where we need an actual name we fall back to "Home Team"/"Away Team" — a finished-looking label, not "Team A/B"
  // or a bare "Home", so a first-timer can tap straight through and the scorecard never reads like a placeholder.
  const [nameA, setNameA] = useState(fTeamA?.name ?? "");
  const [nameB, setNameB] = useState(fTeamB?.name ?? "");
  const effA = nameA.trim() || "Home Team";
  const effB = nameB.trim() || "Away Team";
  const [rosterA, setRosterA] = useState<string[]>(namesOf(fTeamA));
  const [rosterB, setRosterB] = useState<string[]>(namesOf(fTeamB));
  const [presetName, setPresetName] = useState("");
  const [tossWinner, setTossWinner] = useState<Side>("A");
  const [decision, setDecision] = useState<"bat" | "bowl">("bat");
  // Which team bats first in a Quick start — flip it from the hub's toss row (QA #4). Modelled as "won the toss
  // and bats", so the summary reads in plain cricket instead of a tiny tag.
  const [quickBatFirst, setQuickBatFirst] = useState<Side>("A");
  const [strikerIdx, setStrikerIdx] = useState(0);
  const [nonStrikerIdx, setNonStrikerIdx] = useState(1);

  const allPresets = useMemo(() => [...PRESETS, ...app.presets], [app.presets]);
  const currentPreset = allPresets.find((p) => p.id === presetId);

  // Recent, distinct team pairings → one-tap "Quick rematch" (fills the hub's dead space with something useful and
  // keeps each team's real squad + career stats). Empty on first run, where a "How it works" card stands in instead.
  const teamObj = (id?: Id | null) => app.teams.find((t) => t.id === id);
  const recentMatchups = useMemo(() => {
    const seen = new Set<string>();
    const out: { a: Team; b: Team }[] = [];
    for (const m of [...app.matches].reverse()) {
      const a = teamObj(m.teamAId);
      const b = teamObj(m.teamBId);
      if (!a || !b) continue;
      const key = [a.id, b.id].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ a, b });
      if (out.length >= 3) break;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.matches, app.teams]);

  const applyPreset = (id: string) => {
    feedback("pop", "select");
    setPresetId(id);
    const p = allPresets.find((x) => x.id === id);
    if (p) setRules(p.rules);
  };
  const patchRules = (patch: Partial<Rules>) => {
    setPresetId("custom");
    setRules((r) => makeRules({ ...r, ...patch }));
  };

  const namesA = useMemo(() => uniqNames(rosterA), [rosterA]);
  const namesB = useMemo(() => uniqNames(rosterB), [rosterB]);
  const minPer = rules.oneBatter ? 1 : 2;

  // Which side bats first (needed for the openers step).
  const battingFirstSide: Side = useMemo(() => {
    const bats = decision === "bat";
    return tossWinner === "A" ? (bats ? "A" : "B") : bats ? "B" : "A";
  }, [tossWinner, decision]);
  const battingNames = battingFirstSide === "A" ? namesA : namesB;

  const valid = (): string | null => {
    if (step === 0) {
      if (effA.toLowerCase() === effB.toLowerCase()) return "Give the two teams different names.";
      const re = validateRules(rules);
      if (re) return rulesErrorText(re, rules);
      return null;
    }
    if (step === 1) {
      if (namesA.length < minPer) return `${effA} needs at least ${minPer} player${minPer > 1 ? "s" : ""}.`;
      if (namesB.length < minPer) return `${effB} needs at least ${minPer} player${minPer > 1 ? "s" : ""}.`;
      return null;
    }
    if (step === 3) {
      if (!rules.oneBatter && strikerIdx === nonStrikerIdx) return "Openers must be two different players.";
    }
    return null;
  };
  const error = valid();
  // Why Save-as-preset / Next are blocked, surfaced inline so a dimmed button always explains itself (QA).
  const rulesErr = validateRules(rules);
  // A ready-made, descriptive name for the current rules so "Save as preset" is one tap — the field starts empty
  // (placeholder shows the suggestion) and saving with it blank stores THIS name. Before, the button sat disabled
  // until the user typed, so a tap-only flow (and the feature tour) could never save a preset (QA feature_tour).
  const suggestedPresetName = `${rules.playersPerSide}-a-side · ${rules.oversPerInnings || "∞"} ov`.slice(0, 30);

  const next = () => {
    if (error) {
      feedback("error", "error");
      return toast(error);
    }
    if (step < 3) {
      // clamp openers to available batters
      if (step === 2) {
        setStrikerIdx(0);
        setNonStrikerIdx(Math.min(1, Math.max(0, battingNames.length - 1)));
      }
      setStep(step + 1);
    } else {
      begin(namesA, namesB, tossWinner, decision, strikerIdx, nonStrikerIdx);
    }
  };
  const back = () => (step === 0 ? nav.pop() : setStep(step - 1));

  /** Auto-fill a squad to a playable size with real, team-distinct names so no one is stuck before scoring. */
  const fillRoster = (names: string[], side: Side): string[] => {
    const out = uniqNames(names);
    const target = Math.max(minPer + (rules.oneBatter ? 0 : 1), Math.min(rules.playersPerSide, 11));
    const pool = SQUAD_NAMES[side];
    let i = 0;
    while (out.length < target && out.length < 16) {
      // Pool names are distinct per side; the "Sub <side>N" fallback stays distinct too (never a cross-team clash).
      const cand = pool[i] ?? `Sub ${side}${i + 1}`;
      i++;
      if (!out.some((x) => x.toLowerCase() === cand.toLowerCase())) out.push(cand);
    }
    return out;
  };

  // What Quick start will actually create (mirrors quickStart() below) — drives the hub preview so step 0 isn't a
  // blank gap before the CTA and the scorer sees the teams, full squads and toss up front.
  const previewA = nameA.trim() || "Street Royals";
  const previewB = nameB.trim() || "Park Strikers";
  const squadA = fillRoster(namesA, "A");
  const squadB = fillRoster(namesB, "B");

  const begin = (aNames: string[], bNames: string[], tw: Side, dec: "bat" | "bowl", sIdx: number, nsIdx: number, labels: { a: string; b: string } = { a: effA, b: effB }) => {
    let s = app;
    const ra = resolveRoster(s, aNames); s = ra.state;
    const rb = resolveRoster(s, bNames); s = rb.state;
    const ta = addTeam(s, { name: labels.a, playerIds: ra.ids, color: colorFor("A") }); s = ta.state;
    const tb = addTeam(s, { name: labels.b, playerIds: rb.ids, color: colorFor("B") }); s = tb.state;
    const toss = { wonBy: tw === "A" ? ta.id : tb.id, decision: dec };
    const battingFirstId = firstBattingTeam(ta.id, tb.id, toss);
    const battingIds = battingFirstId === ta.id ? ra.ids : rb.ids;
    const sClamp = Math.min(Math.max(0, sIdx), Math.max(0, battingIds.length - 1));
    const nsClamp = rules.oneBatter ? sClamp : Math.min(Math.max(0, nsIdx), Math.max(0, battingIds.length - 1));
    const rest = battingIds.filter((_, i) => i !== sClamp && i !== nsClamp);
    const order = rules.oneBatter
      ? [battingIds[sClamp], ...battingIds.filter((_, i) => i !== sClamp)]
      : [battingIds[sClamp], battingIds[nsClamp], ...rest].filter(Boolean);
    const started = startMatch(s, {
      teamAId: ta.id,
      teamBId: tb.id,
      rules,
      toss,
      date: today(),
      tournamentId: tournamentId ?? null,
      firstBattingOrder: order as Id[],
    });
    if (started.error || !started.id) {
      feedback("error", "error");
      return toast("Could not start the match — check the rules.");
    }
    s = started.state;
    // Link the fixture to this match.
    if (fixtureId) s = { ...s, fixtures: s.fixtures.map((f) => (f.id === fixtureId ? { ...f, matchId: started.id! } : f)) };
    appStore.set(() => s);
    feedback("success", "success");
    analytics.track("match_started");
    // No "match started" toast here — it used to land over the score card and clip the 0/0. The scoring
    // screen's own hero (team names, 0/0, "ready" prompt) is the confirmation, and the first ball celebrates there.
    nav.replace({ t: "scoring", matchId: started.id });
  };

  const quickStart = () => {
    // Quick start reads like a real fixture even when the fields are blank — proper team names, not "Home v Away".
    const a = nameA.trim() || "Street Royals";
    const b = nameB.trim() || "Park Strikers";
    if (a.toLowerCase() === b.toLowerCase()) { feedback("error", "error"); return toast("Give the two teams different names."); }
    if (validateRules(rules)) { feedback("error", "error"); return toast("Check the custom rules."); }
    begin(fillRoster(namesA, "A"), fillRoster(namesB, "B"), quickBatFirst, "bat", 0, 1, { a, b });
  };

  /** One-tap rematch of a previous pairing: reuse each team's real squad (resolveRoster reuses players by name, so
      career stats continue) and a default toss, straight to the first ball. */
  const rematch = (a: Team, b: Team) => {
    feedback("pop", "light");
    const aNames = namesOf(a);
    const bNames = namesOf(b);
    begin(aNames.length ? aNames : fillRoster([], "A"), bNames.length ? bNames : fillRoster([], "B"), "A", "bat", 0, 1, { a: a.name, b: b.name });
  };

  const saveCustomPreset = () => {
    // Empty field → save under the suggested name, so one tap always lands a preset (a typed name just overrides it).
    const name = presetName.trim() || suggestedPresetName;
    const re = validateRules(rules);
    if (re) { feedback("error", "error"); return toast(rulesErrorText(re, rules)); }
    // Saving the same name again UPDATES that preset instead of stacking another identical chip (QA saw four
    // duplicate "Sunday Gully 9s" chips from repeated saves). Then select it, so the format summary + chips reflect
    // the save immediately and the new preset is visible right here (the top chip row was scrolled off-screen).
    const dup = app.presets.find((p) => p.name.toLowerCase() === name.toLowerCase());
    let newId = dup?.id ?? "";
    if (dup) {
      appStore.set((s) => ({ ...s, presets: s.presets.map((p) => (p.id === dup.id ? { ...p, rules } : p)) }));
    } else {
      appStore.set((s) => { const r = savePreset(s, name, rules); newId = r.id; return r.state; });
    }
    setPresetName("");
    if (newId) setPresetId(newId);
    feedback("success", "success");
    toast(dup ? `Updated "${name}" ✓` : `Saved "${name}" ✓ — it's in your presets.`);
  };

  const stepTitles = ["Format & teams", "Players", "Toss", "Openers"];

  return (
    <FooterScreen
      contentStyle={styles.topAlign}
      top={
        // Step 0 is the hub (Quick start skips the rest) so it shows NO "Step 1 of 4" — that counter only
        // belongs to the manual path. Choosing "Set up manually" then walks the 3 guided steps below.
        step === 0 ? (
          // A real back arrow out of New Match (QA: "Cancel is the only way out"). The footer holds the primary CTA.
          <View style={styles.topRow}>
            <IconButton icon="chevronLeft" label="Back" onPress={() => nav.pop()} style={{ marginLeft: -8 }} />
            <View style={{ flex: 1 }}>
              <Text style={type.overline}>New match</Text>
              <Text style={[type.caption, { marginTop: 2 }]} numberOfLines={1}>{manualOpen ? "Pick the format, teams and players" : "One tap to score — or set it up yourself"}</Text>
            </View>
          </View>
        ) : (
          <View>
            <Text style={type.overline}>Step {step} of 3 · {stepTitles[step]}</Text>
            <View style={styles.dots}>
              {[1, 2, 3].map((i) => (
                <View key={i} style={[styles.dot, i === step && styles.dotOn, i < step && { backgroundColor: palette.primary }]} />
              ))}
            </View>
          </View>
        )
      }
      footer={
        step === 0 && !manualOpen ? (
          // Hub: the primary CTA sits in the footer (thumb zone), not at the top of the scroll — QA flagged the old
          // layout as sparse with the action out of reach. Back out via the top-left arrow.
          <Button label="Quick start — score now" size="lg" variant="primary" icon="play" onPress={quickStart} />
        ) : (
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <Button label="Back" variant="ghost" onPress={step === 0 ? () => { feedback("pop", "light"); setManualOpen(false); } : back} style={{ flex: 1 }} />
            <Button label={step === 3 ? "Start scoring" : "Next"} variant="primary" icon={step === 3 ? "play" : "chevronRight"} onPress={next} style={{ flex: 1.6 }} />
          </View>
        )
      }
    >
      <View key={step} style={{ gap: space.lg }}>
        {step === 0 ? (
          !manualOpen ? (
            // One clean promise, the format it'll use with a Customize link, and (once there's history) quick
            // rematches. No competing "Set up manually" card or 3-step how-to — QA flagged the hub as text-heavy.
            <>
              <Card accent={palette.accent} style={{ gap: space.xs }}>
                <Text style={type.overline}>Score in 20 seconds</Text>
                <Text style={type.title}>Quick start</Text>
                <Text style={type.caption}>Tap Quick start below and you're on the first ball in seconds — full squads and a default toss are filled in. Naming the teams is optional.</Text>
              </Card>

              {/* Team names are editable RIGHT HERE on the hub — a first-class, focusable action, no "manual mode"
                  detour (QA core flow: the tester couldn't find/focus a team-name field). Both are optional: leave them
                  blank and Quick start uses sensible defaults. The preview below updates live as you type. */}
              <Card style={{ gap: space.md }}>
                <Text style={type.label}>Team names <Text style={[type.caption, { color: palette.inkMuted }]}>· optional</Text></Text>
                <TeamNameField label="Team A" placeholder="e.g. Street Royals" value={nameA} onChangeText={setNameA} />
                <TeamNameField label="Team B" placeholder="e.g. Park Strikers" value={nameB} onChangeText={setNameB} />
              </Card>

              {/* Format summary + one obvious, full-width entry into the rules engine (overs, players, wides,
                  free-hit, presets…) — a small ghost "Customize" link was too easy for the feature tour to miss. */}
              <Card style={{ gap: space.sm }}>
                <View style={styles.summaryRow}>
                  <View style={styles.summaryIcon}><Icon name="settings" size={18} color={palette.primary} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={type.label}>Format</Text>
                    <Text style={[type.caption, { marginTop: 1 }]} numberOfLines={2}>
                      {currentPreset?.name ?? "Custom"} · {rules.oversPerInnings || "∞"} overs · {rules.playersPerSide}-a-side · {rules.ballsPerOver} balls/over{rules.freeHitOnNoBall ? " · free hit" : ""}
                    </Text>
                  </View>
                </View>
                <Button label="Customize rules, overs & presets" variant="secondary" icon="settings" onPress={() => { feedback("pop", "light"); setManualOpen(true); }} />
              </Card>

              {/* Preview of exactly what Quick start creates — teams, a full squad each and the default toss — so the
                  screen isn't a big empty gap before the CTA and the scorer knows who the players are (QA). */}
              <QuickStartPreview
                a={previewA}
                b={previewB}
                squadA={squadA}
                squadB={squadB}
                batFirst={quickBatFirst}
                onFlip={() => { feedback("pop", "select"); setQuickBatFirst((sd) => (sd === "A" ? "B" : "A")); }}
              />

              {recentMatchups.length ? (
                <View style={{ gap: space.sm }}>
                  <SectionHeader title="Quick rematch" />
                  {recentMatchups.map((mu, i) => (
                    <Tappable key={`${mu.a.id}-${mu.b.id}-${i}`} label={`Rematch ${mu.a.name} versus ${mu.b.name}`} sound="pop" onPress={() => rematch(mu.a, mu.b)} style={styles.rematchRow}>
                      <View style={styles.summaryIcon}><Icon name="ball" size={16} color={palette.primary} /></View>
                      <Text style={[type.bodyStrong, { flex: 1 }]} numberOfLines={1}>{mu.a.name} v {mu.b.name}</Text>
                      <Icon name="play" size={16} color={palette.primary} />
                    </Tappable>
                  ))}
                </View>
              ) : null}
            </>
          ) : (
            <>
            <View style={{ gap: space.sm }}>
              <Text style={type.label}>Format</Text>
              <View style={styles.chips}>
                {allPresets.map((p) => (
                  <Chip key={p.id} label={p.name} selected={presetId === p.id} onPress={() => applyPreset(p.id)} />
                ))}
                <Chip label="Custom" selected={presetId === "custom"} onPress={() => setPresetId("custom")} />
              </View>
              <Text style={type.caption}>
                {rules.oversPerInnings || "∞"} overs · {rules.playersPerSide}-a-side · {rules.ballsPerOver} balls/over
                {rules.oneBatter ? " · one batter" : ""}{rules.lastManBats ? " · last man bats" : ""}
              </Text>
            </View>
            {presetId === "custom" ? (
              <Card style={{ gap: space.xs }}>
                <Stepper label="Overs per innings" value={rules.oversPerInnings} min={0} max={50} onChange={(v) => patchRules({ oversPerInnings: v })} />
                <Stepper label="Balls per over" value={rules.ballsPerOver} min={1} max={12} onChange={(v) => patchRules({ ballsPerOver: v })} />
                <Stepper label="Players per side" value={rules.playersPerSide} min={1} max={16} onChange={(v) => patchRules({ playersPerSide: v, wickets: Math.min(rules.wickets, maxWickets({ playersPerSide: v, lastManBats: rules.lastManBats, oneBatter: rules.oneBatter })) })} />
                {/* Cap wickets at what the squad can actually lose (players − 1 unless last-man/one-batter) so the rules
                    stay valid — before, you could set 10 wickets for a 10-a-side game and every Save/Next went dead. */}
                <Stepper label="Wickets" value={rules.wickets} min={1} max={maxWickets(rules)} onChange={(v) => patchRules({ wickets: v })} />
                <Stepper label="Boundary (four)" value={rules.boundaryFour} min={1} max={9} onChange={(v) => patchRules({ boundaryFour: v })} />
                <Stepper label="Boundary (six)" value={rules.boundarySix} min={rules.boundaryFour} max={12} onChange={(v) => patchRules({ boundarySix: v })} />
                <Stepper label="Wide runs" value={rules.wideRuns} min={0} max={6} onChange={(v) => patchRules({ wideRuns: v })} />
                <Stepper label="No-ball runs" value={rules.noBallRuns} min={0} max={6} onChange={(v) => patchRules({ noBallRuns: v })} />
                <Toggle label="One batter (box cricket)" value={rules.oneBatter} onChange={(v) => patchRules({ oneBatter: v, wickets: Math.min(rules.wickets, maxWickets({ playersPerSide: rules.playersPerSide, lastManBats: rules.lastManBats, oneBatter: v })) })} />
                <Toggle label="Last man bats" value={rules.lastManBats} onChange={(v) => patchRules({ lastManBats: v, wickets: Math.min(rules.wickets, maxWickets({ playersPerSide: rules.playersPerSide, lastManBats: v, oneBatter: rules.oneBatter })) })} />
                <Toggle label="Free hit after a no-ball" value={rules.freeHitOnNoBall} onChange={(v) => patchRules({ freeHitOnNoBall: v })} />
                <Toggle label="Score-only (no ball-by-ball)" value={rules.scoreOnly} onChange={(v) => patchRules({ scoreOnly: v })} />
                {/* Save these custom rules as a reusable preset (shows up as a Format chip above). */}
                <View style={styles.presetSave}>
                  <TextField
                    label="Save as a preset"
                    placeholder={suggestedPresetName}
                    value={presetName}
                    onChangeText={setPresetName}
                    maxLength={30}
                    autoCapitalize="words"
                    autoCorrect={false}
                  />
                  {/* Enabled as soon as the rules are valid — a name is optional (the suggested name is used if the
                      field is left blank), so saving is always one tap and never a silent dead end (QA feature_tour). */}
                  <Button label="Save as preset" variant="secondary" icon="star" disabled={!!rulesErr} onPress={saveCustomPreset} />
                  {/* A disabled Save always says why — a rule is out of range; otherwise show exactly what will be saved. */}
                  {rulesErr ? (
                    <Text style={[type.caption, { color: palette.warning }]}>{rulesErrorText(rulesErr, rules)}</Text>
                  ) : (
                    <Text style={type.caption}>Tap Save to store this as “{presetName.trim() || suggestedPresetName}”, or type your own name.</Text>
                  )}
                  {/* The saved presets show RIGHT HERE (not only in the chip row at the top, which scrolls off while
                      the keyboard is up) so saving a preset lands a visible, lasting result the scorer can see and tap. */}
                  {app.presets.length ? (
                    <View style={{ gap: 6 }}>
                      <Text style={[type.overline, { color: palette.inkMuted }]}>Your saved presets · tap to use</Text>
                      <View style={styles.chips}>
                        {app.presets.map((p) => {
                          const on = presetId === p.id;
                          return (
                            <Tappable key={p.id} label={`Use preset ${p.name}`} sound="pop" onPress={() => applyPreset(p.id)} style={[styles.nameChip, on && { borderColor: palette.primary, backgroundColor: palette.primarySoft }]}>
                              <Icon name={on ? "check" : "star"} size={13} color={on ? palette.primary : palette.inkMuted} />
                              <Text style={[type.label, { color: palette.ink }]} numberOfLines={1}>{p.name}</Text>
                            </Tappable>
                          );
                        })}
                      </View>
                    </View>
                  ) : null}
                </View>
              </Card>
            ) : null}
            <View style={{ gap: space.md }}>
              <TeamNameField label="Team A" placeholder="e.g. Street Royals" value={nameA} onChangeText={setNameA} />
              <TeamNameField label="Team B" placeholder="e.g. Park Strikers" value={nameB} onChangeText={setNameB} />
            </View>
            </>
          )
        ) : step === 1 ? (
          <>
            <RosterField teamName={effA} names={namesA} onChange={setRosterA} onQuickFill={() => setRosterA(fillRoster(namesA, "A"))} per={rules.playersPerSide} />
            <RosterField teamName={effB} names={namesB} onChange={setRosterB} onQuickFill={() => setRosterB(fillRoster(namesB, "B"))} per={rules.playersPerSide} />
            <Text style={type.caption}>Type a name and tap Add, or paste a whole list. Fewer than 11 is fine. Duplicate names are merged. In a hurry? Tap Fill squad.</Text>
          </>
        ) : step === 2 ? (
          <>
            <SectionHeader title="Who won the toss?" />
            <View style={styles.pickRow}>
              <PickCard label={effA} id="A" selected={tossWinner === "A"} onPress={() => { feedback("pop", "select"); setTossWinner("A"); }} />
              <PickCard label={effB} id="B" selected={tossWinner === "B"} onPress={() => { feedback("pop", "select"); setTossWinner("B"); }} />
            </View>
            <SectionHeader title="And chose to" />
            <View style={styles.chips}>
              <Chip label="Bat first" selected={decision === "bat"} onPress={() => setDecision("bat")} />
              <Chip label="Bowl first" selected={decision === "bowl"} onPress={() => setDecision("bowl")} />
            </View>
          </>
        ) : (
          <>
            <Text style={type.body}>
              <Text style={type.bodyStrong}>{battingFirstSide === "A" ? effA : effB}</Text> bat first. Pick the openers.
            </Text>
            <SectionHeader title={rules.oneBatter ? "Opening batter" : "Striker"} />
            <View style={styles.chips}>
              {battingNames.map((n, i) => (
                <Chip key={`${n}-${i}`} label={n} selected={strikerIdx === i} onPress={() => { feedback("pop", "select"); setStrikerIdx(i); if (nonStrikerIdx === i) setNonStrikerIdx(i === 0 ? 1 : 0); }} />
              ))}
            </View>
            {!rules.oneBatter ? (
              <>
                <SectionHeader title="Non-striker" />
                <View style={styles.chips}>
                  {battingNames.map((n, i) => (
                    <Chip key={`ns-${n}-${i}`} label={n} selected={nonStrikerIdx === i} onPress={() => { feedback("pop", "select"); setNonStrikerIdx(i); if (strikerIdx === i) setStrikerIdx(i === 0 ? 1 : 0); }} />
                  ))}
                </View>
              </>
            ) : null}
            <Text style={type.caption}>You'll pick the opening bowler on the next tap.</Text>
          </>
        )}
      </View>
    </FooterScreen>
  );
}

/** Hub preview of the match Quick start will create: both teams with their full squad names and the default toss,
 *  so step 0 reads as a real team sheet rather than a sparse screen with a lone CTA (QA: dead space, unclear players). */
function QuickStartPreview({ a, b, squadA, squadB, batFirst, onFlip }: { a: string; b: string; squadA: string[]; squadB: string[]; batFirst: Side; onFlip: () => void }) {
  const line = (names: string[]) => {
    const shown = names.slice(0, 4).join(", ");
    const extra = names.length - 4;
    return extra > 0 ? `${shown} +${extra} more` : shown;
  };
  const batName = batFirst === "A" ? a : b;
  return (
    <Card style={{ gap: space.sm }}>
      <Text style={type.overline}>You'll start</Text>
      {/* Full-width toss row in plain cricket — tap the coin to flip which team bats first (QA #4: the toss was
          only a tiny tag, so a newcomer couldn't tell who bats first or why). */}
      <Tappable label={`${batName} bats first — tap to flip the toss`} sound="pop" onPress={onFlip} style={styles.tossRow}>
        <View style={styles.tossCoin}><Text style={styles.tossCoinTxt}>🪙</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={type.bodyStrong} numberOfLines={2}>{batName} won the toss and bat first</Text>
          <Text style={[type.caption, { color: palette.primary }]}>Tap to flip the toss</Text>
        </View>
        <Icon name="undo" size={18} color={palette.primary} />
      </Tappable>
      <TeamPreviewRow name={a} squad={line(squadA)} count={squadA.length} side="A" batsFirst={batFirst === "A"} />
      <View style={styles.vsRow}><Text style={[type.overline, { color: palette.inkMuted }]}>versus</Text></View>
      <TeamPreviewRow name={b} squad={line(squadB)} count={squadB.length} side="B" batsFirst={batFirst === "B"} />
    </Card>
  );
}

function TeamPreviewRow({ name, squad, count, side, batsFirst }: { name: string; squad: string; count: number; side: string; batsFirst?: boolean }) {
  return (
    <View style={styles.previewRow}>
      <Avatar name={name} id={side} size={38} color={colorFor(side)} />
      <View style={{ flex: 1 }}>
        <Text style={type.bodyStrong} numberOfLines={1}>{name} <Text style={[type.caption, { color: palette.inkMuted }]}>· {count} players</Text></Text>
        <Text style={type.caption} numberOfLines={1}>{squad}</Text>
      </View>
      {batsFirst ? <Pill label="Bats first" tone="primary" /> : null}
    </View>
  );
}

/**
 * Team-name input that owns its OWN text state. The TextInput's `value` is bound to this component's local state,
 * updated synchronously inside onChangeText, so the native field and JS can never diverge — the parent's heavy
 * re-render on each keystroke (recomputing squads, previews, rematches) can no longer reset the field mid-IME-
 * composition, which is what produced the garbled "Street RoyGully Kings…" duplication in QA. The parent value is
 * mirrored up for validation/preview; autofill/autocorrect/suggestions are fully off (another garble source).
 */
const TeamNameField = memo(function TeamNameField({ label, placeholder, value, onChangeText }: { label: string; placeholder: string; value: string; onChangeText: (t: string) => void }) {
  const [text, setText] = useState(value);
  // Reconcile only when the parent value is changed from the OUTSIDE (e.g. a reset), never echoing our own edits back
  // into the field mid-composition. `text` stays the single source of truth the native view is bound to.
  const last = useRef(value);
  if (value !== last.current && value !== text) {
    last.current = value;
    setText(value);
  }
  const change = (t: string) => {
    last.current = t;
    setText(t);
    onChangeText(t);
  };
  return (
    <TextField
      label={label}
      placeholder={placeholder}
      value={text}
      onChangeText={change}
      maxLength={40}
      autoCapitalize="words"
      autoCorrect={false}
      spellCheck={false}
      autoComplete="off"
      textContentType="none"
      importantForAutofill="no"
    />
  );
});

/** Per-player squad editor: add via button / Enter, paste lists, tap a chip to remove. Robust where a multiline box wasn't. */
function RosterField({ teamName, names, onChange, onQuickFill, per }: { teamName: string; names: string[]; onChange: (names: string[]) => void; onQuickFill: () => void; per: number }) {
  const [text, setText] = useState("");
  const add = () => {
    const parts = splitNames(text);
    if (!parts.length) return;
    onChange(uniqNames([...names, ...parts]));
    setText("");
    feedback("pop", "select");
  };
  const remove = (i: number) => {
    onChange(names.filter((_, j) => j !== i));
    feedback("pop", "light");
  };
  return (
    <View style={{ gap: space.sm }}>
      <TextField
        label={`${teamName} squad`}
        helper={`${names.length} player${names.length === 1 ? "" : "s"} added${per ? ` · ${per} a side` : ""}`}
        placeholder="Add a player name"
        value={text}
        onChangeText={setText}
        onSubmitEditing={add}
        blurOnSubmit={false}
        returnKeyType="done"
        autoCapitalize="words"
        autoCorrect={false}
        spellCheck={false}
      />
      <View style={{ flexDirection: "row", gap: space.sm }}>
        <Button label="Add player" variant="secondary" icon="plus" onPress={add} disabled={!text.trim()} style={{ flex: 1.4 }} />
        <Button label="Fill squad" variant="ghost" icon="people" onPress={onQuickFill} style={{ flex: 1 }} />
      </View>
      {names.length ? (
        <View style={styles.chips}>
          {names.map((n, i) => (
            <Tappable key={`${n}-${i}`} label={`Remove ${n}`} sound={null} onPress={() => remove(i)} style={styles.nameChip}>
              <Text style={[type.label, { color: palette.ink }]} numberOfLines={1}>{n}</Text>
              <Icon name="close" size={14} color={palette.inkMuted} />
            </Tappable>
          ))}
        </View>
      ) : (
        <Text style={type.caption}>No players yet — add a couple to start, or tap Fill squad.</Text>
      )}
    </View>
  );
}

function PickCard({ label, id, selected, onPress }: { label: string; id: string; selected: boolean; onPress: () => void }) {
  return (
    <Tappable label={label} onPress={onPress} sound={null} scale={0.98} style={[styles.pickCard, selected && { borderColor: palette.primary, backgroundColor: palette.primarySoft }]}>
      <Avatar name={label} id={id} size={44} color={colorFor(id)} />
      <Text style={[type.bodyStrong, { textAlign: "center" }]} numberOfLines={2}>{label}</Text>
    </Tappable>
  );
}

function today(): string {
  const d = new Date();
  const p = (v: number) => String(v).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const styles = StyleSheet.create({
  topAlign: { justifyContent: "flex-start" },
  dots: { flexDirection: "row", gap: 6, marginTop: space.sm },
  dot: { flex: 1, height: 5, borderRadius: 3, backgroundColor: palette.border },
  dotOn: { backgroundColor: palette.primary },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  nameChip: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 36, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surfaceAlt },
  presetSave: { gap: space.sm, marginTop: space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border, paddingTop: space.md },
  pickRow: { flexDirection: "row", gap: space.md },
  pickCard: { flex: 1, alignItems: "center", gap: space.sm, padding: space.lg, borderRadius: radius.lg, borderWidth: 1.5, borderColor: palette.border, backgroundColor: palette.surface },
  topRow: { flexDirection: "row", alignItems: "center", gap: space.xs },
  summaryRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  summaryIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: palette.primarySoft },
  rematchRow: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 52, paddingHorizontal: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
  previewRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  vsRow: { alignItems: "center" },
  tossRow: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 56, paddingHorizontal: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: palette.primary, backgroundColor: palette.primarySoft },
  tossCoin: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: palette.surface },
  tossCoinTxt: { fontSize: 20 },
});
