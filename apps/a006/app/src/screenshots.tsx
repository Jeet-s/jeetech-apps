import { useState } from "react";
import { View } from "react-native";
import { HomeScreen } from "./screens/HomeScreen";
import { StatsScreen } from "./screens/StatsScreen";
import { MatchDetailScreen } from "./screens/MatchDetailScreen";
import { TournamentDetailScreen } from "./screens/TournamentDetailScreen";
import { ScoringScreen } from "./screens/ScoringScreen";
import { ProSheet } from "./screens/ProSheet";
import { TAB_BAR_HEIGHT, TabBar, palette } from "./ui";
import { NavContext, type Nav } from "./nav";
import { colorFor } from "./screens/common";
import { appStore } from "./core/data";
import { store } from "./modules/store";
import {
  addTeam,
  createTournament,
  emptyApp,
  generateTournamentFixtures,
  resolveRoster,
  scoreBall,
  startMatch,
  startSecondInnings,
  type AppState,
} from "./core/app";
import { makeRules } from "./core/rules";
import type { ExtraType, Id, WicketType } from "./core/types";

const noop = () => {};
const noopNav: Nav = { push: noop, pop: noop, replace: noop, reset: noop, go: noop, openPro: noop };

// A scripted delivery. `wk` + optional `fld` record a dismissal (bowled by default; caught/runout credit a fielder
// so fielding stats build up); `ex` records an extra (byes/leg-byes are legal deliveries, wides/no-balls re-bowl).
type Ball = { r: number; b?: "four" | "six"; wk?: WicketType; fld?: Id | null; ex?: ExtraType; inc?: Id | null };

function playBalls(s: AppState, matchId: Id, bowlers: Id[], script: Ball[]): AppState {
  let legal = 0;
  for (const x of script) {
    const over = Math.floor(legal / 6);
    const bowler = bowlers[over % bowlers.length];
    s = scoreBall(s, matchId, {
      runs: x.r,
      boundary: x.b ?? "none",
      wicket: x.wk ?? "none",
      fielder: x.fld ?? null,
      extra: x.ex ?? "none",
      incoming: x.inc ?? null,
      bowler,
    });
    // Only legal deliveries advance the over (wides/no-balls re-bowl), so the bowler rotation stays honest.
    if (x.ex !== "wide" && x.ex !== "noball") legal += 1;
  }
  return s;
}

/** Play a full two-innings match: first-innings script, then the chase. Returns the updated state. */
function playMatch(
  s: AppState,
  matchId: Id,
  bowl1: Id[],
  s1: Ball[],
  bowl2: Id[],
  chase: (order: Id[]) => Ball[],
): AppState {
  s = playBalls(s, matchId, bowl1, s1);
  s = startSecondInnings(s, matchId);
  const live = s.matches.find((m) => m.id === matchId)!;
  const order = live.innings[1].battingOrder;
  s = playBalls(s, matchId, bowl2, chase(order));
  return s;
}

/**
 * A scorer a few weeks in: a 3-team Sunday league with a full round-robin played out (believable cards — boundaries,
 * wickets with fielders, byes/leg-byes/wides so Extras is never a row of zeros), plus a live friendly to resume.
 */
function seed(): AppState {
  let s = emptyApp();
  const ra = resolveRoster(s, ["Asha Rao", "Bina Shah", "Chandra K", "Dev Patel", "Esha M"]); s = ra.state;
  const rb = resolveRoster(s, ["Farid A", "Gita N", "Hari V", "Iqbal S", "Jay D"]); s = rb.state;
  const rc = resolveRoster(s, ["Kiran P", "Laxmi R", "Manish T", "Nadia Q", "Omar F"]); s = rc.state;
  const A = addTeam(s, { name: "Street Royals", playerIds: ra.ids, color: colorFor("A") }); s = A.state;
  const B = addTeam(s, { name: "Park Strikers", playerIds: rb.ids, color: colorFor("B") }); s = B.state;
  const C = addTeam(s, { name: "Gully Giants", playerIds: rc.ids, color: colorFor("C") }); s = C.state;

  const tr = createTournament(s, { name: "Sunday Gully League", teamIds: [A.id, B.id, C.id] }); s = tr.state;
  s = generateTournamentFixtures(s, tr.id, "2026-10-13");

  const rules = makeRules({ oversPerInnings: 3, ballsPerOver: 6, wickets: 5, playersPerSide: 5, lastManBats: true, freeHitOnNoBall: false });
  const linkFixture = (teamAId: Id, teamBId: Id, matchId: Id) => {
    s = {
      ...s,
      fixtures: s.fixtures.map((f) =>
        f.tournamentId === tr.id && !f.matchId && ((f.teamAId === teamAId && f.teamBId === teamBId) || (f.teamAId === teamBId && f.teamBId === teamAId))
          ? { ...f, matchId }
          : f,
      ),
    };
  };

  // ---- Match 1 (Street Royals v Park Strikers) — the finished card the scorecard screenshot shows. ----
  const m1 = startMatch(s, { teamAId: A.id, teamBId: B.id, rules, toss: { wonBy: A.id, decision: "bat" }, date: "2026-10-13", tournamentId: tr.id, firstBattingOrder: ra.ids }); s = m1.state;
  s = playMatch(
    s, m1.id!,
    [rb.ids[2], rb.ids[0]],
    [
      { r: 1 }, { r: 4, b: "four" }, { r: 2 }, { ex: "legbye", r: 1 }, { r: 0 }, { r: 6, b: "six" },
      { ex: "wide", r: 0 }, { r: 1 }, { r: 0, wk: "caught", fld: rb.ids[3], inc: ra.ids[2] }, { r: 4, b: "four" }, { r: 1 }, { r: 2 }, { r: 1 },
      { r: 1 }, { ex: "bye", r: 2 }, { r: 4, b: "four" }, { r: 0, wk: "bowled", inc: ra.ids[3] }, { r: 1 }, { r: 6, b: "six" },
    ],
    [ra.ids[0], ra.ids[3]],
    (order: Id[]) => [
      { r: 1 }, { r: 4, b: "four" }, { r: 0 }, { r: 2 }, { r: 1 }, { r: 1 },
      { r: 4, b: "four" }, { r: 0, wk: "runout", fld: ra.ids[1], inc: order[2] }, { r: 1 }, { r: 6, b: "six" }, { r: 0 }, { r: 2 },
      { r: 1 }, { r: 4, b: "four" }, { r: 0, wk: "bowled", inc: order[3] }, { r: 2 }, { r: 1 }, { r: 4, b: "four" },
    ],
  );
  linkFixture(A.id, B.id, m1.id!);

  // ---- Match 2 (Street Royals v Gully Giants). ----
  const m2 = startMatch(s, { teamAId: A.id, teamBId: C.id, rules, toss: { wonBy: A.id, decision: "bat" }, date: "2026-10-20", tournamentId: tr.id, firstBattingOrder: ra.ids }); s = m2.state;
  s = playMatch(
    s, m2.id!,
    [rc.ids[2], rc.ids[0]],
    [
      { r: 2 }, { r: 4, b: "four" }, { r: 1 }, { r: 1 }, { ex: "legbye", r: 1 }, { r: 0 },
      { r: 6, b: "six" }, { r: 1 }, { r: 0, wk: "bowled", inc: ra.ids[2] }, { r: 4, b: "four" }, { r: 2 }, { r: 1 },
      { r: 1 }, { r: 4, b: "four" }, { r: 2 }, { r: 6, b: "six" }, { r: 1 }, { r: 4, b: "four" },
    ],
    [ra.ids[0], ra.ids[3]],
    (order: Id[]) => [
      { r: 1 }, { r: 0 }, { r: 4, b: "four" }, { r: 1 }, { r: 2 }, { r: 0, wk: "caught", fld: ra.ids[2], inc: order[2] },
      { r: 1 }, { r: 4, b: "four" }, { r: 2 }, { r: 0, wk: "runout", fld: ra.ids[1], inc: order[3] }, { r: 1 }, { r: 1 },
      { r: 4, b: "four" }, { r: 2 }, { r: 1 }, { r: 0, wk: "bowled", inc: order[4] }, { r: 6, b: "six" }, { r: 1 },
    ],
  );
  linkFixture(A.id, C.id, m2.id!);

  // ---- Match 3 (Park Strikers v Gully Giants) — Giants chase it down. ----
  const m3 = startMatch(s, { teamAId: B.id, teamBId: C.id, rules, toss: { wonBy: B.id, decision: "bat" }, date: "2026-10-27", tournamentId: tr.id, firstBattingOrder: rb.ids }); s = m3.state;
  s = playMatch(
    s, m3.id!,
    [rc.ids[2], rc.ids[0]],
    [
      { r: 1 }, { r: 1 }, { r: 4, b: "four" }, { r: 0 }, { r: 2 }, { r: 1 },
      { r: 0, wk: "caught", fld: rc.ids[3], inc: rb.ids[2] }, { r: 4, b: "four" }, { r: 1 }, { ex: "legbye", r: 1 }, { r: 2 }, { r: 1 },
      { r: 1 }, { r: 6, b: "six" }, { r: 0 }, { r: 2 }, { r: 1 }, { r: 4, b: "four" },
    ],
    [rb.ids[2], rb.ids[0]],
    (order: Id[]) => [
      { r: 4, b: "four" }, { r: 1 }, { r: 6, b: "six" }, { r: 2 }, { r: 1 }, { r: 4, b: "four" },
      { r: 1 }, { r: 0, wk: "bowled", inc: order[2] }, { r: 4, b: "four" }, { r: 2 }, { r: 4, b: "four" }, { r: 1 },
      { r: 1 }, { r: 4, b: "four" }, { r: 2 },
    ],
  );
  linkFixture(B.id, C.id, m3.id!);

  // ---- Live match to resume, mid-CHASE — the "score" store shot and the Home resume hero. A chase shows the full
  // scoreboard a best-in-class scorer surfaces (target, runs needed, required rate, a live partnership) and a current
  // over with a boundary, a wicket and a six, so the scoring screenshot reads as the richest screen in the app. ----
  const mL = startMatch(s, { teamAId: A.id, teamBId: B.id, rules, toss: { wonBy: A.id, decision: "bat" }, date: "2026-10-29", firstBattingOrder: ra.ids }); s = mL.state;
  // Street Royals post 37/2 in their 3 overs.
  s = playBalls(s, mL.id!, [rb.ids[2], rb.ids[0]], [
    { r: 1 }, { r: 4, b: "four" }, { r: 1 }, { r: 2 }, { r: 0 }, { r: 6, b: "six" },
    { r: 1 }, { r: 0, wk: "caught", fld: rb.ids[3], inc: ra.ids[2] }, { r: 4, b: "four" }, { r: 2 }, { r: 1 }, { r: 1 },
    { r: 2 }, { r: 1 }, { r: 4, b: "four" }, { r: 0, wk: "bowled", inc: ra.ids[3] }, { r: 6, b: "six" }, { r: 1 },
  ]);
  s = startSecondInnings(s, mL.id!);
  const chaseOrder = s.matches.find((m) => m.id === mL.id)!.innings[1].battingOrder;
  // Park Strikers chase: 25/1 after 1.4 overs, needing 13 off 8 — the current over reads 4 · W · 2 · 6.
  s = playBalls(s, mL.id!, [ra.ids[0], ra.ids[3]], [
    { r: 1 }, { r: 4, b: "four" }, { r: 1 }, { r: 6, b: "six" }, { r: 0 }, { r: 1 },
    { r: 4, b: "four" }, { r: 0, wk: "caught", fld: ra.ids[2], inc: chaseOrder[2] }, { r: 2 }, { r: 6, b: "six" },
  ]);

  return s;
}

export function ScreenshotScene({ id }: { id: string }) {
  const state = useState(() => {
    const s = seed();
    appStore.set(() => s);
    store.set({ onboarded: true, pro: id === "stats", adsRemoved: true, sessions: 30 });
    return s;
  })[0];

  const matchId = state.matches.find((m) => m.status === "complete")?.id as Id;
  const liveId = state.matches.find((m) => m.status === "live")?.id as Id;
  const cupId = state.tournaments[0]?.id as Id;
  const root = { flex: 1, backgroundColor: palette.bg };

  const tabs = (active: "home" | "stats") => (
    <TabBar
      tabs={[
        { id: "home", label: "Home", icon: "home" },
        { id: "matches", label: "Matches", icon: "ball" },
        { id: "tournaments", label: "Cups", icon: "trophy" },
        { id: "stats", label: "Stats", icon: "chart" },
        { id: "more", label: "More", icon: "dots" },
      ]}
      active={active}
      onChange={noop}
    />
  );

  return (
    <NavContext.Provider value={noopNav}>
      {(() => {
        switch (id) {
          case "score":
            return <ScoringScreen matchId={liveId} screenshot />;
          case "scorecard":
            return <MatchDetailScreen matchId={matchId} bottomInset={0} />;
          case "cup":
            // Match the real app's tab-bar inset so the last Teams row keeps clear of the home indicator in the shot.
            return <TournamentDetailScreen id={cupId} bottomInset={TAB_BAR_HEIGHT} />;
          case "stats":
            return (
              <View style={root}>
                <StatsScreen bottomInset={TAB_BAR_HEIGHT} />
                {tabs("stats")}
              </View>
            );
          case "pro":
            return (
              <View style={root}>
                <HomeScreen bottomInset={TAB_BAR_HEIGHT} />
                {tabs("home")}
                <ProSheet visible from="screenshot" onClose={noop} />
              </View>
            );
          case "home":
          default:
            return (
              <View style={root}>
                <HomeScreen bottomInset={TAB_BAR_HEIGHT} />
                {tabs("home")}
              </View>
            );
        }
      })()}
    </NavContext.Provider>
  );
}
