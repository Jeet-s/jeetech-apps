import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  CONTENT_MAX,
  Card,
  HeroCard,
  Icon,
  IconButton,
  Pill,
  ProgressBar,
  ProgressRing,
  gradient,
  palette,
  radius,
  space,
  type,
} from "../ui";
import { useApp, todayKey } from "../core/data";
import { computeAchievements, achievementSummary } from "../core/achievements";
import { proNow } from "../core/state";
import type { Achievement } from "../core/achievements";

/** Streak + skill badges, reached from the Home streak card and the Progress
 * stats card. Shows the current streak, best streak and every badge — earned or
 * with its progress — so the daily loop has a visible reward. */
export function AchievementsScreen({ onClose }: { onClose: () => void }) {
  const app = useApp();
  const insets = useSafeAreaInsets();
  const today = todayKey();
  const badges = computeAchievements(app);
  const { earned, total } = achievementSummary(app);
  const streak = app.streak;
  const pro = proNow(app, today);

  const earnedBadges = badges.filter((b) => b.earned);
  const lockedBadges = badges.filter((b) => !b.earned);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.bar}>
        <IconButton icon="chevronLeft" label="Back" onPress={onClose} />
        <Text style={type.heading}>Streak & badges</Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xl }]}>
        <HeroCard
          overline="Current streak"
          value={streak.currentCount > 0 ? `${streak.currentCount} day${streak.currentCount === 1 ? "" : "s"}` : "Start today"}
          caption={streak.currentCount > 0 ? "Keep the flame alive — one take today." : "A take today lights your streak."}
          status={{ label: `${earned}/${total} badges`, tone: "success" }}
          right={
            <ProgressRing
              value={total ? earned / total : 0}
              size={92}
              stroke={10}
              color={gradient.onHero}
              track={gradient.pill}
              labelColor={gradient.onHero}
              label={`${earned}`}
              sublabel={`of ${total}`}
            />
          }
        />

        <Card style={styles.statsCard}>
          <Stat icon="flame" value={`${streak.currentCount}`} label="current" tint={palette.warning} />
          <Stat icon="trophy" value={`${streak.longest}`} label="best streak" tint={palette.primary} />
          <Stat icon="checkCircle" value={pro ? "∞" : `${streak.freezesAvailable}`} label="freezes" tint={palette.success} />
        </Card>

        {earnedBadges.length ? (
          <>
            <Text style={[type.label, styles.section]}>EARNED</Text>
            <View style={styles.grid}>
              {earnedBadges.map((b) => <BadgeCard key={b.id} badge={b} />)}
            </View>
          </>
        ) : (
          <Card>
            <Text style={[type.body, { color: palette.inkSoft, textAlign: "center" }]}>
              Record your first take to earn your first badge. Every drill brings the next one closer.
            </Text>
          </Card>
        )}

        {lockedBadges.length ? (
          <>
            <Text style={[type.label, styles.section]}>IN PROGRESS</Text>
            <View style={styles.grid}>
              {lockedBadges.map((b) => <BadgeCard key={b.id} badge={b} />)}
            </View>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Stat({ icon, value, label, tint }: { icon: "flame" | "trophy" | "checkCircle"; value: string; label: string; tint: string }) {
  return (
    <View style={{ flex: 1, alignItems: "center", gap: 2 }} accessible accessibilityLabel={`${label}: ${value}`}>
      <Icon name={icon} size={18} color={tint} />
      <Text style={[type.number, { fontSize: 22, color: palette.ink }]}>{value}</Text>
      <Text style={type.caption}>{label}</Text>
    </View>
  );
}

function BadgeCard({ badge }: { badge: Achievement }) {
  const earned = badge.earned;
  return (
    <View style={[styles.badge, { opacity: earned ? 1 : 0.72, borderColor: earned ? palette.primary : palette.border }]} accessible accessibilityLabel={`${badge.title}, ${earned ? "earned" : `${badge.progress.current} of ${badge.progress.target}`}`}>
      <View style={[styles.badgeIcon, { backgroundColor: earned ? palette.primarySoft : palette.surfaceAlt }]}>
        <Icon name={earned ? badge.icon : "lock"} size={22} color={earned ? palette.primary : palette.inkMuted} />
      </View>
      <Text style={type.bodyStrong} numberOfLines={1}>{badge.title}</Text>
      <Text style={type.caption} numberOfLines={2}>{badge.desc}</Text>
      {earned ? (
        <Pill label="Earned" tone="success" icon={<Icon name="check" size={12} color={palette.success} />} />
      ) : (
        <View style={{ gap: 4, width: "100%" }}>
          <ProgressBar value={badge.progress.target ? badge.progress.current / badge.progress.target : 0} height={6} />
          <Text style={type.caption}>{badge.progress.current}/{badge.progress.target}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
  bar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space.sm, paddingVertical: space.sm },
  body: { paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.lg, width: "100%", maxWidth: CONTENT_MAX, alignSelf: "center" },
  statsCard: { flexDirection: "row", gap: space.md, paddingVertical: space.lg },
  section: { marginTop: space.xs, textTransform: "uppercase", letterSpacing: 0.6 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  badge: { width: "47%", flexGrow: 1, backgroundColor: palette.surface, borderRadius: radius.lg, borderWidth: 1, padding: space.md, gap: 6, alignItems: "flex-start" },
  badgeIcon: { width: 44, height: 44, borderRadius: radius.md, alignItems: "center", justifyContent: "center", marginBottom: 2 },
});
