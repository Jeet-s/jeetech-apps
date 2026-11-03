import { useState } from "react";
import { View } from "react-native";
import { Button, Card, Chip, EmptyState, Screen, space } from "../ui";
import { art } from "../art";
import { useApp, useNames } from "./common";
import { MatchCard } from "./MatchCard";
import { useOpenMatch } from "./HomeScreen";
import { useNav } from "../nav";

type Filter = "all" | "live" | "done";

/** All matches with a quick status filter. */
export function MatchesScreen({ bottomInset }: { bottomInset: number }) {
  const app = useApp();
  const nav = useNav();
  const openMatch = useOpenMatch();
  const { teamName } = useNames(app.players, app.teams);
  const [filter, setFilter] = useState<Filter>("all");

  const matches = [...app.matches].reverse().filter((m) => {
    if (filter === "live") return m.status === "live" || m.status === "innings_break";
    if (filter === "done") return m.status === "complete" || m.status === "abandoned";
    return true;
  });

  return (
    <Screen title="Matches" bottomInset={bottomInset}>
      {app.matches.length === 0 ? (
        <Card>
          <EmptyState
            art={art.es_matches}
            title="No matches yet"
            body="Score your first game — it takes under 20 seconds to start."
            action={<Button label="Start match" icon="play" onPress={() => nav.push({ t: "setup" })} />}
          />
        </Card>
      ) : (
        <>
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <Chip label="All" selected={filter === "all"} onPress={() => setFilter("all")} />
            <Chip label="Live" selected={filter === "live"} onPress={() => setFilter("live")} />
            <Chip label="Finished" selected={filter === "done"} onPress={() => setFilter("done")} />
          </View>
          <Button label="Start match" variant="secondary" icon="plus" onPress={() => nav.push({ t: "setup" })} />
          <View style={{ gap: space.sm }}>
            {matches.map((m) => (
              <MatchCard key={m.id} match={m} teamName={teamName} onPress={() => openMatch(m)} />
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}
