import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Button, Card, IconButton, ListItem, Pill, SectionHeader, Segmented, Sheet, feedback, palette, space, toast, type } from "../ui";
import { Stack, appStore, useApp, useNames } from "./common";
import { ResultBanner, ScorecardView } from "./ScorecardView";
import { ChartsView } from "./ChartsView";
import { BallList, EditBallSheet } from "./BallEditor";
import { ShareCardSheet } from "./ShareCard";
import { matchStatusPill } from "./MatchCard";
import { useNav } from "../nav";
import { analytics } from "../modules/analytics";
import { editMatchBall } from "../core/app";
import { ballLabel } from "../core/format";
import type { BallEvent, Id } from "../core/types";

type Tab = "card" | "charts" | "fix";

export function MatchDetailScreen({ matchId, bottomInset }: { matchId: Id; bottomInset: number }) {
  const app = useApp();
  const nav = useNav();
  const { playerName, teamName } = useNames(app.players, app.teams);
  const match = app.matches.find((m) => m.id === matchId);
  const [tab, setTab] = useState<Tab>("card");
  const [shareOpen, setShareOpen] = useState(false);
  const [editing, setEditing] = useState<{ inningsIdx: number; seq: number; event: BallEvent } | null>(null);
  const [pickInnings, setPickInnings] = useState(false);
  const [editInnIdx, setEditInnIdx] = useState<number | null>(null);

  if (!match) {
    return <Stack title="Match" onBack={() => nav.pop()} bottomInset={bottomInset}><Text style={type.body}>Match not found.</Text></Stack>;
  }

  const pill = matchStatusPill(match);
  const live = match.status === "live" || match.status === "innings_break";
  const myAudit = app.audit.filter((a) => a.entityId.startsWith(`${matchId}:`) || a.entityId === matchId);

  // Open an in-app share-card preview first — it's a lasting visible result even where the OS share sheet isn't.
  const openShare = () => { feedback("pop", "light"); setShareOpen(true); };

  const saveEdit = (patch: Partial<BallEvent>) => {
    if (!editing) return;
    appStore.set((s) => editMatchBall(s, matchId, editing.inningsIdx, editing.seq, patch, Date.now()));
    setEditing(null);
    feedback("success", "medium");
    analytics.track("match_edited");
    toast("Ball updated — totals recalculated.");
  };

  return (
    <Stack
      title={`${teamName(match.teamAId)} v ${teamName(match.teamBId)}`}
      subtitle={`${match.date} · ${match.rules.oversPerInnings || "∞"} overs`}
      onBack={() => nav.pop()}
      bottomInset={bottomInset}
      right={<IconButton icon="share" label="Share card" onPress={openShare} />}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        <Pill label={pill.label} tone={pill.tone} />
        {match.tournamentId ? <Pill label="Tournament" tone="primary" /> : null}
      </View>
      {match.result && match.result.kind !== "abandoned" ? (
        <ResultBanner match={match} teamName={teamName} playerName={playerName} />
      ) : match.result ? (
        <Text style={[type.bodyStrong, { color: palette.primary }]}>{match.result.summary}</Text>
      ) : null}

      {live ? (
        <Button label="Resume scoring" size="lg" icon="play" onPress={() => nav.replace({ t: "scoring", matchId })} />
      ) : null}

      <Segmented
        options={[{ value: "card", label: "Scorecard" }, { value: "charts", label: "Charts" }, { value: "fix", label: "Corrections" }]}
        value={tab}
        onChange={(v) => setTab(v as Tab)}
      />

      {tab === "card" ? (
        <ScorecardView match={match} teamName={teamName} playerName={playerName} />
      ) : tab === "charts" ? (
        <ChartsView match={match} teamName={teamName} />
      ) : (
        <View style={{ gap: space.md }}>
          <Card style={{ gap: space.sm }}>
            <Text style={type.heading}>Fix a mistake</Text>
            <Text style={[type.body, { color: palette.inkSoft }]}>Edit any ball's runs or extras — totals, partnerships and stats recalculate, and every edit is logged below.</Text>
            <Button label="Edit a ball" icon="edit" onPress={() => setPickInnings(true)} />
          </Card>

          <SectionHeader title="Audit log" />
          {myAudit.length === 0 ? (
            <Card><Text style={type.caption}>No edits yet. Any correction you make will appear here with its before and after.</Text></Card>
          ) : (
            <Card padded={false} style={{ paddingHorizontal: space.lg }}>
              {myAudit.map((a) => (
                <ListItem key={a.id} icon="clock" title={`${a.entity} · ${a.field}`} subtitle={`${trim(a.before)} → ${trim(a.after)}`} />
              ))}
            </Card>
          )}
        </View>
      )}

      {/* pick innings to edit */}
      <Sheet visible={pickInnings} title="Edit which innings?" onClose={() => setPickInnings(false)}>
        <View style={{ gap: space.sm }}>
          {match.innings.map((inn, i) => (
            <Button key={inn.id} label={`${teamName(inn.battingTeamId)} innings`} variant={i === 0 ? "primary" : "secondary"} onPress={() => { setPickInnings(false); setEditInnIdx(i); }} />
          ))}
        </View>
      </Sheet>

      {/* ball list for the chosen innings */}
      <Sheet visible={editInnIdx !== null} title="Pick a ball" scroll={false} onClose={() => setEditInnIdx(null)}>
        {editInnIdx !== null ? (
          <ScrollView style={{ maxHeight: 460 }} showsVerticalScrollIndicator={false}>
            <BallList
              match={match}
              inningsIdx={editInnIdx}
              onPick={(seq, event) => { setEditInnIdx(null); setEditing({ inningsIdx: editInnIdx, seq, event }); }}
            />
          </ScrollView>
        ) : null}
      </Sheet>

      {/* edit a ball */}
      <EditBallSheet
        editing={editing}
        match={match}
        playerName={playerName}
        teamPlayers={(tid) => app.teams.find((t) => t.id === tid)?.playerIds ?? []}
        onClose={() => setEditing(null)}
        onSave={saveEdit}
      />

      {/* Share card: a visible preview of what gets shared, with the one-tap image share (WhatsApp etc.). */}
      <ShareCardSheet visible={shareOpen} match={match} teamName={teamName} playerName={playerName} from="match_detail" onClose={() => setShareOpen(false)} />
    </Stack>
  );
}

const trim = (s: string) => {
  try {
    const v = JSON.parse(s);
    if (v && typeof v === "object") return ballLabel(v as BallEvent);
    return String(v);
  } catch {
    return s.slice(0, 24);
  }
};
