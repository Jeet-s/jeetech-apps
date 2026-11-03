/**
 * Player & team career stats, player merge, head-to-head, recent form and an
 * economy-aware player-of-the-match rating. All FREE forever — never gated.
 * Everything is derived from the match ball logs, so an edit or a merge
 * recalculates every number here.
 */
import { isLegalDelivery, replay } from "./scoring";
import type { Id, Match, Player } from "./types";

export interface BattingStats {
  innings: number;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  outs: number;
  notOuts: number;
  highScore: number;
  fifties: number;
  hundreds: number;
  average: number; // runs / outs
  strikeRate: number; // runs / balls * 100
}

export interface BowlingStats {
  innings: number;
  balls: number;
  runs: number;
  wickets: number;
  maidens: number;
  bestWickets: number;
  bestRuns: number; // runs conceded in the best spell
  hatTricks: number;
  fiveFors: number;
  average: number; // runs / wickets
  economy: number; // runs per over
  strikeRate: number; // balls / wickets
}

export interface CareerStats {
  playerId: Id;
  matches: number;
  batting: BattingStats;
  bowling: BowlingStats;
  catches: number;
  runouts: number;
}

export interface StatsFilter {
  format?: string | null; // preset/format tag by overs, see formatTag()
  year?: number | null;
}

const emptyBatting = (): BattingStats => ({
  innings: 0,
  runs: 0,
  balls: 0,
  fours: 0,
  sixes: 0,
  outs: 0,
  notOuts: 0,
  highScore: 0,
  fifties: 0,
  hundreds: 0,
  average: 0,
  strikeRate: 0,
});
const emptyBowling = (): BowlingStats => ({
  innings: 0,
  balls: 0,
  runs: 0,
  wickets: 0,
  maidens: 0,
  bestWickets: 0,
  bestRuns: 0,
  hatTricks: 0,
  fiveFors: 0,
  average: 0,
  economy: 0,
  strikeRate: 0,
});

export const emptyCareer = (playerId: Id): CareerStats => ({
  playerId,
  matches: 0,
  batting: emptyBatting(),
  bowling: emptyBowling(),
  catches: 0,
  runouts: 0,
});

/** A coarse format tag from the overs, for filtering. */
export function formatTag(oversPerInnings: number): string {
  if (oversPerInnings <= 0) return "unlimited";
  if (oversPerInnings <= 6) return "gully";
  if (oversPerInnings <= 10) return "t10";
  if (oversPerInnings <= 20) return "t20";
  return "odi";
}

/** Follow a merge chain to the surviving player id. */
export function resolvePlayer(id: Id, players: Player[]): Id {
  const byId = new Map(players.map((p) => [p.id, p]));
  let cur = id;
  const seen = new Set<Id>();
  while (true) {
    const p = byId.get(cur);
    if (!p || !p.mergedInto || seen.has(cur)) return cur;
    seen.add(cur);
    cur = p.mergedInto;
  }
}

function matchMatches(m: Match, f: StatsFilter): boolean {
  if (f.format && formatTag(m.rules.oversPerInnings) !== f.format) return false;
  if (f.year && Number(m.date.slice(0, 4)) !== f.year) return false;
  return true;
}

/** Count hat-tricks for a bowler in one innings (3 wickets in a row, off the bowler). */
function hatTricksInInnings(
  events: Match["innings"][number]["events"],
  bowlerId: Id,
): number {
  let streak = 0;
  let count = 0;
  for (const e of events) {
    if (e.bowler !== bowlerId) continue;
    const bowlerWicket =
      e.wicket !== "none" && e.wicket !== "runout" && e.wicket !== "retired";
    if (bowlerWicket) {
      streak += 1;
      if (streak >= 3) {
        count += 1;
        streak = 0; // reset so 4-in-a-row counts once (keep it simple)
      }
    } else {
      streak = 0;
    }
  }
  return count;
}

/** Career stats for every player, keyed by surviving player id. */
export function careerStats(
  matches: Match[],
  players: Player[],
  filter: StatsFilter = {},
): Map<Id, CareerStats> {
  const out = new Map<Id, CareerStats>();
  const get = (id: Id) => {
    const r = resolvePlayer(id, players);
    let c = out.get(r);
    if (!c) out.set(r, (c = emptyCareer(r)));
    return c;
  };
  const playedInMatch = new Map<Id, Set<Id>>(); // playerId -> matchIds

  for (const m of matches) {
    if (!matchMatches(m, filter)) continue;
    for (const inn of m.innings) {
      const sum = replay(inn, m.rules);
      // batting
      for (const b of sum.batters) {
        if (!b.batted) continue;
        const c = get(b.id);
        c.batting.innings += 1;
        c.batting.runs += b.runs;
        c.batting.balls += b.balls;
        c.batting.fours += b.fours;
        c.batting.sixes += b.sixes;
        if (b.out) c.batting.outs += 1;
        else c.batting.notOuts += 1;
        if (b.runs > c.batting.highScore) c.batting.highScore = b.runs;
        if (b.runs >= 100) c.batting.hundreds += 1;
        else if (b.runs >= 50) c.batting.fifties += 1;
        trackMatch(playedInMatch, resolvePlayer(b.id, players), m.id);
      }
      // bowling
      for (const bw of sum.bowlers) {
        const c = get(bw.id);
        c.bowling.innings += 1;
        c.bowling.balls += bw.balls;
        c.bowling.runs += bw.runs;
        c.bowling.wickets += bw.wickets;
        c.bowling.maidens += bw.maidens;
        if (
          bw.wickets > c.bowling.bestWickets ||
          (bw.wickets === c.bowling.bestWickets && bw.runs < c.bowling.bestRuns)
        ) {
          c.bowling.bestWickets = bw.wickets;
          c.bowling.bestRuns = bw.runs;
        }
        if (bw.wickets >= 5) c.bowling.fiveFors += 1;
        c.bowling.hatTricks += hatTricksInInnings(inn.events, bw.id);
        trackMatch(playedInMatch, resolvePlayer(bw.id, players), m.id);
      }
      // fielding
      for (const e of inn.events) {
        if (!e.fielder) continue;
        const c = get(e.fielder);
        if (e.wicket === "caught" || e.wicket === "stumped") c.catches += 1;
        else if (e.wicket === "runout") c.runouts += 1;
      }
    }
  }

  // finalise derived ratios
  for (const [id, c] of out) {
    c.matches = playedInMatch.get(id)?.size ?? 0;
    c.batting.average = c.batting.outs ? c.batting.runs / c.batting.outs : c.batting.runs;
    c.batting.strikeRate = c.batting.balls ? (c.batting.runs / c.batting.balls) * 100 : 0;
    c.bowling.average = c.bowling.wickets ? c.bowling.runs / c.bowling.wickets : 0;
    c.bowling.economy = c.bowling.balls ? c.bowling.runs / (c.bowling.balls / 6) : 0;
    c.bowling.strikeRate = c.bowling.wickets ? c.bowling.balls / c.bowling.wickets : 0;
  }
  return out;
}

function trackMatch(map: Map<Id, Set<Id>>, playerId: Id, matchId: Id) {
  let set = map.get(playerId);
  if (!set) map.set(playerId, (set = new Set()));
  set.add(matchId);
}

/** Recent batting form: last N innings runs, newest first. */
export function recentForm(
  matches: Match[],
  players: Player[],
  playerId: Id,
  n = 10,
): { runs: number; balls: number; out: boolean; date: string }[] {
  const target = resolvePlayer(playerId, players);
  const out: { runs: number; balls: number; out: boolean; date: string }[] = [];
  const sorted = [...matches].sort((a, b) => b.date.localeCompare(a.date));
  for (const m of sorted) {
    for (const inn of m.innings) {
      const sum = replay(inn, m.rules);
      for (const b of sum.batters) {
        if (b.batted && resolvePlayer(b.id, players) === target)
          out.push({ runs: b.runs, balls: b.balls, out: b.out, date: m.date });
      }
    }
    if (out.length >= n) break;
  }
  return out.slice(0, n);
}

/** Batter-vs-bowler head to head across all matches. */
export function headToHead(
  matches: Match[],
  players: Player[],
  batterId: Id,
  bowlerId: Id,
): { balls: number; runs: number; dismissals: number } {
  const bat = resolvePlayer(batterId, players);
  const bowl = resolvePlayer(bowlerId, players);
  let balls = 0;
  let runs = 0;
  let dismissals = 0;
  for (const m of matches) {
    for (const inn of m.innings) {
      const sum = replay(inn, m.rules);
      inn.events.forEach((e, i) => {
        const striker = sum.facedBy[i];
        if (!striker) return;
        if (resolvePlayer(striker, players) !== bat) return;
        if (resolvePlayer(e.bowler, players) !== bowl) return;
        if (isLegalDelivery(e, m.rules)) balls += 1;
        if (e.extra === "none" || e.extra === "noball") runs += e.runs;
        if (
          e.wicket !== "none" &&
          e.wicket !== "runout" &&
          e.wicket !== "retired" &&
          (e.dismissedEnd ?? "striker") === "striker"
        )
          dismissals += 1;
      });
    }
  }
  return { balls, runs, dismissals };
}

export interface PomScore {
  playerId: Id;
  points: number;
}

/**
 * Player of the match — economy-aware so tidy bowling and quick runs both
 * score, and the winning side breaks ties. Returns players sorted best first.
 */
export function playerOfMatch(
  match: Match,
  players: Player[],
  winningPlayerIds: Id[] = [],
): PomScore[] {
  const pts = new Map<Id, number>();
  const add = (id: Id, p: number) => {
    const r = resolvePlayer(id, players);
    pts.set(r, (pts.get(r) ?? 0) + p);
  };
  const onWinner = new Set(winningPlayerIds.map((id) => resolvePlayer(id, players)));

  for (const inn of match.innings) {
    const sum = replay(inn, match.rules);
    for (const b of sum.batters) {
      if (!b.batted) continue;
      let p = b.runs + b.fours * 1 + b.sixes * 2;
      if (b.balls >= 8) p += (b.sr - 100) * 0.08; // strike-rate bonus/penalty
      add(b.id, p);
    }
    for (const bw of sum.bowlers) {
      let p = bw.wickets * 20 + bw.maidens * 4;
      if (bw.balls >= match.rules.ballsPerOver) p += (7 - bw.econ) * 2; // economy-aware
      add(bw.id, p);
    }
    for (const e of inn.events) {
      if (e.fielder && (e.wicket === "caught" || e.wicket === "stumped" || e.wicket === "runout"))
        add(e.fielder, 8);
    }
  }

  const list: PomScore[] = [...pts.entries()].map(([playerId, points]) => ({
    playerId,
    // winning-side players get a small edge
    points: Math.round((points + (onWinner.has(playerId) ? 5 : 0)) * 10) / 10,
  }));
  list.sort((a, b) => b.points - a.points);
  return list;
}
