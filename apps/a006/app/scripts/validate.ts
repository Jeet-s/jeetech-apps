/// <reference types="node" />
/**
 * Core-logic tests for Gully Score — every rule in src/core through the real
 * functions. Run with `npm run validate`.
 * Final stdout line is JSON:
 *   {"tests": N, "passed": N, "failures": [...], "features": [...]}
 */
import { addDays, year } from "../src/core/dates";
import {
  DEFAULT_RULES,
  PRESETS,
  ballsInInnings,
  makeRules,
  maxWickets,
  oversFloat,
  oversText,
  presetById,
  validateRules,
} from "../src/core/rules";
import {
  ScoringError,
  editBall,
  overByOver,
  recordBall,
  replay,
  undoLast,
  type BallInput,
} from "../src/core/scoring";
import { firstBattingTeam, matchResult, targetFor } from "../src/core/match";
import { nrrOvers, pointsTable, DEFAULT_POINTS } from "../src/core/tournament";
import {
  careerStats,
  formatTag,
  headToHead,
  playerOfMatch,
  recentForm,
  resolvePlayer,
} from "../src/core/stats";
import { aiDailyQuota, aiQuotaLeft, canUse, isGated } from "../src/core/pro";
import {
  addPlayer,
  addPlayersBulk,
  addPlayerToTeam,
  archivePlayer,
  deletePlayer,
  playerInUse,
  createTicket,
  createTournament,
  emptyApp,
  mergePlayers,
  removePlayerFromTeam,
  scoreBall,
  setTicketStatus,
  startMatch,
  startSecondInnings,
  addTeam,
  renameTeam,
  renamePlayer,
} from "../src/core/app";
import { ballLabel, formInsightInput, matchTitle, nameResolver, scorecardText, teamResolver } from "../src/core/format";
import { migrateApp } from "../src/core/data";
import { sim } from "../src/core/sim";
import type { Innings, Match, Player, Rules } from "../src/core/types";

const results: { name: string; ok: boolean; why?: string }[] = [];
const features = new Set<string>();
function test(feature: string, name: string, fn: () => void) {
  features.add(feature);
  try {
    fn();
    results.push({ name, ok: true });
  } catch (e) {
    results.push({ name, ok: false, why: String((e as Error)?.message ?? e).slice(0, 200) });
  }
}
function eq<T>(a: T, b: T, msg = "") {
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw new Error(`${msg} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
function ok(cond: boolean, msg = "expected true") {
  if (!cond) throw new Error(msg);
}
function near(a: number, b: number, tol = 0.001, msg = "") {
  if (Math.abs(a - b) > tol) throw new Error(`${msg} expected ~${b}, got ${a}`);
}
function throws(fn: () => void, msg = "expected throw") {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  if (!threw) throw new Error(msg);
}

// Helpers ---------------------------------------------------------------
const R: Rules = makeRules({ oversPerInnings: 5, ballsPerOver: 6, wickets: 5, playersPerSide: 6 });
const ORDER = ["b1", "b2", "b3", "b4", "b5", "b6"];
function mkInn(rules: Rules = R, order = ORDER): Innings {
  return {
    id: "i1",
    battingTeamId: "A",
    bowlingTeamId: "B",
    order: 1,
    battingOrder: order,
    events: [],
    closed: false,
    target: null,
    scoreOnly: null,
  };
}
function play(innings: Innings, rules: Rules, inputs: BallInput[]): Innings {
  return inputs.reduce((inn, i) => recordBall(inn, rules, { bowler: "bw1", ...i }), innings);
}

// ---- Dates ----------------------------------------------------------------
test("dates", "addDays forward", () => eq(addDays("2026-03-10", 1), "2026-03-11"));
test("dates", "addDays across month", () => eq(addDays("2026-01-31", 1), "2026-02-01"));
test("dates", "addDays back across year", () => eq(addDays("2026-01-01", -1), "2025-12-31"));
test("dates", "addDays leap day", () => eq(addDays("2028-02-28", 1), "2028-02-29"));
test("dates", "year()", () => eq(year("2026-05-01"), 2026));

// ---- Rules & presets ------------------------------------------------------
test("rules", "all presets validate", () => PRESETS.forEach((p) => eq(validateRules(p.rules), null, p.id)));
test("rules", "presetById", () => eq(presetById("t20")?.rules.oversPerInnings, 20));
test("rules", "bad overs rejected", () => eq(validateRules(makeRules({ oversPerInnings: -1 })), "overs"));
test("rules", "bad balls/over rejected", () => eq(validateRules(makeRules({ ballsPerOver: 0 })), "balls_per_over"));
test("rules", "too many players rejected", () => eq(validateRules(makeRules({ playersPerSide: 99 })), "players"));
test("rules", "wickets cannot exceed players-1 (normal)", () =>
  eq(validateRules(makeRules({ playersPerSide: 11, wickets: 11 })), "wickets"));
test("rules", "last-man-bats allows players wickets", () =>
  eq(validateRules(makeRules({ playersPerSide: 8, wickets: 8, lastManBats: true })), null));
test("rules", "boundary six < four rejected", () =>
  eq(validateRules(makeRules({ boundaryFour: 6, boundarySix: 4 })), "boundary"));
test("rules", "maxWickets one-batter = players", () =>
  eq(maxWickets({ playersPerSide: 6, lastManBats: false, oneBatter: true }), 6));
test("rules", "oversText 12.3", () => eq(oversText(75, 6), "12.3"));
test("rules", "oversFloat 12.3 → 12.5", () => near(oversFloat(75, 6), 12.5));
test("rules", "ballsInInnings", () => eq(ballsInInnings(R), 30));

// ---- Scoring: runs, extras, rotation --------------------------------------
test("scoring", "single run counts to batter & team", () => {
  const s = replay(play(mkInn(), R, [{ runs: 1 }]), R);
  eq([s.runs, s.batters.find((b) => b.id === "b1")?.runs], [1, 1]);
});
test("scoring", "a normal ball is 1 tap (no extras)", () => {
  const s = replay(play(mkInn(), R, [{ runs: 2 }]), R);
  eq([s.runs, s.legalBalls, s.extras.total], [2, 1, 0]);
});
test("scoring", "four & six boundary classified", () => {
  const s = replay(play(mkInn(), R, [{ runs: 4, boundary: "four" }, { runs: 6, boundary: "six" }]), R);
  const b1 = s.batters.find((b) => b.id === "b1")!;
  eq([b1.fours, b1.sixes, s.runs], [1, 1, 10]);
});
test("scoring", "custom 5/7 boundaries keep classification", () => {
  const r5 = makeRules({ boundaryFour: 5, boundarySix: 7, playersPerSide: 6, wickets: 5, oversPerInnings: 5 });
  // boundaries don't rotate strike, so b1 faces both 5 and 7
  const s = replay(play(mkInn(r5), r5, [{ runs: 5, boundary: "four" }, { runs: 7, boundary: "six" }]), r5);
  const b1 = s.batters.find((b) => b.id === "b1")!;
  eq([b1.fours, b1.sixes, s.runs], [1, 1, 12]);
});
test("scoring", "odd runs rotate the strike", () => {
  const s = replay(play(mkInn(), R, [{ runs: 1 }]), R);
  eq(s.strikerId, "b2");
});
test("scoring", "even runs keep the strike", () => {
  const s = replay(play(mkInn(), R, [{ runs: 2 }]), R);
  eq(s.strikerId, "b1");
});
test("scoring", "wide adds penalty, is not a legal ball", () => {
  const s = replay(play(mkInn(), R, [{ extra: "wide", runs: 0 }]), R);
  eq([s.runs, s.legalBalls, s.extras.wides], [1, 0, 1]);
});
test("scoring", "bye off a wide swaps strike (extra + ran)", () => {
  const s = replay(play(mkInn(), R, [{ extra: "wide", runs: 1 }]), R);
  eq([s.runs, s.extras.wides, s.strikerId], [2, 2, "b2"]);
});
test("scoring", "byes go to extras not the batter", () => {
  const s = replay(play(mkInn(), R, [{ extra: "bye", runs: 2 }]), R);
  eq([s.runs, s.extras.byes, s.batters.find((b) => b.id === "b1")?.runs ?? 0, s.legalBalls], [2, 2, 0, 1]);
});
test("scoring", "leg-byes are a legal ball faced", () => {
  const s = replay(play(mkInn(), R, [{ extra: "legbye", runs: 1 }]), R);
  eq([s.extras.legbyes, s.legalBalls, s.batters.find((b) => b.id === "b1")?.balls], [1, 1, 1]);
});
test("scoring", "no-ball penalty + runs off bat to batter", () => {
  const s = replay(play(mkInn(), R, [{ extra: "noball", runs: 4, boundary: "four" }]), R);
  eq([s.runs, s.extras.noballs, s.batters.find((b) => b.id === "b1")?.runs, s.legalBalls], [5, 1, 4, 0]);
});
test("scoring", "free hit follows a no-ball", () => {
  const s = replay(play(mkInn(), R, [{ extra: "noball", runs: 0 }]), R);
  ok(s.freeHitNext, "free hit should follow");
});
test("scoring", "free hit forbids a bowled dismissal", () => {
  const inn = play(mkInn(), R, [{ extra: "noball", runs: 0 }]);
  throws(() => recordBall(inn, R, { bowler: "bw1", wicket: "bowled" }), "bowled on free hit must throw");
});
test("scoring", "free hit allows a run-out", () => {
  const inn = play(mkInn(), R, [{ extra: "noball", runs: 0 }]);
  const after = recordBall(inn, R, { bowler: "bw1", wicket: "runout", incoming: "b3", dismissedEnd: "striker" });
  eq(replay(after, R).wickets, 1);
});
test("scoring", "over completes and rotates strike; over view intact", () => {
  const six = Array.from({ length: 6 }, () => ({ runs: 0 }));
  const s = replay(play(mkInn(), R, six), R);
  eq([s.legalBalls, s.legalBallsThisOver, s.overComplete, s.strikerId], [6, 0, true, "b2"]);
});
test("scoring", "over view intact after 15 extras then a legal ball", () => {
  const extras = Array.from({ length: 15 }, () => ({ extra: "wide" as const, runs: 0 }));
  const s = replay(play(mkInn(), R, [...extras, { runs: 0 }]), R);
  eq([s.extras.wides, s.legalBalls, s.oversText], [15, 1, "0.1"]);
});

// ---- Undo & edit ----------------------------------------------------------
test("undo/edit", "undo 100 times leaves an empty innings", () => {
  let inn = play(mkInn(), R, Array.from({ length: 100 }, () => ({ extra: "wide" as const, runs: 0 })));
  for (let i = 0; i < 100; i++) inn = undoLast(inn);
  eq(inn.events.length, 0);
});
test("undo/edit", "undo across an over boundary", () => {
  let inn = play(mkInn(), R, Array.from({ length: 7 }, () => ({ runs: 0 })));
  inn = undoLast(inn);
  eq(replay(inn, R).legalBalls, 6);
});
test("undo/edit", "editing a ball recalculates totals & stats", () => {
  const inn = play(mkInn(), R, [{ runs: 4, boundary: "four" }]);
  const edited = editBall(inn, 0, { runs: 6, boundary: "six" });
  const s = replay(edited, R);
  eq([s.runs, s.batters.find((b) => b.id === "b1")?.sixes], [6, 1]);
});

// ---- Wickets & innings end ------------------------------------------------
test("wickets", "bowled dismisses the striker, bowler credited", () => {
  const inn = play(mkInn(), R, [{ wicket: "bowled", incoming: "b3" }]);
  const s = replay(inn, R);
  eq([s.wickets, s.batters.find((b) => b.id === "b1")?.out, s.bowlers.find((b) => b.id === "bw1")?.wickets], [1, true, 1]);
});
test("wickets", "run-out of the non-striker, no bowler credit", () => {
  const inn = play(mkInn(), R, [{ runs: 1, wicket: "runout", dismissedEnd: "nonstriker", incoming: "b3", fielder: "f1" }]);
  const s = replay(inn, R);
  // b2 was non-striker; after a single they swapped so run-out at non-striker end is b1
  eq([s.wickets, s.bowlers.find((b) => b.id === "bw1")?.wickets], [1, 0]);
});
test("wickets", "all out ends the innings", () => {
  const r = makeRules({ playersPerSide: 2, wickets: 1, oversPerInnings: 5, ballsPerOver: 6 });
  const inn = play(mkInn(r, ["x1", "x2"]), r, [{ wicket: "bowled", incoming: null }]);
  ok(replay(inn, r).inningsOver, "1 wicket with wickets=1 ends it");
});
test("wickets", "overs done ends the innings", () => {
  const r = makeRules({ playersPerSide: 6, wickets: 5, oversPerInnings: 1, ballsPerOver: 6 });
  const inn = play(mkInn(r), r, Array.from({ length: 6 }, () => ({ runs: 0 })));
  ok(replay(inn, r).inningsOver, "one full over ends a 1-over innings");
});
test("wickets", "last-man-bats: lone batter continues, no new batter needed", () => {
  const r = makeRules({ playersPerSide: 3, wickets: 3, lastManBats: true, oversPerInnings: 5, ballsPerOver: 6 });
  let inn = play(mkInn(r, ["b1", "b2", "b3"]), r, [{ wicket: "bowled", incoming: "b3" }]);
  inn = recordBall(inn, r, { bowler: "bw1", wicket: "bowled", incoming: null });
  const s = replay(inn, r);
  eq([s.wickets, s.inningsOver, s.needNewBatter], [2, false, false]);
  ok(s.strikerId != null && s.nonStrikerId == null, "lone batter on strike, no partner");
});
test("wickets", "one-batter box mode: no rotation, dismissed replaced", () => {
  const r = makeRules({ oneBatter: true, playersPerSide: 3, wickets: 3, wideReBall: false, oversPerInnings: 5, ballsPerOver: 6 });
  let inn = play(mkInn(r, ["b1", "b2", "b3"]), r, [{ runs: 1 }]);
  eq(replay(inn, r).strikerId, "b1"); // odd run does NOT rotate in one-batter
  inn = recordBall(inn, r, { bowler: "bw1", wicket: "bowled", incoming: "b2" });
  eq(replay(inn, r).strikerId, "b2");
});
test("wickets", "chasing to the target ends the innings", () => {
  const r = makeRules({ playersPerSide: 6, wickets: 5, oversPerInnings: 5, ballsPerOver: 6 });
  const inn2: Innings = { ...mkInn(r), order: 2, target: 3 };
  const inn = play(inn2, r, [{ runs: 2 }, { runs: 1 }]);
  ok(replay(inn, r).inningsOver, "reaching the target ends the chase");
});

// ---- Scorecard details ----------------------------------------------------
test("scorecard", "strike rate & economy", () => {
  const inn = play(mkInn(), R, [{ runs: 1 }, { runs: 1 }, { runs: 1 }, { runs: 1 }]);
  const s = replay(inn, R);
  // b1 & b2 share; just check bowler economy = 4 runs / (4/6 over) = 6
  near(s.bowlers.find((b) => b.id === "bw1")!.econ, 6);
});
test("scorecard", "maiden over detected", () => {
  const inn = play(mkInn(), R, Array.from({ length: 6 }, () => ({ runs: 0 })));
  eq(replay(inn, R).bowlers.find((b) => b.id === "bw1")?.maidens, 1);
});
test("scorecard", "fall of wickets records score & batter", () => {
  const inn = play(mkInn(), R, [{ runs: 3 }, { wicket: "bowled", incoming: "b3" }]);
  const fow = replay(inn, R).fallOfWickets[0];
  eq([fow.wicket, fow.score, fow.batterId], [1, 3, "b2"]);
});
test("scorecard", "partnership runs tracked", () => {
  const inn = play(mkInn(), R, [{ runs: 2 }, { runs: 4, boundary: "four" }, { wicket: "bowled", incoming: "b3" }]);
  const p = replay(inn, R).partnerships[0];
  eq([p.wicket, p.runs], [1, 6]);
});

// ---- NRR & points table ---------------------------------------------------
test("nrr", "overs = actual when not all out", () => near(nrrOvers(180, 4, 120, PRESETS[3].rules), 20));
test("nrr", "all out counts the full over quota", () => near(nrrOvers(150, 10, 108, PRESETS[3].rules), 20));
function scoreOnlyMatch(id: string, tid: string, runsA: number, runsB: number, winner: string): Match {
  const r = PRESETS[3].rules;
  return {
    id,
    teamAId: "A",
    teamBId: "B",
    rules: r,
    toss: null,
    status: "complete",
    tournamentId: tid,
    date: "2026-05-01",
    innings: [
      { id: id + "i1", battingTeamId: "A", bowlingTeamId: "B", order: 1, battingOrder: [], events: [], closed: true, scoreOnly: { runs: runsA, wickets: 5, balls: 120 } },
      { id: id + "i2", battingTeamId: "B", bowlingTeamId: "A", order: 2, battingOrder: [], events: [], closed: true, target: runsA + 1, scoreOnly: { runs: runsB, wickets: 8, balls: 120 } },
    ],
    result: { kind: "win", winnerId: winner, byRuns: runsA - runsB, summary: "" },
  };
}
test("points table", "win = 2 pts, loss = 0", () => {
  const t = { id: "tr1", name: "Cup", format: "league" as const, teamIds: ["A", "B"], groups: [], rounds: ["League"], points: DEFAULT_POINTS, leftTeamIds: [] };
  const table = pointsTable(t, [scoreOnlyMatch("m1", "tr1", 180, 179, "A")]);
  const A = table.find((x) => x.teamId === "A")!;
  eq([A.played, A.won, A.points], [1, 1, 2]);
});
test("points table", "NRR sign is right & verified", () => {
  const t = { id: "tr1", name: "Cup", format: "league" as const, teamIds: ["A", "B"], groups: [], rounds: ["League"], points: DEFAULT_POINTS, leftTeamIds: [] };
  const table = pointsTable(t, [scoreOnlyMatch("m1", "tr1", 180, 179, "A")]);
  near(table.find((x) => x.teamId === "A")!.nrr, 0.05, 0.001);
  near(table.find((x) => x.teamId === "B")!.nrr, -0.05, 0.001);
});
test("points table", "manual override is applied & flagged", () => {
  const t = { id: "tr1", name: "Cup", format: "league" as const, teamIds: ["A", "B"], groups: [], rounds: ["League"], points: DEFAULT_POINTS, leftTeamIds: [] };
  const table = pointsTable(t, [scoreOnlyMatch("m1", "tr1", 180, 179, "A")], [
    { id: "po1", tournamentId: "tr1", teamId: "B", field: "points", value: 10 },
  ]);
  const B = table.find((x) => x.teamId === "B")!;
  eq([B.points, B.overridden], [10, true]);
});

// ---- Match result ---------------------------------------------------------
test("result", "win by wickets when chased", () => {
  const m = scoreOnlyMatch("m1", "tr1", 150, 151, "B");
  const res = matchResult(m, (id) => id);
  eq([res?.kind, res?.winnerId, res?.byWickets], ["win", "B", PRESETS[3].rules.wickets - 8]);
});
test("result", "win by runs when defended", () => {
  const m = scoreOnlyMatch("m1", "tr1", 150, 120, "A");
  const res = matchResult(m, (id) => id);
  eq([res?.kind, res?.winnerId, res?.byRuns], ["win", "A", 30]);
});
test("result", "scores level is a tie", () => {
  const m = scoreOnlyMatch("m1", "tr1", 150, 150, "A");
  eq(matchResult(m, (id) => id)?.kind, "tie");
});
test("result", "targetFor is runs+1", () => eq(targetFor(150), 151));
test("result", "toss decides who bats first", () => {
  eq(firstBattingTeam("A", "B", { wonBy: "A", decision: "bowl" }), "B");
  eq(firstBattingTeam("A", "B", { wonBy: "A", decision: "bat" }), "A");
});

// ---- Stats: career, merge, H2H, form, hat-trick, POM ----------------------
function builtMatch(): { match: Match; players: Player[] } {
  const r = makeRules({ playersPerSide: 4, wickets: 3, oversPerInnings: 2, ballsPerOver: 6 });
  const players: Player[] = ["b1", "b2", "b3", "b4", "bw1"].map((id) => ({
    id, name: id, hand: "right", bowlerType: "pace", role: "allrounder", mergedInto: null,
  }));
  let inn = mkInn(r, ["b1", "b2", "b3", "b4"]);
  inn = play(inn, r, [
    { runs: 4, boundary: "four" },
    { runs: 1 },
    { runs: 6, boundary: "six" },
    { wicket: "bowled", incoming: "b3" }, // b2 out
    { wicket: "caught", incoming: "b4", fielder: "f1" }, // b1 out
    { wicket: "bowled", incoming: null }, // b3 out → all out (3 wkts)
  ]);
  const match: Match = {
    id: "m1", teamAId: "A", teamBId: "B", rules: r, toss: null, status: "complete",
    tournamentId: null, date: "2026-05-01", innings: [inn], result: { kind: "win", winnerId: "A", summary: "" },
  };
  return { match, players };
}
test("stats", "career batting aggregates (b1: 4 + 1 run)", () => {
  const { match, players } = builtMatch();
  const c = careerStats([match], players).get("b1")!;
  eq([c.batting.runs, c.batting.fours], [5, 1]);
});
test("stats", "hat-trick detected (3 in a row)", () => {
  const { match, players } = builtMatch();
  const c = careerStats([match], players).get("bw1")!;
  eq(c.bowling.hatTricks, 1);
});
test("stats", "wickets credited to bowler (caught & bowled)", () => {
  const { match, players } = builtMatch();
  const c = careerStats([match], players).get("bw1")!;
  eq(c.bowling.wickets, 3); // 2 bowled + 1 caught — all credit the bowler
});
test("stats", "merging players recalculates (resolve to survivor)", () => {
  const { match, players } = builtMatch();
  const merged = players.map((p) => (p.id === "b1" ? { ...p, mergedInto: "b3" } : p));
  const c = careerStats([match], merged);
  ok(!c.has("b1"), "b1 folded away");
  ok((c.get("b3")?.batting.runs ?? 0) >= 4, "b1 runs rolled into b3");
  eq(resolvePlayer("b1", merged), "b3");
});
test("stats", "head-to-head batter vs bowler", () => {
  const { match, players } = builtMatch();
  const h = headToHead([match], players, "b1", "bw1");
  ok(h.balls >= 1 && h.runs >= 4, "b1 faced bw1 and scored");
});
test("stats", "recent form lists innings", () => {
  const { match, players } = builtMatch();
  eq(recentForm([match], players, "b1")[0].runs, 5);
});
test("stats", "player of the match is economy-aware & ranked", () => {
  const { match, players } = builtMatch();
  const pom = playerOfMatch(match, players, ["b1", "b2", "b3", "b4"]);
  ok(pom.length > 0 && pom[0].points >= pom[pom.length - 1].points, "sorted best first");
});
test("stats", "format tag by overs", () => eq([formatTag(6), formatTag(20), formatTag(50)], ["gully", "t20", "odi"]));

// ---- Data safety: delete / archive guards ---------------------------------
function appWithMatch() {
  let app = emptyApp();
  const ids: Record<string, string> = {};
  for (const n of ["Asha", "Bina", "Chandra", "Dev"]) {
    const r = addPlayer(app, { name: n });
    app = r.state; ids[n] = r.id as string;
  }
  const ta = addTeam(app, { name: "Royals", playerIds: [ids.Asha, ids.Bina] }); app = ta.state;
  const tb = addTeam(app, { name: "Strikers", playerIds: [ids.Chandra, ids.Dev] }); app = tb.state;
  const st = startMatch(app, { teamAId: ta.id, teamBId: tb.id, rules: { oversPerInnings: 1, ballsPerOver: 2, wickets: 1 }, toss: { wonBy: ta.id, decision: "bat" }, date: "2026-05-01" });
  app = st.state;
  app = scoreBall(app, st.id as string, { runs: 1, bowler: ids.Chandra });
  return { app, ids, matchId: st.id as string };
}
test("data_safety", "playerInUse true for a rostered / batted player", () => {
  const { app, ids } = appWithMatch();
  ok(playerInUse(app, ids.Asha), "Asha is on a team + batting order");
  ok(playerInUse(app, ids.Chandra), "Chandra bowled a ball");
});
test("data_safety", "deletePlayer is blocked while in use (no orphaned refs)", () => {
  const { app, ids } = appWithMatch();
  const out = deletePlayer(app, ids.Asha, 1);
  ok(out.players.some((p) => p.id === ids.Asha), "player kept — hard delete refused");
});
test("data_safety", "scorecard still replays after an archive", () => {
  const { app, ids, matchId } = appWithMatch();
  const out = archivePlayer(app, ids.Asha, 2);
  const m = out.matches.find((x) => x.id === matchId)!;
  const sum = replay(m.innings[0], m.rules);
  ok(sum.runs >= 1 && m.innings[0].battingOrder.includes(ids.Asha), "ball log + batting order intact after archive");
  ok(out.audit.some((a) => a.entity === "player" && a.field === "archived"), "archive is audited");
});
test("data_safety", "archived player drops out of the active roster but is kept", () => {
  const { app, ids } = appWithMatch();
  const out = archivePlayer(app, ids.Asha, 3);
  const p = out.players.find((x) => x.id === ids.Asha)!;
  ok(p.archived === true && out.players.length === app.players.length, "hidden but not removed");
});
test("data_safety", "an unused player can be hard-deleted with an audit entry", () => {
  let app = emptyApp();
  const r = addPlayer(app, { name: "Nobody" }); app = r.state;
  const out = deletePlayer(app, r.id as string, 4);
  ok(!out.players.some((p) => p.id === r.id), "removed");
  ok(out.audit.some((a) => a.entity === "player" && a.field === "deleted"), "delete is audited");
});

// ---- Team rosters (local, on-device) --------------------------------------
test("roster", "add a player to a team's squad", () => {
  let s = emptyApp();
  const p = addPlayer(s, { name: "Zed" }); s = p.state;
  const t = addTeam(s, { name: "Team", playerIds: [] }); s = t.state;
  s = addPlayerToTeam(s, t.id, p.id!);
  ok(s.teams[0].playerIds.includes(p.id!), "player now in the squad");
});
test("roster", "adding the same player twice is idempotent", () => {
  let s = emptyApp();
  const p = addPlayer(s, { name: "Zed" }); s = p.state;
  const t = addTeam(s, { name: "Team", playerIds: [] }); s = t.state;
  s = addPlayerToTeam(s, t.id, p.id!);
  s = addPlayerToTeam(s, t.id, p.id!);
  eq(s.teams[0].playerIds.filter((x) => x === p.id).length, 1);
});
test("roster", "adding an unknown player is a no-op", () => {
  let s = emptyApp();
  const t = addTeam(s, { name: "Team", playerIds: [] }); s = t.state;
  s = addPlayerToTeam(s, t.id, "ghost");
  eq(s.teams[0].playerIds.length, 0);
});
test("roster", "remove a player from a squad (stats untouched)", () => {
  let s = emptyApp();
  const p = addPlayer(s, { name: "Zed" }); s = p.state;
  const t = addTeam(s, { name: "Team", playerIds: [p.id!] }); s = t.state;
  s = removePlayerFromTeam(s, t.id, p.id!);
  ok(!s.teams[0].playerIds.includes(p.id!), "player removed from squad");
  ok(s.players.some((x) => x.id === p.id), "player record itself is kept");
});
test("roster", "a rostered player counts as in use", () => {
  let s = emptyApp();
  const p = addPlayer(s, { name: "Zed" }); s = p.state;
  const t = addTeam(s, { name: "Team", playerIds: [] }); s = t.state;
  s = addPlayerToTeam(s, t.id, p.id!);
  ok(playerInUse(s, p.id!), "in use once on a squad");
});

// ---- Pro gating -----------------------------------------------------------
test("pro", "personal stats & scorecards are NEVER gated", () => {
  ["career_stats", "scorecard", "charts", "basic_points_table", "team_stats"].forEach((f) =>
    eq(isGated(f as any), false, f));
});
test("pro", "power features are gated", () => {
  ["advanced_analytics", "ai_summary", "ad_free", "bulk_export"].forEach((f) => eq(isGated(f as any), true, f));
});
test("pro", "canUse: free user keeps core, lacks power", () => {
  eq([canUse("career_stats", false), canUse("ai_summary", false), canUse("ai_summary", true)], [true, false, true]);
});
test("pro", "AI quota: subscriber 50 / free 2", () => {
  eq([aiDailyQuota({ subscriber: true }), aiDailyQuota({ subscriber: false })], [50, 2]);
  eq(aiQuotaLeft(2, { subscriber: false }), 0);
});

// ---- App operations -------------------------------------------------------
test("app", "duplicate player name is flagged", () => {
  let s = emptyApp();
  s = addPlayer(s, { name: "Virat" }).state;
  eq(addPlayer(s, { name: "virat" }).error, "duplicate");
});
test("app", "empty player name rejected", () => eq(addPlayer(emptyApp(), { name: "  " }).error, "empty"));
test("app", "renameTeam updates name, keeps id & players", () => {
  let s = emptyApp();
  const t = addTeam(s, { name: "Home Team", playerIds: ["p1", "p2"] }); s = t.state;
  s = renameTeam(s, t.id, "  Street Royals  ");
  const team = s.teams.find((x) => x.id === t.id)!;
  eq([team.name, team.playerIds.length], ["Street Royals", 2]);
});
test("app", "renameTeam ignores an empty name", () => {
  let s = emptyApp();
  const t = addTeam(s, { name: "Royals", playerIds: [] }); s = t.state;
  s = renameTeam(s, t.id, "   ");
  eq(s.teams.find((x) => x.id === t.id)!.name, "Royals");
});
test("app", "renamePlayer updates the name in place", () => {
  let s = emptyApp();
  const p = addPlayer(s, { name: "Aarav" }); s = p.state;
  s = renamePlayer(s, p.id!, "Aarav Sharma");
  eq(s.players.find((x) => x.id === p.id)!.name, "Aarav Sharma");
});
test("app", "renamePlayer refuses a duplicate name", () => {
  let s = emptyApp();
  const a = addPlayer(s, { name: "Aarav" }); s = a.state;
  const b = addPlayer(s, { name: "Rohan" }); s = b.state;
  s = renamePlayer(s, b.id!, "aarav");
  eq(s.players.find((x) => x.id === b.id)!.name, "Rohan");
});
test("app", "paste a squad skips duplicates & blanks", () => {
  const r = addPlayersBulk(emptyApp(), "Sam\nSam\n\nDev");
  eq([r.added.length, r.skipped.length], [2, 1]);
});
test("app", "start match → first ball recorded", () => {
  let s = emptyApp();
  const t1 = addTeam(s, { name: "A", playerIds: ["p1", "p2"] }); s = t1.state;
  const t2 = addTeam(s, { name: "B", playerIds: ["p3", "p4"] }); s = t2.state;
  const started = startMatch(s, { teamAId: t1.id, teamBId: t2.id, rules: R, toss: { wonBy: t1.id, decision: "bat" }, date: "2026-05-01" });
  s = started.state;
  s = scoreBall(s, started.id!, { runs: 1, bowler: "p3" });
  eq(s.matches[0].innings[0].events.length, 1);
});
test("app", "second innings gets the target", () => {
  let s = emptyApp();
  const r = makeRules({ playersPerSide: 2, wickets: 1, oversPerInnings: 1, ballsPerOver: 1 });
  const t1 = addTeam(s, { name: "A", playerIds: ["p1", "p2"] }); s = t1.state;
  const t2 = addTeam(s, { name: "B", playerIds: ["p3", "p4"] }); s = t2.state;
  const started = startMatch(s, { teamAId: t1.id, teamBId: t2.id, rules: r, toss: { wonBy: t1.id, decision: "bat" }, date: "2026-05-01" });
  s = started.state;
  s = scoreBall(s, started.id!, { runs: 5, bowler: "p3" }); // one ball → innings over
  s = startSecondInnings(s, started.id!);
  eq(s.matches[0].innings[1].target, 6);
});
test("app", "create tournament holds its teams", () => {
  let s = emptyApp();
  const t1 = addTeam(s, { name: "A", playerIds: [] }); s = t1.state;
  const t2 = addTeam(s, { name: "B", playerIds: [] }); s = t2.state;
  const r = createTournament(s, { name: "Cup", teamIds: [t1.id, t2.id] });
  eq(r.state.tournaments[0].teamIds.length, 2);
});

// ---- Charts (over-by-over) ------------------------------------------------
test("scorecard", "overByOver groups runs per over with a cumulative total", () => {
  const r = makeRules({ oversPerInnings: 2, ballsPerOver: 3, wickets: 5, playersPerSide: 6 });
  let inn = mkInn(r);
  inn = play(inn, r, [
    { runs: 1 }, { runs: 4, boundary: "four" }, { runs: 0 }, // over 1 = 5
    { runs: 2 }, { runs: 6, boundary: "six" }, { runs: 1 }, // over 2 = 9
  ]);
  const buckets = overByOver(inn, r);
  eq(buckets.length, 2);
  eq(buckets[0].runs, 5);
  eq(buckets[1].runs, 9);
  eq(buckets[1].cumulative, 14);
});
test("scorecard", "a wide sits in the over it was bowled", () => {
  const r = makeRules({ oversPerInnings: 1, ballsPerOver: 2, wickets: 5, playersPerSide: 6, wideReBall: true });
  let inn = mkInn(r);
  inn = play(inn, r, [{ extra: "wide", runs: 0 }, { runs: 1 }, { runs: 2 }]);
  const buckets = overByOver(inn, r);
  eq(buckets[0].runs, 4); // 1 (wide penalty) + 1 + 2
});

// ---- Support tickets ------------------------------------------------------
test("tickets", "create ticket opens with status open", () => {
  const r = createTicket(emptyApp(), { subject: "Lost a match", body: "help" }, 1000);
  eq(r.error, null);
  eq(r.state.tickets[0].status, "open");
  eq(r.state.tickets[0].subject, "Lost a match");
});
test("tickets", "blank subject rejected", () => {
  const r = createTicket(emptyApp(), { subject: "   ", body: "x" }, 1);
  eq(r.error, "empty");
  eq(r.state.tickets.length, 0);
});
test("tickets", "status transitions are tracked", () => {
  const r = createTicket(emptyApp(), { subject: "Q", body: "" }, 1);
  const s = setTicketStatus(r.state, r.id!, "resolved", 2000);
  eq(s.tickets[0].status, "resolved");
  eq(s.tickets[0].updatedTs, 2000);
});

// ---- Share / AI text builders ---------------------------------------------
test("format", "matchTitle & scorecard text reflect the real score", () => {
  let s = emptyApp();
  const r = makeRules({ playersPerSide: 2, wickets: 1, oversPerInnings: 1, ballsPerOver: 2 });
  const t1 = addTeam(s, { name: "Royals", playerIds: ["p1", "p2"] }); s = t1.state;
  const t2 = addTeam(s, { name: "Strikers", playerIds: ["p3", "p4"] }); s = t2.state;
  s = { ...s, players: [
    { id: "p1", name: "Asha", hand: "right", bowlerType: "none", role: "batter", mergedInto: null },
    { id: "p2", name: "Bina", hand: "right", bowlerType: "none", role: "batter", mergedInto: null },
    { id: "p3", name: "Chandra", hand: "right", bowlerType: "pace", role: "bowler", mergedInto: null },
    { id: "p4", name: "Dev", hand: "right", bowlerType: "pace", role: "bowler", mergedInto: null },
  ] };
  const started = startMatch(s, { teamAId: t1.id, teamBId: t2.id, rules: r, toss: { wonBy: t1.id, decision: "bat" }, date: "2026-05-01" });
  s = started.state;
  s = scoreBall(s, started.id!, { runs: 4, boundary: "four", bowler: "p3" });
  const m = s.matches[0];
  const tn = teamResolver(s.teams);
  const pn = nameResolver(s.players);
  eq(matchTitle(tn, m), "Royals vs Strikers");
  ok(scorecardText(m, tn, pn).includes("Royals 4/0"), "scorecard shows the live total");
  ok(scorecardText(m, tn, pn).includes("Asha"), "scorecard names the batter");
});
test("format", "ballLabel covers runs, extras and wickets", () => {
  eq(ballLabel({ extra: "none", runs: 4, wicket: "none" }), "4");
  eq(ballLabel({ extra: "wide", runs: 0, wicket: "none" }), "wd");
  eq(ballLabel({ extra: "noball", runs: 2, wicket: "none" }), "2nb");
  eq(ballLabel({ extra: "legbye", runs: 1, wicket: "none" }), "1lb");
  eq(ballLabel({ extra: "none", runs: 0, wicket: "bowled" }), "W");
});
test("format", "form insight input is plain text with scores", () => {
  const players: Player[] = [{ id: "p1", name: "Asha", hand: "right", bowlerType: "none", role: "batter", mergedInto: null }];
  const txt = formInsightInput([], players, "p1");
  ok(txt.includes("Asha"), "names the player");
  ok(txt.includes("no innings"), "handles an empty history");
});

// ---- Migration & persistence ----------------------------------------------
test("migration", "tickets array is coerced", () => {
  const out = migrateApp({ tickets: { 0: undefined } as any }, 0);
  ok(Array.isArray(out.tickets), "tickets is an array");
});
test("migration", "non-object migrates to empty app", () => eq(migrateApp(null, 0).matches.length, 0));
test("migration", "seq is pushed past existing ids", () => {
  const out = migrateApp({ players: [{ id: "p7", name: "X", hand: "right", bowlerType: "none", role: "batter", mergedInto: null }], seq: 2 }, 0);
  ok(out.seq > 7, "seq advanced beyond p7");
});
test("migration", "object-shaped arrays are coerced", () => {
  const out = migrateApp({ matches: { 0: undefined } as any }, 0);
  ok(Array.isArray(out.matches), "matches is an array");
});
test("persistence", "sim state survives serialize → deserialize", () => {
  let s = sim.init();
  for (const a of sim.actions(s).slice(0, 2)) s = sim.apply(s, a);
  eq(sim.deserialize(sim.serialize(s)), s);
});
test("persistence", "DEFAULT_RULES is a sane 11-a-side T20", () =>
  eq([DEFAULT_RULES.playersPerSide, DEFAULT_RULES.oversPerInnings], [11, 20]));

const failures = results.filter((r) => !r.ok).map((r) => `${r.name}: ${r.why}`);
for (const r of results) console.error(`${r.ok ? "PASS" : "FAIL"} ${r.name}${r.why ? ` — ${r.why}` : ""}`);
console.log(JSON.stringify({ tests: results.length, passed: results.length - failures.length, failures, features: [...features] }));
process.exit(failures.length ? 1 : 0);
