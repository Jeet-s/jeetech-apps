import { useEffect, useMemo, useState } from "react";
import { Alert, Image, ScrollView, StyleSheet, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import Animated, { LinearTransition } from "react-native-reanimated";
import {
  AiReport, Button, Card, Chip, EmptyState, Icon, IconButton, Pill, Screen, SectionHeader, Segmented, Sheet,
  Skeleton, Tappable, TextField, feedback, palette, radius, space, toast, type,
} from "../ui";
import { art } from "../art";
import { useSugar, sugarStore } from "../core/data";
import { useSettings } from "../modules/store";
import { analytics } from "../modules/analytics";
import { ai } from "../modules/ai";
import {
  activeProfile, autoSlot, liveMeals, liveReadings, GI_LABEL, SLOT_LABEL, MEAL_SLOTS, type GiBand, type Meal, type MealSlot, type MealItem,
} from "../core/model";
import {
  addMeal, editMeal, deleteMeal, repeatMeal, sameMealCandidate, mealReadings, linkReading, unlinkReading,
  combineGiBand, sanitizeMealEstimate, type AiMealEstimate,
} from "../core/meals";
import { mealLabel as labelOf } from "../core/insights";
import { searchDishes, dishCarbs, type Dish } from "../core/dishes";
import { acceptDisclaimer } from "../core/profiles";
import { aiRemainingAt, canUseAi, consumeAi } from "../core/pro";
import { dayKey } from "../core/dates";
import { formatValue } from "../core/units";
import { nowTs, formatDateTime, formatDelta, DateTimeField } from "./shared";

const MEAL_DISCLAIMER =
  "Carb and glycemic estimates are a wellness guide, not medical advice or treatment guidance. They can be wrong — adjust portions to your own plan and talk to your clinician about any changes.";
const LINK_WINDOW = 4 * 3_600_000;

export type PlatePhoto = { uri: string; base64: string };

/**
 * Capture ONE plate photo for the AI estimate: camera when granted, otherwise
 * the system photo picker (no storage permission). Shrunk to ~1024px JPEG ~0.7
 * base64 before it leaves the device. Returns null if the user cancels.
 */
async function capturePlate(source: "camera" | "library"): Promise<PlatePhoto | null> {
  let picked: ImagePicker.ImagePickerResult;
  if (source === "camera") {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return null;
    picked = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], allowsEditing: false, quality: 1 });
  } else {
    picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: false, quality: 1 });
  }
  if (picked.canceled || !picked.assets?.length) return null;
  const shrunk = await manipulateAsync(picked.assets[0].uri, [{ resize: { width: 1024 } }], {
    compress: 0.7,
    format: SaveFormat.JPEG,
    base64: true,
  });
  if (!shrunk.base64) return null;
  return { uri: shrunk.uri, base64: shrunk.base64 };
}

type EditItem = { name: string; portion: number; per: number };
const GI_TONE: Record<GiBand, "success" | "warning" | "danger"> = { low: "success", medium: "warning", high: "danger" };

/** Meals: dish search, one-tap repeat, honest AI estimates, before/after linking. */
export function MealsScreen({ bottomInset, onPro, openAdd, openSnap }: { bottomInset: number; onPro: (from: string) => void; openAdd?: boolean; openSnap?: boolean }) {
  const data = useSugar();
  const settings = useSettings();
  const profile = activeProfile(data);
  const unit = profile.unit;

  const [sheet, setSheet] = useState<null | { mode: "add"; snap?: boolean } | { mode: "edit"; meal: Meal }>(openAdd ? { mode: "add", snap: openSnap } : null);
  const [detail, setDetail] = useState<Meal | null>(null);

  // Memoised: liveMeals filters + sorts the whole log, so the newest-first list must not be rebuilt
  // on every render (e.g. opening/closing a sheet) — only when the data actually changes.
  const meals = useMemo(() => liveMeals(data).slice().reverse(), [data]);
  const remaining = aiRemainingAt(data, settings.pro, nowTs());

  const repeat = (m: Meal) => {
    const snapshot = data; // for a one-tap undo of the duplicate this creates
    const res = repeatMeal(data, m.id, nowTs());
    if (!res.id) return;
    sugarStore.set(res.state);
    feedback("success", "success");
    analytics.track("core_action", { feature: "meal_repeat" });
    analytics.track("meal_repeat_used");
    toast(`Logged again: ${labelOf(m)}`, { label: "Undo", onPress: () => { sugarStore.set(snapshot); feedback("pop", "warning"); } });
  };

  return (
    <>
      <Screen
        title="Meals"
        subtitle="Know what your plate does"
        bottomInset={bottomInset}
        right={<IconButton icon="plus" label="Log a meal" tone="primary" onPress={() => setSheet({ mode: "add" })} />}
      >
        <Button label="Snap your plate" size="lg" icon="camera" onPress={() => setSheet({ mode: "add", snap: true })} />
        <Button label="Log a meal" variant="secondary" icon="meal" onPress={() => setSheet({ mode: "add" })} />

        {/* Same meal as yesterday, per slot */}
        <SameAsYesterday data={data} onRepeat={repeat} />

        <SectionHeader
          title="Recent meals"
          action={<Text style={type.caption}>{settings.pro ? "AI: Pro" : `${remaining}/3 AI left`}</Text>}
        />
        {meals.length === 0 ? (
          <Card>
            <EmptyState
              art={art.empty_meals}
              title="No meals yet"
              body="Add a plate to see its carbs, glycemic impact and a local swap — then link a before/after reading to learn what it does to you."
              action={<Button label="Add your first meal" icon="plus" onPress={() => setSheet({ mode: "add" })} />}
            />
          </Card>
        ) : (
          <View style={{ gap: space.sm }}>
            {meals.map((m) => (
              <Animated.View key={m.id} layout={LinearTransition.duration(180)}>
                <MealCard meal={m} data={data} unit={unit} onPress={() => setDetail(m)} onRepeat={() => repeat(m)} />
              </Animated.View>
            ))}
          </View>
        )}
      </Screen>

      {sheet ? (
        <MealEditor
          key={sheet.mode === "edit" ? sheet.meal.id : "add"}
          mode={sheet.mode}
          meal={sheet.mode === "edit" ? sheet.meal : undefined}
          startPhoto={sheet.mode === "add" && !!sheet.snap}
          onClose={() => setSheet(null)}
          onPro={onPro}
        />
      ) : null}

      <MealDetail meal={detail} onClose={() => setDetail(null)} onEdit={(m) => { setDetail(null); setSheet({ mode: "edit", meal: m }); }} />
    </>
  );
}

// ── Same as yesterday chips ──────────────────────────────────────────────────────
function SameAsYesterday({ data, onRepeat }: { data: ReturnType<typeof useSugar>; onRepeat: (m: Meal) => void }) {
  const current = autoSlot(nowTs());
  const candidates = MEAL_SLOTS.map((slot) => ({ slot, meal: sameMealCandidate(data, slot, nowTs()) }))
    .filter((c): c is { slot: MealSlot; meal: Meal } => !!c.meal)
    .sort((a) => (a.slot === current ? -1 : 1));
  if (!candidates.length) return null;
  return (
    <Card>
      <Text style={[type.label, { marginBottom: space.sm }]}>ONE-TAP REPEAT</Text>
      <View style={styles.chips}>
        {candidates.slice(0, 4).map(({ slot, meal }) => (
          <Chip key={slot} label={`${SLOT_LABEL[slot]}: ${labelOf(meal)}`} onPress={() => onRepeat(meal)} />
        ))}
      </View>
    </Card>
  );
}

// ── Meal card ──────────────────────────────────────────────────────────────────
function MealCard({ meal, data, unit, onPress, onRepeat }: { meal: Meal; data: ReturnType<typeof useSugar>; unit: ReturnType<typeof activeProfile>["unit"]; onPress: () => void; onRepeat: () => void }) {
  const mr = mealReadings(data, meal.id);
  return (
    <Card padded={false}>
      <Tappable label={`${labelOf(meal)}, ${meal.carbsTotalG} grams carbs. Open details`} onPress={onPress} style={styles.mealMain}>
        <View style={{ flex: 1, gap: 4 }}>
          <View style={styles.mealTop}>
            <Text style={type.bodyStrong} numberOfLines={1}>{labelOf(meal)}</Text>
            {meal.source === "ai" ? <Pill label="Estimate" tone="neutral" /> : null}
          </View>
          <Text style={type.caption}>{SLOT_LABEL[meal.slot]} · {formatDateTime(meal.ts)}</Text>
          <View style={styles.mealTags}>
            <Pill label={`${GI_LABEL[meal.giBand]} GI`} tone={GI_TONE[meal.giBand]} />
            {mr.delta != null ? (
              <Pill label={`${formatDelta(mr.delta, unit)} after`} tone={mr.delta > 40 ? "warning" : "success"} icon={<Icon name={mr.delta > 0 ? "arrowUp" : "arrowDown"} size={12} color={palette.inkSoft} />} />
            ) : mr.before ? (
              <Pill label="Before linked · awaiting after" tone="neutral" icon={<Icon name="link" size={12} color={palette.inkSoft} />} />
            ) : mr.after ? (
              <Pill label="After linked" tone="neutral" icon={<Icon name="link" size={12} color={palette.inkSoft} />} />
            ) : null}
          </View>
        </View>
        <View style={styles.carbs}>
          <Text style={[type.number, { fontSize: 22 }]}>{meal.carbsTotalG}</Text>
          <Text style={type.caption}>g carbs</Text>
        </View>
      </Tappable>
      {/* An explicit, LABELLED "Log again" action — never an unlabelled round icon that
          reads as "link" and silently re-logs a duplicate. The repeat toast offers Undo. */}
      <View style={styles.mealActions}>
        <Button label="Log again" variant="ghost" size="sm" icon="history" onPress={onRepeat} />
      </View>
    </Card>
  );
}

// ── Meal editor sheet (search / AI / portions) ────────────────────────────────────
export function MealEditor({ mode, meal, startPhoto, onClose, onPro }: { mode: "add" | "edit"; meal?: Meal; startPhoto?: boolean; onClose: () => void; onPro: (from: string) => void }) {
  const data = useSugar();
  const settings = useSettings();
  const profile = activeProfile(data);

  const [items, setItems] = useState<EditItem[]>(
    meal ? meal.items.map((i) => ({ name: i.name, portion: i.portion, per: i.portion ? Math.round(i.carbsG / i.portion) : i.carbsG })) : [],
  );
  const [slot, setSlot] = useState<MealSlot>(meal?.slot ?? autoSlot(nowTs()));
  const [gi, setGi] = useState<GiBand>(meal?.giBand ?? "medium");
  const [swap, setSwap] = useState(meal?.swapText ?? "");
  const [note, setNote] = useState(meal?.note ?? "");
  const [ts, setTs] = useState(meal?.ts ?? nowTs());
  const [source, setSource] = useState<Meal["source"]>(meal?.source ?? "db");

  const [query, setQuery] = useState("");
  const [aiText, setAiText] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [photo, setPhoto] = useState<PlatePhoto | null>(null);
  const [whenOpen, setWhenOpen] = useState(false);
  const [tab, setTab] = useState<"search" | "ai">(startPhoto ? "ai" : "search");

  const results = useMemo(() => (query.trim() ? searchDishes(query, { cuisine: profile.cuisine, limit: 20 }) : searchDishes("", { cuisine: profile.cuisine, limit: 8 })), [query, profile.cuisine]);
  const total = Math.round(items.reduce((s, i) => s + i.portion * i.per, 0));

  const addDish = (d: Dish) => {
    feedback("pop", "select");
    setItems((prev) => [...prev, { name: d.name, portion: 1, per: dishCarbs(d, 1) }]);
    // recompute GI from the dishes picked + carry a swap from the sharpest dish
    setGi((g) => combineGiBand([g === "medium" && items.length === 0 ? d.giBand : g, d.giBand]));
    if (!swap || source === "db") setSwap(d.swapIdeas);
    setSource("db");
    setQuery("");
  };
  const setPortion = (idx: number, delta: number) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, portion: Math.max(0.5, Math.round((it.portion + delta) * 2) / 2) } : it)));
  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));

  const runAi = async () => {
    const input = aiText.trim();
    if (!input) return;
    if (!canUseAi(data, settings.pro, dayKey(nowTs()))) {
      analytics.track("quota_hit");
      return onPro("ai_quota");
    }
    const go = async () => {
      setAiBusy(true);
      setAiError(null);
      analytics.track("meal_photo_started");
      const res = await ai.run("meal_estimate", input);
      setAiBusy(false);
      if (!res.ok) {
        if (res.reason === "quota") { analytics.track("quota_hit"); return onPro("ai_quota"); }
        feedback("error", "error");
        return setAiError(res.reason === "offline" ? "You're offline. Search dishes below, or try again when connected." : "Couldn't estimate that. Try rephrasing, or search dishes below.");
      }
      const raw = (res.json ?? safeParse(res.text)) as AiMealEstimate | null;
      if (!raw) return setAiError("Couldn't read the estimate. Try again or search dishes.");
      const est = sanitizeMealEstimate(raw);
      sugarStore.set(consumeAi(data, dayKey(nowTs())));
      analytics.track("meal_analysis_returned");
      feedback("success", "success");
      setItems(est.items.map((i) => ({ name: i.name, portion: i.portion, per: i.portion ? Math.round(i.carbsG / i.portion) : i.carbsG })));
      setGi(est.giBand);
      setSwap(est.swapText);
      setSource("ai");
      setTab("search");
    };
    if (!data.disclaimerAccepted) {
      Alert.alert("A quick note on estimates", MEAL_DISCLAIMER, [
        { text: "Cancel", style: "cancel" },
        { text: "I understand", onPress: () => { sugarStore.set(acceptDisclaimer(data)); void go(); } },
      ]);
      return;
    }
    void go();
  };

  // ── Snap-a-plate photo estimate (the hero action) ────────────────────────────
  const runPhoto = async (src: "camera" | "library") => {
    if (aiBusy) return;
    if (!canUseAi(data, settings.pro, dayKey(nowTs()))) { analytics.track("quota_hit"); return onPro("ai_quota"); }
    const go = async () => {
      let shot: PlatePhoto | null = null;
      try { shot = await capturePlate(src); } catch { shot = null; }
      if (!shot) return; // cancelled or permission not granted
      setPhoto(shot);
      setItems([]);
      setAiBusy(true);
      setAiError(null);
      analytics.track("meal_photo_started");
      const res = await ai.run("meal_photo", "Identify the dishes on this plate and estimate their carbs and glycemic impact for a diabetes wellness tracker.", { image: shot.base64 });
      setAiBusy(false);
      if (!res.ok) {
        if (res.reason === "quota") { analytics.track("quota_hit"); return onPro("ai_quota"); }
        feedback("error", "error");
        return setAiError(res.reason === "offline" ? "You're offline — the photo stays here, try again when connected or search dishes below." : "Couldn't read that photo. Try again in better light, or search dishes below.");
      }
      const raw = (res.json ?? safeParse(res.text)) as AiMealEstimate | null;
      if (!raw) return setAiError("Couldn't read the estimate. Try again or search dishes.");
      const est = sanitizeMealEstimate(raw);
      sugarStore.set((s) => consumeAi(s, dayKey(nowTs())));
      analytics.track("meal_analysis_returned");
      feedback("success", "success");
      setItems(est.items.map((i) => ({ name: i.name, portion: i.portion, per: i.portion ? Math.round(i.carbsG / i.portion) : i.carbsG })));
      setGi(est.giBand);
      setSwap(est.swapText);
      setSource("ai");
    };
    if (!data.disclaimerAccepted) {
      Alert.alert("A quick note on estimates", MEAL_DISCLAIMER, [
        { text: "Cancel", style: "cancel" },
        { text: "I understand", onPress: () => { sugarStore.set(acceptDisclaimer(data)); void go(); } },
      ]);
      return;
    }
    void go();
  };

  const snapPlate = () => {
    feedback("pop", "select");
    Alert.alert("Add a plate photo", "We'll estimate the carbs and glycemic impact — an estimate, not medical advice.", [
      { text: "Choose from library", onPress: () => void runPhoto("library") },
      { text: "Take a photo", onPress: () => void runPhoto("camera") },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  // Snap straight away when opened from the "Snap your plate" button.
  useEffect(() => {
    if (startPhoto) snapPlate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = () => {
    const mealItems: MealItem[] = items.map((i) => ({ name: i.name, portion: i.portion, carbsG: Math.round(i.portion * i.per) }));
    if (!mealItems.length) { feedback("error", "error"); return; }
    if (mode === "edit" && meal) {
      sugarStore.set(editMeal(data, meal.id, { items: mealItems, slot, giBand: gi, swapText: swap, note: note.trim(), ts }, nowTs()));
      feedback("success", "success");
      analytics.track("meal_analysis_edited");
      toast("Meal updated");
      onClose();
      return;
    }
    const res = addMeal(data, { items: mealItems, ts, slot, giBand: gi, swapText: swap, note: note.trim(), source }, nowTs());
    if (!res.id) { feedback("error", "error"); return; }
    // Link a recent pre-meal reading as the "before" (F3).
    let next = res.state;
    const before = liveReadings(next)
      .filter((r) => r.mealId === null && Math.abs(ts - r.ts) <= LINK_WINDOW && r.ts <= ts)
      .sort((a, b) => a.ts - b.ts)
      .pop();
    if (before) {
      next = { ...next, readings: next.readings.map((r) => (r.id === before.id ? { ...r, mealId: res.id!, updatedAt: nowTs() } : r)) };
    }
    sugarStore.set(next);
    feedback("success", "success");
    analytics.track("core_action", { feature: "meal_logged" });
    analytics.track("meal_saved");
    toast(before ? "Meal saved · before-reading linked" : "Meal saved");
    onClose();
  };

  return (
    <Sheet visible title={mode === "edit" ? "Edit meal" : "Log a meal"} onClose={onClose}>
      <Segmented
        options={[{ value: "search", label: "Search dishes" }, { value: "ai", label: "AI estimate" }]}
        value={tab}
        onChange={(t) => setTab(t as "search" | "ai")}
      />

      {tab === "ai" ? (
        <View style={{ gap: space.sm }}>
          <Button label={aiBusy ? "Analysing photo…" : "Snap a plate photo"} size="lg" icon="camera" loading={aiBusy} onPress={snapPlate} />
          {photo ? <Image source={{ uri: photo.uri }} style={styles.photo} resizeMode="cover" accessibilityLabel="Your plate photo" accessibilityIgnoresInvertColors /> : null}
          <Text style={[type.caption, { textAlign: "center" }]}>Point at your plate — or describe it in words below.</Text>
          <TextField
            label="Describe your plate"
            placeholder="e.g. 2 roti, dal, half cup rice, salad"
            value={aiText}
            onChangeText={(t) => { setAiText(t); setAiError(null); }}
            multiline
            helper="We estimate carbs & glycemic impact for your cuisine. Estimates only — not medical advice."
            error={aiError}
          />
          <Button label={aiBusy ? "Estimating…" : "Estimate from text"} variant="secondary" icon="insights" loading={aiBusy} onPress={runAi} />
          {!settings.pro ? <Text style={[type.caption, { textAlign: "center" }]}>{aiRemainingAt(data, false, nowTs())} free estimates left today · search is always free</Text> : null}
        </View>
      ) : (
        <View style={{ gap: space.sm }}>
          <TextField label="Find a dish" placeholder="Search 600+ dishes (roti, dal, arepa…)" value={query} onChangeText={setQuery} />
          <ScrollView style={styles.results} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
            {results.map((d) => (
              <Tappable key={d.id} label={`Add ${d.name}, ${dishCarbs(d, 1)} grams carbs`} onPress={() => addDish(d)} style={styles.resultRow}>
                <View style={{ flex: 1 }}>
                  <Text style={type.bodyStrong} numberOfLines={1}>{d.name}</Text>
                  <Text style={type.caption}>{GI_LABEL[d.giBand]} GI · ~{dishCarbs(d, 1)}g per serving</Text>
                </View>
                <Icon name="plus" size={20} color={palette.primary} />
              </Tappable>
            ))}
          </ScrollView>
        </View>
      )}

      {aiBusy ? (
        <Card padded={false} style={{ paddingHorizontal: space.lg, paddingVertical: space.md }}>
          <View style={{ gap: 10 }} accessibilityLabel="Estimating your plate">
            <Skeleton width="55%" height={16} />
            <Skeleton width="82%" height={14} />
            <Skeleton width="40%" height={14} />
          </View>
        </Card>
      ) : null}

      {!aiBusy && items.length ? (
        <Card padded={false} style={{ paddingHorizontal: space.lg, paddingVertical: space.sm }}>
          {source === "ai" ? (
            <View style={styles.estBanner}>
              <Icon name="info" size={14} color={palette.inkSoft} />
              <Text style={[type.caption, { flex: 1 }]}>AI estimate — review and edit portions before saving.</Text>
            </View>
          ) : null}
          {items.map((it, idx) => {
            const grams = Math.round(it.portion * it.per);
            return (
              <View key={`${it.name}-${idx}`} style={styles.itemRow}>
                <View style={{ flex: 1 }}>
                  <Text style={type.bodyStrong} numberOfLines={1}>{it.name}</Text>
                  <Text style={type.caption}>{it.portion} serving{it.portion === 1 ? "" : "s"}</Text>
                </View>
                {/* Clear carb stepper: unmistakable −/+ with the grams front and centre, so editing the
                    amount (and seeing it change) is obvious — not a pair of nav-looking chevrons. */}
                <View style={styles.stepper}>
                  <IconButton icon="minus" label={`Less ${it.name}`} size={36} onPress={() => setPortion(idx, -0.5)} />
                  <View style={styles.stepperVal} accessible accessibilityLabel={`${it.name}: ${grams} grams carbs`}>
                    <Text style={[type.amount, { fontSize: 18 }]}>{grams}</Text>
                    <Text style={type.caption}>g</Text>
                  </View>
                  <IconButton icon="plus" label={`More ${it.name}`} size={36} onPress={() => setPortion(idx, 0.5)} />
                </View>
                <IconButton icon="trash" label={`Remove ${it.name}`} tone="danger" size={36} onPress={() => removeItem(idx)} />
              </View>
            );
          })}
          <View style={styles.totalRow}>
            <Text style={type.bodyStrong}>Total</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
              <Pill label={`${GI_LABEL[gi]} GI`} tone={GI_TONE[gi]} />
              <Text style={[type.number, { fontSize: 20 }]}>{total}g</Text>
            </View>
          </View>
          {swap ? (
            <View style={styles.swap}>
              <Icon name="insights" size={16} color={palette.primary} />
              <Text style={[type.caption, { flex: 1, color: palette.inkSoft }]}>{swap}</Text>
            </View>
          ) : null}
          {source === "ai" ? <AiReport feature={photo ? "meal_photo" : "meal_estimate"} /> : null}
        </Card>
      ) : null}

      <View style={styles.editRow}>
        <View style={{ flex: 1 }}>
          <Text style={[type.label, { marginBottom: 6 }]}>Meal</Text>
          <Segmented options={MEAL_SLOTS.map((s) => ({ value: s, label: SLOT_LABEL[s] }))} value={slot} onChange={(s) => setSlot(s)} />
        </View>
      </View>
      <Tappable label={`Time: ${formatDateTime(ts)}. Tap to change`} role="button" sound="pop" onPress={() => setWhenOpen(true)} style={styles.whenChip}>
        <Icon name="clock" size={16} color={palette.inkSoft} />
        <Text style={type.label}>{formatDateTime(ts)}</Text>
      </Tappable>

      {/* Free-text note — editable here and shown in the meal detail + searchable in History
          (the search bar says "notes, foods, medications…", so notes must be editable). */}
      <TextField
        label="Note (optional)"
        placeholder="e.g. birthday lunch, felt sluggish after"
        value={note}
        onChangeText={setNote}
        maxLength={1000}
        multiline
      />

      <Button label={mode === "edit" ? "Save changes" : "Save meal"} size="lg" icon="check" disabled={!items.length} onPress={save} />

      <Sheet visible={whenOpen} title="When was this meal?" onClose={() => setWhenOpen(false)}>
        <DateTimeField ts={ts} onChange={setTs} />
        <Button label="Done" size="lg" onPress={() => setWhenOpen(false)} />
      </Sheet>
    </Sheet>
  );
}

// ── Meal detail sheet ─────────────────────────────────────────────────────────────
export function MealDetail({ meal, onClose, onEdit }: { meal: Meal | null; onClose: () => void; onEdit: (m: Meal) => void }) {
  const data = useSugar();
  const profile = activeProfile(data);
  // A lasting inline confirmation of the last link action (toasts alone sit behind the sheet).
  const [linkedMsg, setLinkedMsg] = useState<string | null>(null);
  useEffect(() => { setLinkedMsg(null); }, [meal?.id]);
  if (!meal) return null;
  const mr = mealReadings(data, meal.id);
  const nearby = liveReadings(data)
    .filter((r) => r.mealId === null && Math.abs(r.ts - meal.ts) <= 6 * 3_600_000)
    .sort((a, b) => Math.abs(a.ts - meal.ts) - Math.abs(b.ts - meal.ts))
    .slice(0, 4);
  const fmt = (mgdl: number) => `${formatValue(mgdl, profile.unit)} ${profile.unit === "mmol" ? "mmol/L" : "mg/dL"}`;

  const remove = () => {
    Alert.alert("Delete meal?", "This removes the meal and unlinks its readings. You can undo for a moment.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          const snapshot = data;
          sugarStore.set(deleteMeal(data, meal.id, nowTs()));
          feedback("pop", "warning");
          onClose();
          toast("Meal deleted", { label: "Undo", onPress: () => sugarStore.set(snapshot) });
        },
      },
    ]);
  };

  return (
    <Sheet visible title={labelOf(meal)} onClose={onClose}>
      <View style={styles.detailHead}>
        <View>
          <Text style={[type.number, { fontSize: 30 }]}>{meal.carbsTotalG}g</Text>
          <Text style={type.caption}>estimated carbs</Text>
        </View>
        <View style={{ alignItems: "flex-end", gap: 4 }}>
          <Pill label={`${GI_LABEL[meal.giBand]} GI`} tone={GI_TONE[meal.giBand]} />
          <Text style={type.caption}>{SLOT_LABEL[meal.slot]} · {formatDateTime(meal.ts)}</Text>
        </View>
      </View>

      {/* BEFORE / AFTER sits high in the sheet so linking a reading shows its result
          (the values and change below) above the fold — and the nearby readings are
          listed inline (no hidden toggle) so attaching one is a single, visible tap. */}
      <Card>
        <Text style={[type.label, { marginBottom: space.xs }]}>BEFORE / AFTER</Text>
        <View style={styles.baRow}>
          <View style={styles.baCol}>
            <Text style={type.caption}>Before</Text>
            <Text style={type.bodyStrong}>{mr.before ? fmt(mr.before.valueMgdl) : "—"}</Text>
          </View>
          <Icon name="chevronRight" size={18} color={palette.inkMuted} />
          <View style={styles.baCol}>
            <Text style={type.caption}>After</Text>
            <Text style={type.bodyStrong}>{mr.after ? fmt(mr.after.valueMgdl) : "—"}</Text>
          </View>
          <View style={styles.baCol}>
            <Text style={type.caption}>Change</Text>
            <Text style={[type.bodyStrong, { color: mr.delta == null ? palette.inkMuted : mr.delta > 40 ? palette.warning : palette.success }]}>
              {mr.delta == null ? "—" : formatDelta(mr.delta, profile.unit)}
            </Text>
          </View>
        </View>

        {linkedMsg ? (
          <View style={styles.linkedMsg}>
            <Icon name="check" size={15} color={palette.success} />
            <Text style={[type.caption, { flex: 1, color: palette.success }]}>{linkedMsg}</Text>
          </View>
        ) : !mr.after ? (
          <Text style={[type.caption, { marginTop: space.sm }]}>A reading logged 1–2h after this meal attaches here automatically — or tap one below to link it now.</Text>
        ) : null}

        {/* Nearby unlinked readings, inline. Tapping one links it and the Before/After/Change
            row above updates immediately — plus a lasting inline confirmation. */}
        {nearby.length ? (
          <View style={{ marginTop: space.md, gap: space.sm }}>
            <Text style={type.label}>LINK A READING (±6H)</Text>
            <View style={styles.chips}>
              {nearby.map((r) => {
                const isBefore = r.ts <= meal.ts;
                return (
                  <Tappable
                    key={r.id}
                    label={`Link the ${formatValue(r.valueMgdl, profile.unit)} reading at ${hhmm(r.ts)} as ${isBefore ? "before" : "after"} this meal`}
                    sound="pop"
                    onPress={() => {
                      sugarStore.set((s) => linkReading(s, r.id, meal.id, nowTs()));
                      feedback("success", "success");
                      analytics.track("post_meal_linked");
                      const msg = isBefore ? "Before-meal reading linked ✓" : "After-meal reading linked ✓";
                      setLinkedMsg(msg);
                      toast(msg);
                    }}
                    style={styles.linkChip}
                  >
                    <Icon name="plus" size={14} color={palette.primary} />
                    <Text style={[type.label, { color: palette.primary }]}>{formatValue(r.valueMgdl, profile.unit)} · {hhmm(r.ts)} · {isBefore ? "before" : "after"}</Text>
                  </Tappable>
                );
              })}
            </View>
          </View>
        ) : !mr.before && !mr.after ? (
          <Text style={[type.caption, { marginTop: space.sm }]}>No unlinked readings within a few hours of this meal yet. Log one on the Log tab (before or after) and it will appear here to link.</Text>
        ) : null}

        {mr.before || mr.after ? (
          <Button
            label="Unlink readings"
            variant="ghost"
            size="sm"
            style={{ marginTop: space.sm }}
            onPress={() => {
              const ids = [mr.before, mr.after].filter((r): r is NonNullable<typeof r> => !!r).map((r) => r.id);
              sugarStore.set((s) => ids.reduce((acc, id) => unlinkReading(acc, id, nowTs()), s));
              feedback("pop", "warning");
              setLinkedMsg(null);
              toast("Readings unlinked");
            }}
          />
        ) : null}
      </Card>

      <Card padded={false} style={{ paddingHorizontal: space.lg }}>
        {meal.items.map((i, idx) => (
          <View key={idx} style={styles.detailItem}>
            <Text style={[type.body, { flex: 1 }]} numberOfLines={1}>{i.name}</Text>
            <Text style={type.caption}>{i.portion} × · {i.carbsG}g</Text>
          </View>
        ))}
      </Card>

      {meal.swapText ? (
        <View style={styles.swap}>
          <Icon name="insights" size={16} color={palette.primary} />
          <Text style={[type.caption, { flex: 1, color: palette.inkSoft }]}>{meal.swapText}</Text>
        </View>
      ) : null}
      {meal.note ? <Text style={type.body}>{meal.note}</Text> : null}
      {meal.source === "ai" ? <Text style={type.caption}>Carbs estimated from your description — a wellness guide, not medical advice.</Text> : null}

      <Button label="Edit meal" variant="secondary" icon="edit" onPress={() => onEdit(meal)} />
      <Button label="Delete meal" variant="danger" icon="trash" onPress={remove} />
    </Sheet>
  );
}

function hhmm(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

function safeParse(text: string): AiMealEstimate | null {
  try {
    const m = text.match(/\{[\s\S]*\}/);
    return m ? (JSON.parse(m[0]) as AiMealEstimate) : null;
  } catch {
    return null;
  }
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  mealMain: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, minHeight: 72 },
  mealActions: { flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: space.md, paddingBottom: space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border, paddingTop: space.sm },
  mealTop: { flexDirection: "row", alignItems: "center", gap: space.sm },
  mealTags: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 },
  photo: { width: "100%", height: 160, borderRadius: radius.md },
  carbs: { alignItems: "flex-end", minWidth: 54 },
  results: { maxHeight: 240 },
  resultRow: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 52, paddingVertical: space.xs, paddingHorizontal: space.sm, borderRadius: radius.md },
  estBanner: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.sm },
  itemRow: { flexDirection: "row", alignItems: "center", gap: space.xs, paddingVertical: space.xs, minHeight: 48 },
  stepper: { flexDirection: "row", alignItems: "center", gap: 2 },
  stepperVal: { minWidth: 42, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 2 },
  totalRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border, marginTop: space.xs },
  swap: { flexDirection: "row", gap: space.sm, backgroundColor: palette.primarySoft, borderRadius: radius.md, padding: space.md },
  linkChip: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: palette.primary, backgroundColor: palette.surface },
  linkedMsg: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: space.sm },
  editRow: { flexDirection: "row", gap: space.md },
  whenChip: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: palette.border, alignSelf: "flex-start" },
  detailHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  detailItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md, minHeight: 44, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.border },
  baRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
  baCol: { alignItems: "center", gap: 2 },
});
