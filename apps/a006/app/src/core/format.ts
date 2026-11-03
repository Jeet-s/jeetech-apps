/**
 * Presentation + text builders (pure). These turn a match's replayed numbers
 * into the plain text used by share cards and by the AI features (the AI gets
 * text only, built here, so validate.ts can feed fixed samples). No React, no
 * clocks, no mutation.
 */
import { replay, type InningsSummary } from "./scoring";
import { careerStats, recentForm, type CareerStats } from "./stats";
import type { Id, Innings, Match, Player, Team } from "./types";

export type NameOf = (id: Id | null | undefined) => string;

export function nameResolver(players: Player[]): NameOf {
  const byId = new Map(players.map((p) => [p.id, p]));
  return (id) => (id ? byId.get(id)?.name ?? "Unknown" : "—");
}

export function teamResolver(teams: Team[]): NameOf {
  const byId = new Map(teams.map((t) => [t.id, t]));
  return (id) => (id ? byId.get(id)?.name ?? "Team" : "—");
}

/** "Royals 145/6 (18.4)" — a one-line innings score. */
export function inningsLine(name: string, sum: InningsSummary): string {
  return `${name} ${sum.runs}/${sum.wickets} (${sum.oversText})`;
}

export function matchTitle(teamName: NameOf, m: Match): string {
  return `${teamName(m.teamAId)} vs ${teamName(m.teamBId)}`;
}

/**
 * Plain-language toss line — "Street Royals won the toss and chose to bat first". A newcomer can read who bats
 * first and why straight off the Quick Start summary and the scoring header (QA design review #4). Returns null
 * when no toss was recorded (score-only or imported matches).
 */
export function tossLine(m: Match, teamName: NameOf): string | null {
  if (!m.toss) return null;
  return `${teamName(m.toss.wonBy)} won the toss and chose to ${m.toss.decision === "bat" ? "bat" : "bowl"} first`;
}

/** The top batters / bowlers of one innings, best first. */
function topBatters(sum: InningsSummary, playerName: NameOf, n = 3): string[] {
  return [...sum.batters]
    .filter((b) => b.batted)
    .sort((a, b) => b.runs - a.runs)
    .slice(0, n)
    .map((b) => `${playerName(b.id)} ${b.runs}${b.out ? "" : "*"} (${b.balls})`);
}

function topBowlers(sum: InningsSummary, playerName: NameOf, n = 3): string[] {
  return [...sum.bowlers]
    .filter((b) => b.balls > 0)
    .sort((a, b) => b.wickets - a.wickets || a.runs - b.runs)
    .slice(0, n)
    .map((b) => `${playerName(b.id)} ${b.wickets}/${b.runs} (${b.oversText})`);
}

/** Full plain-text scorecard for a share message. */
export function scorecardText(
  m: Match,
  teamName: NameOf,
  playerName: NameOf,
): string {
  const lines: string[] = [matchTitle(teamName, m)];
  m.innings.forEach((inn) => {
    const sum = replay(inn, m.rules);
    lines.push("");
    lines.push(inningsLine(teamName(inn.battingTeamId), sum));
    const bats = topBatters(sum, playerName);
    const bowls = topBowlers(sum, playerName);
    if (bats.length) lines.push(`  ${bats.join(", ")}`);
    if (bowls.length) lines.push(`  Bowling: ${bowls.join(", ")}`);
  });
  if (m.result) {
    lines.push("");
    lines.push(m.result.summary);
  }
  return lines.join("\n");
}

/** Compact input for the AI match summary (teams, scores, top performers, result). */
export function matchSummaryInput(
  m: Match,
  teamName: NameOf,
  playerName: NameOf,
): string {
  return scorecardText(m, teamName, playerName);
}

/** Input for the AI player form insight (recent scores + career line). */
export function formInsightInput(
  matches: Match[],
  players: Player[],
  playerId: Id,
): string {
  const name = players.find((p) => p.id === playerId)?.name ?? "Player";
  const form = recentForm(matches, players, playerId, 10);
  const career = careerStats(matches, players).get(playerId);
  const scores = form.length
    ? form.map((f) => `${f.runs}${f.out ? "" : "*"}(${f.balls})`).join(", ")
    : "no innings yet";
  const c = career ?? null;
  const careerLine = c
    ? `Career: ${c.batting.runs} runs @ ${c.batting.average.toFixed(1)}, SR ${c.batting.strikeRate.toFixed(0)}; ${c.bowling.wickets} wickets @ econ ${c.bowling.economy.toFixed(1)}.`
    : "No career data yet.";
  return `Player: ${name}. Recent scores (newest first): ${scores}. ${careerLine}`;
}

/** A short human label for a ball event (for the over strip / audit log). */
export function ballLabel(e: {
  extra: Innings["events"][number]["extra"];
  runs: number;
  wicket: Innings["events"][number]["wicket"];
}): string {
  if (e.wicket !== "none") return "W";
  if (e.extra === "wide") return e.runs > 0 ? `${e.runs}wd` : "wd";
  if (e.extra === "noball") return e.runs > 0 ? `${e.runs}nb` : "nb";
  if (e.extra === "bye") return `${e.runs}b`;
  if (e.extra === "legbye") return `${e.runs}lb`;
  return String(e.runs);
}

export type { CareerStats };
