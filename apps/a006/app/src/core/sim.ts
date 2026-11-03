/**
 * Journey-bot simulation over the REAL core logic (src/core/app.ts).
 * Goals = one per PRD user flow (F1 score, F2 finish & share, F3 correct,
 * F4 tournament, F5 backup, F6 manage a team roster, F7 Pro). Actions are
 * what the UI offers in that state. A short match preset keeps the flows quick,
 * exactly as a gully scorer's quick-start would.
 */
import {
  addPlayer,
  addPlayerToTeam,
  addTeam,
  createTournament,
  editMatchBall,
  emptyApp,
  generateTournamentFixtures,
  scoreBall,
  setBackupEmail,
  startMatch,
  startSecondInnings,
  teamById,
  undoBall,
  type AppState,
} from "./app";
import { replay } from "./scoring";
import type { Boundary, Id, WicketType } from "./types";

export interface Goal<S> {
  id: string;
  name: string;
  done(state: S): boolean;
}

export interface AppSim<S, A> {
  init(): S;
  actions(state: S): A[];
  apply(state: S, action: A): S;
  goals: Goal<S>[];
  invariants(state: S): string[];
  serialize(state: S): string;
  deserialize(raw: string): S;
}

interface SimState {
  app: AppState;
  pro: boolean;
  active: Id | null; // the match being scored
  clock: number; // monotonic ts source (never Date.now in core)
}

type Action =
  | { t: "setup" }
  | { t: "score"; runs: number; boundary?: Boundary; wicket?: WicketType }
  | { t: "undo" }
  | { t: "edit_last" }
  | { t: "second_innings" }
  | { t: "tournament" }
  | { t: "add_to_roster" }
  | { t: "backup" }
  | { t: "buy_pro" };

/** Quick-start short match so a full game is a few taps. */
const TINY = { oversPerInnings: 1, ballsPerOver: 2, wickets: 1, playersPerSide: 2 };
const DATE = "2026-05-01";

function liveMatch(s: SimState) {
  if (!s.active) return null;
  const m = s.app.matches.find((x) => x.id === s.active);
  if (!m) return null;
  return m;
}

function bowlerFor(s: SimState): Id | undefined {
  const m = liveMatch(s);
  if (!m || !m.innings.length) return undefined;
  const inn = m.innings[m.innings.length - 1];
  const sum = replay(inn, m.rules);
  return sum.bowlerId ?? teamById(s.app, inn.bowlingTeamId)?.playerIds[0];
}

function canSetup(s: SimState): boolean {
  const m = liveMatch(s);
  return !m || m.status === "complete" || m.status === "abandoned";
}

function currentInningsOver(s: SimState): boolean {
  const m = liveMatch(s);
  if (!m || !m.innings.length) return true;
  return replay(m.innings[m.innings.length - 1], m.rules).inningsOver;
}

function lastEventSeq(s: SimState): { idx: number; seq: number } | null {
  const m = liveMatch(s);
  if (!m) return null;
  const idx = m.innings.length - 1;
  const inn = m.innings[idx];
  if (!inn || !inn.events.length) return null;
  return { idx, seq: inn.events.length - 1 };
}

export const sim: AppSim<SimState, Action> = {
  init: () => ({ app: emptyApp(), pro: false, active: null, clock: 1 }),

  actions: (s) => {
    const out: Action[] = [];
    const m = liveMatch(s);
    const scoring = m && (m.status === "live") && !currentInningsOver(s);

    if (canSetup(s)) out.push({ t: "setup" });
    if (scoring) {
      out.push({ t: "score", runs: 0 });
      out.push({ t: "score", runs: 1 });
      out.push({ t: "score", runs: 4, boundary: "four" });
      out.push({ t: "score", runs: 0, wicket: "bowled" });
      out.push({ t: "undo" });
    }
    if (lastEventSeq(s)) out.push({ t: "edit_last" });
    if (m && m.status === "innings_break") out.push({ t: "second_innings" });
    if (s.app.teams.length >= 2) out.push({ t: "tournament" });
    // A player exists who isn't yet in the first team's squad → the roster can be edited.
    if (
      s.app.teams.length >= 1 &&
      s.app.players.some((p) => !p.mergedInto && !s.app.teams[0].playerIds.includes(p.id))
    )
      out.push({ t: "add_to_roster" });
    if (!s.pro) out.push({ t: "buy_pro" });
    out.push({ t: "backup" }); // always available → never a dead end
    return out;
  },

  apply: (s, a) => {
    const ts = s.clock;
    const s2 = { ...s, clock: s.clock + 1 };
    switch (a.t) {
      case "setup": {
        let app = s.app;
        const k = app.matches.length; // keeps names unique across repeated setups
        const mk = (name: string) => {
          const r = addPlayer(app, { name });
          app = r.state;
          return r.id as Id;
        };
        const pA1 = mk(`A${k}-Opener`);
        const pA2 = mk(`A${k}-Partner`);
        const pB1 = mk(`B${k}-Pacer`);
        const pB2 = mk(`B${k}-Spinner`);
        const ta = addTeam(app, { name: `Royals ${k}`, playerIds: [pA1, pA2] });
        app = ta.state;
        const tb = addTeam(app, { name: `Strikers ${k}`, playerIds: [pB1, pB2] });
        app = tb.state;
        const started = startMatch(app, {
          teamAId: ta.id,
          teamBId: tb.id,
          rules: TINY,
          toss: { wonBy: ta.id, decision: "bat" },
          date: DATE,
        });
        app = started.state;
        return { ...s2, app, active: started.id ?? s.active };
      }
      case "score": {
        if (!s.active) return s2;
        const app = scoreBall(s.app, s.active, {
          runs: a.runs,
          boundary: a.boundary,
          wicket: a.wicket,
          bowler: bowlerFor(s),
          incoming: null,
        });
        return { ...s2, app };
      }
      case "undo":
        return s.active ? { ...s2, app: undoBall(s.app, s.active) } : s2;
      case "edit_last": {
        const loc = lastEventSeq(s);
        if (!s.active || !loc) return s2;
        return {
          ...s2,
          app: editMatchBall(
            s.app,
            s.active,
            loc.idx,
            loc.seq,
            { runs: 1, boundary: "none", extra: "none", wicket: "none", incoming: undefined },
            ts,
          ),
        };
      }
      case "second_innings":
        return s.active ? { ...s2, app: startSecondInnings(s.app, s.active) } : s2;
      case "tournament": {
        const [tA, tB] = s.app.teams;
        const r = createTournament(s.app, { name: "Gully Cup", teamIds: [tA.id, tB.id] });
        const app = generateTournamentFixtures(r.state, r.id, DATE);
        return { ...s2, app };
      }
      case "add_to_roster": {
        const team = s.app.teams[0];
        if (!team) return s2;
        const player = s.app.players.find((p) => !p.mergedInto && !team.playerIds.includes(p.id));
        if (!player) return s2;
        return { ...s2, app: addPlayerToTeam(s.app, team.id, player.id) };
      }
      case "backup":
        return { ...s2, app: setBackupEmail(s.app, "owner@example.com") };
      case "buy_pro":
        return { ...s2, pro: true };
    }
  },

  goals: [
    {
      id: "score_first_ball",
      name: "Score the first ball (F1)",
      done: (s) => s.app.matches.some((m) => (m.innings[0]?.events.length ?? 0) > 0),
    },
    {
      id: "finish_match",
      name: "Finish a match to share (F2)",
      done: (s) => s.app.matches.some((m) => m.status === "complete" && !!m.result),
    },
    {
      id: "correct_edit",
      name: "Correct a ball with an audit log (F3)",
      done: (s) => s.app.audit.some((a) => a.entity === "ball"),
    },
    {
      id: "tournament_table",
      name: "Run a tournament with a table (F4)",
      done: (s) =>
        s.app.tournaments.some((t) => t.teamIds.length >= 2) && s.app.fixtures.length > 0,
    },
    {
      id: "backup_enabled",
      name: "Enable cloud backup (F5)",
      done: (s) => !!s.app.settings.backupEmail,
    },
    {
      id: "roster_edited",
      name: "Add a player to a team's squad (F6)",
      // A player who sits in two teams' squads can only happen through an
      // explicit roster edit — match setup gives each team a disjoint squad.
      done: (s) =>
        s.app.players.some(
          (p) => s.app.teams.filter((t) => t.playerIds.includes(p.id)).length >= 2,
        ),
    },
    {
      id: "go_pro",
      name: "Upgrade to Pro (F7)",
      done: (s) => s.pro,
    },
  ],

  invariants: (s) => {
    const out: string[] = [];
    const app = s.app;

    // id integrity
    const ids = new Set<string>();
    const pushId = (id: string) => {
      if (ids.has(id)) out.push(`duplicate id ${id}`);
      ids.add(id);
    };
    app.players.forEach((p) => pushId(p.id));
    app.teams.forEach((t) => pushId(t.id));
    app.matches.forEach((m) => pushId(m.id));
    app.tournaments.forEach((t) => pushId(t.id));

    const numIds = [
      ...app.players.map((p) => p.id),
      ...app.teams.map((t) => t.id),
      ...app.matches.map((m) => m.id),
      ...app.tournaments.map((t) => t.id),
    ];
    for (const id of numIds) {
      const n = Number(String(id).replace(/^[a-z]+/i, ""));
      if (Number.isFinite(n) && n >= app.seq) out.push(`id ${id} >= seq ${app.seq}`);
    }

    // active player names unique
    const names = new Set<string>();
    for (const p of app.players) {
      if (p.mergedInto) continue;
      const key = p.name.toLowerCase();
      if (names.has(key)) out.push(`duplicate player name "${p.name}"`);
      names.add(key);
    }

    // match/innings integrity
    for (const m of app.matches) {
      for (const inn of m.innings) {
        let sum;
        try {
          sum = replay(inn, m.rules);
        } catch (e) {
          out.push(`replay threw for ${m.id}: ${String((e as Error).message).slice(0, 80)}`);
          continue;
        }
        if (sum.runs < 0) out.push(`${m.id} negative runs`);
        if (sum.wickets > m.rules.wickets) out.push(`${m.id} wickets ${sum.wickets} > ${m.rules.wickets}`);
        const quota = m.rules.oversPerInnings * m.rules.ballsPerOver;
        if (quota > 0 && sum.legalBalls > quota) out.push(`${m.id} legalBalls ${sum.legalBalls} > ${quota}`);
        if (sum.strikerId && sum.nonStrikerId && sum.strikerId === sum.nonStrikerId)
          out.push(`${m.id} striker === nonStriker`);
      }
      if (m.status === "complete" && !m.result) out.push(`${m.id} complete without a result`);
    }

    // every team's squad references real, existing players
    for (const t of app.teams) {
      for (const pid of t.playerIds) {
        if (!app.players.some((p) => p.id === pid)) out.push(`team ${t.id} references missing player ${pid}`);
      }
    }

    // audit entries keep before/after
    for (const a of app.audit) {
      if (a.before === undefined || a.after === undefined) out.push(`audit ${a.id} missing values`);
    }
    return out;
  },

  serialize: (s) => JSON.stringify(s),
  deserialize: (raw) => JSON.parse(raw) as SimState,
};
