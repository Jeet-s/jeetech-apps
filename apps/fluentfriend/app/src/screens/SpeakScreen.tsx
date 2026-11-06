import { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { Card, DotRow, HeroCard, Icon, Pill, Screen, Segmented, Tappable, feedback, gradient, palette, radius, space, type } from "../ui";
import { art } from "../art";
import { appStore, useApp, todayKey } from "../core/data";
import { scenariosByLevel } from "../core/catalog";
import { remaining, dailyLimit } from "../core/quota";
import { grantRewardBonus } from "../core/state";
import { ads } from "../modules/ads";
import { analytics } from "../modules/analytics";
import { useSettings } from "../modules/store";
import { useNav } from "../nav";
import type { Level } from "../core";
import { bn, TOPIC_VISUAL } from "../util";

const LEVELS: { value: Level; label: string }[] = [
  { value: "A1", label: "সহজ" },
  { value: "A2", label: "মাঝারি" },
  { value: "B1", label: "কঠিন" },
];

const LEVEL_LABEL_BN: Record<Level, string> = { A1: "সহজ", A2: "মাঝারি", B1: "কঠিন" };

/** Speak (কথা বলুন): pick a real-life scenario and level, see the daily AI quota, then talk. */
export function SpeakScreen({ bottomInset, onPro }: { bottomInset: number; onPro: (from: string) => void }) {
  const s = useApp();
  const { pro, proSource } = useSettings();
  const aiSub = pro && proSource === "subscription"; // the larger AI quota needs a subscription (lifetime = features only)
  const nav = useNav();
  const [level, setLevel] = useState<Level>(s.profile.level);
  const today = todayKey();
  const limit = dailyLimit(aiSub);
  const left = remaining(s.quota, today, aiSub);
  const scenarios = scenariosByLevel(level);
  const lowQuota = !aiSub && left <= 2;

  // Free users can top up with an opt-in rewarded video (never auto-played) — a fair way to get
  // more value before any upsell (QA: make the free quota + a rewarded option visible on the picker).
  const watchRewarded = () => {
    const shown = ads.showRewarded(() => {
      appStore.set((st) => grantRewardBonus(st, today));
      analytics.track("rewarded_ad_opt_in");
      feedback("success", "success");
    });
    if (!shown) onPro("speak_quota");
  };

  return (
    <Screen title="কথা বলুন" subtitle="AI রোল-প্লে" bottomInset={bottomInset}>
      <HeroCard
        overline="আজকের AI কোটা"
        value={aiSub ? `${bn(limit)} চ্যাট` : `${bn(left)} বাকি`}
        caption={aiSub ? "Pro — রোজ অনেকগুলো সেশন" : left > 0 ? "একটি দৃশ্য বেছে এখনই কথা বলুন" : "কোটা শেষ — স্ক্রিপ্টেড রোল-প্লে চলবে"}
        status={{ label: pro ? "Pro" : "ফ্রি", tone: pro ? "success" : "neutral" }}
        right={<Image source={art.ui_mascot_poses} style={styles.heroMascot} resizeMode="contain" accessibilityIgnoresInvertColors />}
      >
        {/* A dot row (filled = sessions left) instead of repeating the number inside a ring — a glanceable count. */}
        {!aiSub ? <DotRow filled={left} total={limit} /> : null}
        {!aiSub ? (
          <View style={{ gap: space.sm }}>
            {lowQuota ? (
              <Tappable label="বিজ্ঞাপন দেখে +৩ ফ্রি চ্যাট নিন" onPress={watchRewarded} style={[styles.proRow, { backgroundColor: gradient.pill }]}>
                <Icon name="play" size={16} color={gradient.onHero} />
                <Text style={[type.label, { color: gradient.onHero }]}>বিজ্ঞাপন দেখে +{bn(3)} ফ্রি চ্যাট</Text>
                <Icon name="chevronRight" size={16} color={gradient.onHero} />
              </Tappable>
            ) : null}
            <Tappable label="আরও AI চ্যাট পেতে Pro দেখুন" onPress={() => onPro("speak_quota")} style={[styles.proRow, { backgroundColor: gradient.pill }]}>
              <Icon name="star" size={16} color={gradient.onHero} />
              <Text style={[type.label, { color: gradient.onHero }]}>Pro-তে দিনে {bn(dailyLimit(true))}টি চ্যাট</Text>
              <Icon name="chevronRight" size={16} color={gradient.onHero} />
            </Tappable>
          </View>
        ) : null}
      </HeroCard>

      <Segmented options={LEVELS} value={level} onChange={setLevel} />

      <View style={{ gap: space.sm }}>
        {scenarios.map((sc) => {
          const v = TOPIC_VISUAL[sc.topic];
          return (
            <Tappable key={sc.id} label={`${sc.title_bn} — শুরু করুন`} onPress={() => nav.go({ name: "conversation", scenarioId: sc.id })}>
              <Card style={styles.scen} accent={v.color}>
                <View style={[styles.scenIcon, { backgroundColor: `${v.color}1F` }]}>
                  <Icon name={v.icon} size={22} color={v.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={type.bodyStrong} numberOfLines={1}>{sc.title_bn}</Text>
                  <Text style={type.caption} numberOfLines={1}>{sc.sceneBn}</Text>
                </View>
                <Pill label={`${sc.level} · ${LEVEL_LABEL_BN[sc.level]}`} tone="primary" />
                <Icon name="chevronRight" size={20} color={palette.inkMuted} />
              </Card>
            </Tappable>
          );
        })}
      </View>
      <Text style={[type.caption, { textAlign: "center" }]}>নেট বা কোটা না থাকলেও স্ক্রিপ্টেড রোল-প্লে সবসময় চলবে।</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heroMascot: { width: 76, height: 76 },
  proRow: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  scen: { flexDirection: "row", alignItems: "center", gap: space.md },
  scenIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
});
