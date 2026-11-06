import { Image, StyleSheet, Text, View } from "react-native";
import {
  Button,
  Card,
  HeroCard,
  Icon,
  Pill,
  ProgressRing,
  Screen,
  Tappable,
  feedback,
  gradient,
  palette,
  radius,
  space,
  toast,
  type,
} from "../ui";
import { scenarioIcon, scoreColors } from "./widgets";
import { art } from "../art";
import { useApp, todayKey, appStore } from "../core/data";
import { proNow, grantBonusTake, drillDoneToday, todaysDrillReportId } from "../core/state";
import { ads } from "../modules/ads";
import { dailyPrompt, getPack } from "../core/content";
import { renewAllowance, takesRemaining } from "../core/progress";
import { weekKey, daysBetween } from "../core/dates";
import type { ScreenProps } from "../app/nav";
import { analytics } from "../modules/analytics";

const WEEKLY_GOAL = 5;

/** Home: streak + allowance, today's 60-second drill (one tap to record),
 * event countdown and recent takes. */
export function HomeScreen({ bottomInset, nav }: ScreenProps) {
  const app = useApp();
  const today = todayKey();
  const pro = proNow(app, today);
  const allowance = renewAllowance(app.allowance, today, pro);
  const remaining = takesRemaining(allowance);
  const streak = app.streak.currentCount;
  const drill = dailyPrompt(today);
  const doneTakes = app.takes.filter((t) => t.status === "done");
  const hasTakes = doneTakes.length > 0;
  // Today's 60-second drill is the core habit loop. It's always a free scored
  // take (never blocked by the general allowance), so finishing it reliably
  // completes the drill and advances the streak.
  const drillDone = drillDoneToday(app, today);
  const drillReportId = todaysDrillReportId(app, today);
  const recent = [...app.reports].slice(-3).reverse();
  const weekTakes = doneTakes.filter((t) => weekKey(t.startedAt) === weekKey(today)).length;
  const upcoming = app.events
    .filter((e) => !e.archived && e.date >= today)
    .sort((a, b) => (a.date < b.date ? -1 : 1))[0];

  const dateLabel = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  const recordDrill = (practice: boolean = false) => {
    // Coerce to a real boolean: a bare `onPress={recordDrill}` would otherwise
    // pass the gesture event here and silently flip a scored take into free
    // practice (the QA "Not saved · not scored" first take). Only `true` means
    // practice — anything else (including an event object) is a scored take.
    const isPractice = practice === true;
    analytics.track("daily_drill_started");
    nav.record({
      mode: "daily_drill",
      packId: drill.packId,
      promptId: drill.id,
      promptText: drill.text,
      scenario: getPack(drill.packId)?.name ?? "Impromptu",
      title: isPractice ? "Practice drill" : "Today's drill",
      practice: isPractice,
    });
  };

  // Rewarded ad → one bonus scored take (opt-in, capped). Honest fallback when
  // no ad is loaded (the usual case on a test device / flaky connection).
  const watchAdForBonus = () => {
    analytics.track("rewarded_ad_opted_in");
    const shown = ads.showRewarded(() => {
      appStore.set((s) => grantBonusTake(s));
      feedback("success", "success");
      toast("Bonus take unlocked — record it now");
    });
    if (!shown) toast("No bonus take available right now — free takes refresh at midnight");
  };

  return (
    <Screen title="Podium" subtitle={dateLabel} bottomInset={bottomInset}>
      {hasTakes ? (
        <Tappable label="Open your streak and badges" onPress={() => nav.openAchievements()} scale={0.99}>
          <HeroCard
            overline="Your streak"
            value={streak > 0 ? `${streak} day${streak === 1 ? "" : "s"}` : "Start today"}
            caption={streak > 0 ? "Keep the flame alive — one take today." : "A take today starts your streak."}
            status={{ label: pro ? "Pro" : `${remaining} free take${remaining === 1 ? "" : "s"} left`, tone: remaining > 0 ? "success" : "warning" }}
            right={
              <ProgressRing
                value={Math.min(1, weekTakes / WEEKLY_GOAL)}
                size={92}
                stroke={10}
                color={gradient.onHero}
                track={gradient.pill}
                labelColor={gradient.onHero}
                label={`${weekTakes}/${WEEKLY_GOAL}`}
                sublabel="this week"
              />
            }
          >
            <View style={styles.heroLink}>
              <Icon name="trophy" size={15} color={gradient.onHeroSoft} />
              <Text style={[type.label, { color: gradient.onHeroSoft }]}>View streak & badges</Text>
              <Icon name="chevronRight" size={15} color={gradient.onHeroSoft} />
            </View>
          </HeroCard>
        </Tappable>
      ) : (
        <HeroCard overline="Welcome to Podium" value="Your first take" caption="60 seconds to a coach's feedback — private by default.">
          <Image source={art.onboarding_private_practice} style={styles.welcomeArt} resizeMode="contain" accessibilityIgnoresInvertColors />
        </HeroCard>
      )}

      {/* Today's 60-second drill — the core habit loop, one tap. It's a free
          scored take even when the general allowance is spent, so finishing it
          always completes the drill and advances the streak. Once done, the card
          flips to a clear "completed" state with the score and a review link. */}
      {!drillDone ? (
        <Card style={{ gap: space.md }} accent={palette.primary}>
          <View style={styles.rowHead}>
            <View style={styles.iconChip}><Icon name={scenarioIcon(drill.packId)} size={18} color={palette.primary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={type.overline}>Today's 60-second drill</Text>
              <Text style={type.caption}>{getPack(drill.packId)?.name}</Text>
            </View>
            <Pill label="Scored" tone="primary" />
          </View>
          <Text style={[type.title, { color: palette.ink }]}>{drill.text}</Text>
          <Button label="Record today's drill" icon="mic" size="lg" onPress={() => recordDrill(false)} />
          <Text style={[type.caption, { textAlign: "center", color: palette.inkSoft }]}>
            {remaining > 0
              ? `Full scored report · ${remaining} free take${remaining === 1 ? "" : "s"} left today`
              : "Your free daily drill — always fully scored, even when takes run out"}
          </Text>
          <Tappable label="Browse scenarios" onPress={() => nav.go("practice")} style={styles.linkRow}>
            <Text style={[type.label, { color: palette.primary }]}>Browse scenarios instead</Text>
            <Icon name="chevronRight" size={16} color={palette.primary} />
          </Tappable>
        </Card>
      ) : (
        <Card style={{ gap: space.md }} accent={palette.success}>
          <View style={styles.rowHead}>
            <View style={[styles.iconChip, { backgroundColor: palette.successSoft }]}><Icon name="check" size={18} color={palette.success} /></View>
            <View style={{ flex: 1 }}>
              <Text style={type.overline}>Today's drill — done</Text>
              <Text style={type.caption}>{streak > 0 ? `${streak}-day streak 🔥 · keep it going tomorrow` : "Nice work — come back tomorrow"}</Text>
            </View>
            <Pill label="Complete" tone="success" />
          </View>
          {drillReportId ? (
            <Button label="Review today's report" icon="chevronRight" size="lg" onPress={() => nav.openReport(drillReportId)} />
          ) : null}
          <View style={styles.doneActions}>
            <View style={{ flex: 1 }}>
              <Button
                label={remaining > 0 ? "Another take" : "Practise again"}
                icon="refresh"
                variant="secondary"
                onPress={() => recordDrill(remaining === 0)}
              />
            </View>
            {!pro && remaining === 0 ? (
              <View style={{ flex: 1 }}>
                <Button label="Watch ad · +1 take" icon="play" variant="secondary" onPress={watchAdForBonus} />
              </View>
            ) : null}
          </View>
          <Tappable label="Browse scenarios" onPress={() => nav.go("practice")} style={styles.linkRow}>
            <Text style={[type.label, { color: palette.primary }]}>Browse more scenarios</Text>
            <Icon name="chevronRight" size={16} color={palette.primary} />
          </Tappable>
        </Card>
      )}

      {/* Pro — a visible, discoverable entry point from Home (not a wall: the
          daily free takes above always work first). Hidden once the user is Pro. */}
      {!pro ? (
        <Tappable label="See Podium Pro" onPress={() => nav.pro("home")} style={styles.proRow} scale={0.99}>
          <View style={styles.proIcon}><Icon name="star" size={18} color={palette.warning} /></View>
          <View style={{ flex: 1 }}>
            <Text style={type.bodyStrong} numberOfLines={1}>Podium Pro</Text>
            <Text style={type.caption} numberOfLines={2}>48 takes a day · longer rehearsals · deeper analytics</Text>
          </View>
          <Pill label="Try free" tone="primary" />
        </Tappable>
      ) : null}

      {/* Event countdown */}
      {upcoming ? (
        <Tappable label={`${upcoming.title} prep`} onPress={() => nav.openEvent(upcoming.id)} style={styles.event}>
          <View style={[styles.iconChip, { backgroundColor: palette.primarySoft }]}><Icon name="calendar" size={18} color={palette.primary} /></View>
          <View style={{ flex: 1 }}>
            <Text style={type.bodyStrong} numberOfLines={1}>{upcoming.title}</Text>
            <Text style={type.caption}>{countdown(today, upcoming.date)} · {upcoming.readiness}% ready</Text>
          </View>
          <Pill label="Prep" tone="primary" />
        </Tappable>
      ) : null}

      {/* Recent takes */}
      {recent.length ? (
        <>
          <View style={styles.section}>
            <Text style={[type.label, { textTransform: "uppercase", letterSpacing: 0.6 }]}>Recent takes</Text>
            <Tappable label="See all" onPress={() => nav.openHistory()}><Text style={[type.label, { color: palette.primary }]}>See all</Text></Tappable>
          </View>
          <View style={{ gap: space.sm }}>
            {recent.map((r) => {
              const take = app.takes.find((t) => t.id === r.takeId);
              const c = scoreColors(r.overallScore);
              return (
                <Tappable key={r.id} label={`Take scored ${r.overallScore}`} onPress={() => nav.openReport(r.id)} style={styles.takeRow}>
                  <View style={[styles.scoreChip, { backgroundColor: c.bg }]}>
                    <Text style={[type.number, { fontSize: 20, color: c.fg }]}>{r.overallScore}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={type.bodyStrong} numberOfLines={1}>{take?.promptText ?? "Take"}</Text>
                    <Text style={type.caption}>{r.wpmOverall} wpm · {r.fillersPerMin}/min fillers</Text>
                  </View>
                  <Icon name="chevronRight" size={20} color={palette.inkMuted} />
                </Tappable>
              );
            })}
          </View>
        </>
      ) : hasTakes ? null : (
        <Button label="Record your first take" icon="mic" size="lg" onPress={() => recordDrill(false)} />
      )}
    </Screen>
  );
}

function countdown(today: string, date: string): string {
  const d = daysBetween(today, date);
  if (d <= 0) return "Today";
  if (d === 1) return "Tomorrow";
  return `In ${d} days`;
}

const styles = StyleSheet.create({
  heroLink: { flexDirection: "row", alignItems: "center", gap: 4 },
  welcomeArt: { width: "100%", height: 150, marginTop: space.sm },
  rowHead: { flexDirection: "row", alignItems: "center", gap: space.md },
  doneActions: { flexDirection: "row", gap: space.sm },
  iconChip: { width: 36, height: 36, borderRadius: 10, backgroundColor: palette.primarySoft, alignItems: "center", justifyContent: "center" },
  linkRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, minHeight: 36 },
  event: { flexDirection: "row", alignItems: "center", gap: space.md, backgroundColor: palette.surface, borderRadius: radius.lg, padding: space.lg, borderWidth: 1, borderColor: palette.border },
  proRow: { flexDirection: "row", alignItems: "center", gap: space.md, backgroundColor: palette.surface, borderRadius: radius.lg, padding: space.lg, borderWidth: 1, borderColor: palette.border },
  proIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: palette.warningSoft, alignItems: "center", justifyContent: "center" },
  section: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: space.sm },
  takeRow: { flexDirection: "row", alignItems: "center", gap: space.md, backgroundColor: palette.surface, borderRadius: radius.lg, padding: space.md, borderWidth: 1, borderColor: palette.border },
  scoreChip: { width: 48, height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center" },
});
