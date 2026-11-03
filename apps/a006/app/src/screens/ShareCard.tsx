import { type ComponentRef, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Button, Icon, Pill, Sheet, feedback, gradient, palette, radius, space, toast, type } from "../ui";
import { analytics } from "../modules/analytics";
import { captureCard, shareCardImage, type ShareKind } from "../modules/shareImage";
import { replay } from "../core/scoring";
import { inningsLine, scorecardText, type NameOf } from "../core/format";
import type { Match } from "../core/types";

/**
 * The shareable result/scorecard card — the brand gradient, the result line, each innings and the top performer.
 * One component used on the live scorer, match detail and (via its own hero) the result screen, so "share a card
 * to the group" is reachable the same way everywhere, not just after the match completes.
 */
export function ShareCard({ match, teamName, playerName }: { match: Match; teamName: NameOf; playerName: NameOf }) {
  const pom = match.pomId;
  const played = match.innings.some((inn) => (inn.events?.length ?? 0) > 0 || inn.scoreOnly);
  return (
    <LinearGradient colors={gradient.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.shareCard}>
      <Text style={[type.overline, { color: gradient.onHeroSoft }]}>Gully Score</Text>
      <Text style={[type.title, { color: gradient.onHero, textAlign: "center" }]} numberOfLines={3}>
        {match.result?.summary ?? `${teamName(match.teamAId)} v ${teamName(match.teamBId)}`}
      </Text>
      <View style={{ alignItems: "center", gap: 2, marginTop: space.xs }}>
        {played ? (
          match.innings.map((inn) => (
            <Text key={inn.id} style={[type.bodyStrong, { color: gradient.onHero }]} numberOfLines={1}>
              {inningsLine(teamName(inn.battingTeamId), replay(inn, match.rules))}
            </Text>
          ))
        ) : (
          <Text style={[type.body, { color: gradient.onHeroSoft, textAlign: "center" }]}>No balls scored yet — the card fills in as you score.</Text>
        )}
      </View>
      {pom ? <Text style={[type.label, { color: gradient.onHero, marginTop: space.xs }]}>🏅 POTM · {playerName(pom)}</Text> : null}
    </LinearGradient>
  );
}

/**
 * Share-card preview sheet with a one-tap share: shows the card, a pressed "Generating…" state, then hands the
 * snapshot PNG to the native share sheet (WhatsApp etc.), falling back to text. Always ends in a visible toast.
 */
export function ShareCardSheet({
  visible,
  match,
  teamName,
  playerName,
  from,
  onClose,
}: {
  visible: boolean;
  match: Match;
  teamName: NameOf;
  playerName: NameOf;
  from: string;
  onClose: () => void;
}) {
  const cardRef = useRef<ComponentRef<typeof View>>(null);
  const [sharing, setSharing] = useState(false);
  // What the last share attempt produced — kept so the sheet shows a LASTING result (not just a toast that can hide),
  // which is exactly what the QA tester couldn't see ("taps had no visible effect"). Reset each time the sheet opens.
  const [result, setResult] = useState<ShareKind | null>(null);
  useEffect(() => {
    if (visible) { setSharing(false); setResult(null); }
  }, [visible]);

  const doShare = async () => {
    if (sharing) return;
    setSharing(true);
    setResult(null);
    feedback("success", "medium");
    // Snapshot WHILE the preview is mounted (the ref must be on-screen). We DON'T close the sheet first: launching the
    // OS chooser from behind a dismissing Modal is what made the Android share sheet never appear in QA. Keep the sheet
    // open, share from it, then land on a visible in-sheet result the tester (and the user) can see.
    const uri = await captureCard(cardRef);
    const text = `🏏 ${scorecardText(match, teamName, playerName)}\n\nvia Gully Score —`;
    const kind = await shareCardImage(uri, { from, text });
    setSharing(false);
    setResult(kind);
    if (kind !== "none") analytics.track("card_shared");
    if (kind === "none") toast("Share cancelled — tap Share again.");
  };

  const shared = result === "image" || result === "text";

  return (
    <Sheet visible={visible} title="Share card" onClose={onClose}>
      <View ref={cardRef} collapsable={false} style={styles.capture}>
        <ShareCard match={match} teamName={teamName} playerName={playerName} />
      </View>
      {shared ? (
        // A lasting, visible confirmation inside the sheet — the share actually happened (or fell back to text).
        <View style={styles.doneRow}>
          <View style={styles.doneIcon}><Icon name="check" size={18} color={palette.onPrimary} /></View>
          <View style={{ flex: 1 }}>
            <Text style={type.bodyStrong}>{result === "image" ? "Card shared 🏏" : "Shared as text 🏏"}</Text>
            <Text style={type.caption}>Sent to the app you picked. Share again or close.</Text>
          </View>
          <Pill label="Done" tone="success" />
        </View>
      ) : null}
      <Button
        label={sharing ? "Opening share…" : shared ? "Share again" : "Share as image"}
        size="lg"
        icon="share"
        loading={sharing}
        onPress={doShare}
      />
      {shared ? (
        <Button label="Close" variant="ghost" onPress={onClose} />
      ) : (
        <Text style={[type.caption, { textAlign: "center" }]}>Shares the card above as an image to WhatsApp, or any app.</Text>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  capture: { borderRadius: radius.xl, overflow: "hidden", backgroundColor: palette.bg },
  shareCard: { borderRadius: radius.xl, padding: space.xl, gap: space.xs, alignItems: "center" },
  doneRow: { flexDirection: "row", alignItems: "center", gap: space.sm, backgroundColor: palette.primarySoft, borderRadius: radius.lg, padding: space.md },
  doneIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: palette.primary, alignItems: "center", justifyContent: "center" },
});
