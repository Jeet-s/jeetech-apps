/**
 * Tournaments: fixtures, points table and Net Run Rate. NRR follows the
 * standard rule — a side bowled out counts its FULL over quota, not the overs
 * it actually used. Manual overrides to the table are applied last and logged
 * by the caller (every override is auditable).
 */
import { ballsInInnings, oversFloat } from "./rules";
import { replay } from "./scoring";
import { addDays } from "./dates";
import type {
  Fixture,
  Id,
  Match,
  PointsOverride,
  Tournament,
} from "./types";

export interface TableRow {
  teamId: Id;
  played: number;
  won: number;
  lost: number;
  tied: number;
  noResult: number;
  points: number;
  runsFor: number;
  oversFor: number;
  runsAgainst: number;
  oversAgainst: number;
  nrr: number;
  overridden: boolean;
}

function emptyRow(teamId: Id): TableRow {
  return {
    teamId,
    played: 0,
    won: 0,
    lost: 0,
    tied: 0,
    noResult: 0,
    points: 0,
    runsFor: 0,
    oversFor: 0,
    runsAgainst: 0,
    oversAgainst: 0,
    nrr: 0,
    overridden: false,
  };
}

/** Overs a side is charged with for NRR (full quota when all out). */
export function nrrOvers(
  runs: number,
  wickets: number,
  legalBalls: number,
  rules: Match["rules"],
): number {
  const quota = ballsInInnings(rules);
  const allOut = wickets >= rules.wickets;
  const balls = allOut && quota > 0 ? quota : legalBalls;
  return oversFloat(balls, rules.ballsPerOver);
}

/**
 * Build the points table for a tournament from its completed matches.
 * `overrides` edit the final table (manual corrections); they are recorded in
 * the audit log by the caller.
 */
export function pointsTable(
  tournament: Tournament,
  matches: Match[],
  overrides: PointsOverride[] = [],
): TableRow[] {
  const rows = new Map<Id, TableRow>();
  const row = (id: Id) => {
    let r = rows.get(id);
    if (!r) rows.set(id, (r = emptyRow(id)));
    return r;
  };
  tournament.teamIds.forEach((id) => row(id));

  const pts = tournament.points;

  for (const m of matches) {
    if (m.tournamentId !== tournament.id) continue;
    if (m.status !== "complete" && m.status !== "abandoned") continue;
    if (m.innings.length < 1) continue;

    const a = m.teamAId;
    const b = m.teamBId;
    const ra = row(a);
    const rb = row(b);
    ra.played += 1;
    rb.played += 1;

    // accumulate runs/overs for NRR from each innings
    for (const inn of m.innings) {
      const sum = replay(inn, m.rules);
      const batId = inn.battingTeamId;
      const bowlId = inn.bowlingTeamId;
      const overs = nrrOvers(sum.runs, sum.wickets, sum.legalBalls, m.rules);
      const bat = row(batId);
      const bowl = row(bowlId);
      bat.runsFor += sum.runs;
      bat.oversFor += overs;
      bowl.runsAgainst += sum.runs;
      bowl.oversAgainst += overs;
    }

    const res = m.result;
    if (!res || res.kind === "no_result" || res.kind === "abandoned") {
      ra.noResult += 1;
      rb.noResult += 1;
      ra.points += pts.noResult;
      rb.points += pts.noResult;
    } else if (res.kind === "tie") {
      ra.tied += 1;
      rb.tied += 1;
      ra.points += pts.tie;
      rb.points += pts.tie;
    } else if (res.winnerId) {
      const win = row(res.winnerId);
      const lose = row(res.winnerId === a ? b : a);
      win.won += 1;
      win.points += pts.win;
      lose.lost += 1;
      lose.points += pts.loss;
    }
  }

  // NRR
  for (const r of rows.values()) {
    const forRate = r.oversFor > 0 ? r.runsFor / r.oversFor : 0;
    const againstRate = r.oversAgainst > 0 ? r.runsAgainst / r.oversAgainst : 0;
    r.nrr = Math.round((forRate - againstRate) * 1000) / 1000;
  }

  // manual overrides (applied last, flagged)
  for (const o of overrides) {
    if (o.tournamentId !== tournament.id) continue;
    const r = rows.get(o.teamId);
    if (!r) continue;
    r.overridden = true;
    if (o.field === "points") r.points = o.value;
    else if (o.field === "won") r.won = o.value;
    else if (o.field === "lost") r.lost = o.value;
    else if (o.field === "nrr") r.nrr = o.value;
  }

  return [...rows.values()].sort(
    (x, y) => y.points - x.points || y.nrr - x.nrr || x.teamId.localeCompare(y.teamId),
  );
}

/** Single round-robin fixtures (each pair once), sorted by datetime. */
export function generateFixtures(
  tournament: Tournament,
  nextId: (prefix: string) => Id,
  baseDate: string,
): Fixture[] {
  const fixtures: Fixture[] = [];
  const groups = tournament.groups.length
    ? tournament.groups
    : [{ name: "", teamIds: tournament.teamIds }];
  let i = 0;
  for (const g of groups) {
    const teams = g.teamIds;
    for (let x = 0; x < teams.length; x++) {
      for (let y = x + 1; y < teams.length; y++) {
        fixtures.push({
          id: nextId("f"),
          tournamentId: tournament.id,
          round: tournament.rounds[0] ?? "League",
          group: g.name || null,
          teamAId: teams[x],
          teamBId: teams[y],
          datetime: `${addDays(baseDate, i)}T18:00`,
          matchId: null,
        });
        i += 1;
      }
    }
  }
  return fixtures.sort((a, b) => a.datetime.localeCompare(b.datetime));
}

export const DEFAULT_POINTS = { win: 2, tie: 1, loss: 0, noResult: 1 };
