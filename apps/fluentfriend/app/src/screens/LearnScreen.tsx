import { StyleSheet, Text, View } from "react-native";
import { Card, Icon, ListItem, Screen, SectionHeader, Tappable, palette, radius, shadow, space, type } from "../ui";
import { useApp } from "../core/data";
import { GRAMMAR, PHRASES } from "../core/catalog";
import { useNav } from "../nav";
import type { Topic } from "../core";
import { bn, TOPIC_VISUAL } from "../util";

const TOPICS: { id: Topic; label: string }[] = [
  { id: "daily", label: "দৈনন্দিন" },
  { id: "shopping", label: "বাজার" },
  { id: "travel", label: "ভ্রমণ" },
  { id: "interview", label: "ইন্টারভিউ" },
  { id: "jobs", label: "চাকরি" },
  { id: "health", label: "স্বাস্থ্য" },
  { id: "bank", label: "ব্যাঙ্ক" },
  { id: "phone", label: "ফোন" },
];

/** Learn (শিখুন): phrasebook by topic, dictionary, grammar, favorites, pronunciation drills. */
export function LearnScreen({ bottomInset }: { bottomInset: number }) {
  const s = useApp();
  const nav = useNav();
  return (
    <Screen title="শিখুন" subtitle="বাক্য · শব্দ · ব্যাকরণ" bottomInset={bottomInset}>
      <SectionHeader title="বিষয় অনুযায়ী বাক্য" />
      <View style={styles.grid}>
        {TOPICS.map((t) => {
          const v = TOPIC_VISUAL[t.id];
          return (
            <Tappable key={t.id} label={`${t.label} বাক্য`} onPress={() => nav.go({ name: "phrasebook", topic: t.id })} style={styles.cell}>
              <View style={[styles.topic, { borderLeftWidth: 4, borderLeftColor: v.color }]}>
                <View style={[styles.topicIcon, { backgroundColor: `${v.color}1F` }]}>
                  <Icon name={v.icon} size={22} color={v.color} />
                </View>
                <Text style={type.bodyStrong} numberOfLines={1}>{t.label}</Text>
              </View>
            </Tappable>
          );
        })}
      </View>

      <SectionHeader title="আরও" />
      <Card padded={false} style={{ paddingHorizontal: space.lg }}>
        <ListItem icon="search" title="ডিকশনারি" subtitle="ইংরেজি ও বাংলায় শব্দ খুঁজুন" onPress={() => nav.go({ name: "dictionary" })} />
        <ListItem icon="book" title="ব্যাকরণ" subtitle={`সহজ বাংলায় ${bn(GRAMMAR.length)}টি নিয়ম`} onPress={() => nav.go({ name: "grammar" })} />
        <ListItem icon="volume" title="উচ্চারণ ড্রিল" subtitle="th, v/w, z — কঠিন ধ্বনি" onPress={() => nav.go({ name: "drills" })} />
        <ListItem
          icon="heart"
          iconTint={palette.danger}
          title="পছন্দের বাক্য"
          subtitle={s.favorites.length ? `${bn(s.favorites.length)}টি সংরক্ষিত` : "হার্টে ট্যাপ করে সংরক্ষণ করুন"}
          onPress={() => nav.go({ name: "favorites" })}
        />
      </Card>

      <Text style={[type.caption, { textAlign: "center" }]}>{bn(PHRASES.length)}টির বেশি বাক্য — সব অফলাইনে, সম্পাদক-যাচাই করা।</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  cell: { width: "48%", flexGrow: 1 },
  topic: { backgroundColor: palette.surface, borderRadius: radius.lg, padding: space.md, gap: space.sm, flexDirection: "row", alignItems: "center", ...shadow },
  topicIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: palette.primarySoft, alignItems: "center", justifyContent: "center" },
});
