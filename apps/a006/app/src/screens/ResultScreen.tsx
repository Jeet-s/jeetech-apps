import { type ComponentRef, useEffect, useRef, useState } from "react";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { AiReport, Button, Card, Confetti, IconButton, LineChart, Legend, Pill, SectionHeader, Skeleton, categorical, feedback, gradient, palette, radius, space, toast, type } from "../ui";
import { Avatar, useApp, useNames } from "./common";
import { useNav } from "../nav";
import { art } from "../art";
import { analytics } from "../modules/analytics";
import { review } from "../modules/review";
import { ai } from "../modules/ai";
import { share } from "../modules/share";
import { captureCard, shareCardImage } from "../modules/shareImage";
import { overByOver, replay } from "../core/scoring";
import { matchSummaryInput, scorecardText, inningsLine } from "../core/format";
import type { Id, Match } from "../core/types";

/** Result + share cards + an AI match report. Reached when a match completes. */
export function ResultScreen({ matchId }: { matchId: Id }) {
  const app = useApp();
  const nav = useNav();
  const insets = useSafeAreaInsets();
  const { playerName, teamName } = useNames(app.players, app.teams);
  const match = app.matches.find((m) => m.id === matchId);
  const [burst, setBurst] = useState(0);
  const [aiText, setAiText] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [sharing, setSharing] = useState(false);
  const cardRef = useRef<ComponentRef<typeof View>>(null);

  useEffect(() => {
    if (match?.status === "complete") {
      analytics.track("match_completed");
      review.actionCompleted();
      setBurst(1);
    }
  }, [match?.status]);

  if (!match) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 40, alignItems: "center" }]}>
        <Text style={type.body}>Match not found.</Text>
        <Button label="Home" variant="ghost" onPress={() => nav.reset()} />
      </View>
    );
  }

  const result = match.result;
  const pom = match.pomId;
  // Run worm preview — a cumulative-runs line per innings, the visual differentiator the best scorers lead with.
  const scored = match.innings.filter((inn) => !inn.scoreOnly && inn.events.length > 0);
  const wormSeries = scored.map((inn, idx) => ({
    label: teamName(inn.battingTeamId),
    color: categorical[idx % categorical.length],
    values: [0, ...overByOver(inn, match.rules).map((b) => b.cumulative)],
  }));
  const doShare = (from: string, message: string) => {
    feedback("pop", "light");
    toast("Opening share…");
    void share.app(from, message).then((ok) => { if (ok) toast("Shared 🏏"); });
  };
  // The hero result card is shared as a real IMAGE (snapshot of the card on screen), with a text fallback.
  const shareResult = async () => {
    if (sharing) return;
    setSharing(true);
    feedback("pop", "light");
    toast("Preparing card…");
    const uri = await captureCard(cardRef);
    const text = `🏏 ${teamName(match.teamAId)} vs ${teamName(match.teamBId)}\n${result?.summary ?? "Match result"}\n\nScored on Gully Score —`;
    void shareCardImage(uri, { from: "result_card", text }).then((kind) => {
      setSharing(false);
      if (kind === "image") toast("Result shared 🏏");
      else if (kind === "text") toast("Shared as text 🏏");
    });
  };
  const shareCard = () => { analytics.track("card_shared"); doShare("scorecard", `🏏 ${scorecardText(match, teamName, playerName)}\n\nvia Gully Score —`); };
  const sharePom = () => pom && doShare("pom_card", `🏅 Player of the Match: ${playerName(pom)}\n${teamName(match.teamAId)} vs ${teamName(match.teamBId)} — ${result?.summary ?? ""}\n\nvia Gully Score —`);

  const genAi = async () => {
    setAiBusy(true);
    const r = await ai.run("match_summary", matchSummaryInput(match, teamName, playerName));
    setAiBusy(false);
    if (r.ok) { setAiText(r.text); analytics.track("core_action", { feature: "ai_match_report" }); }
    else if (r.reason === "quota") nav.openPro("ai_quota");
    else if (r.reason === "offline") toast("You're offline — try again when connected.");
    else toast(r.reason === "disabled" ? "AI isn't available in this version." : "Couldn't generate a report. Try again.");
  };

  return (
    <View style={styles.root}>
      <View style={[styles.topbar, { paddingTop: insets.top + space.xs }]}>
        <IconButton icon="chevronLeft" label="Home" onPress={() => nav.reset()} />
        <Text style={[type.label, { flex: 1, textAlign: "center" }]} numberOfLines={1}>Result</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xl }]} keyboardShouldPersistTaps="handled">
        {/* result card — wrapped in a ref'd View (collapsable={false}) so we can snapshot it to a shareable PNG */}
        <View ref={cardRef} collapsable={false} style={styles.capture}>
          <LinearGradient colors={gradient.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.resultCard}>
            <Image source={art.ui_share_card_frame} style={styles.frame} resizeMode="contain" accessibilityIgnoresInvertColors />
            <Text style={[type.overline, { color: gradient.onHeroSoft }]}>Gully Score</Text>
            <Text style={[type.title, { color: gradient.onHero, textAlign: "center" }]} numberOfLines={3}>
              {result?.summary ?? "Match complete"}
            </Text>
            <View style={styles.scoreLines}>
              {match.innings.map((inn) => {
                const sum = replay(inn, match.rules);
                return (
                  <Text key={inn.id} style={[type.bodyStrong, { color: gradient.onHero }]} numberOfLines={1}>
                    {inningsLine(teamName(inn.battingTeamId), sum)}
                  </Text>
                );
              })}
            </View>
            {pom ? (
              <View style={styles.pomRow}>
                <Avatar name={playerName(pom)} id={pom} size={30} color="#1A1205" />
                <Text style={[type.label, { color: gradient.onHero }]}>🏅 POTM · {playerName(pom)}</Text>
              </View>
            ) : null}
          </LinearGradient>
        </View>

        <View style={{ flexDirection: "row", gap: space.sm }}>
          <Button label="Share result" icon="share" loading={sharing} onPress={shareResult} style={{ flex: 1 }} />
          <Button label="Scorecard" variant="secondary" icon="chart" onPress={() => nav.replace({ t: "match", matchId })} style={{ flex: 1 }} />
        </View>
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <Button label="Share scorecard" variant="ghost" onPress={shareCard} style={{ flex: 1 }} />
          {pom ? <Button label="Share POTM" variant="ghost" onPress={sharePom} style={{ flex: 1 }} /> : null}
        </View>

        {/* Run worm preview — tap through for the full charts (over-by-over bars, extras breakdown). */}
        {wormSeries.some((s) => s.values.length > 1) ? (
          <>
            <SectionHeader title="Run worm" action={<Text style={[type.caption, { color: palette.primary }]} onPress={() => nav.replace({ t: "match", matchId })}>Full charts →</Text>} />
            <Card style={{ gap: space.sm }}>
              <LineChart series={wormSeries} height={140} />
              <Legend items={wormSeries.map((s) => ({ label: s.label, value: String(s.values[s.values.length - 1]), color: s.color }))} />
            </Card>
          </>
        ) : null}

        {/* AI match report */}
        <SectionHeader title="AI match report" action={<Pill label="Pro · free taste" tone="warning" />} />
        <Card style={{ gap: space.sm }}>
          {aiBusy ? (
            <View style={{ gap: 8 }}>
              <Skeleton width="100%" height={14} />
              <Skeleton width="90%" height={14} />
              <Skeleton width="60%" height={14} />
            </View>
          ) : aiText ? (
            <>
              <Text style={[type.body, { lineHeight: 22 }]}>{aiText}</Text>
              <Button label="Share report" variant="secondary" icon="share" onPress={() => void share.app("ai_report", `🏏 ${aiText}\n\nvia Gully Score —`)} />
              {/* Google Play AI-generated content policy: a report control under every AI response. */}
              <AiReport feature="match_summary" />
            </>
          ) : (
            <>
              <Text style={[type.body, { color: palette.inkSoft }]}>Get a short, shareable match report written for you. Free users get 2 a day; Pro unlocks more.</Text>
              <Button label="Write match report" icon="star" onPress={genAi} />
            </>
          )}
        </Card>

        <Button label="Done" size="lg" variant="ghost" onPress={() => nav.reset()} />
      </ScrollView>
      <View pointerEvents="none" style={[styles.statusBar, { height: insets.top }]} />
      <Confetti trigger={burst} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
  statusBar: { position: "absolute", top: 0, left: 0, right: 0, backgroundColor: palette.bg, zIndex: 10 },
  topbar: { flexDirection: "row", alignItems: "center", paddingHorizontal: space.sm, gap: 2 },
  content: { paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.md, width: "100%", maxWidth: 640, alignSelf: "center" },
  capture: { borderRadius: radius.xl, overflow: "hidden", backgroundColor: palette.bg },
  resultCard: { borderRadius: radius.xl, padding: space.xl, gap: space.sm, alignItems: "center", overflow: "hidden" },
  frame: { position: "absolute", right: -30, bottom: -30, width: 180, height: 180, opacity: 0.18 },
  scoreLines: { alignItems: "center", gap: 2, marginTop: space.xs },
  pomRow: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.sm, backgroundColor: "rgba(255,255,255,0.16)", borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
});
