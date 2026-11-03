import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Button, Chip, Icon, Pill, Sheet, Tappable, feedback, palette, radius, space, type } from "../ui";
import { ballLabel } from "../core/format";
import type { BallEvent, Boundary, ExtraType, Id, Match, WicketType } from "../core/types";

export type Editing = { inningsIdx: number; seq: number; event: BallEvent };

/** Resolve a player id → display name; defaults to a plain passthrough when none is supplied. */
export type NameFn = (id: Id | null | undefined) => string;
/** Resolve a team id → its player ids (the squad), for bowler / fielder pickers. */
export type SquadFn = (teamId: Id) => Id[];

const WKT: { k: WicketType; l: string; needsFielder?: boolean; runOut?: boolean }[] = [
  { k: "none", l: "Not out" },
  { k: "bowled", l: "Bowled" },
  { k: "caught", l: "Caught", needsFielder: true },
  { k: "lbw", l: "LBW" },
  { k: "runout", l: "Run out", needsFielder: true, runOut: true },
  { k: "stumped", l: "Stumped", needsFielder: true },
  { k: "hitwicket", l: "Hit wicket" },
  { k: "retired", l: "Retired" },
];

/** Tappable list of every ball in an innings, newest first — pick one to edit. Shared by live scoring and match detail. */
export function BallList({ match, inningsIdx, onPick }: { match: Match; inningsIdx: number; onPick: (seq: number, e: BallEvent) => void }) {
  const inn = match.innings[inningsIdx];
  const bpo = match.rules.ballsPerOver;
  if (!inn || inn.scoreOnly) return <Text style={type.caption}>This innings has no ball-by-ball detail.</Text>;
  if (!inn.events.length) return <Text style={type.caption}>No balls recorded yet.</Text>;
  let legal = 0;
  const rows = inn.events.map((e, seq) => {
    const over = Math.floor(legal / bpo);
    const ball = (legal % bpo) + 1;
    const legalNow = e.extra === "wide" ? !match.rules.wideReBall : e.extra === "noball" ? !match.rules.noBallReBall : true;
    const label = `${over}.${ball}`;
    if (legalNow) legal += 1;
    return { seq, e, label };
  });
  return (
    <View style={{ gap: 6 }}>
      {rows.slice().reverse().map(({ seq, e, label }) => (
        <Tappable key={seq} label={`Edit ball ${label}`} onPress={() => onPick(seq, e)} style={styles.ballItem}>
          <Text style={[type.amount, { width: 44 }]}>{label}</Text>
          <Text style={[type.body, { flex: 1 }]}>{ballLabel(e)}</Text>
          <Text style={[type.caption, { color: palette.primary }]}>Tap to edit</Text>
        </Tappable>
      ))}
    </View>
  );
}

/** Pick a ball from the current innings, then edit it (two-step sheet flow). */
export function BallEditFlow({
  match,
  visible,
  playerName,
  teamPlayers,
  onClose,
  onSave,
}: {
  match: Match;
  visible: boolean;
  playerName: NameFn;
  teamPlayers: SquadFn;
  onClose: () => void;
  onSave: (inningsIdx: number, seq: number, patch: Partial<BallEvent>) => void;
}) {
  const scored = match.innings
    .map((inn, i) => ({ inn, i }))
    .filter(({ inn }) => !inn.scoreOnly && inn.events.length > 0);
  // Default straight to the latest innings with balls so "edit last ball" is one tap.
  const [innIdx, setInnIdx] = useState<number | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  // When opened, jump to the only / latest innings automatically.
  const startIdx = scored.length ? scored[scored.length - 1].i : null;
  const pickInnings = visible && innIdx === null && !editing && scored.length > 1;
  const pickBall = visible && !editing && !pickInnings;
  const activeIdx = innIdx ?? startIdx;

  const close = () => { setInnIdx(null); setEditing(null); onClose(); };

  return (
    <>
      {/* choose innings only when there are two */}
      <Sheet visible={pickInnings} title="Edit which innings?" onClose={close}>
        <View style={{ gap: space.sm }}>
          {scored.map(({ inn, i }, k) => (
            <Button key={inn.id} label={`${k === scored.length - 1 ? "Current" : "1st"} innings`} variant={k === scored.length - 1 ? "primary" : "secondary"} onPress={() => setInnIdx(i)} />
          ))}
        </View>
      </Sheet>

      {/* ball list */}
      <Sheet visible={pickBall} title="Pick a ball to fix" scroll={false} onClose={close}>
        {activeIdx !== null ? (
          <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
            <BallList match={match} inningsIdx={activeIdx} onPick={(seq, event) => setEditing({ inningsIdx: activeIdx, seq, event })} />
          </ScrollView>
        ) : (
          <Text style={type.caption}>Score a ball first — then you can edit any ball here.</Text>
        )}
      </Sheet>

      {/* edit sheet */}
      <EditBallSheet
        editing={editing}
        match={match}
        playerName={playerName}
        teamPlayers={teamPlayers}
        onClose={() => setEditing(null)}
        onSave={(patch) => {
          if (editing) onSave(editing.inningsIdx, editing.seq, patch);
          setEditing(null);
          setInnIdx(null);
          onClose();
        }}
      />
    </>
  );
}

/**
 * Full ball editor — the "fix any mistake after the match" tool. Edits every field of a delivery, not just runs:
 * the runs (rule-driven, incl. 5/7 boundaries), the delivery (wide / no-ball / bye / leg-bye, no-ball drives the
 * free hit), the dismissal (type + fielder + which end was out), and the bowler. A live before → after preview shows
 * exactly what changes; every save is written to the audit log by editMatchBall, with the over view kept intact.
 */
export function EditBallSheet({
  editing,
  match,
  playerName = (id) => (id ? String(id) : "—"),
  teamPlayers = () => [],
  onClose,
  onSave,
}: {
  editing: Editing | { event: BallEvent } | null;
  match?: Match | null;
  playerName?: NameFn;
  teamPlayers?: SquadFn;
  onClose: () => void;
  onSave: (p: Partial<BallEvent>) => void;
}) {
  const [runs, setRuns] = useState(0);
  const [boundary, setBoundary] = useState<Boundary>("none");
  const [extra, setExtra] = useState<ExtraType>("none");
  const [wicket, setWicket] = useState<WicketType>("none");
  const [fielder, setFielder] = useState<Id | null>(null);
  const [end, setEnd] = useState<"striker" | "nonstriker">("striker");
  const [bowler, setBowler] = useState<Id | null>(null);

  // seed from the event when a new ball is opened
  const ev = editing?.event;
  const seedKey = ev ? JSON.stringify([ev.runs, ev.extra, ev.boundary, ev.wicket, ev.fielder, ev.dismissedEnd, ev.bowler]) : "none";
  const [key, setKey] = useState(seedKey);
  if (ev && key !== seedKey) {
    setKey(seedKey);
    setRuns(ev.runs);
    setBoundary(ev.boundary);
    setExtra(ev.extra);
    setWicket(ev.wicket);
    setFielder(ev.fielder ?? null);
    setEnd(ev.dismissedEnd ?? "striker");
    setBowler(ev.bowler ?? null);
  }

  const inn = match && editing && "inningsIdx" in editing ? match.innings[editing.inningsIdx] : null;
  const rules = match?.rules;
  const four = rules?.boundaryFour ?? 4;
  const six = rules?.boundarySix ?? 6;
  // Run keys are rule-driven: plain 0–3, the boundary values (incl. 5/7 gully rules), and odd 5/7 as run-outs do happen.
  const runKeys: { label: string; runs: number; boundary: Boundary }[] = [
    { label: "0", runs: 0, boundary: "none" },
    { label: "1", runs: 1, boundary: "none" },
    { label: "2", runs: 2, boundary: "none" },
    { label: "3", runs: 3, boundary: "none" },
    { label: `${four}`, runs: four, boundary: "four" },
    { label: "5", runs: 5, boundary: "none" },
    { label: `${six}`, runs: six, boundary: "six" },
    { label: "7", runs: 7, boundary: "none" },
  ];
  const canBoundary = extra === "none" || extra === "noball"; // byes/leg-byes/wides are never off the bat

  const extras: { k: ExtraType; l: string }[] = [
    { k: "none", l: "None" },
    { k: "wide", l: "Wide" },
    { k: "noball", l: "No ball" },
    { k: "bye", l: "Bye" },
    { k: "legbye", l: "Leg bye" },
  ];

  const wktDef = WKT.find((w) => w.k === wicket);
  const squad = inn ? teamPlayers(inn.bowlingTeamId) : [];

  // The draft event, used for the before → after preview so a scorer sees exactly what the fix changes.
  const draft: BallEvent | null = ev
    ? {
        ...ev,
        runs,
        extra,
        boundary: canBoundary ? boundary : "none",
        wicket,
        fielder: wktDef?.needsFielder ? fielder : null,
        dismissedEnd: wicket === "runout" ? end : wicket !== "none" ? "striker" : undefined,
        bowler: bowler ?? ev.bowler,
      }
    : null;

  const save = () => {
    onSave({
      runs,
      extra,
      boundary: canBoundary ? boundary : "none",
      wicket,
      fielder: wktDef?.needsFielder ? fielder : null,
      dismissedEnd: wicket === "runout" ? end : wicket !== "none" ? "striker" : undefined,
      // A ball newly turned into a wicket has no 'incoming' chosen here — replay tolerates null (prompts for the
      // next batter live); an existing wicket keeps whoever already came in.
      incoming: wicket !== "none" ? ev?.incoming ?? null : undefined,
      bowler: bowler ?? ev?.bowler,
    });
  };

  return (
    <Sheet visible={!!editing} title="Edit ball" scroll={false} onClose={onClose}>
      {ev && draft ? (
        <View style={styles.diff}>
          <View style={styles.diffCol}>
            <Text style={[type.overline, { color: palette.inkMuted }]}>Before</Text>
            <Text style={[type.bodyStrong, { color: palette.inkSoft }]} numberOfLines={1}>{ballLabel(ev)}</Text>
          </View>
          <Icon name="chevronRight" size={18} color={palette.primary} />
          <View style={styles.diffCol}>
            <Text style={[type.overline, { color: palette.primary }]}>After</Text>
            <Text style={[type.bodyStrong, { color: palette.ink }]} numberOfLines={1}>{ballLabel(draft)}</Text>
          </View>
        </View>
      ) : null}

      <ScrollView style={{ maxHeight: 440 }} showsVerticalScrollIndicator={false}>
        <Text style={type.label}>Runs off this ball</Text>
        {/* A 4-wide grid of big run keys (not thin wrapping chips) so each is an unmissable ~56dp target — the QA
            tester's taps kept "hitting empty area between" the small chips and nothing changed. */}
        <View style={styles.runGrid}>
          {runKeys.map((r) => {
            const on = runs === r.runs && (r.boundary === "none" ? boundary === "none" : boundary === r.boundary);
            const showDot = r.boundary !== "none" && canBoundary;
            return (
              <Tappable
                key={r.label + r.runs}
                label={`${r.runs} run${r.runs === 1 ? "" : "s"}${showDot ? " boundary" : ""}${on ? ", selected" : ""}`}
                role="checkbox"
                accessibilityState={{ checked: on }}
                sound="pop"
                scale={0.95}
                onPress={() => { feedback("pop", "select"); setRuns(r.runs); setBoundary(canBoundary ? r.boundary : "none"); }}
                fill={on ? palette.primary : palette.surfaceAlt}
                fillActive={on ? palette.primaryDark : palette.primary + "59"}
                style={[styles.runKey, on && { borderColor: palette.primary }]}
              >
                <Text style={[type.number, { fontSize: 22, color: on ? palette.onPrimary : palette.ink }]}>
                  {r.label}{showDot ? <Text style={{ color: on ? palette.onPrimary : palette.primary }}>•</Text> : null}
                </Text>
              </Tappable>
            );
          })}
        </View>

        <Text style={type.label}>Delivery</Text>
        <View style={styles.chips}>
          {extras.map((e) => (
            <Chip key={e.k} label={e.l} selected={extra === e.k} onPress={() => { setExtra(e.k); if (e.k !== "none" && e.k !== "noball") setBoundary("none"); }} />
          ))}
        </View>
        {extra === "noball" && rules?.freeHitOnNoBall ? <Pill label="No-ball → free hit next ball" tone="warning" /> : null}

        <Text style={type.label}>Dismissal</Text>
        <View style={styles.chips}>
          {WKT.map((w) => (
            <Chip key={w.k} label={w.l} selected={wicket === w.k} onPress={() => { setWicket(w.k); if (!WKT.find((x) => x.k === w.k)?.needsFielder) setFielder(null); }} />
          ))}
        </View>
        {wktDef?.runOut ? (
          <>
            <Text style={type.label}>Which batter was out?</Text>
            <View style={styles.chips}>
              <Chip label="Striker" selected={end === "striker"} onPress={() => setEnd("striker")} />
              <Chip label="Non-striker" selected={end === "nonstriker"} onPress={() => setEnd("nonstriker")} />
            </View>
          </>
        ) : null}
        {wktDef?.needsFielder && squad.length ? (
          <>
            <Text style={type.label}>Fielder</Text>
            <View style={styles.chips}>
              {squad.map((id) => (
                <Chip key={id} label={playerName(id)} selected={fielder === id} onPress={() => setFielder(id)} />
              ))}
            </View>
          </>
        ) : null}

        {squad.length ? (
          <>
            <Text style={type.label}>Bowler</Text>
            <View style={styles.chips}>
              {squad.map((id) => (
                <Chip key={id} label={playerName(id)} selected={(bowler ?? ev?.bowler) === id} onPress={() => setBowler(id)} />
              ))}
            </View>
          </>
        ) : null}
      </ScrollView>

      <Button label="Save correction" size="lg" icon="check" onPress={save} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  ballItem: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 44, paddingVertical: 6, paddingHorizontal: space.sm, borderRadius: radius.sm, backgroundColor: palette.surfaceAlt },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginBottom: space.xs },
  runGrid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginBottom: space.xs },
  // ~4 per row on a 360dp sheet; a tall, clearly-bordered key with a press fill so every tap reads.
  runKey: { width: "22%", flexGrow: 1, minHeight: 54, borderRadius: radius.md, borderWidth: 1.5, borderColor: palette.border, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  diff: { flexDirection: "row", alignItems: "center", gap: space.sm, backgroundColor: palette.surfaceAlt, borderRadius: radius.md, padding: space.sm },
  diffCol: { flex: 1, gap: 2 },
});
