import { useEffect, useMemo } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import Animated, { Easing, interpolateColor, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";

const AnimatedImage = Animated.createAnimatedComponent(Image);
import { BarChart, Button, Card, HeroCard, Icon, ListItem, Pill, ProgressBar, Screen, SectionHeader, Tappable, gradient, palette, radius, shadowStrong, space, type } from "../ui";
import { art } from "../art";
import { KeyVal, SyncChip, useApp, useNames } from "./common";
import { MatchCard } from "./MatchCard";
import { useNav } from "../nav";
import { replay } from "../core/scoring";
import { ballsInInnings } from "../core/rules";
import { ballLabel } from "../core/format";
import type { BallEvent, Match } from "../core/types";
import type { NameOf } from "../core/format";

/** Open the right screen for a match's state. */
export function useOpenMatch() {
  const nav = useNav();
  return (m: Match) => {
    if (m.status === "live" || m.status === "innings_break" || m.status === "setup") nav.push({ t: "scoring", matchId: m.id });
    else nav.push({ t: "match", matchId: m.id });
  };
}

/** Home: resume a live match, start a new one, and see recent matches. */
export function HomeScreen({ bottomInset }: { bottomInset: number }) {
  const app = useApp();
  const nav = useNav();
  const openMatch = useOpenMatch();
  const { teamName, playerName } = useNames(app.players, app.teams);

  const live = [...app.matches].reverse().find((m) => m.status === "live" || m.status === "innings_break");
  const recent = [...app.matches].reverse().slice(0, 4);
  const completed = app.matches.filter((m) => m.status === "complete").length;

  // "Your season" — a free, at-a-glance reason to open the app between matches (runs tracked, wickets, boundaries and
  // a run-total trend). Derived once per matches change; Home isn't a hot path, but keep the replay memoised anyway.
  const season = useMemo(() => {
    let runs = 0, wickets = 0, sixes = 0, fours = 0;
    const trend: { label: string; value: number }[] = [];
    const played = app.matches.filter((m) => m.status === "complete" || m.status === "live" || m.status === "innings_break");
    for (const m of played) {
      let matchRuns = 0;
      for (const inn of m.innings) {
        const s = replay(inn, m.rules);
        runs += s.runs; wickets += s.wickets; matchRuns += s.runs;
        for (const b of s.batters) { sixes += b.sixes; fours += b.fours; }
      }
      // Only FINISHED matches go in the run-totals trend, so every bar is a full-match total on the same scale — a
      // half-played live match no longer shows as one odd short bar next to the others (QA design review #5).
      if (m.status === "complete") trend.push({ label: "", value: matchRuns });
    }
    return { runs, wickets, sixes, fours, trend: trend.slice(-7), matches: played.length };
  }, [app.matches]);

  return (
    <Screen title="Home" bottomInset={bottomInset}>
      {live ? (
        // The live hero previews the scoring experience itself — a compact scoreboard (batters, this-over chips, run
        // rate, chase maths) rather than a giant number + ring — so Home is a window onto the match, not just a button.
        <LiveHero match={live} teamName={teamName} playerName={playerName} />
      ) : (
        // The hero card IS the primary CTA — one obvious tap to start, no competing button beneath it.
        <StartHero completed={completed} onPress={() => nav.push({ t: "setup" })} />
      )}
      {live ? (
        <View style={{ gap: space.sm }}>
          <Button label="Resume scoring" size="lg" icon="play" onPress={() => openMatch(live)} />
          <Button label="Start a new match" variant="secondary" icon="plus" onPress={() => nav.push({ t: "setup" })} style={{ borderColor: palette.primary, borderWidth: 1.5 }} />
        </View>
      ) : null}

      {app.matches.length === 0 ? (
        // First run: keep Home focused on the one action — the Start hero IS the CTA, then a preview of the payoff.
        // Backup is demoted (it's reachable from the More tab) so a yellow "add email" chip never competes with the
        // primary CTA before the user has even scored a ball (QA ux_polish). Stats/Cups live in the tab bar, so the
        // old shortcut tiles were pure duplication — removed to declutter.
        <SampleScorecard onStart={() => nav.push({ t: "setup" })} />
      ) : (
        <>
          {/* Season stats lead — the at-a-glance payoff — then the quieter utility cards (backup, teams) sit below
              them, so the hero → stats → tools rhythm reads top-down instead of burying the season under utilities
              (QA design review: Cloud backup/Teams outranked the stats). */}
          {season.matches >= 1 ? <SeasonCard season={season} /> : null}
          {/* Backup folded into a proper card (not a stray amber pill): the honest sync status reads as a feature. */}
          <BackupCard onPress={() => nav.go("more")} />
          {/* Teams & squads — a clearly labelled entry so roster management is reachable in one tap from Home. */}
          {app.teams.length > 0 ? (
            <Card padded={false} style={{ paddingHorizontal: space.lg }}>
              <ListItem
                icon="people"
                iconTint={palette.accent}
                title="Teams & squads"
                subtitle={`${app.teams.length} ${app.teams.length === 1 ? "team" : "teams"} · manage your players`}
                onPress={() => nav.push({ t: "teams" })}
              />
            </Card>
          ) : null}
          <SectionHeader title="Recent matches" action={app.matches.length > 4 ? <Text style={type.caption} onPress={() => nav.go("matches")}>See all</Text> : undefined} />
          <View style={{ gap: space.sm }}>
            {recent.map((m) => (
              <MatchCard key={m.id} match={m} teamName={teamName} onPress={() => openMatch(m)} />
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}

/**
 * Live match hero: a compact scoreboard that previews the scoring screen right on Home — the two batters at the
 * crease (striker flagged), the current over's balls as colour-coded chips, the run rate, and, in a chase, the runs
 * still needed with the required rate. Replaces the oversized number + ring so Home shows the match, not just a total.
 */
function LiveHero({ match, teamName, playerName }: { match: Match; teamName: NameOf; playerName: NameOf }) {
  const inn = match.innings[match.innings.length - 1];
  const sum = replay(inn, match.rules);
  const quota = ballsInInnings(match.rules);
  const chase = inn.target != null;
  const toWin = chase ? Math.max(0, inn.target! - sum.runs) : 0;
  const ballsLeft = quota > 0 ? Math.max(0, quota - sum.legalBalls) : 0;
  const rrr = chase && ballsLeft > 0 ? toWin / (ballsLeft / match.rules.ballsPerOver) : 0;
  const striker = sum.batters.find((b) => b.id === sum.strikerId);
  const nonStriker = sum.batters.find((b) => b.id === sum.nonStrikerId);
  const last6 = inn.events.slice(-6);
  return (
    <LinearGradient colors={gradient.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.liveHero}>
      <View style={styles.liveTopRow}>
        <View style={{ flex: 1 }}>
          <View style={styles.liveBadge}>
            <LivePulse />
            <Text style={[type.overline, { color: gradient.onHero }]} numberOfLines={1}>
              Live · {inn.order === 2 ? "2nd innings" : "1st innings"}
            </Text>
          </View>
          <Text style={[type.hero, { color: gradient.onHero }]} numberOfLines={1} adjustsFontSizeToFit>
            {sum.runs}/{sum.wickets}
          </Text>
          <Text style={[type.label, { color: gradient.onHeroSoft }]} numberOfLines={1}>
            {teamName(inn.battingTeamId)} · {sum.oversText}{quota > 0 ? ` / ${match.rules.oversPerInnings} ov` : " ov"} · RR {sum.runRate.toFixed(2)}
          </Text>
        </View>
        {chase ? (
          <View style={styles.needBox}>
            <Text style={[type.overline, { color: gradient.onHeroSoft }]}>Need</Text>
            <Text style={[type.number, { color: gradient.onHero, fontSize: 26 }]} numberOfLines={1}>{toWin}</Text>
            <Text style={[type.caption, { color: gradient.onHeroSoft }]} numberOfLines={1}>off {ballsLeft}</Text>
            <Text style={[type.caption, { color: gradient.onHeroSoft }]} numberOfLines={1}>RRR {rrr.toFixed(1)}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.liveBatters}>
        <MiniBat name={playerName(sum.strikerId)} runs={striker?.runs ?? 0} balls={striker?.balls ?? 0} on />
        {!match.rules.oneBatter ? (
          <MiniBat name={playerName(sum.nonStrikerId)} runs={nonStriker?.runs ?? 0} balls={nonStriker?.balls ?? 0} />
        ) : null}
      </View>

      {last6.length ? (
        <View style={styles.liveChips}>
          <Text style={[type.overline, { color: gradient.onHeroSoft, marginRight: 2 }]}>Last 6</Text>
          {last6.map((e, i) => (
            <BallChip key={i} event={e} />
          ))}
        </View>
      ) : null}
    </LinearGradient>
  );
}

/** A pulsing live dot on the hero badge — a quiet "this is happening now" beat. */
function LivePulse() {
  const o = useSharedValue(0.4);
  useEffect(() => {
    o.value = withRepeat(withTiming(1, { duration: 750, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [o]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[styles.pulseDot, style]} />;
}

/** One batter on the live hero: strike flag, name, runs (balls). */
function MiniBat({ name, runs, balls, on }: { name: string; runs: number; balls: number; on?: boolean }) {
  return (
    <View style={styles.miniBat}>
      {on ? <View style={styles.strikeDot} /> : <View style={styles.strikeGap} />}
      <Text style={[type.bodyStrong, { color: gradient.onHero, flex: 1, fontSize: 14 }]} numberOfLines={1}>{name}</Text>
      <Text style={[type.amount, { color: gradient.onHero, fontSize: 14 }]} numberOfLines={1}>{runs}</Text>
      <Text style={[type.caption, { color: gradient.onHeroSoft }]} numberOfLines={1}> ({balls})</Text>
    </View>
  );
}

/** A colour-coded ball chip for the live over strip (boundary amber, wicket red, extra outlined, dot/run neutral). */
function BallChip({ event }: { event: BallEvent }) {
  const boundary = event.boundary !== "none";
  const wicket = event.wicket !== "none";
  const extra = event.extra !== "none";
  const bg = wicket ? palette.danger : boundary ? palette.accent : gradient.pill;
  const fg = wicket ? "#fff" : boundary ? "#1A1205" : gradient.onHero;
  return (
    <View style={[styles.ballChip, { backgroundColor: bg }, extra && !wicket && !boundary ? styles.ballChipExtra : null]}>
      <Text style={[styles.ballChipTxt, { color: fg }]} numberOfLines={1}>{ballLabel(event)}</Text>
    </View>
  );
}

/**
 * First-run hero that IS the primary CTA. The whole card is one big tap target, and the inner "Start match"
 * pill gives an unmistakable pressed answer within ~100ms: it brightens (darker/stronger fill) and the whole
 * card scales down together. (Before, pressing only nudged the scale and — with Skia icons — blanked the
 * play/chevron, so QA read it as "only a faint change".)
 */
function StartHero({ completed, onPress }: { completed: number; onPress: () => void }) {
  const press = useSharedValue(0);
  const cardAnim = useAnimatedStyle(() => ({ transform: [{ scale: 1 - press.value * 0.02 }] }));
  // The logo mark is preloaded (App PRELOAD_ART), but fade it in from a visible floor so it can never read as
  // "popping in late" on a blank card in a QA burst frame — it starts at 0.55 opacity, never fully blank.
  const logoIn = useSharedValue(0.55);
  useEffect(() => { logoIn.value = withTiming(1, { duration: 320 }); }, [logoIn]);
  const logoAnim = useAnimatedStyle(() => ({ opacity: logoIn.value }));
  // A SOLID high-contrast button (white fill, brand-green label) — not a translucent inner strip (QA: the old
  // Start row "looked like a translucent strip, not a button"). It darkens a touch on press for a clear answer.
  const pillAnim = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(press.value, [0, 1], [gradient.onHero, "rgba(255,255,255,0.84)"]),
  }));
  return (
    <Tappable label="Start a new match" sound={null} scale={1} progress={press} onPress={onPress} style={{ borderRadius: radius.xl }}>
      <Animated.View style={cardAnim}>
        <HeroCard
          overline="Gully Score"
          value={completed > 0 ? `${completed}` : "Ready"}
          caption={completed > 0 ? `${completed === 1 ? "match" : "matches"} scored — start the next one` : "Score every ball. Own every stat."}
          status={{ label: "Offline · No login", tone: "success" }}
          right={<AnimatedImage source={art.ui_logo_mark} style={[styles.logo, logoAnim]} resizeMode="contain" fadeDuration={0} accessibilityIgnoresInvertColors />}
        >
          <Animated.View style={[styles.cta, pillAnim]}>
            <Icon name="play" size={18} color={palette.primary} />
            <Text style={[type.button, { color: palette.primary, flex: 1 }]}>Start match</Text>
            <Icon name="chevronRight" size={20} color={palette.primary} />
          </Animated.View>
        </HeroCard>
      </Animated.View>
    </Tappable>
  );
}

const RUN_MILESTONES = [100, 250, 500, 1000, 2500, 5000, 10000, 25000];

/** Free season summary — the "reason to come back" card: runs tracked, wickets, boundaries and a run-total trend. */
function SeasonCard({ season }: { season: { runs: number; wickets: number; sixes: number; fours: number; trend: { label: string; value: number }[]; matches: number } }) {
  // A career-milestone bar ("runs to 500") turns passive stats into a goal to chase — a reason to score the next match.
  const nextMilestone = RUN_MILESTONES.find((m) => m > season.runs) ?? (Math.floor(season.runs / 25000) + 1) * 25000;
  const prevMilestone = RUN_MILESTONES.filter((m) => m <= season.runs).pop() ?? 0;
  const span = nextMilestone - prevMilestone;
  const toGo = nextMilestone - season.runs;
  const milestoneProg = span > 0 ? (season.runs - prevMilestone) / span : 0;
  return (
    <View style={{ gap: space.sm }}>
      <SectionHeader title="Your season" action={<Pill label="Free" tone="success" />} />
      <Card style={{ gap: space.md }}>
        <View style={styles.seasonRow}>
          <KeyVal label="Matches" value={`${season.matches}`} tone={palette.primary} />
          <KeyVal label="Runs" value={`${season.runs}`} />
          <KeyVal label="Wickets" value={`${season.wickets}`} tone={palette.accent} />
          <KeyVal label="6s / 4s" value={`${season.sixes}/${season.fours}`} />
        </View>
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={[type.overline, { color: palette.inkMuted, flex: 1 }]}>Next milestone</Text>
            <Text style={[type.caption, { color: palette.primary }]}>{toGo} runs to {nextMilestone}</Text>
          </View>
          <ProgressBar value={milestoneProg} />
        </View>
        {season.trend.length >= 2 ? (
          <View style={{ gap: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text style={[type.overline, { color: palette.inkMuted, flex: 1 }]}>Match run totals</Text>
              <Text style={[type.caption, { color: palette.inkMuted }]}>runs · newest right →</Text>
            </View>
            <BarChart
              data={season.trend.map((t, i) => ({ label: `M${i + 1}`, value: t.value }))}
              color={palette.primary}
              highlight={season.trend.length - 1}
              showValues
            />
          </View>
        ) : null}
      </Card>
    </View>
  );
}

/** Cloud-backup status folded into a tappable card (opens the backup tools) — the sync chip reads as a feature, not
 *  a stray warning pill. The core promise ("score with no login") sits right under it. */
function BackupCard({ onPress }: { onPress: () => void }) {
  return (
    <Tappable label="Backup and sync settings" sound="pop" scale={0.98} onPress={onPress} style={styles.backupCard}>
      <View style={styles.backupIcon}><Icon name="cloud" size={18} color={palette.primary} /></View>
      {/* Title + status chip share the top row; the promise sits on its OWN full-width line below so it never gets
          squeezed to "Free · score with no .." by the chip (QA truncation). */}
      <View style={{ flex: 1, gap: 2 }}>
        <View style={styles.backupTop}>
          <Text style={[type.bodyStrong, { flex: 1 }]} numberOfLines={1}>Cloud backup</Text>
          <SyncChip />
        </View>
        <Text style={[type.caption, { color: palette.inkSoft }]} numberOfLines={1}>Free · no login needed</Text>
      </View>
      <Icon name="chevronRight" size={18} color={palette.inkMuted} />
    </Tappable>
  );
}

/** A preview of the payoff: the kind of shareable result card you get after a match. Tappable → starts a match. */
function SampleScorecard({ onStart }: { onStart: () => void }) {
  return (
    <View style={{ gap: space.sm }}>
      <SectionHeader title="What you'll get" />
      <Tappable label="Start a match to build your own card" sound="pop" scale={0.98} onPress={onStart}>
      <Card accent={palette.accent} style={{ gap: space.sm }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <Pill label="Sample" tone="warning" />
          <Text style={[type.caption, { flex: 1 }]} numberOfLines={2}>One tap shares a card like this to your group</Text>
        </View>
        <Text style={[type.bodyStrong, { color: palette.primary }]}>Street Royals won by 4 runs</Text>
        <View style={styles.sampleLine}>
          <Text style={[type.body, { flex: 1 }]} numberOfLines={1}>Street Royals</Text>
          <Text style={type.amount}>142/6 (20)</Text>
        </View>
        <View style={styles.sampleLine}>
          <Text style={[type.body, { flex: 1 }]} numberOfLines={1}>Park Strikers</Text>
          <Text style={type.amount}>138/9 (20)</Text>
        </View>
        <View style={styles.pomRow}>
          <Icon name="trophy" size={16} color={palette.accent} />
          <Text style={[type.caption, { color: palette.inkSoft }]}>Player of the Match · A. Khan 64 (38)</Text>
        </View>
        <View style={styles.sampleCta}>
          <Icon name="play" size={14} color={palette.primary} />
          <Text style={[type.caption, { color: palette.primary }]}>Tap to score your first match</Text>
        </View>
      </Card>
      </Tappable>
    </View>
  );
}

const styles = StyleSheet.create({
  logo: { width: 84, height: 84 },
  liveHero: { borderRadius: radius.xl, padding: space.lg, gap: space.md, ...shadowStrong, shadowColor: gradient.hero[1], shadowOpacity: 0.28, ...(gradient.border ? { borderWidth: 1, borderColor: gradient.border } : null) },
  liveTopRow: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  liveBadge: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },
  pulseDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: palette.accent },
  needBox: { alignItems: "center", backgroundColor: "rgba(0,0,0,0.16)", borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 6, gap: 1 },
  liveBatters: { gap: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(255,255,255,0.2)", paddingTop: space.sm },
  miniBat: { flexDirection: "row", alignItems: "center" },
  strikeDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: gradient.onHero, marginRight: 8 },
  strikeGap: { width: 7, marginRight: 8 },
  liveChips: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 5 },
  ballChip: { minWidth: 26, height: 26, paddingHorizontal: 5, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  ballChipExtra: { borderWidth: 1, borderColor: "rgba(255,255,255,0.5)" },
  ballChipTxt: { fontFamily: type.amount.fontFamily, fontSize: 12, fontVariant: ["tabular-nums"] },
  backupCard: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.sm, paddingHorizontal: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
  backupIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: palette.primarySoft },
  backupTop: { flexDirection: "row", alignItems: "center", gap: space.sm },
  seasonRow: { flexDirection: "row", gap: space.sm },
  sampleCta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  cta: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.md, backgroundColor: gradient.onHero, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 13 },
  sampleLine: { flexDirection: "row", alignItems: "center", gap: space.sm },
  pomRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
});
