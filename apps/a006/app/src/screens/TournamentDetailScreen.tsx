import { useMemo, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { Button, Card, Chip, IconButton, Pill, Segmented, SectionHeader, Sheet, Tappable, feedback, palette, radius, space, toast, type } from "../ui";
import { Avatar, Stack, Stepper, appStore, colorFor, useApp, useNames } from "./common";
import { TeamSheet } from "./StatsScreen";
import { useNav } from "../nav";
import { analytics } from "../modules/analytics";
import { addPointsOverride, addTeamToTournament, generateTournamentFixtures, leaveTournament } from "../core/app";
import { pointsTable } from "../core/tournament";
import type { Id } from "../core/types";

type Tab = "fixtures" | "table";

export function TournamentDetailScreen({ id, bottomInset }: { id: Id; bottomInset: number }) {
  const app = useApp();
  const nav = useNav();
  const { teamName } = useNames(app.players, app.teams);
  const t = app.tournaments.find((x) => x.id === id);
  // Open a freshly-created tournament ON its Fixtures (the just-generated fixtures ARE the visible result of "run a
  // tournament" — QA tester landed on the empty-looking Table and couldn't confirm the feature). Established cups
  // (any result in) open on the Table, the natural standings view.
  const [tab, setTab] = useState<Tab>(() => {
    const fx = app.fixtures.filter((f) => f.tournamentId === id);
    const anyResult = fx.some((f) => f.matchId && app.matches.find((m) => m.id === f.matchId)?.result);
    return fx.length > 0 && !anyResult ? "fixtures" : "table";
  });
  const [editTeam, setEditTeam] = useState<Id | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [squadTeam, setSquadTeam] = useState<Id | null>(null);
  const [menuTeam, setMenuTeam] = useState<Id | null>(null);
  const [editPts, setEditPts] = useState(0);

  const fixtures = useMemo(() => app.fixtures.filter((f) => f.tournamentId === id).sort((a, b) => a.datetime.localeCompare(b.datetime)), [app.fixtures, id]);
  const table = useMemo(() => (t ? pointsTable(t, app.matches, app.overrides) : []), [t, app.matches, app.overrides]);
  // Recent form (oldest→newest) per team from this cup's finished matches — W / L / T chips in the table.
  const formByTeam = useMemo(() => {
    const m: Record<string, ("W" | "L" | "T")[]> = {};
    const done = app.matches
      .filter((x) => x.tournamentId === id && x.status === "complete" && x.result && x.result.kind !== "abandoned")
      .sort((a, b) => a.date.localeCompare(b.date));
    for (const mt of done) {
      for (const tid of [mt.teamAId, mt.teamBId]) {
        const r = mt.result!;
        const v = r.kind === "tie" ? "T" : r.winnerId === tid ? "W" : "L";
        (m[tid] ??= []).push(v);
      }
    }
    return m;
  }, [app.matches, id]);
  // Top half (min 2) qualify once there are enough teams to make a cut meaningful.
  const qualifyCount = table.length >= 4 ? Math.ceil(table.length / 2) : 0;
  // The next match to play (a scheduled/live fixture), else the most recent result — a "what's next" card that fills
  // the Table tab and gives a one-tap route to score, so the screen is never a table over dead space (QA design #9).
  const nextFixture = useMemo(() => {
    const upcoming = fixtures.find((f) => { const m = f.matchId ? app.matches.find((x) => x.id === f.matchId) : null; return !m || m.status !== "complete"; });
    if (upcoming) return { fixture: upcoming, done: false };
    const last = [...fixtures].reverse().find((f) => f.matchId && app.matches.find((x) => x.id === f.matchId)?.status === "complete");
    return last ? { fixture: last, done: true } : null;
  }, [fixtures, app.matches]);

  if (!t) {
    return <Stack title="Tournament" onBack={() => nav.pop()} bottomInset={bottomInset}><Text style={type.body}>Tournament not found.</Text></Stack>;
  }

  const availableTeams = app.teams.filter((tm) => !t.teamIds.includes(tm.id));

  const regen = () => {
    appStore.set((s) => generateTournamentFixtures(s, id, isoDate()));
    feedback("success", "medium");
    toast("Fixtures generated");
  };
  const scoreFixture = (fixtureId: Id, matchId: Id | null | undefined) => {
    if (matchId) {
      const m = app.matches.find((x) => x.id === matchId);
      if (m && m.status === "complete") nav.push({ t: "match", matchId });
      else nav.push({ t: "scoring", matchId: matchId! });
    } else {
      nav.push({ t: "setup", tournamentId: id, fixtureId });
    }
  };
  const addTeam = (teamId: Id) => {
    appStore.set((s) => addTeamToTournament(s, id, teamId));
    setAddOpen(false);
    feedback("pop", "select");
    toast("Team added — regenerate fixtures to include them.");
  };
  const leave = (teamId: Id) => {
    Alert.alert("Remove team?", `Remove ${teamName(teamId)} from this tournament? They keep all their data.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => { appStore.set((s) => leaveTournament(s, id, teamId)); feedback("pop", "warning"); toast("Team removed"); } },
    ]);
  };
  const saveOverride = () => {
    if (editTeam == null) return;
    appStore.set((s) => addPointsOverride(s, { tournamentId: id, teamId: editTeam, field: "points", value: editPts, note: "Manual table edit" }, Date.now()));
    setEditTeam(null);
    feedback("success", "medium");
    analytics.track("table_viewed");
    toast("Points overridden — logged in the audit trail.");
  };

  return (
    <Stack title={t.name} subtitle={`${t.teamIds.length} teams`} onBack={() => nav.pop()} bottomInset={bottomInset}>
      <Segmented options={[{ value: "table", label: "Table" }, { value: "fixtures", label: "Fixtures" }]} value={tab} onChange={(v) => setTab(v as Tab)} />

      {tab === "table" ? (
        <>
          {table.length === 0 ? (
            <Card><Text style={type.caption}>No teams yet.</Text></Card>
          ) : (
            <Card style={{ gap: 2 }}>
              <View style={styles.row}>
                <Text style={[type.caption, styles.pos]}>#</Text>
                <Text style={[type.caption, { flex: 1 }]}>Team</Text>
                {["P", "W", "L", "Pts"].map((h) => <Text key={h} style={[type.caption, styles.num]}>{h}</Text>)}
                <Text style={[type.caption, styles.numWide]}>NRR</Text>
              </View>
              {table.map((r, i) => {
                const qual = qualifyCount > 0 && i < qualifyCount;
                const form = (formByTeam[r.teamId] ?? []).slice(-5);
                return (
                  <Tappable key={r.teamId} label={`${teamName(r.teamId)}, ${r.points} points${qual ? ", in the qualification zone" : ""}`} onPress={() => { setEditTeam(r.teamId); setEditPts(r.points); }} style={[styles.tRow, qual && styles.qualRow]}>
                    <Text style={[type.amount, styles.pos, qual && { color: palette.primary }]}>{i + 1}</Text>
                    <View style={{ flex: 1, gap: 3 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Avatar name={teamName(r.teamId)} id={r.teamId} size={24} color={colorFor(r.teamId)} />
                        <Text style={[type.bodyStrong, { flex: 1 }]} numberOfLines={1}>{teamName(r.teamId)}</Text>
                        {r.overridden ? <Pill label="edited" tone="warning" /> : null}
                      </View>
                      {form.length ? (
                        <View style={styles.formRow}>
                          {form.map((f, fi) => (
                            <View key={fi} style={[styles.formChip, { backgroundColor: f === "W" ? palette.primary : f === "L" ? palette.danger : palette.inkMuted }]}>
                              <Text style={styles.formTxt}>{f}</Text>
                            </View>
                          ))}
                        </View>
                      ) : null}
                    </View>
                    <Text style={[type.amount, styles.num]}>{r.played}</Text>
                    <Text style={[type.amount, styles.num]}>{r.won}</Text>
                    <Text style={[type.amount, styles.num]}>{r.lost}</Text>
                    <Text style={[type.amount, styles.num, { color: palette.primary }]}>{r.points}</Text>
                    <Text style={[type.amount, styles.numWide]}>{r.nrr > 0 ? "+" : ""}{r.nrr.toFixed(2)}</Text>
                  </Tappable>
                );
              })}
            </Card>
          )}
          <Text style={[type.caption, { textAlign: "center" }]}>
            {qualifyCount > 0 ? "Green = qualification zone. " : ""}Tap a row to edit points. NRR is standard (full quota when all out).
          </Text>
          {nextFixture ? (
            <>
              <SectionHeader title={nextFixture.done ? "Latest result" : "Next up"} action={<Text style={[type.caption, { color: palette.primary }]} onPress={() => setTab("fixtures")}>All fixtures →</Text>} />
              {(() => {
                const f = nextFixture.fixture;
                const m = f.matchId ? app.matches.find((x) => x.id === f.matchId) : null;
                return (
                  <Card accent={nextFixture.done ? palette.primary : palette.accent} style={{ gap: space.sm }}>
                    <View style={styles.fixTop}>
                      <Text style={type.caption}>{f.datetime.replace("T", " · ")}{f.group ? ` · ${f.group}` : ""}</Text>
                      {m?.result ? <Pill label="Result" tone="success" /> : m ? <Pill label="Live" tone="danger" /> : <Pill label="Scheduled" tone="neutral" />}
                    </View>
                    <View style={styles.fixTeams}>
                      <View style={styles.fixTeam}><Avatar name={teamName(f.teamAId)} id={f.teamAId} size={28} color={colorFor(f.teamAId)} /><Text style={[type.bodyStrong, { flex: 1 }]} numberOfLines={1}>{teamName(f.teamAId)}</Text></View>
                      <Text style={type.caption}>v</Text>
                      <View style={styles.fixTeam}><Text style={[type.bodyStrong, { flex: 1, textAlign: "right" }]} numberOfLines={1}>{teamName(f.teamBId)}</Text><Avatar name={teamName(f.teamBId)} id={f.teamBId} size={28} color={colorFor(f.teamBId)} /></View>
                    </View>
                    {m?.result ? <Text style={[type.caption, { color: palette.primary }]} numberOfLines={2}>{m.result.summary}</Text> : null}
                    <Button label={m ? (m.status === "complete" ? "View match" : "Resume scoring") : "Score this match"} variant={m && m.status === "complete" ? "secondary" : "primary"} icon={m && m.status === "complete" ? "chart" : "play"} onPress={() => scoreFixture(f.id, f.matchId)} />
                  </Card>
                );
              })()}
            </>
          ) : null}

          <View style={{ flexDirection: "row", gap: space.sm }}>
            <Button label="Add team" variant="secondary" icon="plus" onPress={() => setAddOpen(true)} style={{ flex: 1 }} />
            <Button label="Regenerate" variant="ghost" onPress={regen} style={{ flex: 1 }} />
          </View>
        </>
      ) : (
        <>
          {fixtures.length === 0 ? (
            <Card style={{ gap: space.sm }}>
              <Text style={type.caption}>No fixtures yet.</Text>
              <Button label="Generate fixtures" icon="trophy" onPress={regen} />
            </Card>
          ) : (
            <View style={{ gap: space.sm }}>
              {fixtures.map((f) => {
                const m = f.matchId ? app.matches.find((x) => x.id === f.matchId) : null;
                return (
                  <Card key={f.id} style={{ gap: space.sm }}>
                    <View style={styles.fixTop}>
                      <Text style={type.caption}>{f.datetime.replace("T", " · ")}{f.group ? ` · ${f.group}` : ""}</Text>
                      {m?.result ? <Pill label="Result" tone="success" /> : m ? <Pill label="Live" tone="danger" /> : <Pill label="Scheduled" tone="neutral" />}
                    </View>
                    <View style={styles.fixTeams}>
                      <View style={styles.fixTeam}><Avatar name={teamName(f.teamAId)} id={f.teamAId} size={28} color={colorFor(f.teamAId)} /><Text style={[type.bodyStrong, { flex: 1 }]} numberOfLines={1}>{teamName(f.teamAId)}</Text></View>
                      <Text style={type.caption}>v</Text>
                      <View style={styles.fixTeam}><Text style={[type.bodyStrong, { flex: 1, textAlign: "right" }]} numberOfLines={1}>{teamName(f.teamBId)}</Text><Avatar name={teamName(f.teamBId)} id={f.teamBId} size={28} color={colorFor(f.teamBId)} /></View>
                    </View>
                    {m?.result ? <Text style={[type.caption, { color: palette.primary }]}>{m.result.summary}</Text> : null}
                    <Button label={m ? (m.status === "complete" ? "View match" : "Resume") : "Score this match"} variant={m ? "secondary" : "primary"} icon={m ? "chart" : "play"} onPress={() => scoreFixture(f.id, f.matchId)} />
                  </Card>
                );
              })}
            </View>
          )}
        </>
      )}

      <SectionHeader title="Teams" />
      <Text style={[type.caption, { marginTop: -space.xs }]}>Tap Squad to manage a team's players. Tap ⋯ for more options.</Text>
      <Card padded={false} style={{ paddingHorizontal: space.lg }}>
        {t.teamIds.map((tid) => {
          const squadSize = app.teams.find((tm) => tm.id === tid)?.playerIds.length ?? 0;
          return (
            // The destructive "Remove" lives in the ⋯ overflow so every team row isn't flanked by a red button (QA
            // design #9); Squad stays as the one explicit inline action.
            <View key={tid} style={styles.teamRow}>
              <Avatar name={teamName(tid)} id={tid} size={30} color={colorFor(tid)} />
              <View style={{ flex: 1 }}>
                <Text style={type.body} numberOfLines={1}>{teamName(tid)}</Text>
                <Text style={[type.caption, { color: palette.inkSoft }]}>{squadSize} in squad</Text>
              </View>
              <Button label="Squad" variant="secondary" size="sm" icon="people" onPress={() => { feedback("pop", "light"); setSquadTeam(tid); }} />
              <IconButton icon="dots" label={`More options for ${teamName(tid)}`} onPress={() => { feedback("pop", "light"); setMenuTeam(tid); }} />
            </View>
          );
        })}
        {t.leftTeamIds.length ? <Text style={[type.caption, { paddingVertical: space.sm }]}>{t.leftTeamIds.length} team(s) left this tournament.</Text> : null}
      </Card>

      <Sheet visible={editTeam !== null} title="Edit points" onClose={() => setEditTeam(null)}>
        <Text style={[type.body, { color: palette.inkSoft }]}>Manual override for {editTeam ? teamName(editTeam) : ""}. Every override is logged in the audit trail.</Text>
        <Stepper label="Points" value={editPts} min={0} max={999} onChange={setEditPts} />
        <Button label="Save override" size="lg" onPress={saveOverride} />
      </Sheet>

      <Sheet visible={menuTeam !== null} title={menuTeam ? teamName(menuTeam) : "Team"} onClose={() => setMenuTeam(null)}>
        <View style={{ gap: space.sm }}>
          <Button label="Manage squad" variant="secondary" icon="people" onPress={() => { const id = menuTeam; setMenuTeam(null); if (id) { feedback("pop", "light"); setSquadTeam(id); } }} />
          <Button label="Edit points" variant="secondary" icon="edit" onPress={() => { const id = menuTeam; setMenuTeam(null); if (id) { const r = table.find((x) => x.teamId === id); setEditTeam(id); setEditPts(r?.points ?? 0); } }} />
          <Button label="Remove from tournament" variant="danger" icon="trash" onPress={() => { const id = menuTeam; setMenuTeam(null); if (id) leave(id); }} />
        </View>
        <Text style={[type.caption, { textAlign: "center" }]}>Removing a team keeps all its matches and player stats.</Text>
      </Sheet>

      <Sheet visible={addOpen} title="Add a team" onClose={() => setAddOpen(false)}>
        {availableTeams.length ? (
          <View style={styles.chips}>
            {availableTeams.map((tm) => (
              <Chip key={tm.id} label={tm.name} onPress={() => addTeam(tm.id)} />
            ))}
          </View>
        ) : (
          <Text style={type.caption}>All your teams are already in this tournament.</Text>
        )}
      </Sheet>

      {/* Manage a team's squad in place — add/remove the scorer's own players (local, on-device). */}
      <TeamSheet teamId={squadTeam} onClose={() => setSquadTeam(null)} />
    </Stack>
  );
}

function isoDate(): string {
  const d = new Date();
  const p = (v: number) => String(v).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 6, gap: 2 },
  tRow: { flexDirection: "row", alignItems: "center", paddingVertical: 7, paddingHorizontal: 6, marginHorizontal: -6, borderRadius: radius.sm, gap: 2 },
  qualRow: { backgroundColor: palette.primarySoft },
  pos: { width: 20 },
  num: { width: 26, textAlign: "right", fontSize: 14 },
  numWide: { width: 48, textAlign: "right", fontSize: 14, fontVariant: ["tabular-nums"], fontFamily: type.amount.fontFamily, color: palette.ink },
  formRow: { flexDirection: "row", gap: 3, marginLeft: 30 },
  formChip: { width: 15, height: 15, borderRadius: 4, alignItems: "center", justifyContent: "center" },
  formTxt: { fontFamily: type.overline.fontFamily, fontSize: 9, lineHeight: 11, color: "#fff" },
  fixTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  fixTeams: { flexDirection: "row", alignItems: "center", gap: space.sm },
  fixTeam: { flex: 1, flexDirection: "row", alignItems: "center", gap: space.sm },
  teamRow: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 44, paddingVertical: space.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
});
