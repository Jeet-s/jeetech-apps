import { useState } from "react";
import { Alert, Keyboard, StyleSheet, Text, View } from "react-native";
import {
  AiReport,
  Button,
  Card,
  EmptyState,
  FocusSentence,
  Icon,
  IconButton,
  Pill,
  Screen,
  TextField,
  palette,
  radius,
  space,
  toast,
  type,
} from "../ui";
import { SpeakSheet, type SpeakMode } from "./SpeakSheet";
import { ai } from "../modules/ai";
import { tts } from "../modules/speech";
import { gymStore, useGym } from "../core/data";
import { removeReviewItem, saveCustomText } from "../core/state";
import { ipaForSound } from "../core/accent";
import { dueItems } from "../core/srs";
import { validateCustomText } from "../core/profile";
import { dateKey } from "../core/dates";
import type { SRSItem } from "../core/types";

const ERR: Record<string, string> = {
  empty: "Type a word or sentence to practise.",
  too_long: "That's a bit long — keep it under 200 characters.",
  unsupported: "Add some English letters so we can sound it out.",
};

/**
 * Review: the free utility layer Quick Pronunciation/Say Clear lack. Type any
 * word or sentence to hear it and get its IPA, then record it for real phoneme
 * feedback — and every missed word is saved to a spaced-repetition set that
 * works offline.
 */
export function ReviewScreen({ bottomInset, onPro }: { bottomInset: number; onPro: (from: string) => void }) {
  const gym = useGym();
  const accent = gym.profile.targetAccent;
  const today = dateKey(new Date());

  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [ipa, setIpa] = useState<{ ipa: string; syllables: string; notes: string } | null>(null);
  const [savedText, setSavedText] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<SpeakMode | null>(null);
  const [speaking, setSpeaking] = useState(false);

  const due = dueItems(gym.srs, today);
  const saved = [...gym.srs].sort((a, b) => (a.dueAt < b.dueAt ? -1 : 1));

  const check = async () => {
    const e = validateCustomText(text);
    if (e) {
      setErr(ERR[e]);
      return;
    }
    Keyboard.dismiss();
    gymStore.set(s => saveCustomText(s, text, today));
    setSavedText(text.trim());
    setErr(null);
    setIpa(null);
    tts.speak(text.trim(), accent);
    if (ai.enabled) {
      setLoading(true);
      const res = await ai.run("tts_ipa", JSON.stringify({ text: text.trim(), accent })).catch(() => null);
      setLoading(false);
      if (res && res.ok && res.json && typeof res.json === "object") {
        const j = res.json as { ipa?: string; syllables?: string; notes?: string };
        setIpa({ ipa: (j.ipa ?? "").replace(/^\/+|\/+$/g, ""), syllables: j.syllables ?? "", notes: j.notes ?? "" });
      } else if (res && !res.ok && res.reason === "quota") {
        setErr("Saved. Your AI allowance is used up; model audio and review remain available.");
        onPro("review_ipa_quota");
      } else { setErr("Saved on this phone. IPA is unavailable right now — tap Hear & check to retry."); }
    } else { setErr("Saved on this phone. Model audio and review work offline; connect and retry for IPA."); }
  };

  const practiceText = () => {
    const e = validateCustomText(text);
    if (e) {
      setErr(ERR[e]);
      return;
    }
    Keyboard.dismiss();
    gymStore.set(s => saveCustomText(s, text, today));
    setSavedText(text.trim());
    setMode({ kind: "custom", text: text.trim(), soundTags: [] });
    setSpeaking(true);
  };

  const practiceItem = (it: SRSItem) => {
    setMode({ kind: "review", srsId: it.id, text: it.text, soundTags: it.soundTags });
    setSpeaking(true);
  };

  const remove = (it: SRSItem) =>
    Alert.alert("Remove word?", `Remove “${it.text}” from your practice set?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => { gymStore.set((s) => removeReviewItem(s, it.id)); toast("Removed"); } },
    ]);

  return (
    <>
      <Screen title="Review" subtitle="Small repeats. Lasting clarity." bottomInset={bottomInset}>
        {due.length ? (
          <Card accent={palette.warning}>
            <View style={styles.rowBetween}>
              <Text style={type.heading}>Due today</Text>
              <Pill label={`${due.length} to review`} tone="warning" />
            </View>
            <Text style={[type.caption, { marginBottom: space.sm }]}>A quick repeat helps these words stick.</Text>
            <Button label="Review due words" icon="mic" onPress={() => practiceItem(due[0])} />
          </Card>
        ) : null}

        <Card accent={palette.primary}>
          <Text style={type.heading}>Type anything to practise</Text>
          <Text style={[type.caption, { marginBottom: space.sm }]}>Hear it, see its IPA, then record it for real feedback.</Text>
          <TextField
            label="Word or sentence"
            placeholder="e.g. comfortable"
            value={text}
            onChangeText={(t) => { setText(t); setIpa(null); if (err) setErr(null); }}
            error={err}
            maxLength={200}
            returnKeyType="done"
            onSubmitEditing={check}
          />
          <View style={styles.actions}>
            <Button label="Hear & check" icon="play" variant="secondary" size="sm" loading={loading} onPress={check} />
            <Button label="Record it" icon="mic" size="sm" variant={due.length ? "secondary" : "primary"} onPress={practiceText} />
          </View>
          {savedText ? <Text style={[type.caption, { color: palette.success, marginTop: space.sm }]} accessibilityLiveRegion="polite">✓ Saved to your review set: {savedText}</Text> : null}
          {ipa ? (
            <View style={styles.ipaBox}>
              <Text style={[type.phonetic, { color: palette.primary, fontSize: 22, lineHeight: 30 }]}>/{ipa.ipa}/</Text>
              {ipa.syllables ? <Text style={type.bodyStrong}>{ipa.syllables}</Text> : null}
              {ipa.notes ? <Text style={type.caption}>{ipa.notes}</Text> : null}
              <AiReport feature="tts_ipa" />
            </View>
          ) : null}
        </Card>



        <Text style={[type.label, { marginTop: space.sm }]}>Your saved words · tap Say it to practise</Text>
        {saved.length ? (
          saved.map((it) => {
            const isDue = it.dueAt <= today;
            return (
              <Card key={it.id} accent={isDue ? palette.warning : palette.primary} padded={false} style={styles.itemCard}>
                <View style={styles.item}>
                  <IconButton icon="play" label={`Hear ${it.text}`} size={48} onPress={() => tts.speak(it.text, accent)} />
                  <View style={{ flex: 1, flexShrink: 1 }}>
                    <FocusSentence text={it.text} soundId={it.soundTags[0]} style={type.bodyStrong} />
                    <Text style={type.caption}>{it.soundTags.length ? `Focus /${it.soundTags.slice(0, 2).map(t => ipaForSound(t, accent)).join(" · ")}/` : "Personal practice"}{isDue ? "" : ` · ${it.dueAt}`}</Text>
                  </View>
                  <Button label="Say it" size="sm" variant={isDue ? "secondary" : "ghost"} onPress={() => practiceItem(it)} />
                  <IconButton icon="trash" label={`Remove ${it.text}`} size={48} onPress={() => remove(it)} />
                </View>
              </Card>
            );
          })
        ) : (
          <EmptyState
            icon="book"
            title="Your word set is empty"
            body="Missed words save here automatically, and anything you type is added too. They come back on a spaced schedule."
          />
        )}
      </Screen>

      <SpeakSheet visible={speaking} mode={mode} onPro={onPro} onClose={() => setSpeaking(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.md },
  ipaBox: { marginTop: space.md, padding: space.md, backgroundColor: palette.primarySoft, borderRadius: radius.md, gap: 4 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  itemCard: { paddingHorizontal: space.md, paddingVertical: space.xs },
  item: { flexDirection: "row", alignItems: "center", gap: space.sm },
});
