import { memo, useCallback, useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn } from "react-native-reanimated";
import { Button, Card, EmptyState, Icon, Pill, Sheet, TextField, Tappable, feedback, palette, radius, space, type } from "../ui";
import { AudioButton, PhraseAudio, PhraseCard, ReportSheet, RouteScreen, StackHeader } from "../components";
import { useBannerHeight } from "../modules/layout";
import { art } from "../art";
import { useApp } from "../core/data";
import { DICTIONARY, DRILLS, GRAMMAR, phrasesByTopic, getPhrase } from "../core/catalog";
import { searchDictionary, searchPhrases } from "../core/search";
import { checkAnswer } from "../core/quiz";
import { useNav } from "../nav";
import type { DictionaryWord, GrammarCard, Phrase, Topic } from "../core";
import { bn } from "../util";

const TOPIC_BN: Record<Topic, string> = {
  daily: "দৈনন্দিন",
  shopping: "বাজার",
  travel: "ভ্রমণ",
  interview: "ইন্টারভিউ",
  jobs: "চাকরি",
  health: "স্বাস্থ্য",
  bank: "ব্যাঙ্ক",
  phone: "ফোন",
};

/**
 * A virtualized search-list route: a fixed header (back + title + search field) over a FlatList, so
 * a 300+ phrase / 380+ word catalog renders only the visible rows and scrolls smoothly on low-end
 * phones (QA performance). The search field sits OUTSIDE the list (a stable header) so typing never
 * remounts it or drops focus.
 */
function SearchListRoute<T>({
  title,
  subtitle,
  query,
  onQuery,
  placeholder,
  data,
  keyExtractor,
  renderItem,
  empty,
  onClose,
}: {
  title: string;
  subtitle?: string;
  query: string;
  onQuery: (s: string) => void;
  placeholder: string;
  data: T[];
  keyExtractor: (item: T) => string;
  renderItem: (info: { item: T }) => React.ReactElement;
  empty: React.ReactNode;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const banner = useBannerHeight();
  return (
    <View style={styles.listRoot}>
      <View style={{ paddingTop: insets.top + space.md, paddingHorizontal: space.lg, gap: space.sm }}>
        <StackHeader title={title} subtitle={subtitle} onClose={onClose} />
        <TextField label="" placeholder={placeholder} value={query} onChangeText={onQuery} autoCapitalize="none" />
      </View>
      {data.length ? (
        <FlatList
          data={data}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          initialNumToRender={10}
          windowSize={9}
          removeClippedSubviews
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: insets.bottom + banner + space.xl, gap: space.sm }}
        />
      ) : (
        <View style={{ paddingHorizontal: space.lg, paddingTop: space.xl }}>{empty}</View>
      )}
    </View>
  );
}

/* ---------------- Phrasebook ---------------- */
const MemoPhraseCard = memo(PhraseCard);

export function PhrasebookScreen({ topic }: { topic?: Topic }) {
  const nav = useNav();
  const [q, setQ] = useState("");
  const [reporting, setReporting] = useState<Phrase | null>(null);
  const results = useMemo(() => (q.trim() ? searchPhrases(q, topic) : topic ? phrasesByTopic(topic) : searchPhrases("")), [q, topic]);
  const renderItem = useCallback(({ item }: { item: Phrase }) => <MemoPhraseCard phrase={item} onReport={setReporting} accent={palette.primary} />, []);
  return (
    <>
      <SearchListRoute
        title={topic ? TOPIC_BN[topic] : "বাক্যভাণ্ডার"}
        subtitle={`${bn(results.length)}টি বাক্য · অফলাইন`}
        query={q}
        onQuery={setQ}
        placeholder="ইংরেজি বা বাংলায় খুঁজুন…"
        data={results}
        keyExtractor={(p) => p.id}
        renderItem={renderItem}
        empty={<EmptyState icon="search" title="কিছু পাওয়া যায়নি" body="অন্য শব্দ চেষ্টা করুন, বা একটি বিষয় বেছে দেখুন।" />}
        onClose={() => nav.back()}
      />
      <ReportSheet phrase={reporting} onClose={() => setReporting(null)} />
    </>
  );
}

/* ---------------- Dictionary ---------------- */
/** One dictionary row as its own tinted card (on-brand "cards, not a flat sheet") — memoized so the
 *  380+ word list only re-renders the rows that change. */
const WordRow = memo(function WordRow({ word, onOpen }: { word: DictionaryWord; onOpen: (w: DictionaryWord) => void }) {
  return (
    <Tappable label={`${word.en} — বিস্তারিত`} onPress={() => onOpen(word)}>
      <Card style={styles.wordCard}>
        <View style={{ flex: 1 }}>
          <Text style={type.bodyStrong}>{word.en}</Text>
          <Text style={[type.body, { color: palette.inkSoft }]}>{word.bn}</Text>
          <Text style={type.caption}>{word.romanBn}</Text>
        </View>
        <AudioButton label={`“${word.en}” শুনুন`} size={40} tone="soft" />
        <Icon name="chevronRight" size={20} color={palette.inkMuted} />
      </Card>
    </Tappable>
  );
});

export function DictionaryScreen() {
  const nav = useNav();
  const [q, setQ] = useState("");
  const [word, setWord] = useState<DictionaryWord | null>(null);
  const results = useMemo(() => searchDictionary(q), [q]);
  const open = useCallback((w: DictionaryWord) => { feedback("pop", "light"); setWord(w); }, []);
  const renderItem = useCallback(({ item }: { item: DictionaryWord }) => <WordRow word={item} onOpen={open} />, [open]);
  return (
    <>
      <SearchListRoute
        title="ডিকশনারি"
        subtitle={`${bn(DICTIONARY.length)}+ শব্দ · অফলাইন`}
        query={q}
        onQuery={setQ}
        placeholder="শব্দ খুঁজুন…"
        data={results}
        keyExtractor={(w) => w.en}
        renderItem={renderItem}
        empty={<EmptyState icon="search" title="শব্দটি পাওয়া যায়নি" body="বানান মিলিয়ে দেখুন বা অন্য শব্দ চেষ্টা করুন।" />}
        onClose={() => nav.back()}
      />
      <WordDetailSheet word={word} onClose={() => setWord(null)} onTopic={(t) => { setWord(null); nav.go({ name: "phrasebook", topic: t }); }} />
    </>
  );
}

/** Dictionary word detail: meaning, pronunciation (dual-speed audio) and a link to that topic's
 *  phrases — the bridge from a searched word to full example sentences (and their Favorites). */
function WordDetailSheet({ word, onClose, onTopic }: { word: DictionaryWord | null; onClose: () => void; onTopic: (t: Topic) => void }) {
  return (
    <Sheet visible={!!word} title={word?.en} onClose={onClose}>
      {word ? (
        <>
          <View style={{ gap: 2 }}>
            <Text style={[type.heading, { color: palette.inkSoft }]}>{word.bn}</Text>
            <Text style={type.caption}>{word.romanBn}</Text>
          </View>
          <PhraseAudio en={word.en} size={48} />
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            <Pill label={TOPIC_BN[word.topic]} tone="neutral" />
            <Text style={[type.caption, { flex: 1, color: palette.inkSoft }]}>এই শব্দটি যে বিষয়ে ব্যবহৃত হয়</Text>
          </View>
          <Button label={`${TOPIC_BN[word.topic]} বিষয়ের বাক্য দেখুন`} icon="chat" onPress={() => onTopic(word.topic)} />
          <Button label="বন্ধ করুন" variant="ghost" onPress={onClose} />
        </>
      ) : null}
    </Sheet>
  );
}

/* ---------------- Favorites ---------------- */
export function FavoritesScreen() {
  const nav = useNav();
  const s = useApp();
  const [reporting, setReporting] = useState<Phrase | null>(null);
  const phrases = s.favorites.map((f) => getPhrase(f.phraseId)).filter(Boolean) as Phrase[];
  return (
    <>
      <RouteScreen title="পছন্দের বাক্য" subtitle={phrases.length ? `${bn(phrases.length)}টি সংরক্ষিত` : undefined} onClose={() => nav.back()}>
        {phrases.length ? (
          phrases.map((p) => <PhraseCard key={p.id} phrase={p} onReport={setReporting} accent={palette.danger} />)
        ) : (
          <EmptyState
            art={art.es_home_no_lessons}
            title="এখনো কোনো পছন্দ নেই"
            body="যেকোনো বাক্যের হার্টে ট্যাপ করলে এখানে জমা হবে।"
            action={<Button label="বাক্যভাণ্ডারে যান" onPress={() => { nav.back(); nav.go({ name: "phrasebook" }); }} />}
          />
        )}
      </RouteScreen>
      <ReportSheet phrase={reporting} onClose={() => setReporting(null)} />
    </>
  );
}

/* ---------------- Drills ---------------- */
export function DrillsScreen() {
  const nav = useNav();
  return (
    <RouteScreen title="উচ্চারণ ড্রিল" subtitle="কঠিন ইংরেজি ধ্বনি" onClose={() => nav.back()}>
      {DRILLS.map((d) => (
        <Card key={d.id} style={{ gap: space.md }}>
          <View style={styles.drillHead}>
            <View style={styles.drillBadge}>
              <Text style={[type.bodyStrong, { color: palette.onPrimary }]}>{d.sound}</Text>
            </View>
            <Text style={[type.label, { color: palette.ink, flex: 1 }]}>{d.tipBn}</Text>
          </View>
          <View style={{ gap: space.sm }}>
            {d.pairs.map((p, i) => (
              <View key={i} style={styles.pairRow}>
                <PairWord word={p.a} />
                <Text style={[type.caption, { color: palette.inkMuted }]}>vs</Text>
                <PairWord word={p.b} />
              </View>
            ))}
          </View>
        </Card>
      ))}
    </RouteScreen>
  );
}

function PairWord({ word }: { word: string }) {
  return (
    <View style={styles.pairWord}>
      <Text style={[type.body, { flex: 1 }]}>{word}</Text>
      <AudioButton label={`“${word}” শুনুন`} size={36} tone="soft" />
    </View>
  );
}

/* ---------------- Grammar ---------------- */
export function GrammarScreen() {
  const nav = useNav();
  const [card, setCard] = useState<GrammarCard | null>(null);
  if (card) return <GrammarDetail card={card} onBack={() => setCard(null)} />;
  return (
    <RouteScreen title="ব্যাকরণ" subtitle={`সহজ বাংলায় ${bn(GRAMMAR.length)}টি নিয়ম`} onClose={() => nav.back()}>
      <Card padded={false} style={{ paddingHorizontal: space.lg }}>
        {GRAMMAR.map((g, i) => (
          <Tappable key={g.id} label={g.title_bn} onPress={() => setCard(g)} style={[styles.gRow, i > 0 && styles.divider]}>
            <View style={styles.gIcon}>
              <Icon name="book" size={18} color={palette.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={type.bodyStrong} numberOfLines={1}>{g.title_bn}</Text>
              <Text style={type.caption} numberOfLines={1}>{g.title_en}</Text>
            </View>
            <Icon name="chevronRight" size={20} color={palette.inkMuted} />
          </Tappable>
        ))}
      </Card>
    </RouteScreen>
  );
}

function GrammarDetail({ card, onBack }: { card: GrammarCard; onBack: () => void }) {
  const [picked, setPicked] = useState<string | null>(null);
  const checked = picked != null ? checkAnswer({ ...card.quiz, id: card.id, lessonId: card.id, type: "translate" }, picked) : null;
  return (
    <RouteScreen title={card.title_bn} subtitle={card.title_en} onClose={onBack}>
      <Card>
        <Text style={type.body}>{card.bodyBn}</Text>
      </Card>
      <Text style={type.overline}>উদাহরণ</Text>
      {card.examples.map((ex, i) => (
        <Card key={i} style={styles.exRow}>
          <View style={{ flex: 1 }}>
            <Text style={type.bodyStrong}>{ex.en}</Text>
            <Text style={[type.body, { color: palette.inkSoft }]}>{ex.bn}</Text>
          </View>
          <AudioButton label={`“${ex.en}” শুনুন`} size={40} tone="soft" />
        </Card>
      ))}
      <Text style={type.overline}>ছোট্ট কুইজ</Text>
      <Card style={{ gap: space.sm }}>
        <Text style={type.bodyStrong}>{card.quiz.prompt}</Text>
        {card.quiz.options.map((o) => {
          const isAnswer = o === card.quiz.answer;
          const show = picked != null && (picked === o || isAnswer);
          return (
            <Tappable
              key={o}
              label={o}
              sound={null}
              disabled={picked != null}
              onPress={() => {
                setPicked(o);
                feedback(o === card.quiz.answer ? "success" : "error", o === card.quiz.answer ? "success" : "warning");
              }}
              style={[styles.quizOpt, show && { backgroundColor: isAnswer ? palette.successSoft : palette.dangerSoft, borderColor: isAnswer ? palette.success : palette.danger }]}
            >
              <Text style={[type.body, { flex: 1 }]}>{o}</Text>
              {show ? <Icon name={isAnswer ? "checkCircle" : "close"} size={18} color={isAnswer ? palette.success : palette.danger} /> : null}
            </Tappable>
          );
        })}
        {checked ? (
          <Animated.View entering={FadeIn.duration(200)}>
            <Text style={[type.label, { color: palette.ink }]}>{card.quiz.explanationBn}</Text>
          </Animated.View>
        ) : null}
      </Card>
    </RouteScreen>
  );
}

const styles = StyleSheet.create({
  listRoot: { flex: 1, backgroundColor: palette.bg },
  wordCard: { flexDirection: "row", alignItems: "center", gap: space.md },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border },
  drillHead: { flexDirection: "row", alignItems: "center", gap: space.md },
  drillBadge: { minWidth: 56, height: 40, borderRadius: radius.md, backgroundColor: palette.primary, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 },
  pairRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  pairWord: { flex: 1, flexDirection: "row", alignItems: "center", gap: space.sm, backgroundColor: palette.surfaceAlt, borderRadius: radius.md, paddingLeft: space.md, paddingRight: 4, paddingVertical: 4 },
  gRow: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 60, paddingVertical: space.sm },
  gIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: palette.primarySoft, alignItems: "center", justifyContent: "center" },
  exRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  quizOpt: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 48, paddingHorizontal: space.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: palette.border },
});
