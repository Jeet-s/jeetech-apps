import { useState } from "react";
import { Text, View } from "react-native";
import { Button, Card, EmptyState, ListItem, palette, space, type } from "../ui";
import { Avatar, Stack, colorFor, useApp } from "./common";
import { TeamSheet } from "./StatsScreen";
import { useNav } from "../nav";
import { art } from "../art";
import type { Id } from "../core/types";

/**
 * A dedicated, clearly-labelled "Teams" destination — the squad/roster hub. Reachable in one tap from Home, it
 * lists EVERY team and each row opens its squad sheet where you add or remove your own players (all on-device —
 * there is no account and no inviting of other people). Works before any match is complete.
 */
export function TeamsScreen({ bottomInset }: { bottomInset: number }) {
  const app = useApp();
  const nav = useNav();
  const [teamOpen, setTeamOpen] = useState<Id | null>(null);

  // Finished-match win/loss per team, for the subtitle where we have it.
  const record = (teamId: Id) => {
    let played = 0, won = 0, lost = 0;
    for (const m of app.matches) {
      if (m.status !== "complete") continue;
      if (m.teamAId !== teamId && m.teamBId !== teamId) continue;
      played += 1;
      if (m.result?.winnerId === teamId) won += 1;
      else if (m.result?.kind === "win") lost += 1;
    }
    return { played, won, lost };
  };

  return (
    <>
    <Stack title="Teams" subtitle="Squads & players" onBack={nav.pop} bottomInset={bottomInset}>
      <Text style={[type.body, { color: palette.inkSoft }]}>
        Your teams and their squads, kept on this phone. Tap a team to add or remove players.
      </Text>

      {app.teams.length === 0 ? (
        <Card>
          <EmptyState
            art={art.es_players_stats}
            title="No teams yet"
            body="Teams are created when you set up a match. Start one, then come back here to manage its squad."
            action={<Button label="Start a match" icon="play" onPress={() => nav.push({ t: "setup" })} />}
          />
        </Card>
      ) : (
        <Card padded={false} style={{ paddingHorizontal: space.lg }}>
          {app.teams.map((t) => {
            const r = record(t.id);
            return (
              <ListItem
                key={t.id}
                icon="people"
                title={t.name}
                subtitle={
                  r.played > 0
                    ? `${t.playerIds.length} in squad · ${r.played} played · ${r.won}W ${r.lost}L`
                    : `${t.playerIds.length} in squad · tap to manage players`
                }
                trailing={<Avatar name={t.name} id={t.id} size={30} color={colorFor(t.id)} />}
                onPress={() => setTeamOpen(t.id)}
              />
            );
          })}
        </Card>
      )}
    </Stack>
    {/* Rendered OUTSIDE the Stack's ScrollView — a Modal nested in a ScrollView content container can fail to
        present on device (same fix as More → Account sheet). */}
    <TeamSheet teamId={teamOpen} onClose={() => setTeamOpen(null)} />
    </>
  );
}
