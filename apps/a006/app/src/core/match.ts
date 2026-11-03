/** Match-level rules: toss, innings setup, target, result and super over. */
import { replay } from "./scoring";
import type {
  Id,
  Innings,
  Match,
  MatchResult,
  Rules,
  TossInfo,
} from "./types";

/** Which team bats first, from the toss. */
export function firstBattingTeam(
  teamAId: Id,
  teamBId: Id,
  toss: TossInfo | null | undefined,
): Id {
  if (!toss) return teamAId;
  const bats = toss.decision === "bat";
  if (toss.wonBy === teamAId) return bats ? teamAId : teamBId;
  return bats ? teamBId : teamAId;
}

export function makeInnings(
  id: Id,
  battingTeamId: Id,
  bowlingTeamId: Id,
  order: number,
  battingOrder: Id[],
  opts: { target?: number | null; scoreOnly?: boolean } = {},
): Innings {
  return {
    id,
    battingTeamId,
    bowlingTeamId,
    order,
    battingOrder,
    events: [],
    closed: false,
    target: opts.target ?? null,
    scoreOnly: opts.scoreOnly ? { runs: 0, wickets: 0, balls: 0 } : null,
  };
}

export function currentInnings(match: Match): Innings | null {
  return match.innings.length ? match.innings[match.innings.length - 1] : null;
}

/** Target the chasing side must reach (first-innings runs + 1). */
export function targetFor(firstInningsRuns: number): number {
  return firstInningsRuns + 1;
}

/** Is the match waiting for a second innings to begin? */
export function needsSecondInnings(match: Match): boolean {
  if (match.innings.length !== 1) return false;
  const sum = replay(match.innings[0], match.rules);
  return sum.inningsOver;
}

/**
 * Compute the result once both innings are done. `name` resolves team ids to
 * display names for the human summary (defaults to the id).
 */
export function matchResult(
  match: Match,
  name: (id: Id) => string = (id) => id,
  opts: { superOver?: boolean } = {},
): MatchResult | null {
  if (match.status === "abandoned")
    return { kind: "abandoned", summary: "Match abandoned", winnerId: null };
  if (match.innings.length < 2) return null;

  const first = match.innings[0];
  const second = match.innings[1];
  const s1 = replay(first, match.rules);
  const s2 = replay(second, match.rules);
  if (!s2.inningsOver) return null;

  const runs1 = s1.runs;
  const runs2 = s2.runs;
  const target = second.target != null ? second.target : targetFor(runs1);
  const chasingTeam = second.battingTeamId;
  const defendingTeam = first.battingTeamId;

  if (runs2 >= target) {
    const byWickets = match.rules.wickets - s2.wickets;
    return {
      kind: "win",
      winnerId: chasingTeam,
      byWickets,
      summary: `${name(chasingTeam)} won by ${byWickets} wicket${byWickets === 1 ? "" : "s"}`,
      superOver: opts.superOver,
    };
  }
  if (runs2 === target - 1) {
    // scores level
    return {
      kind: "tie",
      winnerId: null,
      summary: match.rules.superOver
        ? "Scores level — super over"
        : "Match tied",
      superOver: opts.superOver,
    };
  }
  const byRuns = target - 1 - runs2;
  return {
    kind: "win",
    winnerId: defendingTeam,
    byRuns,
    summary: `${name(defendingTeam)} won by ${byRuns} run${byRuns === 1 ? "" : "s"}`,
    superOver: opts.superOver,
  };
}

/** Rules for a super over (one over, unlimited... capped at 1 over, 10 wkts). */
export function superOverRules(base: Rules): Rules {
  return { ...base, oversPerInnings: 1, wickets: Math.min(2, base.playersPerSide - 1) };
}
