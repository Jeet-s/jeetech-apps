import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Card, Pill, Tappable, palette, space, type } from "../ui";
import { Avatar, colorFor } from "./common";
import { replay } from "../core/scoring";
import type { NameOf } from "../core/format";
import type { Match } from "../core/types";
import type { Tone } from "../ui/theme";

export function matchStatusPill(m: Match): { label: string; tone: Tone } {
  switch (m.status) {
    case "live":
      return { label: "Live", tone: "danger" };
    case "innings_break":
      return { label: "Innings break", tone: "warning" };
    case "complete":
      return { label: "Result", tone: "success" };
    case "abandoned":
      return { label: "Abandoned", tone: "neutral" };
    default:
      return { label: "Setup", tone: "neutral" };
  }
}

function TeamLine({ name, id, score }: { name: string; id: string; score?: string }) {
  return (
    <View style={styles.teamLine}>
      <Avatar name={name} id={id} size={30} />
      <Text style={[type.bodyStrong, { flex: 1 }]} numberOfLines={1}>{name}</Text>
      {score ? <Text style={[type.amount, { color: palette.inkSoft }]}>{score}</Text> : null}
    </View>
  );
}

/** A match in a list: both teams, their scores, a status pill and the result/date. */
export function MatchCard({ match, teamName, onPress }: { match: Match; teamName: NameOf; onPress: () => void }) {
  const pill = matchStatusPill(match);
  // Replaying both innings is the card's only real cost; memoise on the match so an unrelated parent re-render
  // (e.g. a tab filter tap) doesn't re-replay every card in the list (QA no_anr: list-wide replays caused jank).
  const scores = useMemo(() => {
    const scoreForTeam = (teamId: string): string | undefined => {
      const inn = match.innings.find((i) => i.battingTeamId === teamId);
      if (!inn) return undefined;
      const sum = replay(inn, match.rules);
      if (inn.scoreOnly) return `${sum.runs}/${sum.wickets}`;
      return `${sum.runs}/${sum.wickets} (${sum.oversText})`;
    };
    return { a: scoreForTeam(match.teamAId), b: scoreForTeam(match.teamBId) };
  }, [match]);
  const sub = match.result?.summary ?? (match.tournamentId ? "Tournament match" : match.rules.scoreOnly ? "Score-only" : `${match.rules.oversPerInnings || "∞"} overs`);
  return (
    <Tappable label={`Match ${teamName(match.teamAId)} versus ${teamName(match.teamBId)}, ${pill.label}`} onPress={onPress} scale={0.99} style={{ borderRadius: 16 }}>
      <Card accent={colorFor(match.teamAId)} style={{ gap: space.sm }}>
        <View style={styles.top}>
          <Text style={type.caption}>{match.date}</Text>
          <Pill label={pill.label} tone={pill.tone} />
        </View>
        <TeamLine name={teamName(match.teamAId)} id={match.teamAId} score={scores.a} />
        <TeamLine name={teamName(match.teamBId)} id={match.teamBId} score={scores.b} />
        <Text style={[type.caption, { color: palette.inkSoft }]} numberOfLines={1}>{sub}</Text>
      </Card>
    </Tappable>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  teamLine: { flexDirection: "row", alignItems: "center", gap: space.sm },
});
