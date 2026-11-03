/**
 * Top-level app state and operations. One pure reducer-style module that the
 * persisted store (data.ts) holds and the journey bots (sim.ts) drive. Every
 * function takes state + inputs and returns new state — no mutation, no clocks
 * (timestamps are passed in).
 */
import { makeAudit } from "./audit";
import {
  firstBattingTeam,
  makeInnings,
  matchResult,
  needsSecondInnings,
  targetFor,
} from "./match";
import { DEFAULT_RULES, validateRules } from "./rules";
import { playerOfMatch } from "./stats";
import {
  closeInnings,
  editBall,
  recordBall,
  replay,
  undoLast,
  type BallInput,
} from "./scoring";
import { DEFAULT_POINTS, generateFixtures } from "./tournament";
import type {
  AuditEntry,
  BallEvent,
  Fixture,
  Id,
  Innings,
  Match,
  Player,
  PlayerRole,
  PointsOverride,
  RulePreset,
  Rules,
  Settings,
  SupportTicket,
  TicketStatus,
  TossInfo,
  Tournament,
} from "./types";

export interface AppState {
  seq: number;
  players: Player[];
  teams: Team[];
  matches: Match[];
  tournaments: Tournament[];
  fixtures: Fixture[];
  overrides: PointsOverride[];
  audit: AuditEntry[];
  presets: RulePreset[];
  tickets: SupportTicket[];
  settings: Settings;
}

// re-export Team type locally for convenience
import type { Team } from "./types";

export const MAX_NAME = 40;

export function emptyApp(): AppState {
  return {
    seq: 1,
    players: [],
    teams: [],
    matches: [],
    tournaments: [],
    fixtures: [],
    overrides: [],
    audit: [],
    presets: [],
    tickets: [],
    settings: { theme: "system", backupEmail: null },
  };
}

// ---- ids ------------------------------------------------------------------

function take(s: AppState, prefix: string): [AppState, Id] {
  return [{ ...s, seq: s.seq + 1 }, `${prefix}${s.seq}`];
}

// ---- players --------------------------------------------------------------

export type NameError = "empty" | "too_long" | "duplicate";

function activePlayers(s: AppState): Player[] {
  return s.players.filter((p) => !p.mergedInto && !p.archived);
}

export function validatePlayerName(
  s: AppState,
  raw: string,
  exceptId?: Id,
): NameError | null {
  const name = raw.trim();
  if (!name) return "empty";
  if (name.length > MAX_NAME) return "too_long";
  if (
    activePlayers(s).some(
      (p) => p.id !== exceptId && p.name.toLowerCase() === name.toLowerCase(),
    )
  )
    return "duplicate";
  return null;
}

export function addPlayer(
  s: AppState,
  input: { name: string; hand?: Player["hand"]; bowlerType?: Player["bowlerType"]; role?: PlayerRole },
): { state: AppState; id?: Id; error: NameError | null } {
  const error = validatePlayerName(s, input.name);
  if (error) return { state: s, error };
  const [s1, id] = take(s, "p");
  const player: Player = {
    id,
    name: input.name.trim(),
    hand: input.hand ?? "right",
    bowlerType: input.bowlerType ?? "none",
    role: input.role ?? "allrounder",
    photoUri: null,
    mergedInto: null,
  };
  return { state: { ...s1, players: [...s1.players, player] }, id, error: null };
}

/** Paste a squad: one name per line. Duplicates/blank lines are skipped & reported. */
export function addPlayersBulk(
  s: AppState,
  text: string,
): { state: AppState; added: Id[]; skipped: string[] } {
  const names = text
    .split(/[\n,]/)
    .map((t) => t.trim())
    .filter(Boolean);
  let state = s;
  const added: Id[] = [];
  const skipped: string[] = [];
  for (const name of names) {
    const r = addPlayer(state, { name });
    if (r.error || !r.id) skipped.push(name);
    else {
      state = r.state;
      added.push(r.id);
    }
  }
  return { state, added, skipped };
}

/**
 * Turn a list of typed/pasted names into player ids for a match: reuse an
 * existing active player with the same name (so career stats accumulate), add
 * a new one otherwise. Blank lines and in-list duplicates are dropped.
 */
export function resolveRoster(s: AppState, names: string[]): { state: AppState; ids: Id[] } {
  let state = s;
  const ids: Id[] = [];
  const used = new Set<string>();
  for (const raw of names) {
    const name = raw.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (used.has(key)) continue;
    used.add(key);
    const existing = state.players.find((p) => !p.mergedInto && !p.archived && p.name.toLowerCase() === key);
    if (existing) {
      ids.push(existing.id);
      continue;
    }
    const r = addPlayer(state, { name });
    if (r.id) {
      state = r.state;
      ids.push(r.id);
    }
  }
  return { state, ids };
}

export function editPlayer(s: AppState, id: Id, patch: Partial<Player>): AppState {
  return {
    ...s,
    players: s.players.map((p) => (p.id === id ? { ...p, ...patch, id: p.id } : p)),
  };
}

/**
 * Does this player appear anywhere a hard delete would orphan a reference?
 * A match roster (battingOrder), any ball (bowler / fielder / incoming), a team sheet,
 * or being the survivor another player was merged into — all count as "in use".
 */
export function playerInUse(s: AppState, id: Id): boolean {
  if (s.teams.some((t) => t.playerIds.includes(id))) return true;
  if (s.players.some((p) => p.mergedInto === id)) return true;
  for (const m of s.matches) {
    for (const inn of m.innings) {
      if (inn.battingOrder.includes(id)) return true;
      for (const e of inn.events) {
        if (e.bowler === id || e.fielder === id || e.incoming === id) return true;
      }
    }
  }
  return false;
}

/**
 * Hard-delete a player — ONLY allowed when they appear in no match, team or merge.
 * In use → the state is returned unchanged (the UI offers Archive or Merge instead), so a
 * delete can never orphan a ball reference and break a scorecard. Every real delete is audited.
 */
export function deletePlayer(s: AppState, id: Id, ts: number): AppState {
  const player = s.players.find((p) => p.id === id);
  if (!player || playerInUse(s, id)) return s;
  const [s1, auditId] = take(s, "a");
  const audit = makeAudit(auditId, "player", id, "deleted", player.name, null, ts);
  return { ...s1, players: s1.players.filter((p) => p.id !== id), audit: [...s1.audit, audit] };
}

/** Archive a player: hidden from pickers/lists but fully kept (every ball stays). Audited and reversible. */
export function archivePlayer(s: AppState, id: Id, ts: number, archived = true): AppState {
  const player = s.players.find((p) => p.id === id);
  if (!player || !!player.archived === archived) return s;
  const [s1, auditId] = take(s, "a");
  const audit = makeAudit(auditId, "player", id, "archived", player.archived ?? false, archived, ts);
  return {
    ...s1,
    players: s1.players.map((p) => (p.id === id ? { ...p, archived } : p)),
    audit: [...s1.audit, audit],
  };
}

/** Merge a duplicate into a survivor; stats recompute via resolvePlayer. */
export function mergePlayers(
  s: AppState,
  loserId: Id,
  winnerId: Id,
  ts: number,
): AppState {
  if (loserId === winnerId) return s;
  const loser = s.players.find((p) => p.id === loserId);
  if (!loser) return s;
  const [s1, auditId] = take(s, "a");
  const audit = makeAudit(auditId, "player", loserId, "mergedInto", loser.mergedInto ?? null, winnerId, ts);
  return {
    ...s1,
    players: s1.players.map((p) => (p.id === loserId ? { ...p, mergedInto: winnerId } : p)),
    audit: [...s1.audit, audit],
  };
}

// ---- teams ----------------------------------------------------------------

export function addTeam(
  s: AppState,
  input: { name: string; playerIds?: Id[]; color?: string },
): { state: AppState; id: Id } {
  const [s1, id] = take(s, "t");
  const team: Team = {
    id,
    name: input.name.trim() || `Team ${id}`,
    color: input.color ?? null,
    playerIds: input.playerIds ?? [],
  };
  return { state: { ...s1, teams: [...s1.teams, team] }, id };
}

export function teamById(s: AppState, id: Id): Team | undefined {
  return s.teams.find((t) => t.id === id);
}

/** Rename a team in place (keeps its id, players and every ball already scored). Empty input is a no-op. */
export function renameTeam(s: AppState, teamId: Id, raw: string): AppState {
  const name = raw.trim();
  if (!name) return s;
  return { ...s, teams: s.teams.map((t) => (t.id === teamId ? { ...t, name: name.slice(0, MAX_NAME) } : t)) };
}

/**
 * Rename a player in place (career stats stay attached to the id). Empty is a no-op; a name that clashes with
 * another ACTIVE player is rejected (returns the state unchanged) so a rename can't silently create a duplicate.
 */
export function renamePlayer(s: AppState, playerId: Id, raw: string): AppState {
  const name = raw.trim();
  if (!name) return s;
  if (validatePlayerName(s, name, playerId)) return s;
  return { ...s, players: s.players.map((p) => (p.id === playerId ? { ...p, name: name.slice(0, MAX_NAME) } : p)) };
}

// ---- matches --------------------------------------------------------------

export interface StartMatchInput {
  teamAId: Id;
  teamBId: Id;
  rules?: Partial<Rules>;
  toss?: TossInfo | null;
  date: string;
  tournamentId?: Id | null;
  /** Explicit batting order for the first innings (defaults to the team roster). */
  firstBattingOrder?: Id[];
  scoreOnly?: boolean;
}

export function startMatch(
  s: AppState,
  input: StartMatchInput,
): { state: AppState; id?: Id; error: string | null } {
  const rules: Rules = { ...DEFAULT_RULES, ...input.rules };
  const rErr = validateRules(rules);
  if (rErr) return { state: s, error: `rules:${rErr}` };

  const battingFirst = firstBattingTeam(input.teamAId, input.teamBId, input.toss);
  const bowlingFirst = battingFirst === input.teamAId ? input.teamBId : input.teamAId;
  const order =
    input.firstBattingOrder ?? teamById(s, battingFirst)?.playerIds ?? [];

  const [s1, matchId] = take(s, "m");
  const [s2, inningsId] = take(s1, "i");
  const innings = makeInnings(inningsId, battingFirst, bowlingFirst, 1, order, {
    scoreOnly: input.scoreOnly || rules.scoreOnly,
  });
  const match: Match = {
    id: matchId,
    teamAId: input.teamAId,
    teamBId: input.teamBId,
    rules,
    toss: input.toss ?? null,
    status: "live",
    tournamentId: input.tournamentId ?? null,
    date: input.date,
    innings: [innings],
    result: null,
    pomId: null,
  };
  return { state: { ...s2, matches: [...s2.matches, match] }, id: matchId, error: null };
}

/** Start a chase from just a target (target-only second innings). */
export function startChaseOnly(
  s: AppState,
  input: { teamAId: Id; teamBId: Id; rules?: Partial<Rules>; target: number; date: string; battingOrder?: Id[] },
): { state: AppState; id?: Id; error: string | null } {
  const rules: Rules = { ...DEFAULT_RULES, ...input.rules };
  const rErr = validateRules(rules);
  if (rErr) return { state: s, error: `rules:${rErr}` };
  const [s1, matchId] = take(s, "m");
  const [s2, inningsId] = take(s1, "i");
  const order = input.battingOrder ?? teamById(s, input.teamBId)?.playerIds ?? [];
  const innings = makeInnings(inningsId, input.teamBId, input.teamAId, 2, order, {
    target: input.target,
  });
  const match: Match = {
    id: matchId,
    teamAId: input.teamAId,
    teamBId: input.teamBId,
    rules,
    toss: null,
    status: "live",
    tournamentId: null,
    date: input.date,
    innings: [innings],
    result: null,
    pomId: null,
  };
  return { state: { ...s2, matches: [...s2.matches, match] }, id: matchId, error: null };
}

function mapMatch(s: AppState, matchId: Id, fn: (m: Match) => Match): AppState {
  return { ...s, matches: s.matches.map((m) => (m.id === matchId ? fn(m) : m)) };
}

function teamName(s: AppState, id: Id): string {
  return teamById(s, id)?.name ?? id;
}

/** Finish a match: compute the result and player of the match. */
function finalize(s: AppState, match: Match): Match {
  const result = matchResult(match, (id) => teamName(s, id));
  if (!result) return match;
  const winTeam = result.winnerId ? teamById(s, result.winnerId) : undefined;
  const pom = playerOfMatch(match, s.players, winTeam?.playerIds ?? [])[0];
  return { ...match, status: "complete", result, pomId: pom?.playerId ?? null };
}

/** Score one ball on the match's current innings. */
export function scoreBall(s: AppState, matchId: Id, input: BallInput): AppState {
  const match = s.matches.find((m) => m.id === matchId);
  if (!match || match.status === "complete" || match.status === "abandoned") return s;
  const idx = match.innings.length - 1;
  const inn = match.innings[idx];
  if (!inn) return s;

  let nextInn: Innings;
  try {
    nextInn = recordBall(inn, match.rules, input);
  } catch {
    return s; // invalid ball (e.g. innings over, illegal free-hit wicket) — ignored
  }
  const sum = replay(nextInn, match.rules);

  return mapMatch(s, matchId, (m) => {
    const innings = m.innings.map((x, i) => (i === idx ? nextInn : x));
    let updated: Match = { ...m, innings };
    if (sum.inningsOver) {
      if (inn.order === 1 && innings.length === 1) {
        updated = { ...updated, status: "innings_break" };
      } else {
        updated = finalize(s, { ...updated });
      }
    }
    return updated;
  });
}

export function undoBall(s: AppState, matchId: Id): AppState {
  return mapMatch(s, matchId, (m) => {
    const idx = m.innings.length - 1;
    const inn = m.innings[idx];
    if (!inn) return m;
    const innings = m.innings.map((x, i) => (i === idx ? undoLast(x) : x));
    // re-open a match that had just completed via that ball
    const status: Match["status"] = m.status === "complete" ? "live" : m.status;
    return { ...m, innings, status, result: status === "live" ? null : m.result };
  });
}

export function editMatchBall(
  s: AppState,
  matchId: Id,
  inningsIdx: number,
  seq: number,
  patch: Partial<BallEvent>,
  ts: number,
): AppState {
  const match = s.matches.find((m) => m.id === matchId);
  if (!match) return s;
  const inn = match.innings[inningsIdx];
  if (!inn || seq < 0 || seq >= inn.events.length) return s;
  const before = inn.events[seq];
  const after = { ...before, ...patch };
  const [s1, auditId] = take(s, "a");
  const audit = makeAudit(auditId, "ball", `${matchId}:${inningsIdx}:${seq}`, "event", before, after, ts);
  const withEdit = mapMatch(s1, matchId, (m) => ({
    ...m,
    innings: m.innings.map((x, i) => (i === inningsIdx ? editBall(x, seq, patch) : x)),
  }));
  return { ...withEdit, audit: [...withEdit.audit, audit] };
}

export function startSecondInnings(
  s: AppState,
  matchId: Id,
  input: { battingOrder?: Id[] } = {},
): AppState {
  const match = s.matches.find((m) => m.id === matchId);
  if (!match || !needsSecondInnings(match)) return s;
  const first = match.innings[0];
  const runs1 = replay(first, match.rules).runs;
  const battingTeam = first.bowlingTeamId;
  const bowlingTeam = first.battingTeamId;
  const order = input.battingOrder ?? teamById(s, battingTeam)?.playerIds ?? [];
  const [s1, inningsId] = take(s, "i");
  const innings = makeInnings(inningsId, battingTeam, bowlingTeam, 2, order, {
    target: targetFor(runs1),
    scoreOnly: match.rules.scoreOnly || !!first.scoreOnly,
  });
  return mapMatch(s1, matchId, (m) => ({ ...m, status: "live", innings: [...m.innings, innings] }));
}

/** Score-only mode: set the current innings' running totals directly. */
export function setScoreOnlyTotals(
  s: AppState,
  matchId: Id,
  totals: { runs: number; wickets: number; balls: number },
): AppState {
  return mapMatch(s, matchId, (m) => {
    const idx = m.innings.length - 1;
    const inn = m.innings[idx];
    if (!inn || !inn.scoreOnly) return m;
    const clamped = {
      runs: Math.max(0, Math.floor(totals.runs)),
      wickets: Math.max(0, Math.min(m.rules.wickets, Math.floor(totals.wickets))),
      balls: Math.max(0, Math.floor(totals.balls)),
    };
    return { ...m, innings: m.innings.map((x, i) => (i === idx ? { ...x, scoreOnly: clamped } : x)) };
  });
}

export function abandonMatch(s: AppState, matchId: Id): AppState {
  return mapMatch(s, matchId, (m) => ({
    ...m,
    status: "abandoned",
    result: { kind: "abandoned", summary: "Match abandoned", winnerId: null },
  }));
}

/** Declare / confirm an innings closed (e.g. target chased, declaration). */
export function declareInnings(s: AppState, matchId: Id): AppState {
  const match = s.matches.find((m) => m.id === matchId);
  if (!match) return s;
  const idx = match.innings.length - 1;
  return mapMatch(s, matchId, (m) => {
    const innings = m.innings.map((x, i) => (i === idx ? closeInnings(x) : x));
    let updated: Match = { ...m, innings };
    const inn = innings[idx];
    if (inn.order === 1 && innings.length === 1) updated.status = "innings_break";
    else updated = finalize(s, updated);
    return updated;
  });
}

// ---- tournaments ----------------------------------------------------------

export function createTournament(
  s: AppState,
  input: {
    name: string;
    format?: Tournament["format"];
    teamIds?: Id[];
    groups?: { name: string; teamIds: Id[] }[];
    rounds?: string[];
  },
): { state: AppState; id: Id } {
  const [s1, id] = take(s, "tr");
  const t: Tournament = {
    id,
    name: input.name.trim() || `Tournament ${id}`,
    format: input.format ?? "league",
    teamIds: input.teamIds ?? [],
    groups: input.groups ?? [],
    rounds: input.rounds ?? ["League"],
    points: { ...DEFAULT_POINTS },
    leftTeamIds: [],
  };
  return { state: { ...s1, tournaments: [...s1.tournaments, t] }, id };
}

export function addTeamToTournament(s: AppState, tid: Id, teamId: Id): AppState {
  return {
    ...s,
    tournaments: s.tournaments.map((t) =>
      t.id === tid && !t.teamIds.includes(teamId)
        ? { ...t, teamIds: [...t.teamIds, teamId], leftTeamIds: t.leftTeamIds.filter((x) => x !== teamId) }
        : t,
    ),
  };
}

export function leaveTournament(s: AppState, tid: Id, teamId: Id): AppState {
  return {
    ...s,
    tournaments: s.tournaments.map((t) =>
      t.id === tid
        ? {
            ...t,
            teamIds: t.teamIds.filter((x) => x !== teamId),
            leftTeamIds: [...new Set([...t.leftTeamIds, teamId])],
          }
        : t,
    ),
  };
}

export function generateTournamentFixtures(s: AppState, tid: Id, baseDate: string): AppState {
  const t = s.tournaments.find((x) => x.id === tid);
  if (!t) return s;
  let seq = s.seq;
  const nextId = (prefix: string) => `${prefix}${seq++}`;
  const fixtures = generateFixtures(t, nextId, baseDate);
  return {
    ...s,
    seq,
    fixtures: [...s.fixtures.filter((f) => f.tournamentId !== tid), ...fixtures],
  };
}

export function addPointsOverride(
  s: AppState,
  input: { tournamentId: Id; teamId: Id; field: PointsOverride["field"]; value: number; note?: string },
  ts: number,
): AppState {
  const [s1, id] = take(s, "po");
  const [s2, auditId] = take(s1, "a");
  const override: PointsOverride = { id, ...input };
  const audit = makeAudit(auditId, "points", input.tournamentId, input.field, null, input.value, ts);
  return { ...s2, overrides: [...s2.overrides, override], audit: [...s2.audit, audit] };
}

// ---- team rosters ---------------------------------------------------------
// Everything here is on-device. A team is the scorer's OWN squad list — adding
// or removing a player just edits that local roster. There is no account, no
// invite to another person and no shared/online team.

/** Add a player to a team's squad (no-op if they're already in it or ids are unknown). */
export function addPlayerToTeam(s: AppState, teamId: Id, playerId: Id): AppState {
  if (!s.players.some((p) => p.id === playerId)) return s;
  return {
    ...s,
    teams: s.teams.map((t) =>
      t.id === teamId && !t.playerIds.includes(playerId)
        ? { ...t, playerIds: [...t.playerIds, playerId] }
        : t,
    ),
  };
}

/** Remove a player from a team's squad (their matches and career stats are untouched). */
export function removePlayerFromTeam(s: AppState, teamId: Id, playerId: Id): AppState {
  return {
    ...s,
    teams: s.teams.map((t) =>
      t.id === teamId ? { ...t, playerIds: t.playerIds.filter((x) => x !== playerId) } : t,
    ),
  };
}

// ---- settings / presets ---------------------------------------------------

export function setBackupEmail(s: AppState, email: string | null): AppState {
  return { ...s, settings: { ...s.settings, backupEmail: email } };
}

export function updateSettings(s: AppState, patch: Partial<Settings>): AppState {
  return { ...s, settings: { ...s.settings, ...patch } };
}

export function savePreset(
  s: AppState,
  name: string,
  rules: Rules,
): { state: AppState; id: Id } {
  const [s1, id] = take(s, "rp");
  const preset: RulePreset = { id, name: name.trim() || `Preset ${id}`, rules, builtIn: false };
  return { state: { ...s1, presets: [...s1.presets, preset] }, id };
}

// ---- support tickets ------------------------------------------------------

export function createTicket(
  s: AppState,
  input: { subject: string; body: string },
  ts: number,
): { state: AppState; id?: Id; error: "empty" | null } {
  const subject = input.subject.trim();
  if (!subject) return { state: s, error: "empty" };
  const [s1, id] = take(s, "tk");
  const ticket: SupportTicket = {
    id,
    subject,
    body: input.body.trim(),
    status: "open",
    createdTs: ts,
    updatedTs: ts,
  };
  return { state: { ...s1, tickets: [ticket, ...s1.tickets] }, id, error: null };
}

export function setTicketStatus(s: AppState, id: Id, status: TicketStatus, ts: number): AppState {
  return {
    ...s,
    tickets: s.tickets.map((t) => (t.id === id ? { ...t, status, updatedTs: ts } : t)),
  };
}
