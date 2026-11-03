import { useMemo, useState } from "react";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { Button, Card, Chip, EmptyState, HeroCard, IconButton, ListItem, ProgressBar, Screen, SectionHeader, Segmented, Sheet, Tappable, TextField, feedback, gradient, palette, space, toast, type } from "../ui";
import { Avatar, appStore, colorFor, useApp, useNames } from "./common";
import { useNav } from "../nav";
import { art } from "../art";
import { analytics } from "../modules/analytics";
import { useSettings } from "../modules/store";
import { addPlayer, addPlayerToTeam, mergePlayers, removePlayerFromTeam, type AppState } from "../core/app";
import { careerStats, recentForm, resolvePlayer } from "../core/stats";
import type { CareerStats } from "../core/stats";
import type { Id, Team } from "../core/types";

type Tab = "players" | "teams";
type LeaderTab = "batting" | "bowling" | "fielding";
const FORMATS = [
  { v: "all", l: "All" },
  { v: "gully", l: "Gully" },
  { v: "t10", l: "T10" },
  { v: "t20", l: "T20" },
  { v: "odi", l: "ODI" },
];

export function StatsScreen({ bottomInset }: { bottomInset: number }) {
  const app = useApp();
  const nav = useNav();
  const { pro } = useSettings();
  const { playerName, teamName } = useNames(app.players, app.teams);
  const [tab, setTab] = useState<Tab>("players");
  const [leaderTab, setLeaderTab] = useState<LeaderTab>("batting");
  const [format, setFormat] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [teamOpen, setTeamOpen] = useState<Id | null>(null);
  const [mergeOpen, setMergeOpen] = useState(false);

  const filter = format === "all" ? {} : { format };
  const stats = useMemo(() => careerStats(app.matches, app.players, filter), [app.matches, app.players, format]);
  const activePlayers = app.players.filter((p) => !p.mergedInto && !p.archived);

  const withStats = activePlayers
    .map((p) => ({ p, c: stats.get(p.id) }))
    .filter((x): x is { p: typeof x.p; c: CareerStats } => !!x.c && x.c.matches > 0);

  const topRuns = [...withStats].filter((x) => x.c.batting.runs > 0).sort((a, b) => b.c.batting.runs - a.c.batting.runs).slice(0, 5);
  // A mini "last innings" form sparkline per batting leader — the differentiating detail flat value-bars lack. Oldest
  // → newest so the trend reads left-to-right. Memoised (each entry replays innings) and only for the ≤5 shown.
  const battingForm = useMemo(() => {
    const m = new Map<Id, number[]>();
    for (const { p } of topRuns) m.set(p.id, recentForm(app.matches, app.players, p.id, 6).map((f) => f.runs).reverse());
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.matches, app.players, format]);
  const topWkts = [...withStats].filter((x) => x.c.bowling.wickets > 0).sort((a, b) => b.c.bowling.wickets - a.c.bowling.wickets).slice(0, 5);
  const topField = [...withStats]
    .filter((x) => x.c.catches + x.c.runouts > 0)
    .sort((a, b) => b.c.catches + b.c.runouts - (a.c.catches + a.c.runouts))
    .slice(0, 5);
  // The standout to spotlight on the hero card (most runs) — the "top performer imagery" the scorecard leaders lack.
  const star = topRuns[0];

  // team rankings
  const teamRows = app.teams.map((t) => {
    let played = 0, won = 0, lost = 0;
    for (const m of app.matches) {
      if (m.status !== "complete") continue;
      if (m.teamAId !== t.id && m.teamBId !== t.id) continue;
      played += 1;
      if (m.result?.winnerId === t.id) won += 1;
      else if (m.result?.kind === "win") lost += 1;
    }
    return { t, played, won, lost };
  }).filter((r) => r.played > 0).sort((a, b) => b.won - a.won || a.lost - b.lost);

  const save = () => {
    const r = addPlayer(app, { name });
    if (r.error) { feedback("error", "error"); return setErr(r.error === "duplicate" ? "A player with this name exists." : r.error === "too_long" ? "Keep it under 40 characters." : "Enter a name."); }
    appStore.set(() => r.state as AppState);
    feedback("success", "success");
    setAddOpen(false);
    setName("");
    toast("Player added");
  };

  const totalPlayers = activePlayers.length;
  // Every match with any scored balls (complete, live or at the break) — so the hero count never undershoots the
  // per-player "N matches" on the leaderboards below, which also count in-progress innings (QA: "1 match scored" sat
  // above a player showing 2 innings).
  const totalMatches = app.matches.filter((m) => m.innings.some((inn) => (inn.events?.length ?? 0) > 0 || !!inn.scoreOnly)).length;

  return (
    <Screen title="Stats" bottomInset={bottomInset} right={<IconButton icon="plus" label="Add player" tone="primary" onPress={() => { setName(""); setErr(null); setAddOpen(true); }} />}>
      <HeroCard
        overline="Career stats · free forever"
        value={`${totalPlayers}`}
        caption={`${totalPlayers === 1 ? "player" : "players"} · ${totalMatches} ${totalMatches === 1 ? "match" : "matches"} scored`}
        status={{ label: "No paywall on stats", tone: "success" }}
        right={
          star ? (
            // Spotlight the leading run-scorer — a real "top performer" visual on the hero, not a generic logo.
            <Tappable label={`Top scorer ${star.p.name}, ${star.c.batting.runs} runs`} sound="pop" scale={0.96} onPress={() => nav.push({ t: "player", id: star.p.id })} style={styles.starWrap}>
              <Avatar name={star.p.name} id={star.p.id} size={52} color={gradient.onHero} />
              <Text style={[type.overline, { color: gradient.onHeroSoft, marginTop: 4 }]} numberOfLines={1} adjustsFontSizeToFit>Top scorer</Text>
              <Text style={[type.bodyStrong, { color: gradient.onHero }]} numberOfLines={1} adjustsFontSizeToFit>{star.p.name}</Text>
              <Text style={[type.caption, { color: gradient.onHeroSoft }]} numberOfLines={1}>{star.c.batting.runs} runs</Text>
            </Tappable>
          ) : (
            <Image source={art.ui_logo_mark} style={styles.heroLogo} resizeMode="contain" accessibilityIgnoresInvertColors />
          )
        }
      />

      {app.players.length === 0 ? (
        <Card>
          <EmptyState
            art={art.es_players_stats}
            title="No players yet"
            body="Score a match or add players, and career stats build up automatically."
            action={<Button label="Start a match" icon="play" onPress={() => nav.push({ t: "setup" })} />}
          />
        </Card>
      ) : (
        <>
          <Segmented options={[{ value: "players", label: "Players" }, { value: "teams", label: "Teams" }]} value={tab} onChange={(v) => setTab(v as Tab)} />

          {tab === "players" ? (
            <>
              {/* Merge is a headline "how we win" tool, so it gets a clear button up top — QA couldn't find it buried at
                  the bottom of the players list or deep under a profile's Tools section. */}
              {activePlayers.length >= 2 ? (
                <Button label="Merge duplicate players" variant="secondary" icon="people" onPress={() => { feedback("pop", "light"); setMergeOpen(true); }} />
              ) : null}
              <View style={styles.chips}>
                {FORMATS.map((f) => (
                  <Chip key={f.v} label={f.l} selected={format === f.v} onPress={() => setFormat(f.v)} />
                ))}
              </View>

              {withStats.length === 0 ? (
                <Card><Text style={type.caption}>No stats for this filter yet — score a match to build them.</Text></Card>
              ) : (
                <>
                  {/* One segmented leaderboard — Batting / Bowling / Fielding — instead of two stacked lists, so the
                      category leaders are one tap apart and the screen reads like a real stats hub (QA design review). */}
                  <SectionHeader title="Leaderboards" />
                  <Segmented
                    options={[{ value: "batting", label: "Batting" }, { value: "bowling", label: "Bowling" }, { value: "fielding", label: "Fielding" }]}
                    value={leaderTab}
                    onChange={(v) => { feedback("pop", "select"); setLeaderTab(v as LeaderTab); }}
                  />
                  <Card style={{ gap: space.sm }}>
                    {leaderTab === "batting" ? (
                      topRuns.length ? topRuns.map(({ p, c }, i) => (
                        <LeaderRow
                          key={p.id}
                          rank={i}
                          name={p.name}
                          id={p.id}
                          subtitle={`${c.batting.innings} inn · HS ${c.batting.highScore} · SR ${c.batting.strikeRate.toFixed(0)}`}
                          value={c.batting.runs}
                          max={topRuns[0]?.c.batting.runs ?? 1}
                          form={battingForm.get(p.id)}
                          onPress={() => nav.push({ t: "player", id: p.id })}
                        />
                      )) : <Text style={type.caption}>No runs scored for this filter yet.</Text>
                    ) : leaderTab === "bowling" ? (
                      topWkts.length ? topWkts.map(({ p, c }, i) => (
                        <LeaderRow
                          key={p.id}
                          rank={i}
                          name={p.name}
                          id={p.id}
                          subtitle={`econ ${c.bowling.economy.toFixed(1)} · ${c.bowling.innings} inn`}
                          value={c.bowling.wickets}
                          max={topWkts[0]?.c.bowling.wickets ?? 1}
                          tone={palette.accent}
                          onPress={() => nav.push({ t: "player", id: p.id })}
                        />
                      )) : <Text style={type.caption}>No wickets taken for this filter yet.</Text>
                    ) : (
                      topField.length ? topField.map(({ p, c }, i) => (
                        <LeaderRow
                          key={p.id}
                          rank={i}
                          name={p.name}
                          id={p.id}
                          subtitle={`${c.catches} caught · ${c.runouts} run out`}
                          value={c.catches + c.runouts}
                          max={topField[0] ? topField[0].c.catches + topField[0].c.runouts : 1}
                          tone={palette.primary}
                          onPress={() => nav.push({ t: "player", id: p.id })}
                        />
                      )) : <Text style={type.caption}>No catches or run-outs recorded yet.</Text>
                    )}
                  </Card>
                </>
              )}

              {!pro ? (
                <Card style={styles.upsell}>
                  <Text style={type.heading}>Compare players & deep analytics</Text>
                  <Text style={[type.body, { color: palette.inkSoft }]}>Pro adds head-to-head deep dives, player comparisons and bulk export. Your basic stats stay free.</Text>
                  <Button label="See Pro" icon="star" onPress={() => nav.openPro("stats_compare")} />
                </Card>
              ) : null}

              <SectionHeader
                title="All players"
                action={activePlayers.length >= 2 ? <Text style={[type.caption, { color: palette.primary }]} onPress={() => { feedback("pop", "light"); setMergeOpen(true); }}>Merge duplicates</Text> : undefined}
              />
              <Card padded={false} style={{ paddingHorizontal: space.lg }}>
                {activePlayers.map((p) => {
                  const c = stats.get(resolvePlayer(p.id, app.players));
                  return (
                    <ListItem
                      key={p.id}
                      title={p.name}
                      subtitle={c && c.matches ? `${c.batting.runs} runs · ${c.bowling.wickets} wkts · ${c.matches} matches` : "No matches yet"}
                      trailing={<Avatar name={p.name} id={p.id} size={30} />}
                      onPress={() => nav.push({ t: "player", id: p.id })}
                    />
                  );
                })}
              </Card>
              {activePlayers.length >= 2 ? (
                <ListItem
                  icon="people"
                  title="Merge duplicate players"
                  subtitle="Same person scored under two names? Combine them — stats recalculate."
                  onPress={() => { feedback("pop", "light"); setMergeOpen(true); }}
                />
              ) : null}
            </>
          ) : (
            <>
              {app.teams.length === 0 ? (
                <Card><Text style={type.caption}>Teams are created when you set up a match. Start a match to add teams, then manage each squad here.</Text></Card>
              ) : (
                <>
                  {/* Every team is listed and tappable — ranked ones first, then teams with no finished match yet — so
                      roster management is reachable before any match is complete. */}
                  <Card padded={false} style={{ paddingHorizontal: space.lg }}>
                    {[...teamRows, ...app.teams.filter((t) => !teamRows.some((r) => r.t.id === t.id)).map((t) => ({ t, played: 0, won: 0, lost: 0 }))].map((r, i) => (
                      <ListItem
                        key={r.t.id}
                        icon="people"
                        title={r.played > 0 ? `${i + 1}. ${r.t.name}` : r.t.name}
                        subtitle={r.played > 0 ? `${r.played} played · ${r.won} won · ${r.lost} lost · tap for squad` : `${r.t.playerIds.length} in squad · tap to manage`}
                        trailing={<Avatar name={r.t.name} id={r.t.id} size={30} color={colorFor(r.t.id)} />}
                        onPress={() => { feedback("pop", "light"); setTeamOpen(r.t.id); }}
                      />
                    ))}
                  </Card>
                  <Text style={[type.caption, { paddingHorizontal: space.xs }]}>Tap a team to manage its squad — add or remove your players.</Text>
                </>
              )}
            </>
          )}
        </>
      )}

      <Sheet visible={addOpen} title="Add player" onClose={() => setAddOpen(false)}>
        <TextField label="Name" placeholder="e.g. Rohan" value={name} onChangeText={(t) => { setName(t); setErr(null); }} error={err} maxLength={40} autoFocus returnKeyType="done" onSubmitEditing={save} />
        <Button label="Add player" size="lg" onPress={save} />
      </Sheet>

      <TeamSheet teamId={teamOpen} onClose={() => setTeamOpen(null)} />
      <MergeSheet visible={mergeOpen} players={activePlayers} onClose={() => setMergeOpen(false)} />
    </Screen>
  );
}

/**
 * Team detail reached by tapping a team in Stats → Teams: manage the squad entirely on-device. Add any of your
 * players to this team or remove them — an immediate, lasting result (the squad list updates in place). There is
 * no account and no inviting of other people; a "team" is just the scorer's own roster.
 */
export function TeamSheet({ teamId, onClose }: { teamId: Id | null; onClose: () => void }) {
  const app = useApp();
  const { playerName } = useNames(app.players, app.teams);
  const team: Team | undefined = teamId ? app.teams.find((t) => t.id === teamId) : undefined;

  const add = (t: Team, playerId: Id) => {
    appStore.set((s) => addPlayerToTeam(s, t.id, playerId) as AppState);
    feedback("success", "medium");
    analytics.track("roster_edited");
    toast(`${playerName(playerId)} added to ${t.name}`);
  };

  const remove = (t: Team, playerId: Id) => {
    appStore.set((s) => removePlayerFromTeam(s, t.id, playerId) as AppState);
    feedback("pop", "light");
    toast(`${playerName(playerId)} removed from ${t.name}`);
  };

  const notInSquad = team
    ? app.players.filter((p) => !p.mergedInto && !p.archived && !team.playerIds.includes(p.id))
    : [];

  return (
    <Sheet visible={!!team} title={team?.name ?? "Team"} scroll={false} onClose={onClose}>
      {team ? (
        <>
          <Text style={[type.body, { color: palette.inkSoft }]}>Manage this squad — add or remove your players. It's all kept on this phone.</Text>

          <SectionHeader title={`Squad · ${team.playerIds.length}`} />
          <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
            <View style={{ gap: space.sm }}>
              {team.playerIds.length === 0 ? (
                <Text style={type.caption}>No players in this team yet. Add some from the list below.</Text>
              ) : team.playerIds.map((pid) => (
                <View key={pid} style={styles.squadRow}>
                  <Avatar name={playerName(pid)} id={pid} size={34} />
                  <View style={{ flex: 1 }}>
                    <Text style={type.bodyStrong} numberOfLines={1}>{playerName(pid)}</Text>
                  </View>
                  <Button label="Remove" variant="ghost" size="sm" onPress={() => remove(team, pid)} />
                </View>
              ))}

              {notInSquad.length ? (
                <>
                  <SectionHeader title="Add a player" />
                  {notInSquad.map((p) => (
                    <View key={p.id} style={styles.squadRow}>
                      <Avatar name={p.name} id={p.id} size={34} />
                      <View style={{ flex: 1 }}>
                        <Text style={type.bodyStrong} numberOfLines={1}>{p.name}</Text>
                      </View>
                      <Button label="Add" variant="secondary" size="sm" icon="plus" onPress={() => add(team, p.id)} />
                    </View>
                  ))}
                </>
              ) : (
                <Text style={[type.caption, { paddingTop: space.sm }]}>Every player is already in this squad. Add more from Stats → Add player.</Text>
              )}
            </View>
          </ScrollView>
        </>
      ) : null}
    </Sheet>
  );
}

/**
 * Merge duplicate players straight from the Stats list — the QA tester couldn't find merge (it was only buried in a
 * player's profile Tools below the fold). Pick the profile to KEEP, then the duplicate to fold in; confirm with a
 * real in-sheet Button (never a native Alert over the Sheet, which Android swallows). Stats recalculate on merge.
 */
function MergeSheet({ visible, players, onClose }: { visible: boolean; players: { id: Id; name: string }[]; onClose: () => void }) {
  const [keep, setKeep] = useState<Id | null>(null);
  const [dupe, setDupe] = useState<Id | null>(null);

  const reset = () => { setKeep(null); setDupe(null); };
  const close = () => { reset(); onClose(); };
  const keepName = players.find((p) => p.id === keep)?.name ?? "";
  const dupeName = players.find((p) => p.id === dupe)?.name ?? "";

  const confirm = () => {
    if (!keep || !dupe || keep === dupe) return;
    appStore.set((s) => mergePlayers(s, dupe, keep, Date.now()));
    feedback("success", "medium");
    analytics.track("player_merged");
    close();
    toast("Players merged — stats recalculated.");
  };

  return (
    <Sheet visible={visible} title="Merge duplicate players" onClose={close}>
      <Text style={[type.body, { color: palette.inkSoft }]}>1. Pick the profile to <Text style={type.bodyStrong}>keep</Text>.</Text>
      <View style={styles.chips}>
        {players.map((p) => (
          <Chip key={p.id} label={p.name} selected={keep === p.id} onPress={() => { feedback("pop", "select"); setKeep(p.id); if (dupe === p.id) setDupe(null); }} />
        ))}
      </View>
      {keep ? (
        <>
          <Text style={[type.body, { color: palette.inkSoft, marginTop: space.sm }]}>2. Pick the <Text style={type.bodyStrong}>duplicate</Text> to fold into {keepName}.</Text>
          <View style={styles.chips}>
            {players.filter((p) => p.id !== keep).map((p) => (
              <Chip key={p.id} label={p.name} selected={dupe === p.id} onPress={() => { feedback("pop", "select"); setDupe(p.id); }} />
            ))}
          </View>
        </>
      ) : null}
      {keep && dupe ? (
        <>
          <Card style={{ gap: 2, marginTop: space.sm }}>
            <Text style={type.bodyStrong} numberOfLines={2}>"{dupeName}" folds into "{keepName}"</Text>
            <Text style={type.caption}>Their stats combine under {keepName}. This can't be undone.</Text>
          </Card>
          <Button label={`Merge into ${keepName}`} size="lg" icon="people" onPress={confirm} />
        </>
      ) : null}
    </Sheet>
  );
}

const MEDALS = ["🥇", "🥈", "🥉"];

/** A rich leaderboard row: medal/rank, avatar, a value bar scaled to the leader, an optional form sparkline, the figure. */
function LeaderRow({ rank, name, id, subtitle, value, max, tone = palette.primary, form, onPress }: { rank: number; name: string; id: string; subtitle: string; value: number; max: number; tone?: string; form?: number[]; onPress: () => void }) {
  return (
    <Tappable label={`${name}, ${value}`} sound="pop" scale={0.98} onPress={onPress} style={styles.leaderRow}>
      <View style={styles.rankBadge}>
        {rank < 3 ? <Text style={{ fontSize: 17 }}>{MEDALS[rank]}</Text> : <Text style={[type.amount, { color: palette.inkMuted }]}>{rank + 1}</Text>}
      </View>
      <Avatar name={name} id={id} size={36} />
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <Text style={[type.bodyStrong, { flex: 1 }]} numberOfLines={1}>{name}</Text>
          <Text style={[type.amount, { color: tone }]}>{value}</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <View style={{ flex: 1 }}><ProgressBar value={max > 0 ? value / max : 0} color={tone} height={6} /></View>
          {form && form.length >= 2 ? <FormSparkline data={form} tone={tone} /> : null}
        </View>
        <Text style={type.caption} numberOfLines={1}>{subtitle}</Text>
      </View>
    </Tappable>
  );
}

/** A tiny last-innings sparkline (oldest→newest) — a duck shows as a faint stub so recent failures read at a glance. */
function FormSparkline({ data, tone }: { data: number[]; tone: string }) {
  const max = Math.max(1, ...data);
  return (
    <View style={styles.spark} accessibilityLabel={`Recent scores ${data.join(", ")}`}>
      {data.map((v, i) => (
        <View key={i} style={[styles.sparkBar, { height: 3 + (v / max) * 15, backgroundColor: v === 0 ? palette.inkMuted : tone, opacity: v === 0 ? 0.55 : 1 }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  upsell: { gap: space.sm, backgroundColor: palette.primarySoft, shadowOpacity: 0, elevation: 0 },
  squadRow: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 48 },
  heroLogo: { width: 72, height: 72 },
  starWrap: { width: 112, alignItems: "center" },
  leaderRow: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.xs, minHeight: 56 },
  rankBadge: { width: 26, alignItems: "center", justifyContent: "center" },
  spark: { flexDirection: "row", alignItems: "flex-end", justifyContent: "flex-end", gap: 2, height: 18, width: 52 },
  sparkBar: { width: 5, borderRadius: 2 },
});
