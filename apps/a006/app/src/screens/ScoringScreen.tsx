import { useEffect, useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from "react-native-reanimated";
import {
  Button,
  Chip,
  Confetti,
  Icon,
  IconButton,
  Pill,
  Segmented,
  Sheet,
  Tappable,
  TextField,
  feedback,
  gradient,
  palette,
  radius,
  shadowStrong,
  space,
  springs,
  toast,
  type,
} from "../ui";
import { Avatar, Stepper, appStore, useApp, useNames } from "./common";
import { ScorecardView } from "./ScorecardView";
import { ChartsView } from "./ChartsView";
import { BallEditFlow, EditBallSheet, type Editing } from "./BallEditor";
import { ShareCardSheet } from "./ShareCard";
import { useNav } from "../nav";
import { analytics } from "../modules/analytics";
import { review } from "../modules/review";
import {
  abandonMatch,
  declareInnings,
  editMatchBall,
  renamePlayer,
  renameTeam,
  scoreBall,
  setScoreOnlyTotals,
  startSecondInnings,
  teamById,
  undoBall,
} from "../core/app";
import { replay, type BallInput } from "../core/scoring";
import { ballsInInnings } from "../core/rules";
import { ballLabel, tossLine } from "../core/format";
import type { AuditEntry, BallEvent, ExtraType, Id, Match, WicketType } from "../core/types";

const EXTRAS: { key: ExtraType; label: string }[] = [
  { key: "wide", label: "Wide" },
  { key: "noball", label: "No ball" },
  { key: "bye", label: "Bye" },
  { key: "legbye", label: "Leg bye" },
];

const WICKETS: { key: WicketType; label: string; needsFielder?: boolean }[] = [
  { key: "bowled", label: "Bowled" },
  { key: "caught", label: "Caught", needsFielder: true },
  { key: "lbw", label: "LBW" },
  { key: "runout", label: "Run out", needsFielder: true },
  { key: "stumped", label: "Stumped", needsFielder: true },
  { key: "hitwicket", label: "Hit wicket" },
];

/** Full-screen ball-by-ball scoring — the core job, one tap per ball. No tabs, no ads. */
export function ScoringScreen({ matchId, screenshot }: { matchId: Id; screenshot?: boolean }) {
  const app = useApp();
  const nav = useNav();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { playerName, teamName } = useNames(app.players, app.teams);
  const match = app.matches.find((m) => m.id === matchId);

  const [extra, setExtra] = useState<ExtraType>("none");
  const [pickedBowler, setPickedBowler] = useState<Id | null>(null);
  const [wicketOpen, setWicketOpen] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  const [cardTab, setCardTab] = useState<"card" | "charts">("card");
  const [menuOpen, setMenuOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [bowlerSheetOpen, setBowlerSheetOpen] = useState(false);
  const [editFlowOpen, setEditFlowOpen] = useState(false);
  const [editOne, setEditOne] = useState<Editing | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [burst, setBurst] = useState(0);
  // A brief "+N" that pops over the header on every scoring ball — an immediate, rewarding confirmation the run
  // registered (alongside the digit bump + the ball dot). Re-triggered by a tick so identical deltas re-animate.
  const [delta, setDelta] = useState<{ runs: number; wicket: boolean; tick: number } | null>(null);
  // Who faced the last ball — named on the Last-ball confirmation ("1 RUN · Aarav") so each tap reads as a clear,
  // rewarding result, not just a number change. Captured from the on-strike batter BEFORE the ball (pre-rotation).
  const [lastScorer, setLastScorer] = useState<string | null>(null);
  // A brief centre-screen celebration (e.g. "First ball!") — in the body, never over the hero score. Auto-clears.
  const [flash, setFlash] = useState<string | null>(null);
  // A one-time, dismissible tip that pops under the keypad after the FIRST ball of the match — points the new
  // scorer at Undo/Edit and the shareable card so the activation moment hints at what to do next (QA design review #2).
  const [firstBallTip, setFirstBallTip] = useState(false);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 1500);
    return () => clearTimeout(t);
  }, [flash]);

  // Derive the hero numbers ONCE per actual ball (memoised on the innings object, which is a fresh reference only
  // when a ball is scored/undone/edited). Incidental re-renders — toggling an extra, a flash clearing, confetti —
  // no longer re-run the O(n) log replay + over grouping, which is the "large synchronous renders during repeated
  // scoring" the soak ANR flagged. Hooks run before the early return so their order is stable.
  const idx = match ? match.innings.length - 1 : -1;
  const inn = match?.innings[idx];
  const sum = useMemo(() => (inn && match ? replay(inn, match.rules) : null), [inn, match]);
  const over = useMemo(() => (inn && match && sum ? thisOver(inn, match.rules, sum.legalBalls) : null), [inn, match, sum]);
  // STABLE origin object for the (memoised) Confetti: a fresh `{x,y}` literal every render broke Confetti's
  // React.memo, so its Skia <Canvas> re-rendered on every single ball — a growing soak main-thread cost and the exact
  // "unmemoised Skia Canvas → soak ANR" pitfall. Now the Canvas only re-paints when a burst actually fires. (QA no_anr)
  const confettiOrigin = useMemo(() => ({ x: width / 2, y: insets.top + 150 }), [width, insets.top]);

  if (!match || !inn || !sum || !over) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 40, alignItems: "center" }]}>
        <Text style={type.body}>Match not found.</Text>
        <Button label="Back" variant="ghost" onPress={() => nav.reset()} />
      </View>
    );
  }

  const bowling = teamById(app, inn.bowlingTeamId);
  const bowlerIds = bowling?.playerIds ?? [];
  const quota = ballsInInnings(match.rules);

  const commit = (fn: (s: typeof app) => typeof app) => appStore.set(fn);
  const teamPlayers = (tid: Id) => teamById(app, tid)?.playerIds ?? [];

  // ---- score-only mode ----
  if (inn.scoreOnly) return <ScoreOnly match={match} teamName={teamName} nav={nav} />;

  const lefty = !!app.settings.leftHandedKeypad;
  const midOver = inn.events.length > 0 && !sum.overComplete;
  const openingOver = inn.events.length === 0;
  // Auto-pick the first bowler for the opening over so the run keys work on the very first tap (no mandatory
  // picker screen between "start match" and scoring the first ball). The scorer can still swap before the first
  // ball via the "Change" chip. A NEW over mid-innings still asks for the bowler — that's expected cricket flow.
  const autoBowler: Id | null = openingOver ? (bowlerIds[0] ?? null) : null;
  const effectiveBowler: Id | null = midOver ? sum.bowlerId : (pickedBowler ?? autoBowler);
  const needBowler = !sum.inningsOver && !midOver && !effectiveBowler;

  const atCrease = new Set<Id>([sum.strikerId, sum.nonStrikerId].filter(Boolean) as Id[]);
  const outIds = new Set(sum.batters.filter((b) => b.out).map((b) => b.id));
  const toBat = inn.battingOrder.filter((id) => !atCrease.has(id) && !outIds.has(id));

  const score = (input: BallInput) => {
    const bowler = effectiveBowler;
    if (!bowler) {
      feedback("error", "warning");
      return toast("Pick the bowler for this over first.");
    }
    const firstEver = match.innings.length === 1 && inn.events.length === 0;
    const strikerBefore = sum.batters.find((b) => b.id === sum.strikerId)?.runs ?? 0;
    setLastScorer(playerName(sum.strikerId));
    const ex = input.extra ?? extra;

    const next = scoreBall(app, matchId, { ...input, extra: ex, bowler });
    // scoreBall returns the SAME state when the ball is invalid (e.g. an illegal free-hit wicket) — nothing to do.
    if (next === app) { feedback("error", "warning"); return; }
    commit(() => next);
    setExtra("none");

    // Derive the delta + over/milestone transitions ARITHMETICALLY instead of replaying the whole innings again —
    // the hero/over memos already replay once on the re-render, so a third full O(n) replay here per ball was the
    // bulk of the soak's growing main-thread cost (QA no_anr). These mirror core teamRuns/batterRuns/isLegalDelivery.
    const r = match.rules;
    const runsIn = input.runs ?? 0;
    const gained = ex === "wide" ? r.wideRuns + runsIn : ex === "noball" ? r.noBallRuns + runsIn : runsIn;
    const batterGain = ex === "none" || ex === "noball" ? runsIn : 0;
    const strikerAfter = strikerBefore + batterGain;
    const isLegal = ex === "wide" ? !r.wideReBall : ex === "noball" ? !r.noBallReBall : true;
    const overCompleteAfter = isLegal && (sum.legalBalls + 1) % r.ballsPerOver === 0;

    const isWkt = !!input.wicket && input.wicket !== "none";
    setDelta({ runs: gained, wicket: isWkt, tick: (delta?.tick ?? 0) + 1 });

    // Haptics + confetti per event. The on-screen confirmation is the LastBall card, the over-tracker dot that
    // pops in, and the score bump on the hero — NO toast over the hero (a toast there clipped the 0/0 in QA).
    if (input.wicket && input.wicket !== "none") { feedback("error", "heavy"); setBurst((b) => b + 1); }
    else if (input.boundary === "six") { feedback("success", "heavy"); setBurst((b) => b + 1); }
    else if (input.boundary === "four") { feedback("success", "medium"); }
    else feedback("tap", "light");

    // First ball of the whole match gets its own little moment — a confetti pop, a centre-screen "First ball!",
    // a bottom toast and a one-time tip card pointing at Undo/Edit + the share card (activation hint, QA #2).
    if (firstEver) { setBurst((b) => b + 1); setFlash("FIRST BALL! 🏏"); setFirstBallTip(true); toast("First ball scored! 🎉"); }

    if ((strikerBefore < 50 && strikerAfter >= 50) || (strikerBefore < 100 && strikerAfter >= 100)) {
      setBurst((b) => b + 1);
      feedback("unlock", "success");
    }

    analytics.track("ball_scored");
    analytics.track("core_action", { feature: "score_ball" });
    review.actionCompleted();
    if (firstEver) analytics.track("first_ball_scored");

    // New over → force a fresh bowler pick. If the innings also ended, the state panel replaces the keypad so a
    // cleared bowler is harmless either way (we no longer need a replay to distinguish the two).
    if (overCompleteAfter) setPickedBowler(null);
  };

  const onRun = (runs: number, boundary: "none" | "four" | "six" = "none") => {
    // A boundary only counts for the batter off a legal/no-ball delivery, never on byes/leg-byes/wides.
    const useBoundary = extra === "none" || extra === "noball" ? boundary : "none";
    score({ runs, boundary: useBoundary, extra });
  };

  const undo = () => {
    if (!inn.events.length && match.innings.length === 1) {
      feedback("error", "warning");
      return toast("Nothing to undo yet.");
    }
    commit((s) => undoBall(s, matchId));
    setPickedBowler(null);
    setLastScorer(null);
    feedback("pop", "light");
    analytics.track("undo_used");
  };

  const pickBowler = (id: Id) => {
    setPickedBowler(id);
    setMenuOpen(false);
    feedback("pop", "select");
  };

  const saveEdit = (inningsIdx: number, seq: number, patch: Partial<BallEvent>) => {
    commit((s) => editMatchBall(s, matchId, inningsIdx, seq, patch, Date.now()));
    setEditOne(null);
    setEditFlowOpen(false);
    feedback("success", "medium");
    analytics.track("match_edited");
    // Land the correction on a LASTING, findable result: open the edit-history sheet showing the logged
    // before→after (QA: after a fix the tester hunted Match Options / Scorecard for an audit trail and found none).
    setHistoryOpen(true);
    toast("Ball fixed ✓ — logged below", undefined, { top: true });
  };

  const endInnings = () => {
    Alert.alert("End this innings?", "Close the innings now (declaration or all out confirmed).", [
      { text: "Cancel", style: "cancel" },
      { text: "End innings", style: "destructive", onPress: () => { commit((s) => declareInnings(s, matchId)); setPickedBowler(null); feedback("success", "medium"); } },
    ]);
  };
  const abandon = () => {
    Alert.alert("Abandon match?", "The match is kept and marked abandoned — nothing is deleted.", [
      { text: "Cancel", style: "cancel" },
      { text: "Abandon", style: "destructive", onPress: () => { commit((s) => abandonMatch(s, matchId)); feedback("error", "warning"); nav.reset(); } },
    ]);
  };

  const startChase = () => {
    commit((s) => startSecondInnings(s, matchId));
    setPickedBowler(null);
    feedback("whoosh", "medium");
  };

  // ---- derived header lines ----
  const striker = sum.batters.find((b) => b.id === sum.strikerId);
  const nonStriker = sum.batters.find((b) => b.id === sum.nonStrikerId);
  const bowlerCard = sum.bowlers.find((b) => b.id === sum.bowlerId);
  const chase = inn.target != null;
  const toWin = chase ? Math.max(0, inn.target! - sum.runs) : 0;
  const ballsLeft = quota > 0 ? Math.max(0, quota - sum.legalBalls) : 0;
  const rrr = chase && ballsLeft > 0 ? (toWin / (ballsLeft / match.rules.ballsPerOver)) : 0;
  // Current (unbroken) partnership and a projected total — the extra scoreboard density the best competitors show.
  const partnership = sum.partnerships.find((p) => p.wicket === 0);
  const projected = quota > 0 && !chase && sum.legalBalls > 0 ? Math.round(sum.runRate * match.rules.oversPerInnings) : null;

  const complete = match.status === "complete";
  const inningsBreak = match.status === "innings_break";
  const tossText = tossLine(match, teamName);

  return (
    <View style={styles.root}>
      {/* top bar */}
      <View style={[styles.topbar, { paddingTop: insets.top + space.xs }]}>
        <IconButton icon="chevronLeft" label="Back to home" onPress={() => nav.reset()} />
        {/* Tapping the title still opens rename (a quiet shortcut), but the inline pencil glyph is gone and the
            standalone Share icon moved into the ⋯ menu — the title was being truncated against three right-side
            icons (QA). Now just Scorecard + ⋯ sit on the right, so the match name has room on a 360dp phone. */}
        <Tappable label="Rename teams and players" sound="pop" onPress={() => { feedback("pop", "light"); setRenameOpen(true); }} style={styles.titleTap}>
          <Text style={[type.label, { textAlign: "center" }]} numberOfLines={1}>
            {teamName(match.teamAId)} v {teamName(match.teamBId)}
          </Text>
        </Tappable>
        <IconButton icon="chart" label="Scorecard and charts" onPress={() => { setCardTab("card"); setCardOpen(true); }} />
        <IconButton icon="dots" label="Match options" onPress={() => setMenuOpen(true)} />
      </View>

      {/* score header */}
      <LinearGradient colors={gradient.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
        {delta ? <FloatingDelta runs={delta.runs} wicket={delta.wicket} tick={delta.tick} /> : null}
        <View style={styles.scoreRow}>
          <View style={{ flex: 1 }}>
            <Text style={[type.overline, { color: gradient.onHeroSoft }]} numberOfLines={1}>
              {teamName(inn.battingTeamId)} · {inn.order === 2 ? "2nd innings" : "1st innings"}
            </Text>
            <BumpScore runs={sum.runs} wickets={sum.wickets} />

            <Text style={[type.label, { color: gradient.onHeroSoft }]}>
              {sum.oversText}{quota > 0 ? ` / ${match.rules.oversPerInnings} ov` : " ov"} · CRR {sum.runRate.toFixed(2)}
            </Text>
            {/* Toss line, in plain cricket so a newcomer can read who bats first and why — not just a tiny tag (QA #4). */}
            {tossText ? (
              <Text style={[type.caption, { color: gradient.onHeroSoft, marginTop: 2 }]} numberOfLines={1}>🪙 {tossText}</Text>
            ) : null}
          </View>
          <View style={{ alignItems: "flex-end", gap: 4 }}>
            {chase ? (
              // Target / Need / Req-RR — the chase maths the best scorers surface up top (image 7/8).
              <View style={styles.targetBox}>
                <Text style={[type.overline, { color: gradient.onHeroSoft }]} numberOfLines={1}>Target {inn.target}</Text>
                <Text style={[type.bodyStrong, { color: gradient.onHero }]} numberOfLines={1}>Need {toWin}</Text>
                <Text style={[type.caption, { color: gradient.onHeroSoft }]} numberOfLines={1}>{ballsLeft} balls · RRR {rrr.toFixed(2)}</Text>
              </View>
            ) : null}
            {sum.freeHitNext ? <View style={styles.freeHit}><Text style={styles.freeHitTxt}>FREE HIT</Text></View> : null}
          </View>
        </View>

        {/* batters + bowler — a compact aligned table (R B 4s 6s SR), denser and clearer like the best competitors */}
        <View style={styles.mini}>
          <View style={styles.tableHead}>
            <Text style={[type.overline, styles.cBat, { color: gradient.onHeroSoft }]} numberOfLines={1}>Batting</Text>
            {["R", "B", "4s", "6s"].map((h) => (
              <Text key={h} style={[type.overline, styles.cStat, { color: gradient.onHeroSoft }]}>{h}</Text>
            ))}
            <Text style={[type.overline, styles.cSR, { color: gradient.onHeroSoft }]}>SR</Text>
          </View>
          <BatRow name={playerName(sum.strikerId)} on runs={striker?.runs ?? 0} balls={striker?.balls ?? 0} fours={striker?.fours ?? 0} sixes={striker?.sixes ?? 0} />
          {!match.rules.oneBatter ? (
            <BatRow name={playerName(sum.nonStrikerId)} runs={nonStriker?.runs ?? 0} balls={nonStriker?.balls ?? 0} fours={nonStriker?.fours ?? 0} sixes={nonStriker?.sixes ?? 0} />
          ) : null}
          <View style={styles.miniDivider} />
          <View style={styles.bowlerRow}>
            <Text style={[type.bodyStrong, { fontSize: 14, color: gradient.onHero, flex: 1 }]} numberOfLines={1}>
              🏏 {bowlerCard ? `${playerName(sum.bowlerId)} ${bowlerCard.oversText}-${bowlerCard.maidens}-${bowlerCard.runs}-${bowlerCard.wickets}` : "New over"}
            </Text>
            {bowlerCard ? <Text style={[type.caption, { color: gradient.onHeroSoft }]} numberOfLines={1}>Econ {bowlerCard.econ.toFixed(1)}</Text> : null}
          </View>
          {/* Always rendered with a reserved height so the hero header stays the SAME size before and after the first
              ball — the partnership/projected line appearing used to grow the header and shove the whole screen down a
              row between frames (QA: "header shifts vertically between frames"). */}
          <View style={styles.pshipRow}>
            {partnership ? <Text style={[type.caption, { color: gradient.onHeroSoft }]} numberOfLines={1}>P'ship {partnership.runs} ({partnership.balls})</Text> : <View />}
            {projected != null ? <Text style={[type.caption, { color: gradient.onHeroSoft }]} numberOfLines={1}>Projected {projected}</Text> : null}
          </View>
        </View>
      </LinearGradient>

      {/* body: keypad or state panel */}
      <View style={[styles.body, { paddingBottom: insets.bottom + space.lg }]}>
        {complete ? (
          <StatePanel
            title="Match complete"
            body={match.result?.summary ?? ""}
            action={<Button label="See result & share" size="lg" icon="share" onPress={() => nav.replace({ t: "result", matchId })} />}
          />
        ) : inningsBreak ? (
          <StatePanel
            title="Innings break"
            body={`Target ${(replay(match.innings[0], match.rules).runs) + 1}. ${teamName(inn.bowlingTeamId)} to chase.`}
            action={<Button label="Start 2nd innings" size="lg" icon="play" onPress={startChase} />}
          />
        ) : sum.inningsOver ? (
          <StatePanel
            title="Innings over"
            body={`${teamName(inn.battingTeamId)} ${sum.runs}/${sum.wickets} (${sum.oversText})`}
            action={<Button label="Continue" size="lg" onPress={() => commit((s) => declareInnings(s, matchId))} />}
          />
        ) : needBowler ? (
          (() => {
            const filtered = bowlerIds.filter((id) => inn.events.length === 0 || id !== sum.bowlerId);
            const choices = filtered.length ? filtered : bowlerIds;
            return (
              <BowlerPicker
                opening={inn.events.length === 0}
                choices={choices}
                playerName={playerName}
                onConfirm={pickBowler}
                soloNote={!filtered.length && bowlerIds.length > 0}
              />
            );
          })()
        ) : (
          <>
            {/* FREE HIT: an unmissable, full-width amber banner on the scoring screen itself the moment a no-ball
                arms one — the next delivery can't be lost to a bowled/caught/stumped dismissal, only a run-out counts.
                QA flagged "no free-hit indicator anywhere"; this sits directly above the over tracker so it's the
                first thing a scorer sees before the next ball, in addition to the hero tag and the wicket-sheet lock. */}
            {sum.freeHitNext ? <FreeHitBanner /> : null}
            {/* this-over tracker sits right under the score card: current bowler, ball dots (tap to fix), next-ball
                prompt. It lives in a ScrollView that takes the leftover space so, on a short screen, the tracker scrolls
                on its own instead of the ball-dots row overflowing its box and sitting half-hidden behind the Extras
                panel below it (QA scoring UX: "over-tracker dots clipped behind Extras"). The keypad stays fixed. */}
            <ScrollView
              style={styles.trackWrap}
              contentContainerStyle={styles.trackScroll}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <ThisOverTracker
                over={over}
                ballsPerOver={match.rules.ballsPerOver}
                freeHit={sum.freeHitNext}
                scorer={lastScorer}
                bowlerLabel={bowlerCard ? `${playerName(effectiveBowler)} · ${bowlerCard.oversText}-${bowlerCard.maidens}-${bowlerCard.runs}-${bowlerCard.wickets}` : playerName(effectiveBowler)}
                strikerLabel={`${playerName(sum.strikerId)} on strike · ${striker?.runs ?? 0} (${striker?.balls ?? 0})`}
                onTapBall={(cell) => cell.seq != null && setEditOne({ inningsIdx: idx, seq: cell.seq, event: inn.events[cell.seq] })}
                onChangeBowler={openingOver && bowlerIds.length > 1 ? () => { feedback("pop", "light"); setBowlerSheetOpen(true); } : undefined}
                onUndo={undo}
              />

              {/* One-time activation tip after the first ball: where to correct a ball and that a shareable card is ready. */}
              {firstBallTip ? (
                <View style={styles.tipCard}>
                  <View style={styles.tipIcon}><Icon name="check" size={16} color={palette.primary} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={type.bodyStrong} numberOfLines={1}>First ball in the books 🏏</Text>
                    <Text style={[type.caption, { color: palette.inkSoft }]} numberOfLines={2}>
                      Got it wrong? Tap a ball above, or use Undo / Edit below. Share a scorecard card any time from ⋯.
                    </Text>
                  </View>
                  <Tappable label="Dismiss tip" sound="pop" onPress={() => { feedback("pop", "light"); setFirstBallTip(false); }} style={styles.tipClose}>
                    <Icon name="close" size={16} color={palette.inkMuted} />
                  </Tappable>
                </View>
              ) : null}
            </ScrollView>

            {/* extras modifier row — grouped under a label and higher-contrast so they don't read as disabled */}
            <View style={styles.extraGroup}>
              <Text style={[type.overline, { color: palette.inkMuted }]}>
                {extra === "none" ? "Extras — tap one, then a run" : `${labelForExtra(extra)} on · tap it again to clear`}
              </Text>
              <View style={styles.extraRow}>
                {EXTRAS.map((e) => {
                  const on = extra === e.key;
                  // The Tappable animates backgroundColor from fill→fillActive, so the SELECTED fill has to be the
                  // primary colour itself — otherwise releasing the press snapped the button back to surfaceAlt and
                  // the "armed" extra looked unselected (QA: no persistent selected state). A selected extra now stays
                  // solid-green with a check until tapped again.
                  return (
                    <Tappable
                      key={e.key}
                      label={`${e.label}${on ? ", selected" : ""}`}
                      role="checkbox"
                      accessibilityState={{ checked: on }}
                      sound="pop"
                      onPress={() => setExtra(on ? "none" : e.key)}
                      fill={on ? palette.primary : palette.surfaceAlt}
                      fillActive={on ? palette.primaryDark : palette.primary + "59"}
                      style={[styles.extraBtn, on && styles.extraOn]}
                    >
                      <View style={styles.extraInner}>
                        {on ? <Icon name="check" size={13} color={palette.onPrimary} /> : null}
                        <Text style={[type.bodyStrong, { fontSize: 14, color: on ? palette.onPrimary : palette.ink }]} numberOfLines={1}>{e.label}</Text>
                      </View>
                    </Tappable>
                  );
                })}
              </View>
              {extra !== "none" ? (
                <Text style={[type.caption, { textAlign: "center", color: palette.warning }]}>
                  {labelForExtra(extra)} armed — tap runs (0 = just the {labelForExtra(extra).toLowerCase()}).
                </Text>
              ) : null}
            </View>

            {/* run grid (mirrored for a left-handed scorer) */}
            <View style={styles.grid}>
              {maybeFlip([0, 1, 2, 3], lefty).map((r) => (
                <RunKey key={r} label={String(r)} onPress={() => onRun(r)} />
              ))}
            </View>
            <View style={styles.grid}>
              {maybeFlip(
                [
                  <RunKey key="4" label={String(match.rules.boundaryFour)} big tone={palette.primary} pressFill={palette.primary + "73"} onPress={() => onRun(match.rules.boundaryFour, "four")} />,
                  <RunKey key="5" label="5" big onPress={() => onRun(5)} />,
                  <RunKey key="6" label={String(match.rules.boundarySix)} big tone={palette.accent} pressFill={palette.accent + "73"} onPress={() => onRun(match.rules.boundarySix, "six")} />,
                  <RunKey key="out" label="OUT" big tone={palette.danger} pressFill={palette.danger + "73"} onPress={() => setWicketOpen(true)} />,
                ],
                lefty,
              )}
            </View>
            {/* Before the first ball there's nothing to undo, so rather than two DIM disabled buttons (which read as
                broken in QA), show one clear "locked" hint of the same height. Once a ball exists, the real,
                full-contrast Undo / Edit buttons take its place — no layout jump (QA ux_polish). */}
            {openingOver ? (
              <View style={styles.lockRow}>
                <Icon name="undo" size={15} color={palette.inkMuted} />
                <Text style={[type.caption, { color: palette.inkMuted, flex: 1 }]} numberOfLines={1}>Nothing to undo yet</Text>
              </View>
            ) : (
              <View style={{ flexDirection: "row", gap: space.sm }}>
                {/* Undo gets a bright primary outline so it reads clearly against the dark-green fill (QA: was dim). */}
                <Button label="Undo" variant="secondary" icon="undo" onPress={undo} style={{ flex: 1, borderColor: palette.primary }} />
                <Button label="Edit ball" variant="secondary" icon="edit" onPress={() => setEditFlowOpen(true)} style={{ flex: 1 }} />
              </View>
            )}
          </>
        )}
      </View>

      <WicketSheet
        visible={wicketOpen}
        onClose={() => setWicketOpen(false)}
        playerName={playerName}
        strikerId={sum.strikerId}
        nonStrikerId={sum.nonStrikerId}
        oneBatter={match.rules.oneBatter}
        fielders={bowlerIds}
        toBat={toBat}
        freeHit={sum.freeHitNext}
        onCommit={(w) => {
          setWicketOpen(false);
          score({ runs: w.runs, wicket: w.wicket, dismissedEnd: w.dismissedEnd, fielder: w.fielder, incoming: w.incoming, extra: w.extra });
          // Wrong wicket? A top toast (clear of the keypad) with a one-tap Undo — the confirmation + instant reversal
          // the best scorers offer after an OUT (QA design review #3).
          toast("Wicket recorded", { label: "Undo", onPress: undo }, { top: true });
        }}
      />

      <Sheet visible={cardOpen} title="Scorecard & charts" scroll={false} onClose={() => setCardOpen(false)}>
        {/* The scorecard/charts replay the whole log; only build them while the sheet is actually open so repeated
            scoring behind a closed sheet never pays for them (soak ANR). */}
        {cardOpen ? (
          <>
            <Segmented
              options={[{ value: "card", label: "Scorecard" }, { value: "charts", label: "Charts" }]}
              value={cardTab}
              onChange={(v) => setCardTab(v)}
            />
            <ScrollView style={{ maxHeight: 500 }} showsVerticalScrollIndicator={false}>
              {cardTab === "card" ? (
                <ScorecardView match={match} teamName={teamName} playerName={playerName} />
              ) : (
                <ChartsView match={match} teamName={teamName} />
              )}
            </ScrollView>
          </>
        ) : null}
      </Sheet>

      {/* Fix any ball during the game (edit last ball or an earlier one) — undo's partner. */}
      <BallEditFlow match={match} visible={editFlowOpen} playerName={playerName} teamPlayers={teamPlayers} onClose={() => setEditFlowOpen(false)} onSave={saveEdit} />
      <EditBallSheet editing={editOne} match={match} playerName={playerName} teamPlayers={teamPlayers} onClose={() => setEditOne(null)} onSave={(patch) => editOne && saveEdit(editOne.inningsIdx, editOne.seq, patch)} />

      {/* Change the opening bowler before the first ball (scrim'd sheet, slides in). */}
      <Sheet visible={bowlerSheetOpen} title="Opening bowler" onClose={() => setBowlerSheetOpen(false)}>
        <Text style={[type.body, { color: palette.inkSoft }]}>Pick who bowls the first over — you can change this until the first ball.</Text>
        <View style={{ gap: space.sm }}>
          {bowlerIds.map((id) => (
            <Tappable
              key={id}
              label={`Pick ${playerName(id)}`}
              sound="pop"
              onPress={() => { setPickedBowler(id); setBowlerSheetOpen(false); feedback("pop", "select"); }}
              style={[styles.bowlerItem, effectiveBowler === id && styles.bowlerItemOn]}
            >
              <Avatar name={playerName(id)} id={id} size={34} />
              <Text style={[type.bodyStrong, { flex: 1, color: palette.ink }]} numberOfLines={1}>{playerName(id)}</Text>
              {effectiveBowler === id ? <Icon name="check" size={20} color={palette.primary} /> : null}
            </Tappable>
          ))}
        </View>
      </Sheet>

      <Sheet visible={menuOpen} title="Match options" onClose={() => setMenuOpen(false)}>
        <View style={{ gap: space.sm }}>
          <Button label="Share scorecard card" variant="secondary" icon="share" onPress={() => { setMenuOpen(false); setShareOpen(true); }} />
          <Button label="Scorecard & charts" variant="secondary" icon="chart" onPress={() => { setMenuOpen(false); setCardTab("card"); setCardOpen(true); }} />
          <Button label="Rename teams & players" variant="secondary" icon="edit" onPress={() => { setMenuOpen(false); setRenameOpen(true); }} />
          <Button label="Edit a ball" variant="secondary" icon="edit" onPress={() => { setMenuOpen(false); setEditFlowOpen(true); }} />
          <Button label="Edit history" variant="secondary" icon="clock" onPress={() => { setMenuOpen(false); setHistoryOpen(true); }} />
          <Button label="End this innings" variant="ghost" onPress={() => { setMenuOpen(false); endInnings(); }} />
          <Button label="Abandon match" variant="danger" onPress={() => { setMenuOpen(false); abandon(); }} />
        </View>
      </Sheet>

      {/* Share the live scorecard as a card to the group — reachable mid-match, not only after the result. */}
      <ShareCardSheet visible={shareOpen} match={match} teamName={teamName} playerName={playerName} from="scorer" onClose={() => setShareOpen(false)} />

      {/* A lasting record of every correction, reachable mid-match (opens automatically after a fix) — the audit
          trail the QA tester couldn't find after editing a ball. Each row shows the before → after in plain cricket. */}
      <EditHistorySheet visible={historyOpen} matchId={matchId} audit={app.audit} onEdit={() => { setHistoryOpen(false); setEditFlowOpen(true); }} onClose={() => setHistoryOpen(false)} />

      <RenameSheet
        visible={renameOpen}
        onClose={() => setRenameOpen(false)}
        teamA={teamById(app, match.teamAId)}
        teamB={teamById(app, match.teamBId)}
        playerName={playerName}
        onSaveTeam={(id, name) => commit((s) => renameTeam(s, id, name))}
        onSavePlayer={(id, name) => commit((s) => renamePlayer(s, id, name))}
      />

      {flash ? <FlashBanner text={flash} topOffset={insets.top + space.xs} /> : null}
      {/* A short, high burst over the hero header — kept clear of the last-ball result in the tracker below (QA).
          Skipped in screenshot mode: a full-screen hardware Skia <Canvas> reads back BLACK under Android's
          screenshot/PixelCopy path, which blanked the entire store "score" capture (the real app is unaffected). */}
      {screenshot ? null : <Confetti trigger={burst} count={40} origin={confettiOrigin} />}
    </View>
  );
}

/** A brief celebratory banner (e.g. "First ball!") pinned to the TOP strip — never over the last-ball result in the
 *  tracker (QA: the pill + confetti covered the one thing a scorer wants to verify). Pops in, auto-dismissed. */
function FlashBanner({ text, topOffset }: { text: string; topOffset: number }) {
  const scale = useSharedValue(0.6);
  const op = useSharedValue(0);
  useEffect(() => {
    scale.value = withSequence(withSpring(1.08, springs.pop), withSpring(1, springs.pop));
    op.value = withTiming(1, { duration: 140 });
  }, [scale, op]);
  const style = useAnimatedStyle(() => ({ opacity: op.value, transform: [{ scale: scale.value }] }));
  return (
    <View style={[styles.flashWrap, { paddingTop: topOffset }]} pointerEvents="none">
      <Animated.View style={[styles.flashPill, style]}>
        <Text style={styles.flashTxt} numberOfLines={1}>{text}</Text>
      </Animated.View>
    </View>
  );
}

/** A quick "+N" (or "W") that pops over the top-centre of the score header on every ball and floats up as it fades —
 *  an immediate, rewarding confirmation the tap registered. pointerEvents none so it never blocks the keypad. */
function FloatingDelta({ runs, wicket, tick }: { runs: number; wicket: boolean; tick: number }) {
  const op = useSharedValue(0);
  const ty = useSharedValue(0);
  const sc = useSharedValue(0.7);
  useEffect(() => {
    op.value = withSequence(withTiming(1, { duration: 90 }), withTiming(1, { duration: 260 }), withTiming(0, { duration: 260 }));
    ty.value = 0;
    ty.value = withTiming(-26, { duration: 620 });
    sc.value = withSequence(withSpring(1.1, springs.pop), withSpring(1, springs.pop));
  }, [tick, op, ty, sc]);
  const style = useAnimatedStyle(() => ({ opacity: op.value, transform: [{ translateY: ty.value }, { scale: sc.value }] }));
  const label = wicket ? "WICKET" : `+${runs}`;
  const bg = wicket ? palette.danger : runs >= 6 ? palette.accent : palette.onPrimary;
  const fg = wicket ? palette.onPrimary : runs >= 6 ? "#1A1205" : palette.primary;
  return (
    <View style={styles.deltaWrap} pointerEvents="none">
      <Animated.View style={[styles.deltaPill, { backgroundColor: bg }, style]}>
        <Text style={[styles.deltaTxt, { color: fg }]} numberOfLines={1}>{label}</Text>
      </Animated.View>
    </View>
  );
}

/** Rename teams and any player mid-match — the "edit names" affordance behind the header title and the menu. */
function RenameSheet({
  visible,
  onClose,
  teamA,
  teamB,
  playerName,
  onSaveTeam,
  onSavePlayer,
}: {
  visible: boolean;
  onClose: () => void;
  teamA?: ReturnType<typeof teamById>;
  teamB?: ReturnType<typeof teamById>;
  playerName: (id: Id | null | undefined) => string;
  onSaveTeam: (id: Id, name: string) => void;
  onSavePlayer: (id: Id, name: string) => void;
}) {
  return (
    <Sheet visible={visible} title="Rename" scroll={false} onClose={onClose}>
      <Text style={[type.caption, { color: palette.inkSoft }]}>Fix a team or player name — stats and every ball already scored stay attached.</Text>
      <ScrollView style={{ maxHeight: 460 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={{ gap: space.md }}>
          {teamA ? <TeamRename key={teamA.id} team={teamA} playerName={playerName} onSaveTeam={onSaveTeam} onSavePlayer={onSavePlayer} /> : null}
          {teamB ? <TeamRename key={teamB.id} team={teamB} playerName={playerName} onSaveTeam={onSaveTeam} onSavePlayer={onSavePlayer} /> : null}
        </View>
      </ScrollView>
    </Sheet>
  );
}

function TeamRename({
  team,
  playerName,
  onSaveTeam,
  onSavePlayer,
}: {
  team: NonNullable<ReturnType<typeof teamById>>;
  playerName: (id: Id | null | undefined) => string;
  onSaveTeam: (id: Id, name: string) => void;
  onSavePlayer: (id: Id, name: string) => void;
}) {
  const [name, setName] = useState(team.name);
  return (
    <View style={styles.renameCard}>
      <TextField
        label="Team name"
        value={name}
        onChangeText={setName}
        onBlur={() => { const n = name.trim(); if (n && n !== team.name) { onSaveTeam(team.id, n); feedback("pop", "light"); } }}
        maxLength={40}
        autoCapitalize="words"
        autoCorrect={false}
      />
      <Text style={[type.overline, { color: palette.inkMuted, marginTop: 2 }]}>Players</Text>
      {team.playerIds.map((pid) => (
        <PlayerRename key={pid} id={pid} initial={playerName(pid)} onSave={onSavePlayer} />
      ))}
    </View>
  );
}

function PlayerRename({ id, initial, onSave }: { id: Id; initial: string; onSave: (id: Id, name: string) => void }) {
  const [name, setName] = useState(initial);
  return (
    <TextField
      label={initial}
      value={name}
      onChangeText={setName}
      onBlur={() => { const n = name.trim(); if (n && n !== initial) { onSave(id, n); feedback("pop", "light"); } }}
      maxLength={40}
      autoCapitalize="words"
      autoCorrect={false}
    />
  );
}

/** Plain-cricket one-liner for a ball event, used in the correction trail. */
function describeBall(e: BallEvent): string {
  const bits: string[] = [];
  if (e.extra && e.extra !== "none") bits.push(labelForExtra(e.extra));
  if (e.wicket && e.wicket !== "none") bits.push("wicket");
  const bdy = e.boundary === "four" ? " (four)" : e.boundary === "six" ? " (six)" : "";
  bits.push(`${e.runs} run${e.runs === 1 ? "" : "s"}${bdy}`);
  return bits.join(" · ");
}

function safeEvent(json: string): BallEvent | null {
  try {
    return JSON.parse(json) as BallEvent;
  } catch {
    return null;
  }
}

/**
 * Correction history for THIS match — every edited ball with its before → after, newest first. Reachable from the
 * Match options menu and opened automatically right after a fix, so a correction always lands a lasting, findable
 * result (QA: after "Ball fixed ✓" the tester hunted every sheet for an audit trail and couldn't find one).
 */
function EditHistorySheet({ visible, matchId, audit, onEdit, onClose }: {
  visible: boolean;
  matchId: Id;
  audit: AuditEntry[];
  onEdit: () => void;
  onClose: () => void;
}) {
  const mine = audit
    .filter((a) => a.entity === "ball" && a.entityId.startsWith(`${matchId}:`))
    .sort((a, b) => b.ts - a.ts);
  return (
    <Sheet visible={visible} title="Edit history" onClose={onClose}>
      <Text style={[type.caption, { color: palette.inkSoft }]}>
        Every correction is logged here with its before and after — totals, partnerships and stats recalculate, and nothing is ever lost.
      </Text>
      {mine.length === 0 ? (
        <View style={styles.histEmpty}>
          <Icon name="clock" size={28} color={palette.inkMuted} />
          <Text style={[type.body, { textAlign: "center" }]}>No corrections yet</Text>
          <Text style={[type.caption, { textAlign: "center", color: palette.inkSoft }]}>Fix a ball's runs, extras or wicket and it shows up here.</Text>
        </View>
      ) : (
        <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
          <View style={{ gap: space.sm }}>
            {mine.map((a) => {
              const before = safeEvent(a.before);
              const after = safeEvent(a.after);
              return (
                <View key={a.id} style={styles.histRow}>
                  <View style={styles.histIcon}><Icon name="edit" size={15} color={palette.primary} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={type.bodyStrong} numberOfLines={1}>Ball corrected</Text>
                    <Text style={[type.caption, { color: palette.inkSoft }]} numberOfLines={2}>
                      {before ? describeBall(before) : "—"} → {after ? describeBall(after) : "—"}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </ScrollView>
      )}
      <Button label="Edit a ball" icon="edit" onPress={onEdit} />
    </Sheet>
  );
}

function maybeFlip<T>(arr: T[], flip: boolean): T[] {
  return flip ? [...arr].reverse() : arr;
}

function labelForExtra(e: ExtraType): string {
  return e === "wide" ? "Wide" : e === "noball" ? "No ball" : e === "bye" ? "Bye" : e === "legbye" ? "Leg bye" : "";
}

type OverCell = { label: string; danger?: boolean; gold?: boolean; extra?: boolean; seq: number };
type OverData = { cells: OverCell[]; ballNo: number };

function thisOver(inn: Match["innings"][number], rules: Match["rules"], totalLegal: number): OverData {
  // Only the CURRENT over is shown, so walk BACKWARD from the end collecting just that over's events instead of
  // grouping the whole innings every ball — the old full scan grew with the innings and fed the soak ANR (QA no_anr).
  const bpo = rules.ballsPerOver;
  const legalOf = (e: Match["innings"][number]["events"][number]) =>
    e.extra === "wide" ? !rules.wideReBall : e.extra === "noball" ? !rules.noBallReBall : true;
  const legalThisOver = totalLegal % bpo;
  // How many legal balls the current over holds: a just-completed over keeps all `bpo`, an in-progress one keeps
  // what's been bowled, and an all-extras first over keeps everything (0 legal).
  const targetLegal = totalLegal === 0 ? 0 : legalThisOver === 0 ? bpo : legalThisOver;
  const events = inn.events;
  const cells: OverCell[] = [];
  let legalSeen = 0;
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    const isLegal = legalOf(e);
    // The next legal ball back belongs to the PREVIOUS over — stop before adding it.
    if (isLegal && legalSeen >= targetLegal) break;
    cells.push({ label: ballLabel(e), danger: e.wicket !== "none", gold: e.boundary !== "none", extra: e.extra !== "none", seq: i });
    if (isLegal) legalSeen += 1;
  }
  cells.reverse();
  // ballNo = next legal ball of this over (1..bpo); derived from legal-balls modulo.
  const ballNo = (totalLegal % bpo) + 1;
  return { cells: cells.slice(-10), ballNo };
}

/** Hero score that gives a quick scale "bump" every time the total changes — a visible beat for each ball. */
function BumpScore({ runs, wickets }: { runs: number; wickets: number }) {
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = withSequence(withTiming(1.12, { duration: 90 }), withSpring(1, springs.pop));
  }, [runs, wickets, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.Text style={[type.hero, { color: gradient.onHero, alignSelf: "flex-start" }, style]} numberOfLines={1} adjustsFontSizeToFit>
      {runs}/{wickets}
    </Animated.Text>
  );
}

/** One ball dot in the over strip. The newest ball pops in via a shared value on mount (not a keyed `entering=`
 *  layout animation, which can stick blank on Android); it starts from a visible floor, so it never flashes empty. */
function BallDot({ cell, isNew, onTap }: { cell: OverCell; isNew: boolean; onTap: (cell: OverCell) => void }) {
  const scale = useSharedValue(isNew ? 0.5 : 1);
  const op = useSharedValue(isNew ? 0.4 : 1);
  useEffect(() => {
    if (isNew) {
      scale.value = withSpring(1, springs.pop);
      op.value = withTiming(1, { duration: 140 });
    }
    // Mount only: a dot pops once when its ball is added, never again on later re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const style = useAnimatedStyle(() => ({ opacity: op.value, transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={style}>
      <Tappable label={`Fix ball ${cell.label}`} sound={null} scale={0.9} onPress={() => onTap(cell)} style={[styles.trackDot, cell.extra && !cell.danger && !cell.gold && styles.trackExtra, cell.danger && styles.trackDanger, cell.gold && styles.trackGold]}>
        <Text style={[styles.trackDotTxt, cell.extra && !cell.danger && !cell.gold && { color: palette.warning }, (cell.danger || cell.gold) && { color: "#1A1205" }]} numberOfLines={1}>{cell.label}</Text>
      </Tappable>
    </Animated.View>
  );
}

/** This-over tracker: current bowler, big ball dots (tap to fix a ball) and the next-ball prompt. Sits under the score. */
function ThisOverTracker({ over, ballsPerOver, freeHit, scorer, bowlerLabel, strikerLabel, onTapBall, onChangeBowler, onUndo }: { over: OverData; ballsPerOver: number; freeHit?: boolean; scorer?: string | null; bowlerLabel: string; strikerLabel: string; onTapBall: (cell: OverCell) => void; onChangeBowler?: () => void; onUndo?: () => void }) {
  const last = over.cells.length - 1;
  // Pad the strip with hollow "upcoming" dots so this over always reads as a full ball-by-ball tracker
  // (• • • • • •), not an empty gap before the first ball. A clean over shows exactly ballsPerOver slots.
  const upcoming = Math.max(0, ballsPerOver - over.cells.length);
  return (
    <View style={styles.trackCard}>
      {/* Over + bowler are the orientation a scorer checks before every ball, so they lead the card: a tinted ball
          badge, an overline, the bowler in bodyStrong, and the live ball count as a bright primary pill (QA: the
          header/bowler read as low-hierarchy). */}
      <View style={styles.trackHead}>
        <View style={styles.trackBallBadge}><Icon name="ball" size={16} color={palette.primary} /></View>
        <View style={{ flex: 1 }}>
          <Text style={[type.overline, { color: palette.inkMuted }]} numberOfLines={1}>This over · bowling</Text>
          <Text style={[type.bodyStrong, { color: palette.ink }]} numberOfLines={1}>{bowlerLabel}</Text>
        </View>
        <Pill label={`Ball ${over.ballNo}/${ballsPerOver}`} tone="primary" />
      </View>
      <View style={styles.strikerRow}>
        <Text style={[type.caption, { color: palette.inkSoft, flex: 1 }]} numberOfLines={1}>{strikerLabel}</Text>
        {/* Change bowler is a real, labelled affordance (not a cryptic low-contrast "Change") but sits BELOW the
            bowler line so it never outranks the score itself. */}
        {onChangeBowler ? (
          <Tappable label="Change bowler" sound="pop" onPress={onChangeBowler} style={styles.changeBowler}>
            <Icon name="swap" size={13} color={palette.primary} />
            <Text style={[type.caption, { color: palette.primary }]}>Change bowler</Text>
          </Tappable>
        ) : null}
      </View>

      {/* Big, PERSISTENT last-ball result — the confirmation a scorer (and a QA still frame) can't miss.
          It pops on every ball; before the first ball it's a clear "ready" prompt, so the middle is never dead. */}
      {over.cells.length ? <LastBall cell={over.cells[last]} scorer={scorer} onUndo={onUndo} /> : <FirstBallPrompt />}

      <View style={styles.trackStrip}>
        {over.cells.map((c, i) => (
          // The newest ball pops in — a clear, satisfying "that ball was recorded" beat for every tap. Driven by a
          // shared value on a stable (keyed) View, NOT a keyed `entering=` layout animation, which can stick blank on
          // Android (QA keyed-entering pitfall). The pop starts from a visible floor so it never flashes blank.
          <BallDot key={c.seq} cell={c} isNew={i === last} onTap={onTapBall} />
        ))}
        {Array.from({ length: upcoming }).map((_, i) => (
          // The very NEXT slot carries the free-hit marker ("FH", amber) so the over strip itself shows the free hit,
          // not just the banner above (QA: "no free-hit indicator on the over view").
          i === 0 && freeHit ? (
            <View key={`up-${i}`} style={[styles.trackDot, styles.trackFH]} accessible accessibilityLabel="Next ball is a free hit">
              <Text style={styles.trackFHTxt} numberOfLines={1}>FH</Text>
            </View>
          ) : (
            <View key={`up-${i}`} style={[styles.trackDot, styles.trackDotEmpty]} accessible={false}>
              <View style={styles.trackDotPip} />
            </View>
          )
        ))}
      </View>
    </View>
  );
}

/** Map the last ball's compact label into a big figure + a shout-word, coloured by what happened. */
function lastBallDisplay(cell: OverCell): { big: string; word: string; tone: "gold" | "danger" | "dot" | "normal" } {
  const l = cell.label;
  if (cell.danger) return { big: "W", word: "WICKET!", tone: "danger" };
  if (/wd$/.test(l)) return { big: l.toUpperCase(), word: "WIDE", tone: "normal" };
  if (/nb$/.test(l)) return { big: l.toUpperCase(), word: "NO BALL", tone: "normal" };
  if (cell.gold) return l === "6" ? { big: "6", word: "SIX!", tone: "gold" } : { big: "4", word: "FOUR!", tone: "gold" };
  if (/lb$/.test(l)) return { big: l, word: "LEG BYE", tone: "normal" };
  if (/b$/.test(l)) return { big: l, word: "BYE", tone: "normal" };
  if (l === "0") return { big: "0", word: "DOT BALL", tone: "dot" };
  const n = Number(l) || 0;
  return { big: l, word: `${n} RUN${n === 1 ? "" : "S"}`, tone: "normal" };
}

/** The last ball recorded, shown big and bold, naming who faced it ("1 RUN · Aarav"). Scales-pop on each new ball.
 *  Doubles as the undo snackbar: a persistent, one-tap "Undo" sits on the result so a mis-tap is reversed instantly
 *  without a transient toast (QA design review #1 — a visible, dismissable undo after every ball). */
function LastBall({ cell, scorer, onUndo }: { cell: OverCell; scorer?: string | null; onUndo?: () => void }) {
  const d = lastBallDisplay(cell);
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = withSequence(withTiming(1.16, { duration: 110 }), withSpring(1, springs.pop));
  }, [cell.seq, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const bg = d.tone === "gold" ? palette.accent : d.tone === "danger" ? palette.danger : d.tone === "dot" ? palette.surfaceAlt : palette.primarySoft;
  const fg = d.tone === "gold" || d.tone === "danger" ? "#1A1205" : d.tone === "dot" ? palette.inkSoft : palette.primary;
  const wordColor = d.tone === "danger" ? palette.danger : d.tone === "gold" ? palette.accent : palette.ink;
  return (
    <View style={styles.lastRow} accessible accessibilityLabel={`Last ball: ${d.word}${scorer ? `, ${scorer}` : ""}`}>
      <Animated.View style={[styles.lastBadge, { backgroundColor: bg }, style]}>
        <Text style={[styles.lastBadgeTxt, { color: fg }]} numberOfLines={1} adjustsFontSizeToFit>{d.big}</Text>
      </Animated.View>
      <View style={{ flex: 1 }}>
        <Text style={[type.overline, { color: palette.inkMuted }]}>Last ball{scorer ? ` · ${scorer}` : ""}</Text>
        <Text style={[type.title, { color: wordColor }]} numberOfLines={1} adjustsFontSizeToFit>{d.word}</Text>
      </View>
      {onUndo ? (
        <Tappable label="Undo the last ball" sound="pop" onPress={() => { feedback("pop", "light"); onUndo(); }} style={styles.lastUndo}>
          <Icon name="undo" size={15} color={palette.primary} />
          <Text style={[type.caption, { color: palette.primary }]}>Undo</Text>
        </Tappable>
      ) : null}
    </View>
  );
}

/** A loud, full-width FREE HIT banner shown above the over tracker whenever a no-ball has armed one. It gently
 *  pulses so a scorer can't miss it before the next delivery, and spells out the rule (only a run-out counts). */
function FreeHitBanner() {
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = withSequence(withTiming(1.03, { duration: 260 }), withSpring(1, springs.pop));
  }, [pulse]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  return (
    <Animated.View style={[styles.fhBanner, style]} accessible accessibilityLabel="Free hit — only a run-out counts on the next ball">
      <View style={styles.fhBadge}><Text style={styles.fhBadgeTxt} numberOfLines={1}>FREE HIT</Text></View>
      <Text style={[type.bodyStrong, { color: "#1A1205", flex: 1 }]} numberOfLines={2}>
        Next ball — only a run-out counts
      </Text>
    </Animated.View>
  );
}

/** Before the first ball of an over: a calm, visible prompt so the panel is never empty. */
function FirstBallPrompt() {
  return (
    <View style={styles.lastRow}>
      <View style={[styles.lastBadge, { backgroundColor: palette.surfaceAlt }]}>
        <Icon name="play" size={26} color={palette.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[type.overline, { color: palette.inkMuted }]}>Ready</Text>
        <Text style={[type.title, { color: palette.ink }]} numberOfLines={2}>Tap the runs to score each ball</Text>
      </View>
    </View>
  );
}

/** Opening / new-over bowler picker: a styled list with avatars, a preselected default and a one-tap confirm. */
function BowlerPicker({ opening, choices, playerName, onConfirm, soloNote }: { opening: boolean; choices: Id[]; playerName: (id: Id | null | undefined) => string; onConfirm: (id: Id) => void; soloNote: boolean }) {
  const [sel, setSel] = useState<Id | null>(choices[0] ?? null);
  const pick = sel && choices.includes(sel) ? sel : choices[0] ?? null;
  return (
    <View style={styles.pickerWrap}>
      <View style={styles.pickerCard}>
        <Text style={[type.overline, { color: palette.inkSoft }]}>{opening ? "Start the innings" : "New over"}</Text>
        <Text style={type.title}>{opening ? "Opening bowler" : "Who bowls this over?"}</Text>
        <View style={{ gap: space.sm, marginTop: space.xs }}>
          {choices.map((id) => (
            <Tappable
              key={id}
              label={`Pick ${playerName(id)}`}
              sound="pop"
              onPress={() => { setSel(id); feedback("pop", "select"); }}
              style={[styles.bowlerItem, pick === id && styles.bowlerItemOn]}
            >
              <Avatar name={playerName(id)} id={id} size={34} />
              <Text style={[type.bodyStrong, { flex: 1, color: palette.ink }]} numberOfLines={1}>{playerName(id)}</Text>
              {pick === id ? <Icon name="check" size={20} color={palette.primary} /> : null}
            </Tappable>
          ))}
        </View>
        {soloNote ? <Text style={[type.caption, { color: palette.inkMuted }]}>Only one bowler available — add players to rotate.</Text> : null}
      </View>
      <Button label="Start this over" size="lg" icon="play" disabled={!pick} onPress={() => pick && onConfirm(pick)} />
    </View>
  );
}

/** One batter's row in the hero mini-table — name + aligned R / B / 4s / 6s / SR columns, like the best scorers show. */
function BatRow({ name, runs, balls, fours, sixes, on }: { name: string; runs: number; balls: number; fours: number; sixes: number; on?: boolean }) {
  const sr = balls > 0 ? Math.round((runs / balls) * 100) : 0;
  return (
    <View style={styles.batRow}>
      <Text style={[type.bodyStrong, styles.cBat, { color: gradient.onHero }]} numberOfLines={1}>
        {on ? "➤ " : "   "}{name}
      </Text>
      <Text style={[styles.statTxt, styles.cStat, { color: gradient.onHero }]}>{runs}</Text>
      <Text style={[styles.statTxt, styles.cStat, { color: gradient.onHeroSoft }]}>{balls}</Text>
      <Text style={[styles.statTxt, styles.cStat, { color: gradient.onHeroSoft }]}>{fours}</Text>
      <Text style={[styles.statTxt, styles.cStat, { color: gradient.onHeroSoft }]}>{sixes}</Text>
      <Text style={[styles.statTxt, styles.cSR, { color: balls > 0 ? gradient.onHero : gradient.onHeroSoft }]}>{balls > 0 ? sr : "–"}</Text>
    </View>
  );
}

function RunKey({ label, onPress, big, tone, pressFill }: { label: string; onPress: () => void; big?: boolean; tone?: string; pressFill?: string }) {
  return (
    // A deeper scale-down (0.93) + a native ripple (clipped to the rounded edge by overflow:hidden so it's never an
    // uneven smudge) + a strong, saturated fill on press so a tap gets an instant, unmistakable "full-button"
    // answer within 100ms that is obvious even in a single still frame (QA: run keys showed no pressed state).
    <Tappable label={`Score ${label}`} sound={null} onPress={onPress} scale={0.93} fill={palette.surface} fillActive={pressFill ?? palette.primary + "73"} style={[styles.key, big && styles.keyBig, tone ? { borderColor: tone } : null]}>
      <Text style={[type.number, { color: tone ?? palette.ink, fontSize: big ? 30 : 26 }]}>{label}</Text>
    </Tappable>
  );
}

function StatePanel({ title, body, action }: { title: string; body: string; action: React.ReactNode }) {
  return (
    <View style={styles.statePanel}>
      <Text style={[type.title, { textAlign: "center" }]}>{title}</Text>
      {body ? <Text style={[type.body, { color: palette.inkSoft, textAlign: "center" }]}>{body}</Text> : null}
      {action}
    </View>
  );
}

// ---- score-only mode ------------------------------------------------------
function ScoreOnly({ match, teamName, nav }: { match: Match; teamName: (id: Id | null | undefined) => string; nav: ReturnType<typeof useNav> }) {
  const insets = useSafeAreaInsets();
  const idx = match.innings.length - 1;
  const inn = match.innings[idx];
  const totals = inn.scoreOnly ?? { runs: 0, wickets: 0, balls: 0 };
  const bpo = match.rules.ballsPerOver;
  const set = (patch: Partial<typeof totals>) => appStore.set((s) => setScoreOnlyTotals(s, match.id, { ...totals, ...patch }));
  const complete = match.status === "complete";
  const inningsBreak = match.status === "innings_break";
  const overs = `${Math.floor(totals.balls / bpo)}.${totals.balls % bpo}`;

  return (
    <View style={styles.root}>
      <View style={[styles.topbar, { paddingTop: insets.top + space.xs }]}>
        <IconButton icon="chevronLeft" label="Back to home" onPress={() => nav.reset()} />
        <Text style={[type.label, { flex: 1, textAlign: "center" }]} numberOfLines={1}>{teamName(match.teamAId)} v {teamName(match.teamBId)}</Text>
        <View style={{ width: 40 }} />
      </View>
      <LinearGradient colors={gradient.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
        <Text style={[type.overline, { color: gradient.onHeroSoft }]}>{teamName(inn.battingTeamId)} · score-only</Text>
        <Text style={[type.hero, { color: gradient.onHero }]}>{totals.runs}/{totals.wickets}</Text>
        <Text style={[type.label, { color: gradient.onHeroSoft }]}>{overs} overs{inn.target != null ? ` · target ${inn.target}` : ""}</Text>
      </LinearGradient>
      <View style={styles.body}>
        {complete ? (
          <StatePanel title="Match complete" body={match.result?.summary ?? ""} action={<Button label="See result & share" size="lg" icon="share" onPress={() => nav.replace({ t: "result", matchId: match.id })} />} />
        ) : inningsBreak ? (
          <StatePanel title="Innings break" body={`Target ${(match.innings[0].scoreOnly?.runs ?? 0) + 1}.`} action={<Button label="Start 2nd innings" size="lg" icon="play" onPress={() => appStore.set((s) => startSecondInnings(s, match.id))} />} />
        ) : (
          <>
            <View style={{ flexDirection: "row", gap: space.sm }}>
              {[1, 2, 4, 6].map((r) => (
                <Tappable key={r} label={`Add ${r} runs`} sound="tap" fill={palette.surface} fillActive={palette.surfaceAlt} onPress={() => { feedback("tap", "light"); set({ runs: totals.runs + r, balls: totals.balls + 1 }); }} style={styles.key}>
                  <Text style={[type.number, { fontSize: 24 }]}>+{r}</Text>
                </Tappable>
              ))}
            </View>
            <Stepper label="Total runs" value={totals.runs} min={0} max={9999} onChange={(v) => set({ runs: v })} />
            <Stepper label="Wickets" value={totals.wickets} min={0} max={match.rules.wickets} onChange={(v) => set({ wickets: v })} />
            <Stepper label="Balls bowled" value={totals.balls} min={0} max={9999} onChange={(v) => set({ balls: v })} />
            <Button label="End innings" size="lg" onPress={() => { feedback("success", "medium"); appStore.set((s) => declareInnings(s, match.id)); }} />
          </>
        )}
      </View>
    </View>
  );
}

// ---- wicket sheet ---------------------------------------------------------
function WicketSheet({
  visible,
  onClose,
  playerName,
  strikerId,
  nonStrikerId,
  oneBatter,
  fielders,
  toBat,
  freeHit,
  onCommit,
}: {
  visible: boolean;
  onClose: () => void;
  playerName: (id: Id | null | undefined) => string;
  strikerId: Id | null;
  nonStrikerId: Id | null;
  oneBatter: boolean;
  fielders: Id[];
  toBat: Id[];
  freeHit: boolean;
  onCommit: (w: { wicket: WicketType; runs: number; dismissedEnd: "striker" | "nonstriker"; fielder: Id | null; incoming: Id | null; extra: ExtraType }) => void;
}) {
  const [wicket, setWicket] = useState<WicketType>("bowled");
  const [fielder, setFielder] = useState<Id | null>(null);
  const [incoming, setIncoming] = useState<Id | null>(null);
  const [end, setEnd] = useState<"striker" | "nonstriker">("striker");
  // Free hit: only run-outs are allowed. Snap the selection to "run out" the moment the sheet opens on a free hit —
  // otherwise the default "bowled" state fails the core free-hit guard on Confirm and the OUT button dead-ends (QA).
  useEffect(() => {
    if (visible && freeHit) setWicket("runout");
  }, [visible, freeHit]);
  const def = WICKETS.find((w) => w.key === wicket);
  const allowed = freeHit ? WICKETS.filter((w) => w.key === "runout") : WICKETS;
  const incomingChoices = toBat;

  const commit = () => {
    if (def?.needsFielder && !fielder) { feedback("error", "warning"); return toast("Pick the fielder."); }
    onCommit({ wicket, runs: 0, dismissedEnd: wicket === "runout" ? end : "striker", fielder, incoming: incomingChoices.length ? incoming ?? incomingChoices[0] : null, extra: "none" });
    setWicket("bowled"); setFielder(null); setIncoming(null); setEnd("striker");
  };

  return (
    <Sheet visible={visible} title="Wicket" onClose={onClose}>
      {freeHit ? <Pill label="Free hit — only a run-out counts" tone="warning" /> : null}
      <Text style={type.label}>How out?</Text>
      <View style={styles.chips}>
        {allowed.map((w) => (
          <Chip key={w.key} label={w.label} selected={wicket === w.key} onPress={() => { setWicket(w.key); if (!WICKETS.find((x) => x.key === w.key)?.needsFielder) setFielder(null); }} />
        ))}
      </View>
      {wicket === "runout" && !oneBatter ? (
        <>
          <Text style={type.label}>Who was run out?</Text>
          <View style={styles.chips}>
            <Chip label={`${playerName(strikerId)} (striker)`} selected={end === "striker"} onPress={() => setEnd("striker")} />
            <Chip label={`${playerName(nonStrikerId)} (non-striker)`} selected={end === "nonstriker"} onPress={() => setEnd("nonstriker")} />
          </View>
        </>
      ) : null}
      {def?.needsFielder ? (
        <>
          <Text style={type.label}>Fielder</Text>
          <View style={styles.chips}>
            {fielders.map((id) => (
              <Chip key={id} label={playerName(id)} selected={fielder === id} onPress={() => setFielder(id)} />
            ))}
          </View>
        </>
      ) : null}
      {incomingChoices.length ? (
        <>
          <Text style={type.label}>Next batter</Text>
          <View style={styles.chips}>
            {incomingChoices.map((id) => (
              <Chip key={id} label={playerName(id)} selected={(incoming ?? incomingChoices[0]) === id} onPress={() => setIncoming(id)} />
            ))}
          </View>
        </>
      ) : (
        <Text style={type.caption}>No batters left — this ends the innings.</Text>
      )}
      <Button label="Confirm wicket" size="lg" variant="danger" icon="check" onPress={commit} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
  topbar: { flexDirection: "row", alignItems: "center", paddingHorizontal: space.sm, paddingBottom: space.xs, gap: 2 },
  titleTap: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, minHeight: 40 },
  // A reserved min-height keeps the gradient header the same size whether or not the chase / free-hit lines show,
  // so entering the scorer (e.g. from Quick Start) doesn't jump the body ~30px (QA).
  header: { marginHorizontal: space.lg, borderRadius: radius.xl, padding: space.lg, gap: space.md, minHeight: 206 },
  scoreRow: { flexDirection: "row", alignItems: "flex-start" },
  mini: { gap: 3, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(255,255,255,0.2)", paddingTop: space.sm },
  tableHead: { flexDirection: "row", alignItems: "center", marginBottom: 1 },
  batRow: { flexDirection: "row", alignItems: "center" },
  cBat: { flex: 1 },
  cStat: { width: 30, textAlign: "right" },
  cSR: { width: 42, textAlign: "right" },
  statTxt: { fontFamily: type.amount.fontFamily, fontSize: 14, lineHeight: 20, fontVariant: ["tabular-nums"] },
  miniDivider: { height: StyleSheet.hairlineWidth, backgroundColor: "rgba(255,255,255,0.18)", marginVertical: 3 },
  bowlerRow: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: 2 },
  targetBox: { alignItems: "flex-end", gap: 1, backgroundColor: "rgba(0,0,0,0.14)", borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 5 },
  pshipRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm, minHeight: 16 },
  freeHit: { backgroundColor: palette.accent, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  freeHitTxt: { fontFamily: type.overline.fontFamily, fontSize: 11, color: "#1A1205", letterSpacing: 0.6 },
  fhBanner: { flexDirection: "row", alignItems: "center", gap: space.sm, backgroundColor: palette.accent, borderRadius: radius.lg, paddingHorizontal: space.md, paddingVertical: 10 },
  fhBadge: { backgroundColor: "#1A1205", borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  fhBadgeTxt: { fontFamily: type.overline.fontFamily, fontSize: 12, color: palette.accent, letterSpacing: 1 },
  trackFH: { backgroundColor: palette.accent, borderColor: palette.accent },
  trackFHTxt: { fontFamily: type.overline.fontFamily, fontSize: 12, color: "#1A1205", letterSpacing: 0.5 },
  body: { flex: 1, paddingHorizontal: space.lg, paddingTop: space.md, gap: space.md, justifyContent: "flex-end", paddingBottom: space.xl },
  // The tracker takes the leftover space above the fixed keypad; its content scrolls when the screen is short so the
  // ball-dots row can never overflow onto the Extras panel below (QA). flexGrow keeps a short tracker pinned to the top.
  trackWrap: { flex: 1 },
  trackScroll: { gap: space.sm, flexGrow: 1 },
  trackCard: { backgroundColor: palette.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: palette.border, padding: space.md, gap: space.sm },
  trackHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  trackBallBadge: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: palette.primarySoft },
  strikerRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  // A clearly intentional "locked" hint (not a dim disabled button) shown before the first ball — same height as the
  // Undo/Edit button row it replaces, so nothing jumps when the buttons appear (QA ux_polish).
  lockRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm, minHeight: 48, borderRadius: radius.lg, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surfaceAlt, paddingHorizontal: space.md },
  changeBowler: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, height: 30, borderRadius: radius.pill, borderWidth: 1, borderColor: palette.primary, backgroundColor: palette.primarySoft },
  lastRow: { flexDirection: "row", alignItems: "center", gap: space.sm, backgroundColor: palette.surfaceAlt, borderRadius: radius.lg, paddingHorizontal: space.sm, paddingVertical: 6, marginTop: 2 },
  lastBadge: { width: 46, height: 46, borderRadius: radius.md, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  lastUndo: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, height: 32, borderRadius: radius.pill, borderWidth: 1, borderColor: palette.primary, backgroundColor: palette.primarySoft },
  lastBadgeTxt: { fontFamily: type.hero.fontFamily, fontSize: 24, letterSpacing: -0.5 },
  trackStrip: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, alignItems: "center", minHeight: 40 },
  trackDot: { minWidth: 38, height: 38, borderRadius: 19, paddingHorizontal: 6, backgroundColor: palette.surfaceAlt, borderWidth: 1, borderColor: palette.border, alignItems: "center", justifyContent: "center" },
  trackDanger: { backgroundColor: palette.danger, borderColor: palette.danger },
  trackGold: { backgroundColor: palette.accent, borderColor: palette.accent },
  trackExtra: { borderColor: palette.warning, backgroundColor: palette.warning + "22" },
  trackDotTxt: { fontFamily: type.amount.fontFamily, fontSize: 14, color: palette.ink },
  // Hollow "ball still to bowl" placeholder — keeps the over reading as a full 6-dot tracker.
  trackDotEmpty: { backgroundColor: "transparent", borderStyle: "dashed", borderColor: palette.border },
  trackDotPip: { width: 5, height: 5, borderRadius: 3, backgroundColor: palette.inkMuted, opacity: 0.5 },
  pickerWrap: { flex: 1, justifyContent: "center", gap: space.md },
  pickerCard: { backgroundColor: palette.surface, borderRadius: radius.xl, borderWidth: 1, borderColor: palette.border, padding: space.lg, gap: 4 },
  bowlerItem: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 52, paddingHorizontal: space.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: palette.border, backgroundColor: palette.surfaceAlt },
  bowlerItemOn: { borderColor: palette.primary, backgroundColor: palette.primarySoft },
  tipCard: { flexDirection: "row", alignItems: "center", gap: space.sm, backgroundColor: palette.primarySoft, borderRadius: radius.lg, borderWidth: 1, borderColor: palette.primary, padding: space.sm },
  tipIcon: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: palette.surface },
  tipClose: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  extraGroup: { backgroundColor: palette.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: palette.border, padding: space.sm, gap: space.sm },
  extraRow: { flexDirection: "row", gap: space.sm },
  // No static backgroundColor — the Tappable's fill/fillActive animates it (surfaceAlt → green tint on press). A
  // brighter 2dp border + bold label so the extras read as real buttons next to the run keys, not disabled chips (QA).
  extraBtn: { flex: 1, minHeight: 46, borderRadius: radius.md, borderWidth: 2, borderColor: palette.inkMuted, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  extraInner: { flexDirection: "row", alignItems: "center", gap: 4 },
  extraOn: { borderColor: palette.primary },
  grid: { flexDirection: "row", gap: space.sm },
  // backgroundColor comes from the Tappable fill/fillActive (animated press state), not here. overflow:hidden clips
  // the Android ripple to the rounded edge so a press fills cleanly instead of leaving an uneven corner smudge (QA).
  key: { flex: 1, minHeight: 66, borderRadius: radius.lg, borderWidth: 1.5, borderColor: palette.border, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  keyBig: { minHeight: 76 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  statePanel: { backgroundColor: palette.surface, borderRadius: radius.xl, padding: space.xl, gap: space.md, alignItems: "stretch", marginBottom: space.xl },
  renameCard: { backgroundColor: palette.surfaceAlt, borderRadius: radius.lg, borderWidth: 1, borderColor: palette.border, padding: space.md, gap: space.sm },
  histEmpty: { alignItems: "center", gap: 6, paddingVertical: space.xl },
  histRow: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 48, paddingHorizontal: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surfaceAlt },
  histIcon: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: palette.primarySoft },
  deltaWrap: { position: "absolute", top: 6, left: 0, right: 0, alignItems: "center", zIndex: 5 },
  deltaPill: { borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 4, ...shadowStrong },
  deltaTxt: { fontFamily: type.hero.fontFamily, fontSize: 18, letterSpacing: 0.3 },
  flashWrap: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "flex-start" },
  flashPill: { backgroundColor: palette.accent, borderRadius: radius.pill, paddingHorizontal: space.lg, paddingVertical: space.sm, ...shadowStrong },
  flashTxt: { fontFamily: type.hero.fontFamily, fontSize: 22, letterSpacing: 0.4, color: "#1A1205" },
});
