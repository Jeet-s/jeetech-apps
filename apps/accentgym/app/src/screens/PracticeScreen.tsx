import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  Button,
  Card,
  HeroCard,
  Icon,
  FocusSentence,
  MouthIllustration,
  Pill,
  ProgressRing,
  Screen,
  gradient,
  palette,
  radius,
  space,
  toast,
  type,
} from "../ui";
import { SpeakSheet, type SpeakMode } from "./SpeakSheet";
import { canOfferPro } from "../modules/purchase-ui";
import { review } from "../modules/review";
import { analytics } from "../modules/analytics";
import { gymStore, useGym } from "../core/data";
import {
  advanceSession,
  completeSession,
  pro as isProNow,
  todaysSession,
} from "../core/state";
import { clarityLabel, clarityScore } from "../core/assessment";
import { sentenceForSound } from "../core/sentences";
import { soundLabel } from "../core/accent";
import { SOUND_BY_ID } from "../core/sounds";
import { remaining, FREE_DAILY } from "../core/quota";
import { atRisk } from "../core/streak";
import { resumeIndex } from "../core/session";
import { dateKey } from "../core/dates";

/**
 * Home: opens straight to a line with the mic ready (fewer taps than ELSA/
 * BoldVoice). The hero shows the streak; one tap records today's weakest-sound
 * line; a 5-minute session strings the due words + weak sounds together.
 */
export function PracticeScreen({ bottomInset, onPro, onAssessment }: { bottomInset: number; onPro: (from: string) => void; onAssessment?: () => void }) {
  const gym = useGym();
  const today = dateKey(new Date());
  const now = Date.now();
  const pro = isProNow(gym, now);
  const left = remaining(gym.quota, today, pro);

  const [mode, setMode] = useState<SpeakMode | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [withoutMic, setWithoutMic] = useState(false);
  const [sessionOn, setSessionOn] = useState(false);

  const weakest = gym.plan[0];
  const todaysSentence = useMemo(() => (weakest ? sentenceForSound(weakest, pro) : undefined), [weakest, pro]);
  const session = useMemo(() => todaysSession(gym, today, now), [gym, today, now]);
  const sessionIdx = resumeIndex(gym.sessionProgress, today);
  const sessionDone = session.items.length > 0 && sessionIdx >= session.items.length;

  const clarity = clarityScore([...gym.diagnostics, ...gym.attempts]);
  const clarityBand = clarity > 0 ? clarityLabel(clarity) : null;

  const openLine = (guided = false) => {
    if (!todaysSentence) return;
    setWithoutMic(guided);
    setSessionOn(false);
    setMode({ kind: "practice", sentenceId: todaysSentence.id, text: todaysSentence.text, soundTags: todaysSentence.soundTags, title: "Today's line" });
    setSpeaking(true);
  };

  const sessionModeFor = (i: number): SpeakMode | null => {
    const it = session.items[i];
    if (!it) return null;
    return { kind: "practice", sentenceId: it.kind === "srs" ? undefined : it.refId, text: it.text, soundTags: it.soundTags, title: `Session · ${i + 1}/${session.items.length}` };
  };

  const startSession = () => {
    const start = sessionDone ? 0 : sessionIdx;
    const m = sessionModeFor(start);
    if (!m) return;
    setWithoutMic(false);
    if (sessionDone) gymStore.set(s => ({ ...s, sessionProgress: { date: today, index: 0, total: session.items.length } }));
    setSessionOn(true);
    setMode(m);
    setSpeaking(true);
  };

  const onSessionClose = () => {
    // Advance one item; open the next, or finish with the streak + a celebration.
    const nextIdx = resumeIndex(gymStore.get().sessionProgress, today) + 1;
    gymStore.set((s) => advanceSession(s, today, now));
    const next = sessionModeFor(nextIdx);
    if (next && nextIdx < session.items.length) {
      setMode(next);
    } else {
      gymStore.set((s) => completeSession(s, today, now));
      analytics.track("core_action", { feature: "daily_session" });
      review.actionCompleted();
      setSpeaking(false);
      setSessionOn(false);
      toast("Session complete — streak kept! 🔥");
    }
  };

  return (
    <>
      <PracticeBody
        gym={gym}
        pro={pro}
        left={left}
        clarityBand={clarityBand}
        weakest={weakest}
        todaysSentence={todaysSentence}
        session={session}
        sessionIdx={sessionIdx}
        sessionDone={sessionDone}
        bottomInset={bottomInset}
        onLine={() => openLine()}
        onListen={() => openLine(true)}
        onSession={startSession}
        onPro={onPro}
        onAssessment={onAssessment}
      />
      <SpeakSheet
        visible={speaking}
        mode={mode}
        startWithoutMic={withoutMic}
        onPro={onPro}
        onClose={() => { setSpeaking(false); setSessionOn(false); }}
        onScored={sessionOn ? onSessionClose : undefined}
      />
    </>
  );
}

function PracticeBody({
  gym,
  pro,
  left,
  clarityBand,
  weakest,
  todaysSentence,
  session,
  sessionIdx,
  sessionDone,
  bottomInset,
  onLine,
  onListen,
  onSession,
  onPro,
  onAssessment,
}: {
  gym: ReturnType<typeof useGym>;
  pro: boolean;
  left: number;
  clarityBand: string | null;
  weakest: string | undefined;
  todaysSentence: ReturnType<typeof sentenceForSound>;
  session: ReturnType<typeof todaysSession>;
  sessionIdx: number;
  sessionDone: boolean;
  bottomInset: number;
  onLine: () => void;
  onListen: () => void;
  onSession: () => void;
  onPro: (from: string) => void;
  onAssessment?: () => void;
}) {
  const today = dateKey(new Date());
  const streak = gym.streak.current;
  const risk = atRisk(gym.streak, today);
  const sessionFrac = session.items.length ? sessionIdx / session.items.length : 0;
  const needsAssessment = gym.diagnostics.length < 3 && !!onAssessment;
  const practisedToday = gym.streak.lastActiveDate === today;

  return (
    <Screen title="Practice" subtitle="Accent Gym" bottomInset={bottomInset}>
      <HeroCard
        overline="Your warm-up · sound coach"
        value={weakest && SOUND_BY_ID[weakest] ? soundLabel(weakest) : "Let's speak"}
        status={{ label: practisedToday ? "Practice saved today" : "One line is all it takes", tone: "primary" }}
        right={weakest ? <View style={styles.art}><MouthIllustration soundId={weakest} size={96} /></View> : undefined}
        style={{ padding: space.lg, gap: space.md }}
      >
        {todaysSentence ? <>
          <FocusSentence text={todaysSentence.text} soundId={weakest} style={{ color: gradient.onHero }} highlight={gradient.onHero} />
          {weakest && SOUND_BY_ID[weakest] ? <Text style={[type.label, { color: gradient.onHeroSoft }]}>{SOUND_BY_ID[weakest].mouthTip}</Text> : null}
          <Button label="Tap to speak" size="lg" icon="mic" onPress={onLine} />
          <Button label="Listen & say without a mic" variant="secondary" icon="play" onPress={onListen} />
        </> : null}
        <Text style={[type.caption, { color: gradient.onHeroSoft, minHeight: 40 }]}>
          {practisedToday ? "Nice work today! Come back tomorrow for one line to grow your streak." : "Say this line, then save your practice to start a streak. No account needed."}
        </Text>
      </HeroCard>

      <View style={styles.rowBetween}>
        <View style={[styles.rowBetween, { flexShrink: 1 }]}><Icon name="flame" size={22} color={risk ? palette.warning : palette.primary} /><Text style={[type.label, { flexShrink: 1 }]}>{streak > 0 ? `${streak}-day streak${risk ? " · keep it going" : ""}` : "One line starts your streak"}</Text></View>
        <Pill label={pro ? "Pro" : `${left}/${FREE_DAILY} free checks`} tone="neutral" />
      </View>
      {clarityBand ? <Text style={type.caption}>Clarity estimate · {clarityBand}</Text> : null}

      <Card>
        <View style={styles.rowBetween}>
          <View style={{ flex: 1 }}>
            <Text style={type.heading}>5-minute session</Text>
            <Text style={type.caption}>{sessionIdx} of {session.items.length} lines complete · resume anytime</Text>
          </View>
          <ProgressRing value={sessionFrac} size={56} stroke={7} label={`${sessionIdx}/${session.items.length}`} />
        </View>
        <View style={{ height: space.sm }} />
        <Button
          label={sessionDone ? "Practice again" : sessionIdx > 0 ? "Resume session" : "Start session"}
          icon={sessionDone ? "refresh" : "target"}
          variant="secondary"
          onPress={onSession}
        />
        {sessionDone ? <Text style={[type.caption, { textAlign: "center", marginTop: space.sm }]}>Done for today — great work! 🎉</Text> : null}
        <View style={styles.path}>
          {([['play', 'Warm-up'], ['target', 'Sound drill'], ['book', 'Review']] as const).map(([icon, label]) => <View key={label} style={styles.pathStep}><Icon name={icon} size={18} color={palette.primary} /><Text style={type.caption}>{label}</Text></View>)}
        </View>
        <Text style={[type.caption, { marginTop: space.sm }]}>Warm up with the line above. Your session is a separate set of due words and sound drills.</Text>
      </Card>

      {onAssessment ? <Card style={{ gap: space.xs }}>
        <Text style={type.heading}>{gym.diagnostics.length >= 3 ? "Your personal sound plan" : "Which 3 sounds should you work on?"}</Text>
        <Text style={type.caption}>{needsAssessment ? "Optional: a free, three-line sound check tailors your plan to your first language." : "See your priority sounds and a listening drill for each."}</Text>
        <Button label={gym.diagnostics.length >= 3 ? "Open my 3-sound plan" : gym.diagnostics.length ? "Continue my sound check" : "Find my 3 focus sounds"} variant="secondary" icon="target" onPress={onAssessment} />
      </Card> : null}

      {!pro ? <View style={{ gap: space.xs }}>
        <Text style={type.caption}>5 free AI checks daily. Model audio and listening drills stay unlimited. Pro subscriptions include 134 AI checks a day.</Text>
        {canOfferPro() ? <Button label="Compare Pro plans" variant="ghost" size="sm" onPress={() => onPro("practice_quota")} /> : null}
      </View> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  art: { backgroundColor: palette.primarySoft, borderRadius: radius.md, padding: space.xs },
  path: { flexDirection: "row", justifyContent: "space-between", gap: space.sm, paddingTop: space.md, marginTop: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border },
  pathStep: { alignItems: "center", gap: space.xs, flex: 1 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
});
