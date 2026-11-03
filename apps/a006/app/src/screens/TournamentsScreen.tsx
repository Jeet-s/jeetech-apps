import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button, Card, Chip, EmptyState, Icon, IconButton, ListItem, Screen, Sheet, Tappable, TextField, feedback, palette, radius, space, type } from "../ui";
import { appStore, colorFor, useApp } from "./common";
import { useNav } from "../nav";
import { art } from "../art";
import { analytics } from "../modules/analytics";
import { addTeam, createTournament, generateTournamentFixtures } from "../core/app";
import type { AppState } from "../core/app";
import type { Id } from "../core/types";

export function TournamentsScreen({ bottomInset }: { bottomInset: number }) {
  const app = useApp();
  const nav = useNav();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  // Existing teams selected via chips…
  const [picked, setPicked] = useState<Id[]>([]);
  // …and brand-new team names typed in (kept local, created atomically on submit — no per-tap store writes that
  // could race the render and drop a team, which is why "Create & make fixtures" silently did nothing in QA).
  const [pending, setPending] = useState<string[]>([]);
  const [newTeam, setNewTeam] = useState("");

  const reset = () => { setOpen(false); setName(""); setPicked([]); setPending([]); setNewTeam(""); };
  const teamCount = picked.length + pending.length;
  const canCreate = name.trim().length > 0 && teamCount >= 2;

  // Quick-start rematches create a fresh team each time, so the squad can hold several "Street Royals" / "Park
  // Strikers". Showing all of them as separate chips read as "six teams already added" and the tester never tapped
  // any to actually select them (QA: Create stayed dimmed, taps did nothing). Collapse to ONE chip per distinct
  // name (keeping the most recent id) so the picker is honest about how many teams there really are.
  const uniqueTeams = useMemo(() => {
    const byName = new Map<string, (typeof app.teams)[number]>();
    for (const t of app.teams) byName.set(t.name.toLowerCase(), t); // later wins → most recent id per name
    return [...byName.values()];
  }, [app.teams]);

  const toggle = (id: Id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const addTeamInline = () => {
    const nm = newTeam.trim();
    if (!nm) return;
    const key = nm.toLowerCase();
    // Typed an existing team's name? Select that team instead of making a duplicate.
    const existing = app.teams.find((t) => t.name.toLowerCase() === key);
    if (existing) {
      if (!picked.includes(existing.id)) setPicked((p) => [...p, existing.id]);
    } else if (!pending.some((n) => n.toLowerCase() === key)) {
      setPending((p) => [...p, nm]);
    }
    setNewTeam("");
    feedback("pop", "select");
  };
  const removePending = (nm: string) => { setPending((p) => p.filter((n) => n !== nm)); feedback("pop", "light"); };

  const create = () => {
    if (!canCreate) { feedback("error", "error"); return; }
    // Everything in ONE functional update off the latest store, so creating teams, the tournament and its fixtures
    // can never race a stale render (the QA "nothing happens" bug). Capture the new id to open its detail after.
    let createdId: Id | null = null;
    appStore.set((prev: AppState) => {
      let s = prev;
      const ids: Id[] = [...picked];
      for (const nm of pending) {
        const r = addTeam(s, { name: nm, color: colorFor(nm) });
        s = r.state;
        ids.push(r.id);
      }
      const tr = createTournament(s, { name: name.trim(), teamIds: ids, format: "league" });
      s = tr.state;
      s = generateTournamentFixtures(s, tr.id, isoDate());
      createdId = tr.id;
      return s;
    });
    feedback("success", "success");
    analytics.track("tournament_created");
    reset();
    if (createdId) nav.push({ t: "tournament", id: createdId });
  };

  return (
    <Screen title="Cups" subtitle="Tournaments & series" bottomInset={bottomInset} right={<IconButton icon="plus" label="New tournament" tone="primary" onPress={() => setOpen(true)} />}>
      {app.tournaments.length === 0 ? (
        <Card>
          <EmptyState
            art={art.es_tournaments}
            title="No tournaments yet"
            body="Create a league or series, add teams and generate fixtures with an automatic points table and NRR."
            action={<Button label="Create tournament" icon="trophy" onPress={() => setOpen(true)} />}
          />
        </Card>
      ) : (
        /* existing-tournament list */

        <View style={{ gap: space.sm }}>
          {app.tournaments.map((t) => {
            const fixtures = app.fixtures.filter((f) => f.tournamentId === t.id);
            const done = fixtures.filter((f) => f.matchId).length;
            return (
              <ListItem
                key={t.id}
                icon="trophy"
                iconTint={palette.accent}
                title={t.name}
                subtitle={`${t.teamIds.length} teams · ${done}/${fixtures.length} matches played`}
                onPress={() => nav.push({ t: "tournament", id: t.id })}
              />
            );
          })}
        </View>
      )}

      <Sheet visible={open} title="New tournament" onClose={reset}>
        <TextField label="Name" placeholder="e.g. Sunday Gully League" value={name} onChangeText={setName} maxLength={40} autoCapitalize="words" autoCorrect={false} />
        <Text style={type.label}>Teams in this cup {teamCount ? `(${teamCount})` : ""}</Text>
        {uniqueTeams.length ? (
          <>
            {/* Spell out that the chips are TAP-TO-ADD, not teams already in the cup — the exact confusion that left
                the tester staring at a dimmed Create button (QA feature_tour_reach). A ✓ fills each one as it's added. */}
            <Text style={[type.caption, { color: palette.inkMuted }]}>
              {teamCount >= 2 ? "Tap a team to add or remove it." : "Tap your teams to add them — or type a new one below."}
            </Text>
            <View style={styles.chips}>
              {uniqueTeams.map((t) => (
                <Chip key={t.id} label={picked.includes(t.id) ? `✓ ${t.name}` : t.name} selected={picked.includes(t.id)} onPress={() => toggle(t.id)} />
              ))}
            </View>
          </>
        ) : (
          <Text style={type.caption}>Add two or more teams below to get started.</Text>
        )}
        {/* Newly typed teams show as removable tokens so the scorer can SEE each one landed before creating. */}
        {pending.length ? (
          <View style={styles.chips}>
            {pending.map((nm) => (
              <Tappable key={nm} label={`Remove ${nm}`} sound={null} onPress={() => removePending(nm)} style={styles.newChip}>
                <Text style={[type.label, { color: palette.onPrimary }]} numberOfLines={1}>{nm}</Text>
                <Icon name="close" size={13} color={palette.onPrimary} />
              </Tappable>
            ))}
          </View>
        ) : null}
        <View style={{ flexDirection: "row", gap: space.sm, alignItems: "flex-end" }}>
          <View style={{ flex: 1 }}>
            <TextField label="Add a team" placeholder="Team name" value={newTeam} onChangeText={setNewTeam} maxLength={40} autoCapitalize="words" autoCorrect={false} returnKeyType="done" blurOnSubmit={false} onSubmitEditing={addTeamInline} />
          </View>
          <Button label="Add" variant="secondary" icon="plus" disabled={!newTeam.trim()} onPress={addTeamInline} style={{ marginBottom: 2 }} />
        </View>
        {/* Inline hint INSIDE the sheet (a toast would hide behind this modal) + a disabled CTA until it's valid, so
            a tap can never silently no-op the way it did in QA. */}
        <Button label="Create & make fixtures" size="lg" icon="trophy" disabled={!canCreate} onPress={create} />
        {!canCreate ? (
          <Text style={[type.caption, { textAlign: "center", color: palette.inkMuted }]}>
            {!name.trim() ? "Name the tournament, then add at least two teams." : `Add ${2 - teamCount} more team${2 - teamCount === 1 ? "" : "s"} to make fixtures.`}
          </Text>
        ) : (
          <Text style={[type.caption, { textAlign: "center", color: palette.inkMuted }]}>
            Round-robin fixtures, points table and NRR are generated automatically.
          </Text>
        )}
      </Sheet>
    </Screen>
  );
}

function isoDate(): string {
  const d = new Date();
  const p = (v: number) => String(v).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  newChip: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 36, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: palette.primary },
});
