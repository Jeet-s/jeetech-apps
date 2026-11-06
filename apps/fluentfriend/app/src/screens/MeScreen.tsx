import { Image, StyleSheet, Text, View } from "react-native";
import { BarChart, Card, HeroCard, Icon, ListItem, Pill, ProgressRing, Screen, SectionHeader, Tappable, gradient, palette, radius, shadow, space, type } from "../ui";
import { art } from "../art";
import { useApp, todayKey } from "../core/data";
import { fluencyTrend, trendReady, scoredSessions } from "../core/state";
import { courseProgress } from "../core/courses";
import { dueMistakes, masteredCount } from "../core/mistakes";
import { weekdayLabelBn } from "../core/dates";
import type { Badge } from "../core";
import { useNav } from "../nav";
import { bn } from "../util";

const BADGES: Record<Badge, { label: string; icon: "flame" | "award" | "chat" | "star" }> = {
  first_ai: { label: "প্রথম AI চ্যাট", icon: "chat" },
  streak_7: { label: "৭ দিনের ধারা", icon: "flame" },
  course_7: { label: "৭ দিনের কোর্স", icon: "star" },
  course_30: { label: "৩০ দিনের কোর্স", icon: "award" },
};

/** Me (আমি): progress, weekly fluency trend, My Mistakes, badges, settings. */
export function MeScreen({ bottomInset, onPro }: { bottomInset: number; onPro: (from: string) => void }) {
  void onPro;
  const s = useApp();
  const nav = useNav();
  const today = todayKey();
  const cp = courseProgress(s.progress, "c30");
  const due = dueMistakes(s.mistakes, today).length;
  const mastered = masteredCount(s.mistakes);
  const trend = fluencyTrend(s, today);
  const ready = trendReady(s);
  const scored = scoredSessions(s);
  const avg = scored.length ? Math.round(scored.reduce((a, b) => a + b.fluencyScore, 0) / scored.length) : 0;

  return (
    <Screen
      title="আমি"
      subtitle={s.profile.name || "আপনার অগ্রগতি"}
      bottomInset={bottomInset}
      right={
        <Tappable label="সেটিংস" sound={null} onPress={() => nav.go({ name: "settings" })} style={styles.gear}>
          <Icon name="settings" size={22} color={palette.inkSoft} />
        </Tappable>
      }
    >
      <HeroCard
        overline="গড় সাবলীলতা স্কোর"
        value={ready ? bn(avg) : "—"}
        caption={ready ? `${bn(scored.length)}টি AI চ্যাট থেকে` : "২টি AI চ্যাট শেষ করলে স্কোর দেখা যাবে"}
        status={{ label: `${bn(s.streak.current)} দিনের ধারা`, tone: s.streak.current > 0 ? "warning" : "neutral" }}
        right={<ProgressRing value={avg / 100} size={84} stroke={10} color={gradient.onHero} track={gradient.pill} label={ready ? bn(avg) : "—"} labelColor={gradient.onHero} />}
      />

      <Card>
        <View style={styles.cardHead}>
          <Text style={type.heading}>সাপ্তাহিক সাবলীলতা</Text>
          <Icon name="chart" size={18} color={palette.inkMuted} />
        </View>
        {ready ? (
          <BarChart
            data={trend.map((t) => ({ label: weekdayLabelBn(t.day), value: t.score ?? 0 }))}
            highlight={6}
            height={120}
            showValues
            scaleColor
            goal={70}
            goalLabel={`লক্ষ্য ${bn(70)}`}
            format={(v) => (v > 0 ? bn(v) : "–")}
          />
        ) : (
          <View style={styles.trendEmpty}>
            <Image source={art.es_history_no_conversations} style={styles.trendArt} resizeMode="contain" accessibilityIgnoresInvertColors />
            <Text style={[type.body, { color: palette.inkSoft, textAlign: "center" }]}>
              ২টি AI চ্যাট শেষ করলে এখানে আপনার সাপ্তাহিক অগ্রগতি দেখা যাবে।
            </Text>
          </View>
        )}
      </Card>

      <Card padded={false} style={{ paddingHorizontal: space.lg }}>
        <ListItem
          icon="refresh"
          iconTint={palette.primary}
          title="আমার ভুল — রিভিউ"
          subtitle={s.mistakes.length ? `${bn(mastered)}টি আয়ত্ত · ${bn(s.mistakes.length)}টি মোট` : "AI চ্যাট করলে ভুলগুলো এখানে জমা হবে"}
          trailing={due ? <Pill label={`${bn(due)}টি বাকি`} tone="warning" /> : undefined}
          onPress={() => nav.go({ name: "review" })}
        />
        <ListItem
          icon="award"
          iconTint={cp.completed ? palette.accent : palette.inkMuted}
          title="সার্টিফিকেট"
          subtitle={cp.completed ? "৩০ দিনের পথ সম্পূর্ণ — দেখুন ও শেয়ার করুন" : `৩০ দিনের পথ শেষ করলে খুলবে · ${bn(cp.done)}/${bn(cp.total)} দিন`}
          trailing={cp.completed ? <Pill label="প্রস্তুত" tone="success" /> : <Icon name="lock" size={16} color={palette.inkMuted} />}
          onPress={() => nav.go({ name: "certificate", courseId: "c30" })}
        />
      </Card>

      <SectionHeader title="ব্যাজ" />
      {s.badges.length ? (
        <View style={styles.badgeRow}>
          {s.badges.map((b) => (
            <View key={b} style={styles.badge}>
              <View style={styles.badgeIcon}>
                <Icon name={BADGES[b].icon} size={22} color={palette.accent} />
              </View>
              <Text style={[type.caption, { textAlign: "center" }]} numberOfLines={2}>{BADGES[b].label}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Card style={styles.badgeEmpty}>
          <Icon name="award" size={22} color={palette.inkMuted} />
          <Text style={[type.body, { color: palette.inkSoft, flex: 1 }]}>প্রথম AI চ্যাট, ৭ দিনের ধারা, কোর্স শেষ — মাইলফলকে ব্যাজ খুলবে।</Text>
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  gear: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: palette.surfaceAlt },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: space.md },
  trendEmpty: { alignItems: "center", gap: space.sm, paddingVertical: space.lg },
  trendArt: { width: 140, height: 110 },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  badge: { width: "30%", flexGrow: 1, backgroundColor: palette.surface, borderRadius: radius.lg, padding: space.md, alignItems: "center", gap: 6, ...shadow },
  badgeIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: palette.warningSoft, alignItems: "center", justifyContent: "center" },
  badgeEmpty: { flexDirection: "row", alignItems: "center", gap: space.md },
});
