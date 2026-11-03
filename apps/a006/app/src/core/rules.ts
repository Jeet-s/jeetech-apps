/** Match rules: defaults, presets (Gully/Box/T10/T20/ODI) and validation. */
import type { RulePreset, Rules } from "./types";

export const DEFAULT_RULES: Rules = {
  oversPerInnings: 20,
  ballsPerOver: 6,
  wickets: 10,
  playersPerSide: 11,
  wideRuns: 1,
  noBallRuns: 1,
  wideReBall: true,
  noBallReBall: true,
  boundaryFour: 4,
  boundarySix: 6,
  oneBatter: false,
  lastManBats: false,
  dummyRunner: false,
  scoreOnly: false,
  freeHitOnNoBall: true,
  superOver: true,
};

export function makeRules(patch: Partial<Rules> = {}): Rules {
  return { ...DEFAULT_RULES, ...patch };
}

export const PRESETS: RulePreset[] = [
  {
    id: "gully",
    name: "Gully",
    builtIn: true,
    rules: makeRules({
      oversPerInnings: 6,
      ballsPerOver: 6,
      playersPerSide: 8,
      wickets: 8,
      lastManBats: true,
      // Free hit after a no-ball is on by default (modern tape-ball / gully tournaments play it) so the Quick-start
      // match demonstrates the rule out of the box — a no-ball arms a free hit on which only a run-out can count.
      freeHitOnNoBall: true,
    }),
  },
  {
    id: "box",
    name: "Box / Indoor",
    builtIn: true,
    rules: makeRules({
      oversPerInnings: 5,
      ballsPerOver: 6,
      playersPerSide: 6,
      wickets: 6,
      wideRuns: 1,
      noBallRuns: 1,
      wideReBall: false, // box cricket usually does not re-bowl
      noBallReBall: false,
      oneBatter: true,
      boundaryFour: 4,
      boundarySix: 6,
      freeHitOnNoBall: false,
    }),
  },
  {
    id: "t10",
    name: "T10",
    builtIn: true,
    rules: makeRules({ oversPerInnings: 10, playersPerSide: 11, wickets: 10 }),
  },
  {
    id: "t20",
    name: "Club T20",
    builtIn: true,
    rules: makeRules({ oversPerInnings: 20, playersPerSide: 11, wickets: 10 }),
  },
  {
    id: "odi",
    name: "ODI 50",
    builtIn: true,
    rules: makeRules({ oversPerInnings: 50, playersPerSide: 11, wickets: 10 }),
  },
];

export function presetById(id: string): RulePreset | undefined {
  return PRESETS.find((p) => p.id === id);
}

export type RulesError =
  | "overs"
  | "balls_per_over"
  | "players"
  | "wickets"
  | "wide_runs"
  | "no_ball_runs"
  | "boundary";

/** Largest number of wickets an innings can lose given the squad size. */
export function maxWickets(
  r: Pick<Rules, "playersPerSide" | "lastManBats" | "oneBatter">,
): number {
  // Last-man-stands and one-batter formats let every batter be dismissed;
  // otherwise the final batter is left stranded for want of a partner.
  return r.lastManBats || r.oneBatter ? r.playersPerSide : r.playersPerSide - 1;
}

export function validateRules(r: Rules): RulesError | null {
  if (r.oversPerInnings < 0 || r.oversPerInnings > 200 || !Number.isInteger(r.oversPerInnings))
    return "overs";
  if (r.ballsPerOver < 1 || r.ballsPerOver > 12 || !Number.isInteger(r.ballsPerOver))
    return "balls_per_over";
  if (r.playersPerSide < 1 || r.playersPerSide > 16 || !Number.isInteger(r.playersPerSide))
    return "players";
  if (r.wickets < 1 || r.wickets > maxWickets(r) || !Number.isInteger(r.wickets))
    return "wickets";
  if (r.wideRuns < 0 || r.wideRuns > 10) return "wide_runs";
  if (r.noBallRuns < 0 || r.noBallRuns > 10) return "no_ball_runs";
  if (r.boundaryFour < 1 || r.boundarySix < 1 || r.boundarySix < r.boundaryFour)
    return "boundary";
  return null;
}

/** Number of legal balls in a full innings (0 for unlimited overs). */
export function ballsInInnings(r: Rules): number {
  return r.oversPerInnings > 0 ? r.oversPerInnings * r.ballsPerOver : 0;
}

/** "12.3" overs display from a legal-ball count. */
export function oversText(legalBalls: number, ballsPerOver: number): string {
  const o = Math.floor(legalBalls / ballsPerOver);
  const b = legalBalls % ballsPerOver;
  return b === 0 ? `${o}` : `${o}.${b}`;
}

/** Overs as a float for run-rate / NRR maths (12.3 of 6 → 12.5). */
export function oversFloat(legalBalls: number, ballsPerOver: number): number {
  const o = Math.floor(legalBalls / ballsPerOver);
  const b = legalBalls % ballsPerOver;
  return o + b / ballsPerOver;
}
