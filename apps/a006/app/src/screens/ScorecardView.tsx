import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Card, Icon, Pill, gradient, palette, radius, space, type } from "../ui";
import { Avatar } from "./common";
import { replay, type BatterCard, type BowlerCard, type InningsSummary } from "../core/scoring";
import { oversText } from "../core/rules";
import type { NameOf } from "../core/format";
import type { Match } from "../core/types";

function dismissalText(b: BatterCard, playerName: NameOf): string {
  if (!b.out) return b.batted ? "not out" : "did not bat";
  switch (b.wicket) {
    case "bowled":
      return `b ${playerName(b.bowlerId)}`;
    case "lbw":
      return `lbw b ${playerName(b.bowlerId)}`;
    case "caught":
      return `c ${playerName(b.fielderId)} b ${playerName(b.bowlerId)}`;
    case "stumped":
      return `st ${playerName(b.fielderId)} b ${playerName(b.bowlerId)}`;
    case "runout":
      return `run out (${playerName(b.fielderId)})`;
    case "hitwicket":
      return `hit wicket b ${playerName(b.bowlerId)}`;
    case "retired":
      return "retired out";
    default:
      return "out";
  }
}

function Row({ cols, header }: { cols: (string | number)[]; header?: boolean }) {
  return (
    <View style={styles.row}>
      {cols.map((c, i) => (
        <Text
          key={i}
          style={[
            i === 0 ? styles.cName : styles.cNum,
            header ? type.caption : type.amount,
            header && { color: palette.inkMuted },
            i === 0 && !header ? type.bodyStrong : null,
          ]}
          numberOfLines={1}
        >
          {c}
        </Text>
      ))}
    </View>
  );
}

/** One batter's row, highlighted (tinted + ★) when they're the innings' top scorer. */
function BatterRow({ b, playerName, top }: { b: BatterCard; playerName: NameOf; top: boolean }) {
  return (
    <View style={[styles.statRow, top && styles.topRow]}>
      <View style={styles.nameCell}>
        {top ? <Icon name="trophy" size={13} color={palette.accent} /> : <View style={{ width: 13 }} />}
        <View style={{ flex: 1 }}>
          <Text style={[type.bodyStrong, top && { color: palette.primary }]} numberOfLines={1}>{playerName(b.id)}</Text>
          <Text style={[type.caption, styles.dismissal]} numberOfLines={1}>{dismissalText(b, playerName)}</Text>
        </View>
      </View>
      <Text style={[styles.cNum, type.amount, top && { color: palette.primary }]}>{b.runs}</Text>
      <Text style={[styles.cNum, type.amount]}>{b.balls}</Text>
      <Text style={[styles.cNum, type.amount]}>{b.fours}</Text>
      <Text style={[styles.cNum, type.amount]}>{b.sixes}</Text>
      <Text style={[styles.cNum, type.amount]}>{b.sr.toFixed(0)}</Text>
    </View>
  );
}

function InningsBlock({ inn, sum, teamName, playerName }: { inn: Match["innings"][number]; sum: InningsSummary; teamName: NameOf; playerName: NameOf }) {
  const bats = sum.batters.filter((b) => b.batted);
  const bowls = sum.bowlers.filter((b) => b.balls > 0 || b.runs > 0);
  const e = sum.extras;
  // Top performers to highlight: most runs (min 1 ball) and most wickets (then fewest runs).
  const topBat = bats.reduce<BatterCard | null>((best, b) => (b.balls > 0 && (!best || b.runs > best.runs) ? b : best), null);
  const topBowl = bowls.reduce<BowlerCard | null>((best, b) => (!best || b.wickets > best.wickets || (b.wickets === best.wickets && b.runs < best.runs) ? b : best), null);
  return (
    <Card style={{ gap: space.md, overflow: "hidden" }} padded={false}>
      {/* Team header: logo avatar, big score, run-rate / target. */}
      <LinearGradient colors={gradient.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.innHead}>
        <Avatar name={teamName(inn.battingTeamId)} id={inn.battingTeamId} size={40} color={gradient.onHero} />
        <View style={{ flex: 1 }}>
          <Text style={[type.heading, { color: gradient.onHero }]} numberOfLines={1}>{teamName(inn.battingTeamId)}</Text>
          <Text style={[type.caption, { color: gradient.onHeroSoft }]}>RR {sum.runRate.toFixed(2)}{inn.target != null ? ` · target ${inn.target}` : ""}</Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={[type.hero, { color: gradient.onHero, fontSize: 30, lineHeight: 34 }]} numberOfLines={1}>{sum.runs}/{sum.wickets}</Text>
          <Text style={[type.caption, { color: gradient.onHeroSoft }]}>({sum.oversText} ov)</Text>
        </View>
      </LinearGradient>

      <View style={{ paddingHorizontal: space.lg, paddingBottom: space.lg, gap: space.md }}>
        {inn.scoreOnly ? (
          <Text style={type.caption}>Score-only innings — totals recorded without ball-by-ball detail.</Text>
        ) : (
          <>
            <View style={{ gap: 2 }}>
              <Row header cols={["Batting", "R", "B", "4s", "6s", "SR"]} />
              {bats.map((b) => (
                <BatterRow key={b.id} b={b} playerName={playerName} top={!!topBat && b.id === topBat.id && b.runs > 0} />
              ))}
              <View style={styles.divider} />
              <View style={styles.extrasRow}>
                <Text style={type.label}>Extras</Text>
                <Text style={type.amount}>{e.total} <Text style={type.caption}>(b {e.byes}, lb {e.legbyes}, w {e.wides}, nb {e.noballs})</Text></Text>
              </View>
              <View style={styles.extrasRow}>
                <Text style={type.bodyStrong}>Total</Text>
                <Text style={type.bodyStrong}>{sum.runs}/{sum.wickets} ({sum.oversText} ov)</Text>
              </View>
            </View>

            {sum.fallOfWickets.length ? (
              <View style={{ gap: 4 }}>
                <Text style={type.label}>Fall of wickets</Text>
                <Text style={[type.caption, { lineHeight: 18 }]}>
                  {sum.fallOfWickets.map((f) => `${f.score}-${f.wicket} (${playerName(f.batterId)}, ${f.overText})`).join("  ·  ")}
                </Text>
              </View>
            ) : null}

            {bowls.length ? (
              <View style={{ gap: 2 }}>
                <Row header cols={["Bowling", "O", "M", "R", "W", "Econ"]} />
                {bowls.map((b: BowlerCard) => {
                  const top = !!topBowl && b.id === topBowl.id && b.wickets > 0;
                  return (
                    <View key={b.id} style={[styles.statRow, top && styles.topRow]}>
                      <View style={styles.nameCell}>
                        {top ? <Icon name="ball" size={13} color={palette.accent} /> : <View style={{ width: 13 }} />}
                        <Text style={[type.bodyStrong, { flex: 1 }, top && { color: palette.primary }]} numberOfLines={1}>{playerName(b.id)}</Text>
                      </View>
                      <Text style={[styles.cNum, type.amount]}>{b.oversText}</Text>
                      <Text style={[styles.cNum, type.amount]}>{b.maidens}</Text>
                      <Text style={[styles.cNum, type.amount]}>{b.runs}</Text>
                      <Text style={[styles.cNum, type.amount, top && { color: palette.primary }]}>{b.wickets}</Text>
                      <Text style={[styles.cNum, type.amount]}>{b.econ.toFixed(1)}</Text>
                    </View>
                  );
                })}
              </View>
            ) : null}
          </>
        )}
      </View>
    </Card>
  );
}

/**
 * Result banner for a finished match: the result line, both innings' scores with team avatars, and the Player of the
 * Match — the "who won, who starred" summary the scorecard screen was missing (QA design review #4).
 */
export function ResultBanner({ match, teamName, playerName }: { match: Match; teamName: NameOf; playerName: NameOf }) {
  if (!match.result || match.result.kind === "abandoned") return null;
  const pom = match.pomId;
  return (
    <LinearGradient colors={gradient.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.banner}>
      <Text style={[type.overline, { color: gradient.onHeroSoft }]}>Result</Text>
      <Text style={[type.title, { color: gradient.onHero }]} numberOfLines={2}>{match.result.summary}</Text>
      <View style={styles.bannerScores}>
        {match.innings.map((inn) => {
          const sum = replay(inn, match.rules);
          const won = match.result?.winnerId === inn.battingTeamId;
          return (
            <View key={inn.id} style={styles.bannerLine}>
              <Avatar name={teamName(inn.battingTeamId)} id={inn.battingTeamId} size={26} color={gradient.onHero} />
              <Text style={[type.bodyStrong, { flex: 1, color: gradient.onHero }]} numberOfLines={1}>{teamName(inn.battingTeamId)}</Text>
              {won ? <Icon name="trophy" size={14} color={gradient.onHero} /> : null}
              <Text style={[type.amount, { color: gradient.onHero }]}>{sum.runs}/{sum.wickets} ({sum.oversText})</Text>
            </View>
          );
        })}
      </View>
      {pom ? (
        <View style={styles.pomRow}>
          <Text style={{ fontSize: 15 }}>🏅</Text>
          <Text style={[type.label, { color: gradient.onHero }]} numberOfLines={1}>Player of the Match · {playerName(pom)}</Text>
        </View>
      ) : null}
    </LinearGradient>
  );
}

/** Full batting + bowling scorecard with extras and fall of wickets. Free for everyone. Memoised so an open sheet
 *  doesn't re-replay every innings on each unrelated parent re-render. */
export const ScorecardView = memo(function ScorecardView({ match, teamName, playerName }: { match: Match; teamName: NameOf; playerName: NameOf }) {
  return (
    <View style={{ gap: space.md }}>
      {match.innings.map((inn) => (
        <InningsBlock key={inn.id} inn={inn} sum={replay(inn, match.rules)} teamName={teamName} playerName={playerName} />
      ))}
      {match.innings.length === 0 ? (
        <Card><Text style={type.caption}>No scoring yet.</Text></Card>
      ) : null}
    </View>
  );
});

/** A compact two-line partnerships summary for the current innings. */
export function PartnershipPill({ sum }: { sum: InningsSummary }) {
  const current = sum.partnerships.find((p) => p.wicket === 0);
  if (!current) return null;
  return <Pill label={`Partnership ${current.runs} (${current.balls})`} tone="primary" />;
}

export { oversText };

const styles = StyleSheet.create({
  innHead: { flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.lg, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 3 },
  statRow: { flexDirection: "row", alignItems: "center", paddingVertical: 4, paddingHorizontal: 6, marginHorizontal: -6, borderRadius: radius.sm },
  topRow: { backgroundColor: palette.primarySoft },
  nameCell: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6 },
  cName: { flex: 1, textAlign: "left" },
  cNum: { width: 40, textAlign: "right" },
  dismissal: { marginTop: -2 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: palette.border, marginVertical: 4 },
  extrasRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  banner: { borderRadius: radius.xl, padding: space.lg, gap: space.sm },
  bannerScores: { gap: 6, marginTop: 2 },
  bannerLine: { flexDirection: "row", alignItems: "center", gap: space.sm },
  pomRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2, backgroundColor: "rgba(255,255,255,0.16)", borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5, alignSelf: "flex-start" },
});
