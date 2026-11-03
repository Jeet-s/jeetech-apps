import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { AiReport, BarChart, Button, Card, Chip, IconButton, ListItem, Pill, Segmented, SectionHeader, Sheet, Skeleton, feedback, palette, space, toast, type } from "../ui";
import { Avatar, KeyVal, Stack, appStore, useApp, useNames } from "./common";
import { useNav } from "../nav";
import { analytics } from "../modules/analytics";
import { ai } from "../modules/ai";
import { share } from "../modules/share";
import { addPlayerToTeam, archivePlayer, deletePlayer, editPlayer, mergePlayers, playerInUse, removePlayerFromTeam, type AppState } from "../core/app";
import { careerStats, headToHead, recentForm, resolvePlayer } from "../core/stats";
import { formInsightInput } from "../core/format";
import type { BowlerType, Hand, Id } from "../core/types";

const HANDS: { v: Hand; l: string }[] = [{ v: "right", l: "Right" }, { v: "left", l: "Left" }];
const BOWL: { v: BowlerType; l: string }[] = [
  { v: "none", l: "—" }, { v: "pace", l: "Pace" }, { v: "medium", l: "Medium" },
  { v: "offspin", l: "Off spin" }, { v: "legspin", l: "Leg spin" }, { v: "left_arm_spin", l: "L-arm spin" }, { v: "left_arm_pace", l: "L-arm pace" },
];

export function PlayerProfileScreen({ id, bottomInset }: { id: Id; bottomInset: number }) {
  const app = useApp();
  const nav = useNav();
  const { playerName } = useNames(app.players, app.teams);
  const player = app.players.find((p) => p.id === id);
  const [editOpen, setEditOpen] = useState(false);
  const [h2hOpen, setH2hOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeLoser, setMergeLoser] = useState<Id | null>(null);
  const [addTeamOpen, setAddTeamOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [opponent, setOpponent] = useState<Id | null>(null);
  const [aiText, setAiText] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);

  const stats = useMemo(() => careerStats(app.matches, app.players), [app.matches, app.players]);
  const form = useMemo(() => recentForm(app.matches, app.players, id, 10), [app.matches, app.players, id]);

  if (!player) {
    return <Stack title="Player" onBack={() => nav.pop()} bottomInset={bottomInset}><Text style={type.body}>Player not found.</Text></Stack>;
  }
  const c = stats.get(resolvePlayer(id, app.players));
  const others = app.players.filter((p) => !p.mergedInto && !p.archived && p.id !== id);

  const genAi = async () => {
    setAiBusy(true);
    const r = await ai.run("form_insight", formInsightInput(app.matches, app.players, id));
    setAiBusy(false);
    if (r.ok) { setAiText(r.text); analytics.track("core_action", { feature: "ai_form_insight" }); }
    else if (r.reason === "quota") nav.openPro("ai_quota");
    else if (r.reason === "offline") toast("You're offline — try again when connected.");
    else toast(r.reason === "disabled" ? "AI isn't available in this version." : "Couldn't generate insight. Try again.");
  };

  const h2h = opponent ? headToHead(app.matches, app.players, id, opponent) : null;

  // Confirm merge INSIDE the sheet (not a native Alert — an Alert raised over an open Sheet/Modal on Android
  // swallows its button taps, which is exactly why the QA tester couldn't complete the merge). A real Button in
  // the sheet always registers.
  const confirmMerge = () => {
    if (!mergeLoser) return;
    appStore.set((s) => mergePlayers(s, mergeLoser, id, Date.now()));
    setMergeLoser(null);
    setMergeOpen(false);
    feedback("success", "medium");
    analytics.track("player_merged");
    toast("Players merged — stats recalculated.");
  };

  const inUse = playerInUse(app, id);
  const doArchive = () => {
    appStore.set((s) => archivePlayer(s, id, Date.now(), !player.archived));
    setRemoveOpen(false);
    feedback("success", "medium");
    analytics.track(player.archived ? "player_unarchived" : "player_archived");
    toast(player.archived ? "Player restored." : "Player archived — hidden but kept.");
    if (!player.archived) nav.pop();
  };
  const doDelete = () => {
    appStore.set((s) => deletePlayer(s, id, Date.now()));
    setRemoveOpen(false);
    feedback("error", "warning");
    analytics.track("player_deleted");
    toast("Player deleted.");
    nav.pop();
  };

  // Teams whose squad already includes this player, and the ones that don't (both local, on-device).
  const inTeams = app.teams.filter((t) => t.playerIds.includes(id));
  const notInTeams = app.teams.filter((t) => !t.playerIds.includes(id));

  const addToTeam = (teamId: Id) => {
    appStore.set((s) => addPlayerToTeam(s, teamId, id) as AppState);
    setAddTeamOpen(false);
    feedback("success", "medium");
    analytics.track("roster_edited");
    toast(`Added to ${app.teams.find((t) => t.id === teamId)?.name ?? "team"}`);
  };
  const removeFromTeam = (teamId: Id) => {
    appStore.set((s) => removePlayerFromTeam(s, teamId, id) as AppState);
    feedback("pop", "light");
    toast(`Removed from ${app.teams.find((t) => t.id === teamId)?.name ?? "team"}`);
  };

  const save = (patch: { hand?: Hand; bowlerType?: BowlerType }) => {
    appStore.set((s) => editPlayer(s, id, patch) as AppState);
  };

  return (
    <Stack
      title={player.name}
      subtitle={`${player.hand === "left" ? "Left" : "Right"}-hand${player.bowlerType !== "none" ? ` · ${BOWL.find((b) => b.v === player.bowlerType)?.l}` : ""}`}
      onBack={() => nav.pop()}
      bottomInset={bottomInset}
      right={
        <View style={{ flexDirection: "row", gap: space.xs }}>
          <IconButton icon="people" label="Add to a team" onPress={() => setAddTeamOpen(true)} />
          <IconButton icon="edit" label="Edit player" onPress={() => setEditOpen(true)} />
        </View>
      }
    >
      <Card style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
        <Avatar name={player.name} id={player.id} size={56} />
        <View style={{ flex: 1 }}>
          <Text style={type.heading}>{player.name}</Text>
          <Text style={type.caption}>{c?.matches ?? 0} matches</Text>
        </View>
        {c && c.batting.hundreds > 0 ? <Pill label={`${c.batting.hundreds}× 100`} tone="warning" /> : c && c.batting.fifties > 0 ? <Pill label={`${c.batting.fifties}× 50`} tone="primary" /> : null}
      </Card>

      {/* The squads this player is part of — a lasting, visible result of adding them to a team, with one-tap remove. */}
      {inTeams.length ? (
        <>
          <SectionHeader title="In these teams" />
          <Card padded={false} style={{ paddingHorizontal: space.lg }}>
            {inTeams.map((t) => (
              <View key={t.id} style={styles.teamMembershipRow}>
                <View style={{ flex: 1 }}>
                  <Text style={type.bodyStrong} numberOfLines={1}>{t.name}</Text>
                  <Text style={type.caption}>{t.playerIds.length} in squad</Text>
                </View>
                <Button label="Remove" variant="ghost" size="sm" onPress={() => removeFromTeam(t.id)} />
              </View>
            ))}
          </Card>
        </>
      ) : null}

      {!c || c.matches === 0 ? (
        <Card><Text style={type.caption}>No match data yet. Career stats build up as this player features in matches.</Text></Card>
      ) : (
        <>
          <SectionHeader title="Batting" />
          <Card style={styles.statRow}>
            <KeyVal label="Runs" value={`${c.batting.runs}`} tone={palette.primary} />
            <KeyVal label="Average" value={c.batting.average.toFixed(1)} />
            <KeyVal label="SR" value={c.batting.strikeRate.toFixed(0)} />
            <KeyVal label="HS" value={`${c.batting.highScore}`} />
          </Card>
          <Card style={styles.statRow}>
            <KeyVal label="50s" value={`${c.batting.fifties}`} />
            <KeyVal label="100s" value={`${c.batting.hundreds}`} />
            <KeyVal label="4s" value={`${c.batting.fours}`} />
            <KeyVal label="6s" value={`${c.batting.sixes}`} />
          </Card>

          <SectionHeader title="Bowling" />
          <Card style={styles.statRow}>
            <KeyVal label="Wickets" value={`${c.bowling.wickets}`} tone={palette.accent} />
            <KeyVal label="Econ" value={c.bowling.economy.toFixed(1)} />
            <KeyVal label="Best" value={c.bowling.bestWickets ? `${c.bowling.bestWickets}/${c.bowling.bestRuns}` : "—"} />
            <KeyVal label="Avg" value={c.bowling.wickets ? c.bowling.average.toFixed(1) : "—"} />
          </Card>
          <Card style={styles.statRow}>
            <KeyVal label="5-fers" value={`${c.bowling.fiveFors}`} />
            <KeyVal label="Hat-tricks" value={`${c.bowling.hatTricks}`} />
            <KeyVal label="Catches" value={`${c.catches}`} />
            <KeyVal label="Run-outs" value={`${c.runouts}`} />
          </Card>

          {form.length > 0 ? (
            <>
              <SectionHeader title="Recent form" />
              <Card>
                <BarChart
                  data={[...form].reverse().map((f, i) => ({ label: f.out ? `${i + 1}` : "*", value: f.runs }))}
                  color={palette.primary}
                  highlight={form.length - 1}
                  showValues
                />
                <Text style={[type.caption, { marginTop: space.sm }]}>Last {form.length} innings (newest right). * = not out.</Text>
              </Card>
            </>
          ) : null}
        </>
      )}

      {/* AI form insight */}
      <SectionHeader title="AI form insight" action={<Pill label="Pro · free taste" tone="warning" />} />
      <Card style={{ gap: space.sm }}>
        {aiBusy ? (
          <View style={{ gap: 8 }}><Skeleton width="100%" height={14} /><Skeleton width="80%" height={14} /></View>
        ) : aiText ? (
          <>
            <Text style={[type.body, { lineHeight: 22 }]}>{aiText}</Text>
            <Button label="Share insight" variant="secondary" icon="share" onPress={() => void share.app("form_insight", `${player.name} form: ${aiText}\n\nvia Gully Score —`)} />
            {/* Google Play AI-generated content policy: a report control under every AI response. */}
            <AiReport feature="form_insight" />
          </>
        ) : (
          <>
            <Text style={[type.body, { color: palette.inkSoft }]}>A short, honest read on this player's form and one thing to work on.</Text>
            <Button label="Get form insight" icon="star" onPress={genAi} />
          </>
        )}
      </Card>

      <SectionHeader title="Tools" />
      <Card padded={false} style={{ paddingHorizontal: space.lg }}>
        <ToolRow icon="swap" title="Head-to-head" subtitle="Compare vs another player" onPress={() => { setOpponent(others[0]?.id ?? null); setH2hOpen(true); }} />
        <ToolRow icon="people" title="Merge duplicate" subtitle="Combine two profiles into one" onPress={() => setMergeOpen(true)} disabled={others.length === 0} />
        <ToolRow icon="people" title="Add to a team" subtitle="Put this player in a squad" onPress={() => setAddTeamOpen(true)} disabled={notInTeams.length === 0} />
        <ToolRow icon="trash" title={player.archived ? "Restore player" : "Remove player"} subtitle={player.archived ? "Un-archive and show again" : inUse ? "Archive — matches keep their data" : "Archive or delete this profile"} onPress={() => setRemoveOpen(true)} />
      </Card>

      {/* edit */}
      <Sheet visible={editOpen} title="Edit player" onClose={() => setEditOpen(false)}>
        <Text style={type.label}>Batting hand</Text>
        <Segmented options={HANDS.map((h) => ({ value: h.v, label: h.l }))} value={player.hand} onChange={(v) => save({ hand: v as Hand })} />
        <Text style={type.label}>Bowler type</Text>
        <View style={styles.chips}>
          {BOWL.map((b) => (
            <Chip key={b.v} label={b.l} selected={player.bowlerType === b.v} onPress={() => save({ bowlerType: b.v })} />
          ))}
        </View>
        <Button label="Done" size="lg" onPress={() => { feedback("success", "light"); setEditOpen(false); toast("Saved"); }} />
      </Sheet>

      {/* head-to-head */}
      <Sheet visible={h2hOpen} title="Head-to-head" onClose={() => setH2hOpen(false)}>
        <Text style={[type.body, { color: palette.inkSoft }]}>{player.name} vs:</Text>
        <View style={styles.chips}>
          {others.map((o) => (
            <Chip key={o.id} label={o.name} selected={opponent === o.id} onPress={() => setOpponent(o.id)} />
          ))}
        </View>
        {h2h ? (
          <Card style={styles.statRow}>
            <KeyVal label="Balls" value={`${h2h.balls}`} />
            <KeyVal label="Runs" value={`${h2h.runs}`} tone={palette.primary} />
            <KeyVal label="Dismissals" value={`${h2h.dismissals}`} tone={palette.accent} />
          </Card>
        ) : null}
      </Sheet>

      {/* merge — two in-sheet steps (pick a duplicate, then confirm with a real Button so the tap always lands) */}
      <Sheet visible={mergeOpen} title="Merge into this player" onClose={() => { setMergeOpen(false); setMergeLoser(null); }}>
        {mergeLoser ? (
          <View style={{ gap: space.md }}>
            <Card style={{ gap: space.xs }}>
              <Text style={type.heading}>Merge players?</Text>
              <Text style={[type.body, { color: palette.inkSoft }]}>
                "{playerName(mergeLoser)}" folds into "{player.name}". Their stats combine under this profile and this can't be undone.
              </Text>
            </Card>
            <View style={{ flexDirection: "row", gap: space.sm }}>
              <Button label="Cancel" variant="secondary" onPress={() => setMergeLoser(null)} style={{ flex: 1 }} />
              <Button label="Merge" icon="people" onPress={confirmMerge} style={{ flex: 1 }} />
            </View>
          </View>
        ) : (
          <>
            <Text style={[type.body, { color: palette.inkSoft }]}>Pick a duplicate to merge into {player.name}. All their stats recalculate under this profile.</Text>
            <View style={styles.chips}>
              {others.map((o) => (
                <Chip key={o.id} label={o.name} onPress={() => { feedback("pop", "select"); setMergeLoser(o.id); }} />
              ))}
            </View>
          </>
        )}
      </Sheet>

      {/* remove / archive — delete is blocked while the player is in a match so no ball reference is ever orphaned */}
      <Sheet visible={removeOpen} title={player.archived ? "Restore player" : "Remove player"} onClose={() => setRemoveOpen(false)}>
        {player.archived ? (
          <>
            <Text style={[type.body, { color: palette.inkSoft }]}>{player.name} is archived. Restore to show them in pickers and lists again.</Text>
            <Button label="Restore player" size="lg" icon="undo" onPress={doArchive} />
          </>
        ) : (
          <>
            <Text style={[type.body, { color: palette.inkSoft }]}>
              {inUse
                ? `${player.name} has match data, so they can't be deleted — that would break a scorecard. Archive instead: they're hidden from lists but every ball they feature in stays intact.`
                : `${player.name} isn't in any match yet. Archive to hide them, or delete the profile permanently.`}
            </Text>
            <Button label="Archive player" size="lg" icon="lock" variant={inUse ? "primary" : "secondary"} onPress={doArchive} />
            {!inUse ? <Button label="Delete permanently" variant="danger" icon="trash" onPress={doDelete} /> : null}
          </>
        )}
      </Sheet>

      {/* add to a team */}
      <Sheet visible={addTeamOpen} title="Add to a team" onClose={() => setAddTeamOpen(false)}>
        <Text style={[type.body, { color: palette.inkSoft }]}>Pick a squad to add {player.name} to. It's saved on this phone.</Text>
        {notInTeams.length ? (
          <View style={styles.chips}>
            {notInTeams.map((t) => (
              <Chip key={t.id} label={t.name} onPress={() => addToTeam(t.id)} />
            ))}
          </View>
        ) : (
          <Text style={type.caption}>{player.name} is already in every team.</Text>
        )}
      </Sheet>
    </Stack>
  );
}

function ToolRow({ icon, title, subtitle, onPress, disabled }: { icon: "swap" | "people" | "shield" | "trash"; title: string; subtitle: string; onPress: () => void; disabled?: boolean }) {
  if (disabled) {
    return (
      <View style={{ opacity: 0.4 }}>
        <ListItem icon={icon} title={title} subtitle={subtitle} chevron={false} />
      </View>
    );
  }
  return <ListItem icon={icon} title={title} subtitle={subtitle} onPress={onPress} />;
}

const styles = StyleSheet.create({
  statRow: { flexDirection: "row", gap: space.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  teamMembershipRow: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 56, paddingVertical: space.sm },
});
