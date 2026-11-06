import { Image, StyleSheet, Text, View } from "react-native";
import { Button, Card, HeroCard, Icon, ListItem, Pill, ProgressRing, Screen, SectionHeader, Tappable, gradient, palette, shadow, space, type } from "../ui";
import { art } from "../art";
import { useApp, todayKey } from "../core/data";
import { courseProgress } from "../core/courses";
import { getCourse, getLesson } from "../core/catalog";
import { dueMistakes } from "../core/mistakes";
import { streakAtRisk } from "../core/streak";
import { packState } from "../core/state";
import { useNav } from "../nav";
import { bn } from "../util";

/** Home (পথ): today's day card, streak, progress, offline download banner — one calm next step. */
export function HomeScreen({ bottomInset, onPro }: { bottomInset: number; onPro: (from: string) => void }) {
  void onPro;
  const s = useApp();
  const nav = useNav();
  const today = todayKey();
  const cp = courseProgress(s.progress, "c30");
  const course = getCourse("c30")!;
  const nextLesson = cp.nextLessonId ? getLesson(cp.nextLessonId) : null;
  const atRisk = streakAtRisk(s.streak, today);
  const dueCount = dueMistakes(s.mistakes, today).length;
  const packReady = packState(s, "all") === "ready" || packState(s, "c30") === "ready";

  return (
    <Screen
      title="পথ"
      subtitle="Fluent Friend"
      bottomInset={bottomInset}
      right={
        <Tappable label="সেটিংস" sound={null} onPress={() => nav.go({ name: "settings" })} style={styles.gear}>
          <Icon name="settings" size={22} color={palette.inkSoft} />
        </Tappable>
      }
    >
      <HeroCard
        overline={course.title_bn}
        value={cp.completed ? "সম্পূর্ণ! 🎉" : `দিন ${bn(cp.currentDay)}`}
        caption={cp.completed ? "৩০ দিনের পথ শেষ" : nextLesson?.title_bn}
        status={{ label: `${bn(s.streak.current)} দিনের ধারা`, tone: s.streak.current > 0 ? "warning" : "neutral" }}
        right={<ProgressRing value={cp.pct} size={96} stroke={13} color={gradient.onHero} track={gradient.pill} label={`${bn(Math.round(cp.pct * 100))}%`} labelColor={gradient.onHero} />}
      >
        {cp.completed ? (
          <Button label="সার্টিফিকেট দেখুন" size="lg" variant="secondary" icon="award" onPress={() => nav.go({ name: "certificate", courseId: "c30" })} />
        ) : (
          <Button
            label={cp.done === 0 ? `দিন ${bn(cp.currentDay)} শুরু করুন` : `দিন ${bn(cp.currentDay)} চালিয়ে যান`}
            size="lg"
            variant="secondary"
            icon="play"
            onPress={() => cp.nextLessonId && nav.go({ name: "lesson", lessonId: cp.nextLessonId })}
          />
        )}
      </HeroCard>

      {atRisk ? (
        <Card accent={palette.accent} style={styles.riskRow}>
          <Icon name="flame" size={22} color={palette.accent} />
          <View style={{ flex: 1 }}>
            <Text style={type.bodyStrong}>ধারা ঝুঁকিতে — আজ একটা পাঠ করুন</Text>
            {s.streak.freezeAvailable ? <Text style={type.caption}>একটি স্ট্রিক-ফ্রিজ আছে</Text> : null}
          </View>
        </Card>
      ) : null}

      {dueCount > 0 ? (
        <Tappable label={`আজকের রিভিউ: ${bn(dueCount)}টি ভুল — শুরু করুন`} onPress={() => nav.go({ name: "review" })}>
          <Card accent={palette.warning} style={styles.reviewRow}>
            <View style={styles.reviewIcon}>
              <Icon name="refresh" size={22} color={palette.warning} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={type.bodyStrong}>আজকের রিভিউ: {bn(dueCount)}টি ভুল</Text>
              <Text style={type.caption}>১ মিনিটে ঝালিয়ে নিন — বাংলা ব্যাখ্যাসহ</Text>
            </View>
            <Icon name="chevronRight" size={20} color={palette.inkMuted} />
          </Card>
        </Tappable>
      ) : null}

      {/* The headline "how we win" feature — AI speaking practice — as a prominent accent CTA with Bondhu,
          not a dense list row. This is the single action that beats the textbook competitors. */}
      <Tappable label="AI বন্ধু Bondhu-র সাথে কথা বলুন" onPress={() => nav.tab("speak")}>
        <Card accent={palette.accent} style={styles.aiCta}>
          <Image source={art.ui_mascot_poses} style={styles.aiMascot} resizeMode="contain" accessibilityIgnoresInvertColors />
          <View style={{ flex: 1 }}>
            <Text style={type.heading} numberOfLines={2}>Bondhu-র সাথে কথা বলুন</Text>
            <Text style={type.caption} numberOfLines={2}>বাস্তব দৃশ্যে বলুন — সঙ্গে সঙ্গে বাংলা সংশোধন ও স্কোর</Text>
          </View>
          <View style={styles.aiMic}>
            <Icon name="mic" size={24} color={palette.onPrimary} />
          </View>
        </Card>
      </Tappable>

      <Card padded={false} style={{ paddingHorizontal: space.lg }}>
        <ListItem
          icon="refresh"
          iconTint={palette.accent}
          title="আমার ভুল — রিভিউ"
          subtitle={dueCount ? `${bn(dueCount)}টি আজ রিভিউয়ের জন্য` : "AI চ্যাটের ভুল বাংলা ব্যাখ্যাসহ ঝালিয়ে নিন"}
          trailing={dueCount ? <Pill label={`${bn(dueCount)}টি বাকি`} tone="warning" /> : undefined}
          onPress={() => nav.go({ name: "review" })}
        />
      </Card>

      {/* Course map with a mini 30-day progress strip so the whole journey is visible at a glance. */}
      <Tappable label={`কোর্স ম্যাপ — ${bn(cp.done)}/${bn(cp.total)} দিন সম্পূর্ণ`} onPress={() => nav.go({ name: "courseMap", courseId: "c30" })}>
        <Card accent={palette.primary} style={{ gap: space.md }}>
          <View style={styles.mapHead}>
            <View style={[styles.dlIcon, { backgroundColor: palette.primarySoft }]}>
              <Icon name="calendar" size={22} color={palette.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={type.bodyStrong} numberOfLines={1}>কোর্স ম্যাপ</Text>
              <Text style={type.caption} numberOfLines={1}>{course.title_bn} · {bn(cp.done)}/{bn(cp.total)} দিন</Text>
            </View>
            <Icon name="chevronRight" size={20} color={palette.inkMuted} />
          </View>
          <DayStrip done={cp.done} current={cp.currentDay} total={cp.total} />
        </Card>
      </Tappable>

      <SectionHeader title="অফলাইন" />
      <Tappable label="অফলাইনের জন্য ডাউনলোড" sound={null} onPress={() => nav.go({ name: "downloads" })}>
        <Card accent={packReady ? palette.success : palette.primary} style={styles.dlRow}>
          <View style={[styles.dlIcon, { backgroundColor: packReady ? palette.successSoft : palette.primarySoft }]}>
            <Icon name={packReady ? "checkCircle" : "download"} size={22} color={packReady ? palette.success : palette.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={type.bodyStrong}>{packReady ? "অফলাইনে প্রস্তুত" : "অফলাইনের জন্য ডাউনলোড করুন"}</Text>
            <Text style={type.caption}>{packReady ? "নেট ছাড়াই সব পাঠ ও অডিও চলবে" : "একবার ডাউনলোড করলে নেট ছাড়াই শিখুন"}</Text>
          </View>
          <Icon name="chevronRight" size={20} color={palette.inkMuted} />
        </Card>
      </Tappable>
    </Screen>
  );
}

/** Mini 30-day strip: each day is a small segment — filled (done), ringed (today) or faint (upcoming). */
function DayStrip({ done, current, total }: { done: number; current: number; total: number }) {
  return (
    <View style={styles.strip} accessibilityLabel={`${total} দিনের মধ্যে ${done} দিন সম্পূর্ণ`}>
      {Array.from({ length: total }).map((_, i) => {
        const day = i + 1;
        const state = day <= done ? "done" : day === current ? "now" : "upcoming";
        return (
          <View
            key={i}
            style={[
              styles.stripSeg,
              state === "done" && { backgroundColor: palette.primary },
              state === "now" && { backgroundColor: palette.accent },
              state === "upcoming" && { backgroundColor: palette.surfaceAlt },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  gear: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: palette.surfaceAlt },
  riskRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  reviewRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  reviewIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: palette.warningSoft, alignItems: "center", justifyContent: "center" },
  dlRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  dlIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  aiCta: { flexDirection: "row", alignItems: "center", gap: space.sm },
  aiMascot: { width: 52, height: 52 },
  aiMic: { width: 46, height: 46, borderRadius: 23, backgroundColor: palette.primary, alignItems: "center", justifyContent: "center", ...shadow },
  mapHead: { flexDirection: "row", alignItems: "center", gap: space.md },
  strip: { flexDirection: "row", gap: 2, alignItems: "center" },
  stripSeg: { flex: 1, height: 8, borderRadius: 3 },
});
