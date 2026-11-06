import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  Button,
  Card,
  Icon,
  Screen,
  SectionHeader,
  Tappable,
  TextField,
  feedback,
  palette,
  radius,
  space,
  toast,
  type,
} from "../ui";
import { scenarioIcon } from "./widgets";
import { appStore, todayKey, useApp } from "../core/data";
import { addCustomScenario } from "../core/state";
import { LESSONS, PACKS, nextPrompt } from "../core/content";
import { ai } from "../modules/ai";
import { analytics } from "../modules/analytics";
import type { IconName } from "../ui";
import type { ScreenProps } from "../app/nav";

const LESSON_ICON: Record<string, IconName> = {
  opening: "flag",
  pace: "wave",
  fillers: "mic",
  structure: "book",
  confidence: "flame",
  closing: "star",
};

/** Practice hub: impromptu, custom AI scenarios, 12 scenario packs, lessons and event prep. */
export function PracticeScreen({ bottomInset, nav }: ScreenProps) {
  const app = useApp();
  const today = todayKey();
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const impromptu = () => {
    const p = nextPrompt("impromptu", app.prompts.seen, app.shuffleSeed + Date.now() % 97) ?? null;
    if (!p) return;
    analytics.track("scenario_selected", { pack: "impromptu" });
    nav.record({ mode: "standard", packId: p.packId, promptId: p.id, promptText: p.text, scenario: "Impromptu", title: "Impromptu" });
  };

  const importTalk = () => {
    analytics.track("scenario_selected", { pack: "import" });
    nav.record({
      mode: "standard",
      packId: "impromptu",
      promptId: "import",
      // Open instruction (no fixed topic) so an imported talk is never judged
      // "off-topic" against a specific prompt — any prepared talk answers it.
      promptText: "Deliver the talk, pitch or speech you want feedback on.",
      scenario: "Imported talk",
      title: "Import a talk",
      startTyped: true,
    });
  };

  const createCustom = async () => {
    const clean = topic.trim();
    if (clean.length < 3) {
      feedback("error", "warning");
      return setErr("Give your topic a few more words.");
    }
    setErr(null);
    setBusy(true);
    const r = await ai.run("personalised_prompts", JSON.stringify({ scenario: clean, difficulty: "medium" }));
    const prompts = r.ok ? ((r.json as { prompts?: string[] })?.prompts ?? []).filter((p): p is string => typeof p === "string") : undefined;
    const res = addCustomScenario(appStore.get(), clean, today, prompts?.length ? prompts : undefined);
    appStore.set(res.state);
    setBusy(false);
    setTopic("");
    feedback("success", "success");
    analytics.track("scenario_selected", { pack: "custom" });
    if (!r.ok && r.reason === "quota") toast("Added with starter prompts · Pro adds AI-tailored ones");
    else if (!r.ok) toast("Added with starter prompts · reconnect for AI-tailored ones");
    else toast("Custom scenario ready");
    if (res.id) nav.openPack(res.id);
  };

  return (
    <Screen title="Practice" subtitle="Pick a scenario" bottomInset={bottomInset}>
      {/* Quick start */}
      <View style={styles.quickRow}>
        <QuickCard icon="shuffle" title="Impromptu" subtitle="Random topic" onPress={impromptu} />
        <QuickCard icon="calendar" title="Event prep" subtitle="Plan for a date" onPress={() => nav.openEvent()} />
      </View>

      {/* Import an existing talk (audio file OR pasted text → scored report + rewrite) */}
      <Tappable label="Import a talk to score" onPress={importTalk} style={styles.listRow}>
        <View style={[styles.iconChip, { backgroundColor: palette.primarySoft }]}><Icon name="document" size={18} color={palette.primary} /></View>
        <View style={{ flex: 1 }}>
          <Text style={type.bodyStrong}>Import a talk</Text>
          <Text style={type.caption} numberOfLines={2}>Choose an audio file or paste a script to score it</Text>
        </View>
        <Icon name="chevronRight" size={20} color={palette.inkMuted} />
      </Tappable>

      {/* Custom AI scenario */}
      <Card style={{ gap: space.md }} accent={palette.accent}>
        <View style={styles.rowHead}>
          <View style={[styles.iconChip, { backgroundColor: palette.primarySoft }]}><Icon name="sparkle" size={18} color={palette.primary} /></View>
          <View style={{ flex: 1 }}>
            <Text style={type.bodyStrong}>Custom scenario</Text>
            <Text style={type.caption}>Your topic or pasted agenda — private, never shared</Text>
          </View>
        </View>
        <TextField
          label="Topic or agenda"
          placeholder="e.g. My conference keynote on AI ethics"
          value={topic}
          onChangeText={(t) => { setTopic(t); setErr(null); }}
          error={err}
          maxLength={160}
          returnKeyType="done"
          onSubmitEditing={createCustom}
        />
        <Button label="Create tailored prompts" icon="sparkle" loading={busy} onPress={createCustom} />
      </Card>

      {app.customPacks.length ? (
        <>
          <SectionHeader title="Your scenarios" />
          <View style={{ gap: space.sm }}>
            {app.customPacks.map((c) => (
              <Tappable key={c.id} label={c.name} onPress={() => nav.openPack(c.id)} style={styles.listRow}>
                <View style={[styles.iconChip, { backgroundColor: palette.primarySoft }]}><Icon name="sparkle" size={18} color={palette.primary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={type.bodyStrong} numberOfLines={1}>{c.name}</Text>
                  <Text style={type.caption}>{c.promptTexts.length} prompts</Text>
                </View>
                <Icon name="chevronRight" size={20} color={palette.inkMuted} />
              </Tappable>
            ))}
          </View>
        </>
      ) : null}

      {/* Scenario packs */}
      <SectionHeader title="Scenario packs" />
      <View style={styles.grid}>
        {PACKS.map((p) => (
          <Tappable key={p.id} label={`${p.name}: ${p.blurb}`} onPress={() => { analytics.track("scenario_selected", { pack: p.id }); nav.openPack(p.id); }} style={styles.packCard}>
            <View style={styles.packIcon}><Icon name={scenarioIcon(p.id)} size={22} color={palette.primary} /></View>
            <Text style={type.bodyStrong} numberOfLines={1}>{p.name}</Text>
            <Text style={type.caption} numberOfLines={2}>{p.blurb}</Text>
          </Tappable>
        ))}
      </View>

      {/* Lessons */}
      <SectionHeader title="Guided lessons" />
      <View style={{ gap: space.sm }}>
        {LESSONS.map((l) => {
          const done = app.lessons.find((x) => x.lessonId === l.id)?.completed;
          return (
            <Tappable key={l.id} label={l.title} onPress={() => nav.openLesson(l.id)} style={styles.listRow}>
              <View style={[styles.iconChip, { backgroundColor: done ? palette.successSoft : palette.primarySoft }]}>
                <Icon name={done ? "check" : (LESSON_ICON[l.skill] ?? "book")} size={18} color={done ? palette.success : palette.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={type.bodyStrong} numberOfLines={1}>{l.title}</Text>
                <Text style={type.caption} numberOfLines={1}>{l.steps.length} steps · ends in a scored take</Text>
              </View>
              <Icon name="chevronRight" size={20} color={palette.inkMuted} />
            </Tappable>
          );
        })}
      </View>
    </Screen>
  );
}

function QuickCard({ icon, title, subtitle, onPress }: { icon: "shuffle" | "calendar"; title: string; subtitle: string; onPress: () => void }) {
  return (
    <Tappable label={title} onPress={onPress} style={styles.quickCard}>
      <View style={styles.packIcon}><Icon name={icon} size={22} color={palette.primary} /></View>
      <Text style={type.bodyStrong}>{title}</Text>
      <Text style={type.caption}>{subtitle}</Text>
    </Tappable>
  );
}

const styles = StyleSheet.create({
  quickRow: { flexDirection: "row", gap: space.md },
  quickCard: { flex: 1, backgroundColor: palette.surface, borderRadius: radius.lg, padding: space.lg, gap: 4, borderWidth: 1, borderColor: palette.border },
  rowHead: { flexDirection: "row", alignItems: "center", gap: space.md },
  iconChip: { width: 36, height: 36, borderRadius: 10, backgroundColor: palette.primarySoft, alignItems: "center", justifyContent: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  packCard: { width: "47%", flexGrow: 1, backgroundColor: palette.surface, borderRadius: radius.lg, padding: space.lg, gap: 4, borderWidth: 1, borderColor: palette.border },
  packIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: palette.primarySoft, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  listRow: { flexDirection: "row", alignItems: "center", gap: space.md, backgroundColor: palette.surface, borderRadius: radius.lg, padding: space.md, borderWidth: 1, borderColor: palette.border, minHeight: 64 },
});
