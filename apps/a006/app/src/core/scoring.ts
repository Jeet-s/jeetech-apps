/**
 * The scoring engine. A match's truth is the append-only BallEvent log; every
 * number here is derived by REPLAYING that log, so:
 *   - undo  = drop the last event,
 *   - edit  = change one event and replay (totals/partnerships/stats recompute),
 *   - resume after a crash = just replay the saved events.
 * Pure functions only — no clocks, no mutation.
 */
import {
  ballsInInnings,
  maxWickets,
  oversFloat,
  oversText,
} from "./rules";
import type {
  BallEvent,
  Boundary,
  ExtraType,
  Id,
  Innings,
  Rules,
  WicketType,
} from "./types";

export interface BatterCard {
  id: Id;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  out: boolean;
  wicket: WicketType;
  bowlerId?: Id | null;
  fielderId?: Id | null;
  batted: boolean;
  sr: number; // strike rate (runs / balls * 100)
}

export interface BowlerCard {
  id: Id;
  balls: number; // legal balls
  runs: number; // conceded
  wickets: number;
  maidens: number;
  wides: number;
  noballs: number;
  oversText: string;
  econ: number; // runs per over
}

export interface FallOfWicket {
  wicket: number;
  score: number;
  batterId: Id;
  overText: string;
}

export interface Partnership {
  wicket: number; // the wicket that closed it (0 = ongoing)
  runs: number;
  balls: number;
  batters: [Id, Id | null];
}

export interface InningsSummary {
  runs: number;
  wickets: number;
  legalBalls: number;
  oversText: string;
  oversFloat: number;
  extras: {
    wides: number;
    noballs: number;
    byes: number;
    legbyes: number;
    total: number;
  };
  runRate: number;
  batters: BatterCard[];
  bowlers: BowlerCard[];
  fallOfWickets: FallOfWicket[];
  partnerships: Partnership[];
  /** The striker who faced each event (same length/order as innings.events). */
  facedBy: (Id | null)[];
  // Live pointers for the scoring screen:
  strikerId: Id | null;
  nonStrikerId: Id | null;
  bowlerId: Id | null;
  legalBallsThisOver: number;
  oversCompleted: number;
  overComplete: boolean; // next ball needs a new bowler
  needNewBatter: boolean; // last ball was a wicket; incoming not yet set
  freeHitNext: boolean;
  inningsOver: boolean;
  target?: number | null;
}

// ---- per-delivery accounting ---------------------------------------------

export function isLegalDelivery(e: BallEvent, r: Rules): boolean {
  switch (e.extra) {
    case "wide":
      return !r.wideReBall;
    case "noball":
      return !r.noBallReBall;
    default:
      return true; // none / bye / legbye
  }
}

function teamRuns(e: BallEvent, r: Rules): number {
  switch (e.extra) {
    case "wide":
      return r.wideRuns + e.runs;
    case "noball":
      return r.noBallRuns + e.runs;
    default:
      return e.runs; // none / bye / legbye
  }
}

function bowlerRuns(e: BallEvent, r: Rules): number {
  switch (e.extra) {
    case "wide":
      return r.wideRuns + e.runs;
    case "noball":
      return r.noBallRuns + e.runs;
    case "bye":
    case "legbye":
      return 0;
    default:
      return e.runs;
  }
}

function batterRuns(e: BallEvent): number {
  return e.extra === "none" || e.extra === "noball" ? e.runs : 0;
}

function batterFacedBall(e: BallEvent): boolean {
  return e.extra === "none" || e.extra === "bye" || e.extra === "legbye";
}

/** Strike swaps when an odd number of runs is physically RUN (never on a
 * boundary — it's hit to the fence, so no running even for 5s/7s). */
function swapOnRuns(e: BallEvent, r: Rules): boolean {
  if (r.oneBatter) return false;
  if (e.boundary !== "none") return false;
  return e.runs % 2 === 1;
}

// ---- replay ---------------------------------------------------------------

interface MutBatter {
  id: Id;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  out: boolean;
  wicket: WicketType;
  bowlerId?: Id | null;
  fielderId?: Id | null;
  batted: boolean;
}
interface MutBowler {
  id: Id;
  balls: number;
  runs: number;
  wickets: number;
  maidens: number;
  wides: number;
  noballs: number;
}

function newBatter(id: Id): MutBatter {
  return { id, runs: 0, balls: 0, fours: 0, sixes: 0, out: false, wicket: "none", batted: false };
}
function newBowler(id: Id): MutBowler {
  return { id, balls: 0, runs: 0, wickets: 0, maidens: 0, wides: 0, noballs: 0 };
}

export function replay(innings: Innings, rules: Rules): InningsSummary {
  const ballsPerOver = rules.ballsPerOver;

  // Score-only innings: totals are stored directly.
  if (innings.scoreOnly) {
    const { runs, wickets, balls } = innings.scoreOnly;
    return {
      runs,
      wickets,
      legalBalls: balls,
      oversText: oversText(balls, ballsPerOver),
      oversFloat: oversFloat(balls, ballsPerOver),
      extras: { wides: 0, noballs: 0, byes: 0, legbyes: 0, total: 0 },
      runRate: oversFloat(balls, ballsPerOver) > 0 ? runs / oversFloat(balls, ballsPerOver) : 0,
      batters: [],
      bowlers: [],
      fallOfWickets: [],
      partnerships: [],
      facedBy: [],
      strikerId: null,
      nonStrikerId: null,
      bowlerId: null,
      legalBallsThisOver: 0,
      oversCompleted: Math.floor(balls / ballsPerOver),
      overComplete: false,
      needNewBatter: false,
      freeHitNext: false,
      inningsOver: innings.closed,
      target: innings.target ?? null,
    };
  }

  const batters = new Map<Id, MutBatter>();
  const bowlers = new Map<Id, MutBowler>();
  const bat = (id: Id) => {
    let b = batters.get(id);
    if (!b) batters.set(id, (b = newBatter(id)));
    return b;
  };
  const bowl = (id: Id) => {
    let b = bowlers.get(id);
    if (!b) bowlers.set(id, (b = newBowler(id)));
    return b;
  };

  let runs = 0;
  let wickets = 0;
  let legalBalls = 0;
  const extras = { wides: 0, noballs: 0, byes: 0, legbyes: 0, total: 0 };
  const fallOfWickets: FallOfWicket[] = [];
  const partnerships: Partnership[] = [];
  const facedBy: (Id | null)[] = [];

  const order = innings.battingOrder;
  let s: Id | null = order[0] ?? null;
  let n: Id | null = rules.oneBatter ? null : order[1] ?? null;
  let lastBowler: Id | null = null;
  let lastWasNoBall = false;

  // partnership + per-over tracking
  let pRuns = 0;
  let pBalls = 0;
  let overBowler: Id | null = null;
  let overLegal = 0;
  let overRuns = 0;

  const closeOver = () => {
    if (overBowler && overLegal === ballsPerOver && overRuns === 0) {
      bowl(overBowler).maidens += 1;
    }
    overBowler = null;
    overLegal = 0;
    overRuns = 0;
  };

  for (const e of innings.events) {
    facedBy.push(s);
    const legal = isLegalDelivery(e, rules);
    const tRuns = teamRuns(e, rules);
    const bRuns = bowlerRuns(e, rules);

    // bowler bookkeeping
    const bw = bowl(e.bowler);
    if (overBowler !== e.bowler) {
      // new over for maiden tracking (bowler can't bowl consecutive overs anyway)
      closeOver();
      overBowler = e.bowler;
    }
    bw.runs += bRuns;
    overRuns += bRuns;
    if (e.extra === "wide") bw.wides += 1;
    if (e.extra === "noball") bw.noballs += 1;
    if (legal) {
      bw.balls += 1;
      overLegal += 1;
    }

    // striker accounting
    if (s != null) {
      const sb = bat(s);
      sb.batted = true;
      sb.runs += batterRuns(e);
      if (batterFacedBall(e)) sb.balls += 1;
      if (e.boundary === "four") sb.fours += 1;
      else if (e.boundary === "six") sb.sixes += 1;
    }
    if (n != null) bat(n).batted = true;

    // team + extras
    runs += tRuns;
    if (e.extra === "wide") extras.wides += rules.wideRuns + e.runs;
    else if (e.extra === "noball") extras.noballs += rules.noBallRuns;
    else if (e.extra === "bye") extras.byes += e.runs;
    else if (e.extra === "legbye") extras.legbyes += e.runs;

    pRuns += tRuns;
    if (legal) {
      legalBalls += 1;
      pBalls += 1;
    }

    const completedOver = legal && legalBalls % ballsPerOver === 0;

    // A lone batter (box one-batter OR last-man-stands with no partner) never
    // rotates ends.
    const lone = rules.oneBatter || s == null || n == null;

    // wicket bookkeeping
    let outId: Id | null = null;
    if (e.wicket !== "none") {
      wickets += 1;
      const dismissedEnd = e.dismissedEnd ?? "striker";
      outId = dismissedEnd === "nonstriker" ? n : s;
      if (outId != null) {
        const ob = bat(outId);
        ob.out = true;
        ob.wicket = e.wicket;
        ob.bowlerId = e.wicket === "runout" || e.wicket === "retired" ? null : e.bowler;
        ob.fielderId = e.fielder ?? null;
        if (e.wicket !== "runout" && e.wicket !== "retired") bw.wickets += 1;
        fallOfWickets.push({
          wicket: wickets,
          score: runs,
          batterId: outId,
          overText: oversText(legalBalls, ballsPerOver),
        });
      }
      partnerships.push({ wicket: wickets, runs: pRuns, balls: pBalls, batters: [s ?? "", n] });
      pRuns = 0;
      pBalls = 0;
    }

    // rotation: run swap → fill the dismissed slot with the incoming batter →
    // over-end swap (only when both ends are occupied).
    let ns: Id | null = s;
    let nn: Id | null = n;
    if (!lone && swapOnRuns(e, rules)) [ns, nn] = [nn, ns];
    if (outId != null) {
      const incoming = e.incoming ?? null;
      if (ns === outId) ns = incoming;
      else if (nn === outId) nn = incoming;
    }
    if (completedOver && !rules.oneBatter && ns != null && nn != null) [ns, nn] = [nn, ns];
    // normalise a lone batter to the striker's end
    if (ns == null && nn != null) {
      ns = nn;
      nn = null;
    }
    s = ns;
    n = nn;
    lastBowler = e.bowler;
    lastWasNoBall = e.extra === "noball";
    if (completedOver) closeOver();
  }

  extras.total = extras.wides + extras.noballs + extras.byes + extras.legbyes;

  // ongoing partnership
  if (pBalls > 0 || pRuns > 0 || (s != null && innings.events.length > 0 && wickets < rules.wickets)) {
    if (!innings.closed) partnerships.push({ wicket: 0, runs: pRuns, balls: pBalls, batters: [s ?? "", n] });
  }

  const totalBalls = ballsInInnings(rules);
  const wicketsOut = wickets >= rules.wickets;
  const oversDone = totalBalls > 0 && legalBalls >= totalBalls;
  const chased = innings.target != null && runs >= innings.target;
  const inningsOver = innings.closed || wicketsOut || oversDone || chased;

  const ovF = oversFloat(legalBalls, ballsPerOver);
  const legalThisOver = legalBalls % ballsPerOver;
  const overComplete = legalBalls > 0 && legalThisOver === 0;

  const atCrease = new Set<Id>([s, n].filter((x): x is Id => x != null));
  const remaining = order.filter((id) => !atCrease.has(id) && !batters.get(id)?.out).length;
  const hole = s == null || (!rules.oneBatter && n == null);
  const needNewBatter = !inningsOver && hole && remaining > 0;

  const batCards: BatterCard[] = [...batters.values()].map((b) => ({
    id: b.id,
    runs: b.runs,
    balls: b.balls,
    fours: b.fours,
    sixes: b.sixes,
    out: b.out,
    wicket: b.wicket,
    bowlerId: b.bowlerId,
    fielderId: b.fielderId,
    batted: b.batted,
    sr: b.balls > 0 ? (b.runs / b.balls) * 100 : 0,
  }));
  const bowlCards: BowlerCard[] = [...bowlers.values()].map((b) => ({
    id: b.id,
    balls: b.balls,
    runs: b.runs,
    wickets: b.wickets,
    maidens: b.maidens,
    wides: b.wides,
    noballs: b.noballs,
    oversText: oversText(b.balls, ballsPerOver),
    econ: b.balls > 0 ? b.runs / (b.balls / ballsPerOver) : 0,
  }));

  return {
    runs,
    wickets,
    legalBalls,
    oversText: oversText(legalBalls, ballsPerOver),
    oversFloat: ovF,
    extras,
    runRate: ovF > 0 ? runs / ovF : 0,
    batters: batCards,
    bowlers: bowlCards,
    fallOfWickets,
    partnerships,
    facedBy,
    strikerId: s,
    nonStrikerId: n,
    bowlerId: lastBowler,
    legalBallsThisOver: legalThisOver,
    oversCompleted: Math.floor(legalBalls / ballsPerOver),
    overComplete,
    needNewBatter,
    freeHitNext: !inningsOver && lastWasNoBall && rules.freeHitOnNoBall,
    inningsOver,
    target: innings.target ?? null,
  };
}

export interface OverBucket {
  over: number; // 1-based over number
  runs: number; // team runs in the over (incl. extras)
  wickets: number;
  cumulative: number; // team runs up to and including this over
}

/**
 * Over-by-over breakdown for the manhattan / worm charts. Groups deliveries by
 * completed over (a wide/no-ball sits in the over it was bowled). Pure.
 */
export function overByOver(innings: Innings, rules: Rules): OverBucket[] {
  if (innings.scoreOnly) return [];
  const bpo = rules.ballsPerOver;
  const buckets: OverBucket[] = [];
  let legal = 0;
  let cumulative = 0;
  let cur: OverBucket | null = null;
  const ensure = (overIdx: number) => {
    if (!cur || cur.over !== overIdx + 1) {
      cur = { over: overIdx + 1, runs: 0, wickets: 0, cumulative };
      buckets.push(cur);
    }
    return cur;
  };
  for (const e of innings.events) {
    const overIdx = Math.floor(legal / bpo);
    const b = ensure(overIdx);
    const tr = teamRuns(e, rules);
    b.runs += tr;
    cumulative += tr;
    b.cumulative = cumulative;
    if (e.wicket !== "none") b.wickets += 1;
    if (isLegalDelivery(e, rules)) legal += 1;
  }
  return buckets;
}

// ---- recording ------------------------------------------------------------

export interface BallInput {
  extra?: ExtraType;
  runs?: number;
  boundary?: Boundary;
  wicket?: WicketType;
  dismissedEnd?: "striker" | "nonstriker";
  incoming?: Id | null;
  fielder?: Id | null;
  bowler?: Id;
  wagonAngle?: number | null;
}

export class ScoringError extends Error {}

const OFF_DELIVERY_WICKETS: WicketType[] = [
  "bowled",
  "caught",
  "lbw",
  "stumped",
  "hitwicket",
];

/** Append one ball to the innings (returns a new innings; never mutates). */
export function recordBall(innings: Innings, rules: Rules, input: BallInput): Innings {
  if (innings.scoreOnly) throw new ScoringError("Score-only innings has no ball log");
  const sum = replay(innings, rules);
  if (sum.inningsOver) throw new ScoringError("Innings is over");

  const bowler = input.bowler ?? sum.bowlerId;
  if (!bowler) throw new ScoringError("A bowler is required");

  const extra: ExtraType = input.extra ?? "none";
  const wicket: WicketType = input.wicket ?? "none";
  const runs = Math.max(0, Math.floor(input.runs ?? 0));

  if (sum.freeHitNext && OFF_DELIVERY_WICKETS.includes(wicket))
    throw new ScoringError("Only a run-out is allowed on a free hit");

  const event: BallEvent = {
    extra,
    runs,
    boundary: input.boundary ?? "none",
    wicket,
    dismissedEnd: wicket !== "none" ? input.dismissedEnd ?? "striker" : undefined,
    incoming: wicket !== "none" ? input.incoming ?? null : undefined,
    fielder: input.fielder ?? null,
    bowler,
    wagonAngle: input.wagonAngle ?? null,
  };

  return { ...innings, events: [...innings.events, event] };
}

/** Unlimited instant undo — drop the last ball. */
export function undoLast(innings: Innings): Innings {
  if (!innings.events.length) return innings;
  return { ...innings, events: innings.events.slice(0, -1) };
}

/** Edit any past ball; replay recomputes everything downstream. */
export function editBall(
  innings: Innings,
  seq: number,
  patch: Partial<BallEvent>,
): Innings {
  if (seq < 0 || seq >= innings.events.length) return innings;
  const events = innings.events.map((e, i) => (i === seq ? { ...e, ...patch } : e));
  return { ...innings, events };
}

/** Close an innings early (declaration / all out confirmed / overs done). */
export function closeInnings(innings: Innings): Innings {
  return { ...innings, closed: true };
}

/** Convenience for a score-only innings. */
export function setScoreOnly(
  innings: Innings,
  totals: { runs: number; wickets: number; balls: number },
): Innings {
  return { ...innings, scoreOnly: totals };
}

/** Count of batters who still can come in (for last-man / lone-batter logic). */
export function remainingBatters(innings: Innings, sum: InningsSummary): number {
  const atCrease = new Set<Id>([sum.strikerId, sum.nonStrikerId].filter(Boolean) as Id[]);
  const out = new Set(sum.batters.filter((b) => b.out).map((b) => b.id));
  return innings.battingOrder.filter((id) => !atCrease.has(id) && !out.has(id)).length;
}

export { maxWickets };
