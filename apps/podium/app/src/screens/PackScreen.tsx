import { useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { LinearTransition } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  AiReport,
  Button,
  CONTENT_MAX,
  Card,
  Icon,
  IconButton,
  Segmented,
  Tappable,
  feedback,
  palette,
  radius,
  space,
  toast,
  type,
} from "../ui";
import { scenarioIcon } from "./widgets";
import { appStore, useApp } from "../core/data";
import { flagPrompt, removeCustomPack } from "../core/state";
import { getPack, promptsForPack } from "../core/content";
import type { Difficulty } from "../core/types";
import type { AppNav } from "../app/nav";
import { analytics } from "../modules/analytics";

type Row = { id: string; text: string; difficulty: Difficulty };

/** A scenario pack's prompts: shuffle, filter by difficulty, skip/flag, and tap
 * any prompt to record it. No locked progression — every prompt is available. */
export function PackScreen({ packId, nav, onClose }: { packId: string; nav: AppNav; onClose: () => void }) {
  const app = useApp();
  const insets = useSafeAreaInsets();
  const isCustom = packId.startsWith("custom_");
  const pack = getPack(packId);
  const custom = app.customPacks.find((c) => c.id === packId);
  const name = isCustom ? custom?.name ?? "Scenario" : pack?.name ?? "Scenario";
  const [diff, setDiff] = useState<"all" | Difficulty>("all");

  const all: Row[] = isCustom
    ? (custom?.promptTexts ?? []).map((text, i) => ({ id: `${packId}_${i}`, text, difficulty: "medium" as Difficulty }))
    : promptsForPack(packId).map((p) => ({ id: p.id, text: p.text, difficulty: p.difficulty }));

  const flagged = new Set(app.prompts.flagged);
  const rows = all.filter((r) => !flagged.has(r.id)).filter((r) => isCustom || diff === "all" || r.difficulty === diff);

  const record = (r: Row) => {
    analytics.track("scenario_selected", { pack: packId });
    nav.record({ mode: "standard", packId, promptId: r.id, promptText: r.text, scenario: name, title: name });
  };

  const shuffle = () => {
    const pool = rows.length ? rows : all;
    if (!pool.length) return;
    const pick = pool[(app.shuffleSeed + Date.now()) % pool.length];
    feedback("pop", "light");
    record(pick);
  };

  const flag = (r: Row) => {
    appStore.set((s) => flagPrompt({ ...s, selection: { packId, promptId: r.id } }));
    feedback("pop", "warning");
    analytics.track("prompt_flagged_irrelevant");
    toast("Hidden — we won't suggest that one");
  };

  const deletePack = () => {
    Alert.alert(`Delete "${name}"?`, "This removes your custom scenario and its tailored prompts from this phone. It can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          appStore.set((s) => removeCustomPack(s, packId));
          feedback("pop", "warning");
          toast("Scenario deleted");
          onClose();
        },
      },
    ]);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.bar}>
        <IconButton icon="chevronLeft" label="Back" onPress={onClose} />
        <View style={styles.titleWrap}>
          <View style={styles.titleIcon}><Icon name={scenarioIcon(packId)} size={18} color={palette.primary} /></View>
          <Text style={type.heading} numberOfLines={1}>{name}</Text>
        </View>
        {isCustom ? <IconButton icon="trash" label="Delete scenario" tone="danger" onPress={deletePack} /> : <View style={{ width: 48 }} />}
      </View>

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 96 }]}>
        {!isCustom && pack ? <Text style={[type.body, { color: palette.inkSoft }]}>{pack.blurb}</Text> : null}
        {custom ? (
          <View style={{ gap: space.xs }}>
            <Text style={type.caption}>Private to you · {custom.promptTexts.length} tailored prompts</Text>
            <AiReport feature="personalised_prompts" />
          </View>
        ) : null}

        {!isCustom ? (
          <Segmented
            options={[{ value: "all", label: "All" }, { value: "easy", label: "Easy" }, { value: "medium", label: "Medium" }, { value: "hard", label: "Hard" }]}
            value={diff}
            onChange={setDiff}
          />
        ) : null}

        {rows.length === 0 ? (
          <Card><Text style={[type.body, { color: palette.inkSoft, textAlign: "center" }]}>No prompts here right now. Try another difficulty.</Text></Card>
        ) : (
          <View style={{ gap: space.sm }}>
            {rows.map((r) => (
              <Animated.View key={r.id} layout={LinearTransition.duration(220)} style={styles.promptRow}>
                <Tappable label={r.text} onPress={() => record(r)} style={{ flex: 1 }}>
                  <Text style={type.body}>{r.text}</Text>
                  {!isCustom ? <Text style={[type.caption, { marginTop: 2, textTransform: "capitalize" }]}>{r.difficulty}</Text> : null}
                </Tappable>
                <IconButton icon="close" label="Not relevant" size={36} onPress={() => flag(r)} />
              </Animated.View>
            ))}
          </View>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
        <Button label="Shuffle & record" icon="shuffle" size="lg" onPress={shuffle} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
  bar: { flexDirection: "row", alignItems: "center", paddingHorizontal: space.sm, paddingVertical: space.sm, gap: space.sm },
  titleWrap: { flex: 1, flexDirection: "row", alignItems: "center", gap: space.sm },
  titleIcon: { width: 32, height: 32, borderRadius: 9, backgroundColor: palette.primarySoft, alignItems: "center", justifyContent: "center" },
  body: { paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.lg, width: "100%", maxWidth: CONTENT_MAX, alignSelf: "center" },
  promptRow: { flexDirection: "row", alignItems: "center", gap: space.sm, backgroundColor: palette.surface, borderRadius: radius.lg, padding: space.md, borderWidth: 1, borderColor: palette.border },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: space.lg, paddingTop: space.md, backgroundColor: palette.bg, borderTopWidth: 1, borderTopColor: palette.border },
});
