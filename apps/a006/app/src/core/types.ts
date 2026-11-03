/**
 * Gully Score — domain types (pure data, no React, no storage).
 *
 * The source of truth for a match is an APPEND-ONLY BALL EVENT LOG per innings.
 * Every total, card, chart and stat is DERIVED by replaying that log
 * (src/core/scoring.ts), so undo is just "drop the last event" and an edit is
 * "change one event and replay" — totals, partnerships and stats recompute for
 * free. Nothing here mutates; functions take state + inputs and return new state.
 */

export type Id = string;

export type Hand = "right" | "left";
export type BowlerType =
  | "pace"
  | "medium"
  | "offspin"
  | "legspin"
  | "left_arm_spin"
  | "left_arm_pace"
  | "none";
export type PlayerRole = "batter" | "bowler" | "allrounder" | "keeper";

export interface Player {
  id: Id;
  name: string;
  hand: Hand;
  bowlerType: BowlerType;
  role: PlayerRole;
  photoUri?: string | null;
  /** When two duplicate players are merged, the loser points at the survivor. */
  mergedInto?: Id | null;
  /** Hidden from pickers/lists but kept (and all their balls stay intact). Never hard-deleted while in use. */
  archived?: boolean;
}

export interface Team {
  id: Id;
  name: string;
  color?: string | null;
  playerIds: Id[];
}

/** Delivery classification. */
export type ExtraType = "none" | "wide" | "noball" | "bye" | "legbye";
/** Boundary classification for stats (decoupled from the run value so 5s/7s work). */
export type Boundary = "none" | "four" | "six";
export type WicketType =
  | "none"
  | "bowled"
  | "caught"
  | "lbw"
  | "runout"
  | "stumped"
  | "hitwicket"
  | "retired"; // retired out

/**
 * One delivery. Striker / non-striker are NOT stored — they are derived by
 * replaying from the batting order + each wicket's `incoming` batter, so editing
 * an earlier ball recomputes who faced every later ball automatically.
 */
export interface BallEvent {
  extra: ExtraType;
  /** Runs off the bat (none/noball) or runs physically run (bye/legbye/wide). */
  runs: number;
  boundary: Boundary;
  wicket: WicketType;
  /** Which end was dismissed — matters for run-outs (default "striker"). */
  dismissedEnd?: "striker" | "nonstriker";
  /** Batter who comes in after this wicket (null when it ends the innings). */
  incoming?: Id | null;
  /** Fielder credited (caught/run-out/stumped). */
  fielder?: Id | null;
  /** Bowler is a per-over user choice, so it is stored explicitly. */
  bowler: Id;
  wagonAngle?: number | null; // 0..359, optional and skippable
}

export interface Innings {
  id: Id;
  battingTeamId: Id;
  bowlingTeamId: Id;
  order: number; // 1 or 2 (3/4 for super over)
  /** Players in batting order (openers first). */
  battingOrder: Id[];
  events: BallEvent[];
  /** Innings closed early (declared / target chased / overs or wickets done). */
  closed: boolean;
  /** Score-only mode: just the totals, no ball-by-ball detail. */
  scoreOnly?: { runs: number; wickets: number; balls: number } | null;
  /** Target handed to this innings (target-only second innings). */
  target?: number | null;
}

export type MatchStatus =
  | "setup"
  | "live"
  | "innings_break"
  | "complete"
  | "abandoned";

export interface TossInfo {
  wonBy: Id; // team id
  decision: "bat" | "bowl";
}

export type ResultKind = "win" | "tie" | "no_result" | "abandoned";

export interface MatchResult {
  kind: ResultKind;
  /** Winning team (undefined for tie / no-result). */
  winnerId?: Id | null;
  /** Won by N runs OR by N wickets. */
  byRuns?: number | null;
  byWickets?: number | null;
  summary: string; // human text, e.g. "Royals won by 12 runs"
  superOver?: boolean;
}

export interface Match {
  id: Id;
  teamAId: Id;
  teamBId: Id;
  rules: Rules;
  toss?: TossInfo | null;
  status: MatchStatus;
  tournamentId?: Id | null;
  date: string; // YYYY-MM-DD
  innings: Innings[];
  result?: MatchResult | null;
  pomId?: Id | null; // player of the match
}

export interface Rules {
  /** Overs per innings; 0 = unlimited. */
  oversPerInnings: number;
  ballsPerOver: number;
  /** Wickets that end an innings. */
  wickets: number;
  playersPerSide: number;
  /** Penalty runs for a wide / no-ball (can be 0 in box cricket). */
  wideRuns: number;
  noBallRuns: number;
  /** Whether a wide / no-ball is re-bowled (does not count as a legal ball). */
  wideReBall: boolean;
  noBallReBall: boolean;
  /** Run value of a "four" / "six" boundary (5 and 7 for some gully rules). */
  boundaryFour: number;
  boundarySix: number;
  /** One batter at a time (box cricket): no non-striker, no strike rotation. */
  oneBatter: boolean;
  /** Last man stands: the final batter may bat on alone. */
  lastManBats: boolean;
  dummyRunner: boolean;
  scoreOnly: boolean;
  freeHitOnNoBall: boolean;
  superOver: boolean;
}

export interface RulePreset {
  id: string;
  name: string;
  rules: Rules;
  builtIn?: boolean;
}

export interface Tournament {
  id: Id;
  name: string;
  format: "bilateral" | "league" | "knockout" | "groups";
  teamIds: Id[];
  groups: { name: string; teamIds: Id[] }[];
  rounds: string[];
  points: { win: number; tie: number; loss: number; noResult: number };
  /** Teams that left the tournament (kept for the audit trail). */
  leftTeamIds: Id[];
}

export interface Fixture {
  id: Id;
  tournamentId: Id;
  round: string;
  group?: string | null;
  teamAId: Id;
  teamBId: Id;
  datetime: string; // ISO; fixtures sort by this
  matchId?: Id | null;
  walkoverTeamId?: Id | null;
}

export interface PointsOverride {
  id: Id;
  tournamentId: Id;
  teamId: Id;
  field: "points" | "won" | "lost" | "nrr";
  value: number;
  note?: string;
}

export interface AuditEntry {
  id: Id;
  entity: string; // "ball" | "match" | "player" | "points"
  entityId: Id;
  field: string;
  before: string;
  after: string;
  ts: number; // explicit clock input, never Date.now() inside core
}

export type TicketStatus = "open" | "in_review" | "resolved";

/** In-app support ticket with a tracked status (operator-run review queue). */
export interface SupportTicket {
  id: Id;
  subject: string;
  body: string;
  status: TicketStatus;
  createdTs: number;
  updatedTs: number;
}

export interface Settings {
  ownerName?: string;
  backupEmail?: string | null;
  theme: "system" | "light" | "dark" | "sunlight";
  /** Pro is read from the factory store at the UI layer; mirrored here for sim/tests. */
  leftHandedKeypad?: boolean;
}
