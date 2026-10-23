import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, ScrollView, Share, StyleSheet, Text, TextInput, View } from "react-native";
import {
  Button,
  Card,
  Chip,
  Icon,
  IconButton,
  ListItem,
  Pill,
  Segmented,
  Sheet,
  Tappable,
  TextField,
  feedback,
  palette,
  radius,
  space,
  toast,
  type,
} from "../ui";
import {
  type Block,
  type Template,
  BLOCK_COLORS,
  COLOR_NAMES,
  MAX_DURATION,
  MAX_REMINDERS,
  MAX_TAGS,
  MAX_TITLE,
  MIN_DURATION,
  STARTER_TEMPLATES,
} from "../core/model";
import {
  type ApplyMode,
} from "../core/templates";
import { applyTemplate, createFromStarter, saveDayAsTemplate } from "../core/templates";
import {
  type BlockError,
  appendLog,
  cleanTags,
  clearDay,
  completeBlock,
  deleteBlock,
  duplicateBlock,
  duration,
  findFreeSlot,
  overlapsAny,
  reopenBlock,
  resizeBlock,
  restoreBlock,
  shiftFollowing,
  skipBlock,
  snoozeBlock,
  startBlock,
  createBlock,
  updateBlock,
  validateBlockFields,
} from "../core/blocks";
import { blocksToCSV } from "../core/stats";
import { type PlanDraft, applyPlan, parseAiPlan, parseTasksFallback, planToBlocks } from "../core/ai";
import { DAY, addDays, fmtDuration, toHHMM } from "../core/time";
import { ai } from "../modules/ai";
import { analytics } from "../modules/analytics";
import {
  type Ops,
  DURATION_OPTIONS,
  REMINDER_OPTIONS,
  reminderOptionLabel,
  reminderSummary,
  timeRange,
  useKeyboardVisible,
} from "./helpers";

const ERRORS: Record<BlockError, string> = {
  empty_title: "Give the block a title.",
  too_long: `Keep the title under ${MAX_TITLE} characters.`,
  bad_notes: "Those notes are too long.",
  too_many_tags: `Up to ${MAX_TAGS} tags.`,
  bad_tag: "A tag is too long.",
  bad_time: "Check the start and end time.",
  too_short: `Blocks are at least ${MIN_DURATION} minutes.`,
  too_long_duration: "A block can’t be longer than 24 hours.",
  overlap: "That overlaps another block — pick a free slot.",
  not_found: "That block no longer exists.",
};

const TAG_SUGGESTIONS = ["focus", "admin", "break", "meeting", "study", "health", "personal"];
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** −/value/+ stepper row used for start & end times. */
function Stepper({ label, value, onDec, onInc }: { label: string; value: string; onDec: () => void; onInc: () => void }) {
  return (
    <View style={styles.stepper}>
      <Text style={[type.label, { flex: 1 }]}>{label}</Text>
      <IconButton icon="minus" label={`${label} earlier`} size={40} onPress={onDec} />
      <Text style={[type.amount, { minWidth: 62, textAlign: "center" }]}>{value}</Text>
      <IconButton icon="plus" label={`${label} later`} size={40} onPress={onInc} />
    </View>
  );
}

// ── Block editor (add / edit) ────────────────────────────────────────────────
export function BlockEditorSheet({
  visible,
  mode,
  block,
  initial,
  date,
  ops,
  onClose,
}: {
  visible: boolean;
  mode: "add" | "edit";
  block?: Block | null;
  initial?: { start: number; end: number } | null;
  date: string;
  ops: Ops;
  onClose: () => void;
}) {
  const step = ops.settings.snapIntervalMin;
  const kbVisible = useKeyboardVisible();
  const titleRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const [title, setTitle] = useState("");
  const [color, setColor] = useState<string>(BLOCK_COLORS[0]);
  const [tags, setTags] = useState<string[]>([]);
  const [reminders, setReminders] = useState<number[]>([0]);
  const [start, setStart] = useState(9 * 60);
  const [end, setEnd] = useState(10 * 60);
  const [tagDraft, setTagDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Open the sheet FIRST, raise the keyboard a beat later. Auto-focusing on the
  // same frame the Modal mounts makes the keyboard animation fight the sheet
  // slide-in, which reads as a sluggish ~1s open. Letting the sheet settle, then
  // focusing, makes it appear instantly and the keyboard glides in after.
  useEffect(() => {
    if (!visible || mode !== "add") return;
    const id = setTimeout(() => titleRef.current?.focus(), 260);
    return () => clearTimeout(id);
  }, [visible, mode]);

  useEffect(() => {
    if (!visible) return;
    setError(null);
    setTagDraft("");
    if (mode === "edit" && block) {
      setTitle(block.title);
      setColor(block.color);
      setTags(block.tags);
      setReminders(block.remindersMin);
      setStart(block.start);
      setEnd(block.end);
    } else {
      setTitle("");
      setColor(BLOCK_COLORS[0]);
      setTags([]);
      setReminders([0]);
      setStart(initial?.start ?? ops.settings.workStart);
      setEnd(initial?.end ?? (initial?.start ?? ops.settings.workStart) + ops.settings.defaultDurationMin);
    }
  }, [visible, mode, block, initial, ops.settings]);

  const dur = end - start;
  const setStartSafe = (v: number) => {
    const s = clamp(v, 0, DAY - MIN_DURATION);
    setStart(s);
    if (end - s < MIN_DURATION) setEnd(s + MIN_DURATION);
    if (end - s > MAX_DURATION) setEnd(s + MAX_DURATION);
    setError(null);
  };
  const setEndSafe = (v: number) => {
    setEnd(clamp(v, start + MIN_DURATION, start + MAX_DURATION));
    setError(null);
  };

  const toggle = <T,>(list: T[], v: T, max: number): T[] =>
    list.includes(v) ? list.filter((x) => x !== v) : list.length >= max ? list : [...list, v];

  const addTag = () => {
    const t = cleanTags([...tags, tagDraft]);
    if (t.length > MAX_TAGS) return setError(ERRORS.too_many_tags);
    setTags(t);
    setTagDraft("");
  };

  const save = () => {
    // Never dead-end the primary action on a blank title when adding: default it
    // to "New block" (the user can rename it on the timeline) so the very first
    // Add always succeeds and fires core_action. Editing still requires a title.
    const titleToUse = mode === "add" && !title.trim() ? "New block" : title;
    const fieldErr = validateBlockFields({ title: titleToUse, start, end, tags, remindersMin: reminders });
    if (fieldErr) {
      feedback("error", "error");
      toast(ERRORS[fieldErr]); // visible above the keyboard, where the inline hint can be hidden
      return setError(ERRORS[fieldErr]);
    }
    if (mode === "add") {
      // Never dead-end the primary action: if this slot is taken, slide the new
      // block into the next free slot automatically (gap-fill) instead of making
      // a first-time user hunt for a gap. Only truly full days are rejected.
      const dur = end - start;
      let s = start;
      if (overlapsAny(ops.state.blocks, { date, start: s, end: s + dur })) {
        const free = findFreeSlot(ops.state.blocks, date, s, dur);
        if (free == null || free >= DAY - MIN_DURATION) {
          feedback("error", "error");
          const msg = "Your day is full — shorten or shift a block to make room.";
          toast(msg);
          return setError(msg);
        }
        s = free;
      }
      const res = createBlock(ops.state, { date, start: s, end: s + dur, title: titleToUse, color, tags, remindersMin: reminders }, ops.today);
      if (res.error) { feedback("error", "error"); return setError(ERRORS[res.error]); }
      feedback("success", "success");
      analytics.track("block_create");
      analytics.track("core_action", { feature: "create_block" });
      ops.commit(appendLog(res.state, "create", `Added “${titleToUse.trim()}”`, ops.today), s !== start ? `Added at ${toHHMM(s)} — the next free slot` : "Block added");
    } else if (block) {
      if (overlapsAny(ops.state.blocks, { date, start, end }, block.id)) {
        feedback("error", "error");
        return setError(ERRORS.overlap);
      }
      let s = updateBlock(ops.state, block.id, { title, color, tags, remindersMin: reminders }, ops.today);
      if (s.error) return setError(ERRORS[s.error]);
      if (start !== block.start || end !== block.end) {
        const rz = resizeBlock(s.state, block.id, { start, end }, 1, ops.today);
        if (rz.error) return setError(ERRORS[rz.error]);
        s = rz;
      }
      feedback("success", "success");
      analytics.track("block_edit");
      ops.commit(appendLog(s.state, "update", `Edited “${title.trim()}”`, ops.today), "Block updated");
    }
    onClose();
  };

  const del = () => {
    if (!block) return;
    const removed = block;
    feedback("pop", "warning");
    ops.commit(appendLog(deleteBlock(ops.state, removed.id), "delete", `Deleted “${removed.title}”`, ops.today), `Deleted “${removed.title}”`, {
      label: "Undo",
      onPress: () => ops.commit(restoreBlock(ops.state, removed), "Block restored"),
    });
    onClose();
  };

  const confirmLabel = mode === "edit" ? "Save changes" : "Add block";
  return (
    <Sheet
      visible={visible}
      title={mode === "edit" ? "Edit block" : "New block"}
      onClose={onClose}
      // Keyboard up → the only confirm is this compact header action (it sits
      // above the keyboard). Keyboard down → it hides and the big bottom CTA
      // takes over. Exactly one primary is ever visible, and it's never covered.
      headerAction={
        kbVisible ? (
          <Button label={mode === "edit" ? "Save" : "Add"} size="sm" icon="check" onPress={save} style={styles.headerBtn} />
        ) : undefined
      }
    >
      <ScrollView style={{ maxHeight: 460 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={{ gap: space.lg, paddingBottom: space.sm }}>
          <TextField
            ref={titleRef}
            label="Title"
            placeholder="e.g. Deep Work"
            value={title}
            onChangeText={(t) => {
              setTitle(t);
              setError(null);
            }}
            maxLength={MAX_TITLE}
            returnKeyType="done"
            onSubmitEditing={save}
            blurOnSubmit
          />

          <Card style={{ gap: space.sm }}>
            <Stepper label="Starts" value={toHHMM(start)} onDec={() => setStartSafe(start - step)} onInc={() => setStartSafe(start + step)} />
            <View style={styles.divider} />
            <Stepper label="Ends" value={toHHMM(end)} onDec={() => setEndSafe(end - step)} onInc={() => setEndSafe(end + step)} />
            <Text style={[type.caption, { textAlign: "center" }]}>
              {fmtDuration(dur)}
              {end > DAY ? " · crosses midnight" : ""}
            </Text>
            <View style={styles.quickDur}>
              {DURATION_OPTIONS.map((d) => (
                <Chip key={d} label={fmtDuration(d)} selected={dur === d} onPress={() => setEndSafe(start + d)} />
              ))}
            </View>
          </Card>

          <View style={{ gap: space.sm }}>
            <Text style={type.label}>Colour</Text>
            <View style={styles.swatches}>
              {BLOCK_COLORS.map((c) => (
                <Tappable
                  key={c}
                  label={COLOR_NAMES[c]}
                  role="checkbox"
                  accessibilityState={{ checked: color === c }}
                  sound="pop"
                  onPress={() => setColor(c)}
                  style={[styles.swatch, { backgroundColor: c }, color === c && styles.swatchOn]}
                >
                  {color === c ? <Icon name="check" size={18} color="#fff" /> : null}
                </Tappable>
              ))}
            </View>
          </View>

          <View style={{ gap: space.sm }}>
            <Text style={type.label}>Reminders</Text>
            <View style={styles.wrap}>
              {REMINDER_OPTIONS.map((r) => (
                <Chip
                  key={r}
                  label={reminderOptionLabel(r)}
                  selected={reminders.includes(r)}
                  onPress={() => setReminders(toggle(reminders, r, MAX_REMINDERS))}
                />
              ))}
            </View>
          </View>

          <View style={{ gap: space.sm }}>
            <Text style={type.label}>Tags</Text>
            <View style={styles.wrap}>
              {tags.map((t) => (
                <Chip key={t} label={`${t}  ✕`} selected onPress={() => setTags(tags.filter((x) => x !== t))} />
              ))}
              {TAG_SUGGESTIONS.filter((t) => !tags.includes(t)).map((t) => (
                <Chip key={t} label={t} onPress={() => setTags(toggle(tags, t, MAX_TAGS))} />
              ))}
            </View>
            <View style={styles.tagAdd}>
              <TextField
                label="Add a tag"
                placeholder="custom tag"
                value={tagDraft}
                onChangeText={setTagDraft}
                autoCapitalize="none"
                maxLength={24}
                returnKeyType="done"
                onSubmitEditing={addTag}
                style={{ flex: 1 }}
              />
            </View>
          </View>

          {error ? <Text style={[type.caption, { color: palette.danger }]}>{error}</Text> : null}
        </View>
      </ScrollView>
      {/* Big primary CTA — only while the keyboard is down (otherwise it'd be
          hidden behind it; the header action covers the keyboard-up case). */}
      {!kbVisible ? <Button label={confirmLabel} size="lg" icon="check" onPress={save} /> : null}
      {mode === "edit" && !kbVisible ? <Button label="Delete block" variant="danger" icon="trash" onPress={del} /> : null}
    </Sheet>
  );
}

// ── Per-block quick actions (tap a block) ─────────────────────────────────────
export function BlockActionsSheet({
  visible,
  block,
  ops,
  onEdit,
  onClose,
}: {
  visible: boolean;
  block: Block | null;
  ops: Ops;
  onEdit: () => void;
  onClose: () => void;
}) {
  const [shiftMin, setShiftMin] = useState(15);
  useEffect(() => {
    if (visible) setShiftMin(15);
  }, [visible]);
  if (!block) return null;
  const b = ops.state.blocks.find((x) => x.id === block.id) ?? block;

  const status = (next: () => void, msg: string, event?: string) => {
    feedback("success", "success");
    if (event) analytics.track(event);
    next();
    toast(msg);
    onClose();
  };

  const doShift = (sign: 1 | -1) => {
    const r = shiftFollowing(ops.state, b.date, b.start, sign * shiftMin, ops.today);
    if (r.error) {
      feedback("error", "error");
      return toast(r.error === "overlap" ? "No room to shift that far" : "Can’t shift that far");
    }
    feedback("success", "success");
    analytics.track("rubber_band_shift");
    ops.commit(r.state, `Shifted ${r.moved} block${r.moved === 1 ? "" : "s"} ${sign > 0 ? "later" : "earlier"}`);
    onClose();
  };

  // Snooze = push this block (and everything after it) 10 minutes later. Same
  // action offered on the shade notification (UF04), here as a visible tap.
  const doSnooze = () => {
    const r = snoozeBlock(ops.state, b.id, 10, ops.today);
    if (r.error) {
      feedback("error", "error");
      return toast("Not enough room — the next block is too close");
    }
    feedback("pop", "light");
    analytics.track("block_snooze");
    ops.commit(r.state, "Snoozed +10 min — later blocks shifted");
    onClose();
  };

  const del = () => {
    const removed = b;
    feedback("pop", "warning");
    ops.commit(appendLog(deleteBlock(ops.state, removed.id), "delete", `Deleted “${removed.title}”`, ops.today), `Deleted “${removed.title}”`, {
      label: "Undo",
      onPress: () => ops.commit(restoreBlock(ops.state, removed), "Block restored"),
    });
    onClose();
  };

  return (
    <Sheet visible={visible} title={b.title} onClose={onClose}>
      <View style={styles.actionsHead}>
        <View style={[styles.actionsDot, { backgroundColor: b.color }]} />
        <Text style={type.body}>{timeRange(b)} · {fmtDuration(duration(b))}</Text>
        <StatusPill status={b.status} />
      </View>

      {/* Reassure that tweaks here are a one-off: editing, shifting or skipping a
          routine block changes only today — the saved routine stays untouched. */}
      {b.templateId ? (
        <View style={styles.oneOff}>
          <Icon name="layers" size={14} color={palette.success} />
          <Text style={[type.caption, { flex: 1, color: palette.inkSoft }]}>Changes apply to today only — your routine stays as it is.</Text>
        </View>
      ) : null}

      <View style={styles.actionGrid}>
        {b.status === "planned" || b.status === "active" ? (
          <Button
            label={b.status === "active" ? "Mark done" : "Start now"}
            icon={b.status === "active" ? "check" : "play"}
            onPress={() =>
              status(
                () => ops.commit(b.status === "active" ? completeBlock(ops.state, b.id, ops.today) : startBlock(ops.state, b.id, ops.today)),
                b.status === "active" ? "Done — nice work" : "Block started",
                b.status === "active" ? "block_done" : "block_start",
              )
            }
            style={{ flex: 1 }}
          />
        ) : (
          <Button label="Reopen" icon="undo" variant="secondary" onPress={() => status(() => ops.commit(reopenBlock(ops.state, b.id, ops.today)), "Reopened")} style={{ flex: 1 }} />
        )}
        <Button label="Edit" icon="edit" variant="secondary" onPress={() => { onClose(); onEdit(); }} style={{ flex: 1 }} />
      </View>

      {b.status !== "skipped" ? (
        <View style={styles.actionGrid}>
          <Button label="Skip" icon="skip" variant="secondary" onPress={() => status(() => ops.commit(skipBlock(ops.state, b.id, ops.today), "Marked skipped"), "Marked skipped", "block_skip")} style={{ flex: 1 }} />
          <Button label="Snooze +10" icon="clock" variant="secondary" onPress={doSnooze} style={{ flex: 1 }} />
        </View>
      ) : null}

      <Button
        label="Duplicate block"
        icon="copy"
        variant="ghost"
        onPress={() => {
          const r = duplicateBlock(ops.state, b.id, ops.today);
          if (r.error) { feedback("error", "error"); return toast("Your day is full — no free slot to copy into"); }
          feedback("success", "success");
          analytics.track("block_duplicate");
          const copy = r.state.blocks.find((x) => x.id === r.id);
          ops.commit(appendLog(r.state, "create", `Duplicated “${b.title}”`, ops.today), copy ? `Copy added at ${toHHMM(copy.start)}` : "Duplicated to the next free slot");
          onClose();
        }}
      />

      {/* Shift this & following — pick an amount, then Earlier / Later. One tap
          slides the rest of the plan and never overlaps. */}
      <Card style={{ gap: space.sm }}>
        <Text style={type.label}>Shift this & following blocks</Text>
        <Segmented
          options={[{ value: "15", label: "15 min" }, { value: "30", label: "30 min" }, { value: "60", label: "1 hr" }]}
          value={String(shiftMin)}
          onChange={(v) => setShiftMin(Number(v))}
        />
        <View style={styles.actionGrid}>
          <Button label="Earlier" size="sm" icon="chevronLeft" variant="secondary" onPress={() => doShift(-1)} style={{ flex: 1 }} />
          <Button label="Later" size="sm" icon="chevronRight" variant="secondary" onPress={() => doShift(1)} style={{ flex: 1 }} />
        </View>
      </Card>

      <ListItem icon="trash" title="Delete block" destructive chevron={false} onPress={del} />
    </Sheet>
  );
}

export function StatusPill({ status }: { status: Block["status"] }) {
  if (status === "active") return <Pill label="Active" tone="primary" />;
  if (status === "done") return <Pill label="Done" tone="success" />;
  if (status === "skipped") return <Pill label="Skipped" tone="neutral" />;
  return <Pill label="Planned" tone="neutral" />;
}

// ── Apply a template / routine ────────────────────────────────────────────────
export function ApplyTemplateSheet({ visible, ops, onClose }: { visible: boolean; ops: Ops; onClose: () => void }) {
  const [mode, setMode] = useState<ApplyMode>("merge");
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => {
    if (visible) {
      setMode("merge");
      setPicked(ops.state.templates[0]?.id ?? null);
    }
  }, [visible, ops.state.templates]);

  const apply = (templateId: string) => {
    const r = applyTemplate(ops.state, templateId, ops.today, mode, "auto", ops.today);
    if (r.error) { feedback("error", "error"); return toast("Couldn’t apply that routine"); }
    feedback("success", "success");
    analytics.track("template_apply");
    ops.commit(r.state, `Added ${r.added} block${r.added === 1 ? "" : "s"}${r.skipped ? ` · ${r.skipped} skipped` : ""}`);
    onClose();
  };

  const applyStarter = (key: string) => {
    const starter = STARTER_TEMPLATES.find((s) => s.key === key)!;
    const made = createFromStarter(ops.state, starter, ops.today);
    if (made.error || !made.id) { feedback("error", "error"); return toast("Couldn’t create that routine"); }
    const r = applyTemplate(made.state, made.id, ops.today, mode, "auto", ops.today);
    feedback("success", "success");
    analytics.track("template_apply");
    ops.commit(r.state, `Added ${r.added} block${r.added === 1 ? "" : "s"}`);
    onClose();
  };

  return (
    <Sheet visible={visible} title="Apply a routine" onClose={onClose}>
      <Text style={[type.body, { color: palette.inkSoft }]}>Drop a saved routine onto this day. Conflicts slide into the next free slot automatically.</Text>
      <Segmented
        options={[{ value: "merge", label: "Merge" }, { value: "replace", label: "Replace day" }]}
        value={mode}
        onChange={setMode}
      />
      {ops.state.templates.length ? (
        <View style={{ gap: space.sm }}>
          {ops.state.templates.map((t) => (
            <Tappable key={t.id} label={`Apply ${t.name}`} onPress={() => apply(t.id)} style={styles.tplRow}>
              <View style={styles.tplStripes}>
                {t.colorPalette.slice(0, 4).map((c, i) => (
                  <View key={i} style={[styles.tplStripe, { backgroundColor: c }]} />
                ))}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={type.bodyStrong} numberOfLines={1}>{t.name}</Text>
                <Text style={type.caption}>{t.blocks.length} blocks</Text>
              </View>
              <Icon name="plus" size={20} color={palette.primary} />
            </Tappable>
          ))}
        </View>
      ) : (
        <View style={{ gap: space.sm }}>
          <Text style={type.caption}>No routines yet — start from a template:</Text>
          {STARTER_TEMPLATES.map((s) => (
            <Button key={s.key} label={s.name} variant="secondary" icon="layers" onPress={() => applyStarter(s.key)} />
          ))}
        </View>
      )}
    </Sheet>
  );
}

// ── AI Plan Helper ────────────────────────────────────────────────────────────
function safeJson(text: string): unknown {
  try { return JSON.parse(text); } catch { return null; }
}

export function AiPlanSheet({ visible, ops, onClose }: { visible: boolean; ops: Ops; onClose: () => void }) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [drafts, setDrafts] = useState<PlanDraft[] | null>(null);
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) { setText(""); setDrafts(null); setChosen(new Set()); setNote(null); setError(null); }
  }, [visible]);

  const buildDrafts = (items: { title: string; durationMin: number; tags?: string[]; color?: string }[], source: string) => {
    const d = planToBlocks(ops.state, ops.today, items, ops.settings);
    if (!d.length) { setError("No free time left today for these tasks."); return; }
    setDrafts(d);
    setChosen(new Set(d.map((_, i) => i)));
    setNote(source);
  };

  const generate = async () => {
    if (!text.trim()) return setError("Paste a few tasks first, one per line.");
    setError(null);
    setLoading(true);
    analytics.track("ai_plan_generate");
    try {
      if (ai.enabled) {
        const r = await ai.run("plan_from_tasks", text);
        if (r.ok) {
          const items = parseAiPlan(r.json ?? safeJson(r.text), ops.settings.defaultDurationMin);
          if (items.length) buildDrafts(items, "Planned with AI");
          else buildDrafts(parseTasksFallback(text, ops.settings.defaultDurationMin), "Planned on device");
        } else if (r.reason === "quota") {
          setLoading(false);
          ops.onPro("ai_quota");
          return;
        } else if (r.reason === "offline") {
          buildDrafts(parseTasksFallback(text, ops.settings.defaultDurationMin), "Planned offline");
        } else {
          buildDrafts(parseTasksFallback(text, ops.settings.defaultDurationMin), "Planned on device");
        }
      } else {
        buildDrafts(parseTasksFallback(text, ops.settings.defaultDurationMin), "Planned on device");
      }
    } catch {
      buildDrafts(parseTasksFallback(text, ops.settings.defaultDurationMin), "Planned on device");
    } finally {
      setLoading(false);
    }
  };

  const apply = () => {
    if (!drafts) return;
    const selected = drafts.filter((_, i) => chosen.has(i));
    if (!selected.length) return setError("Pick at least one block to add.");
    const r = applyPlan(ops.state, ops.today, selected, ops.today);
    feedback("success", "success");
    analytics.track("ai_plan_apply");
    analytics.track("core_action", { feature: "ai_plan" });
    ops.commit(r.state, `Added ${r.added} block${r.added === 1 ? "" : "s"}`);
    onClose();
  };

  return (
    <Sheet visible={visible} title="Plan with AI" onClose={onClose}>
      {!drafts ? (
        <View style={{ gap: space.md }}>
          <Text style={[type.body, { color: palette.inkSoft }]}>
            Paste your to-dos — one per line. Add a rough time like “90m” if you know it, or let BlockDay estimate.
          </Text>
          <TextField
            label="Your tasks"
            placeholder={"Write proposal 90m\nReview PRs\nInbox zero 30m"}
            value={text}
            onChangeText={(t) => { setText(t); setError(null); }}
            multiline
            style={{ minHeight: 120, textAlignVertical: "top", paddingTop: space.md }}
          />
          {error ? <Text style={[type.caption, { color: palette.danger }]}>{error}</Text> : null}
          <Button label="Generate plan" size="lg" icon="sparkle" loading={loading} onPress={generate} />
          <Text style={[type.caption, { textAlign: "center" }]}>Fits around what’s already on your day, inside work hours.</Text>
        </View>
      ) : (
        <View style={{ gap: space.md }}>
          {note ? <Pill label={note} tone="primary" /> : null}
          <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
            <View style={{ gap: space.sm }}>
              {drafts.map((d, i) => (
                <Tappable
                  key={i}
                  label={`${d.title}, ${fmtDuration(d.durationMin)}`}
                  role="checkbox"
                  accessibilityState={{ checked: chosen.has(i) }}
                  onPress={() => setChosen((c) => { const n = new Set(c); n.has(i) ? n.delete(i) : n.add(i); return n; })}
                  style={[styles.draft, { borderLeftColor: d.color }, !chosen.has(i) && { opacity: 0.45 }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={type.bodyStrong} numberOfLines={1}>{d.title}</Text>
                    <Text style={type.caption}>{toHHMM(d.start)} · {fmtDuration(d.durationMin)}{d.fits ? "" : " · outside work hours"}</Text>
                  </View>
                  <View style={[styles.draftCheck, chosen.has(i) && styles.draftCheckOn]}>
                    {chosen.has(i) ? <Icon name="check" size={16} color="#fff" /> : null}
                  </View>
                </Tappable>
              ))}
            </View>
          </ScrollView>
          {error ? <Text style={[type.caption, { color: palette.danger }]}>{error}</Text> : null}
          <Button label={`Add ${chosen.size} block${chosen.size === 1 ? "" : "s"}`} size="lg" icon="check" onPress={apply} />
          <Button label="Start over" variant="ghost" onPress={() => { setDrafts(null); setNote(null); }} />
        </View>
      )}
    </Sheet>
  );
}

// ── Day menu (save template / clear / export / log) ───────────────────────────
export function DayMenuSheet({ visible, ops, onClose, onLog, onHelp }: { visible: boolean; ops: Ops; onClose: () => void; onLog: () => void; onHelp: () => void }) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const dayBlocks = useMemo(() => ops.state.blocks.filter((b) => b.date === ops.today).sort((a, b) => a.start - b.start), [ops.state, ops.today]);
  useEffect(() => { if (visible) { setNaming(false); setName(""); setErr(null); } }, [visible]);

  const saveTpl = () => {
    const r = saveDayAsTemplate(ops.state, ops.today, name, ops.today);
    if (r.error) {
      setErr(r.error === "duplicate" ? "You already have a routine with that name." : r.error === "no_blocks" ? "Add some blocks first." : "Give the routine a name.");
      return;
    }
    feedback("success", "success");
    analytics.track("template_create");
    ops.commit(r.state, "Saved as a routine");
    onClose();
  };

  const exportCsv = async () => {
    const csv = blocksToCSV(dayBlocks);
    analytics.track("export_csv");
    try { await Share.share({ message: csv }); } catch { /* cancelled */ }
    onClose();
  };
  const exportText = async () => {
    const lines = dayBlocks.map((b) => `${toHHMM(b.start)}–${toHHMM(b.end)}  ${b.title}`);
    analytics.track("export_image");
    try { await Share.share({ message: `My plan for ${ops.today}\n\n${lines.join("\n")}` }); } catch { /* cancelled */ }
    onClose();
  };
  const clearDayNow = () => {
    Alert.alert("Clear this day?", "Every block on this day is removed. You can undo right after.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear",
        style: "destructive",
        onPress: () => {
          const before = ops.state;
          ops.commit(clearDay(ops.state, ops.today, ops.today), "Day cleared", { label: "Undo", onPress: () => ops.commit(before, "Restored") });
          onClose();
        },
      },
    ]);
  };

  return (
    <Sheet visible={visible} title="This day" onClose={onClose}>
      {naming ? (
        <View style={{ gap: space.md }}>
          <TextField label="Routine name" placeholder="e.g. My Workday" value={name} onChangeText={(t) => { setName(t); setErr(null); }} error={err} autoFocus maxLength={MAX_TITLE} />
          <Button label="Save routine" size="lg" icon="check" onPress={saveTpl} />
          <Button label="Back" variant="ghost" onPress={() => setNaming(false)} />
        </View>
      ) : (
        <View>
          <ListItem icon="layers" title="Save day as routine" subtitle="Reuse today’s plan on any day" onPress={() => { if (!dayBlocks.length) return toast("Add some blocks first"); setNaming(true); }} />
          <ListItem icon="share" title="Export as CSV" subtitle="date, title, times, colour, tags" onPress={exportCsv} />
          <ListItem icon="download" title="Share as text" subtitle="A quick plain-text summary" onPress={exportText} />
          <ListItem icon="list" title="Activity log" subtitle="Every change, newest first" onPress={() => { onClose(); onLog(); }} />
          <ListItem icon="help" title="How BlockDay works" subtitle="Drag, shift and focus cues — the quick tour" onPress={() => { onClose(); onHelp(); }} />
          <ListItem icon="trash" title="Clear this day" destructive onPress={clearDayNow} />
        </View>
      )}
    </Sheet>
  );
}

// ── Activity log (shared by Today menu & Settings) ────────────────────────────
const LOG_ICON: Record<string, import("../ui").IconName> = {
  create: "plus", update: "edit", delete: "trash", apply_template: "layers",
  shift: "shift", clear_day: "trash", ai_plan: "sparkle", backup: "download", restore: "upload",
};
export function ActivityLogSheet({ visible, log, onClose }: { visible: boolean; log: { id: string; type: string; summary: string; at: string }[]; onClose: () => void }) {
  return (
    <Sheet visible={visible} title="Activity log" onClose={onClose}>
      {log.length ? (
        <ScrollView style={{ maxHeight: 440 }} showsVerticalScrollIndicator={false}>
          <View>
            {log.map((l) => (
              <ListItem key={l.id} icon={LOG_ICON[l.type] ?? "clock"} title={l.summary} subtitle={l.at} chevron={false} />
            ))}
          </View>
        </ScrollView>
      ) : (
        <Text style={[type.body, { color: palette.inkSoft, textAlign: "center", paddingVertical: space.lg }]}>No changes logged yet.</Text>
      )}
      <Button label="Close" variant="secondary" onPress={onClose} />
    </Sheet>
  );
}

export { addDays };

const styles = StyleSheet.create({
  headerBtn: { paddingHorizontal: 16 },
  stepper: { flexDirection: "row", alignItems: "center", gap: space.sm },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: palette.border },
  quickDur: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, justifyContent: "center", marginTop: space.xs },
  swatches: { flexDirection: "row", gap: space.md },
  swatch: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: "transparent" },
  swatchOn: { borderColor: palette.ink },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  tagAdd: { flexDirection: "row", gap: space.sm },
  actionsHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  oneOff: { flexDirection: "row", alignItems: "center", gap: space.sm, backgroundColor: palette.successSoft, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.sm },
  actionsDot: { width: 12, height: 12, borderRadius: 6 },
  actionGrid: { flexDirection: "row", gap: space.sm },
  shiftRow: { flexDirection: "row", alignItems: "center", gap: space.xs },
  tplRow: { flexDirection: "row", alignItems: "center", gap: space.md, backgroundColor: palette.surface, borderRadius: radius.lg, padding: space.md, borderWidth: 1, borderColor: palette.border },
  tplStripes: { flexDirection: "row", gap: 2, height: 36, alignItems: "center" },
  tplStripe: { width: 5, height: 36, borderRadius: 3 },
  draft: { flexDirection: "row", alignItems: "center", gap: space.md, backgroundColor: palette.surface, borderRadius: radius.md, padding: space.md, borderLeftWidth: 4, borderWidth: 1, borderColor: palette.border },
  draftCheck: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: palette.border, alignItems: "center", justifyContent: "center" },
  draftCheckOn: { backgroundColor: palette.primary, borderColor: palette.primary },
});
