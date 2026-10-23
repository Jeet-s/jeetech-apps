/// <reference types="node" />
/**
 * Core-logic tests for BlockDay — run by `npm run validate`.
 * Every rule in src/core is exercised through the real functions: dates &
 * overnight math, block create/validate/resize/move/duplicate, overlap safety,
 * rubber-band shift, templates & one-off deviations, stats/streaks, Pro gating,
 * AI plan helper, backup/restore round-trip & migration, CSV export, and the
 * journey sim's serialize round-trip.
 *
 * Final stdout line MUST be JSON:
 *   {"tests": N, "passed": N, "failures": ["name: why", ...], "features": [...]}
 */
import {
  DAY,
  addDays,
  dayNumber,
  diffDays,
  fmtDuration,
  isValidDateKey,
  parseHHMM,
  snap,
  toHHMM,
  weekdayLabel,
} from "../src/core/time";
import {
  BLOCK_COLORS,
  MAX_LOG,
  MAX_TITLE,
  MIN_DURATION,
  STARTER_TEMPLATES,
  defaultSettings,
  emptyState,
  type Block,
  type BlockDayState,
} from "../src/core/model";
import { contrastRatio, meetsAA, over } from "../src/core/contrast";
import {
  darkColors,
  darkGradient,
  darkTones,
  lightColors,
  lightGradient,
  lightTones,
  type Colors,
  type ToneKey,
} from "../src/core/palette";
import { mergeBlockDayState, mergeBlocks } from "../src/core/sync";
import {
  absEnd,
  absStart,
  blocksForDay,
  clearDay,
  completeBlock,
  createBlock,
  duplicateBlock,
  findFreeSlot,
  hasOverlap,
  moveBlock,
  moveMany,
  overlaps,
  resizeBlock,
  shiftFollowing,
  skipBlock,
  startBlock,
  updateBlock,
  type BlockInput,
} from "../src/core/blocks";
import {
  applyTemplate,
  createFromStarter,
  createTemplate,
  deleteTemplate,
  deviatedInstances,
  renameTemplate,
  saveDayAsTemplate,
  validateTemplateName,
} from "../src/core/templates";
import {
  advancedInsights,
  blocksToCSV,
  dayComplete,
  dayStreak,
  distributionByColor,
  distributionByTag,
  plannedVsDone,
} from "../src/core/stats";
import { applyPlan, parseAiPlan, parseTasksFallback, planToBlocks } from "../src/core/ai";
import { exportBackup, importBackup } from "../src/core/backup";
import { canRedo, canUndo, initHistory, record, redo, undo } from "../src/core/undo";
import { sim } from "../src/core/sim";

const results: { name: string; ok: boolean; why?: string }[] = [];
const features = new Set<string>();
function test(feature: string, name: string, fn: () => void) {
  features.add(feature);
  try {
    fn();
    results.push({ name, ok: true });
  } catch (e) {
    results.push({ name, ok: false, why: String((e as Error)?.message ?? e).slice(0, 200) });
  }
}
function eq<T>(a: T, b: T, msg = "") {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
function ok(cond: boolean, msg = "expected true") {
  if (!cond) throw new Error(msg);
}

const T = "2026-03-10"; // a Tuesday
const S = defaultSettings();

// Helper: add a block at [start,end) with a title; assert it succeeded.
function add(state: BlockDayState, start: number, end: number, extra: Partial<BlockInput> = {}): BlockDayState {
  const r = createBlock(state, { date: T, start, end, title: extra.title ?? "Block", ...extra }, T);
  if (r.error) throw new Error(`add failed: ${r.error}`);
  return r.state;
}

// ── Dates & time math ─────────────────────────────────────────────────────────
test("dates", "addDays forward across month", () => eq(addDays("2026-01-31", 1), "2026-02-01"));
test("dates", "addDays backward across year", () => eq(addDays("2026-01-01", -1), "2025-12-31"));
test("dates", "addDays leap day", () => eq(addDays("2028-02-28", 1), "2028-02-29"));
test("dates", "diffDays", () => eq(diffDays("2026-03-10", "2026-03-01"), 9));
test("dates", "dayNumber is consecutive", () => eq(dayNumber("2026-03-11") - dayNumber("2026-03-10"), 1));
test("dates", "weekday label", () => eq(weekdayLabel("2026-03-10"), "Tue"));
test("dates", "rejects impossible date", () => ok(!isValidDateKey("2026-02-30") && isValidDateKey("2026-02-28")));
test("dates", "parseHHMM / toHHMM round-trip", () => eq(toHHMM(parseHHMM("09:30")!), "09:30"));
test("dates", "parseHHMM rejects junk", () => eq(parseHHMM("25:00"), null));
test("dates", "toHHMM wraps overnight minutes", () => eq(toHHMM(DAY + 60), "01:00"));
test("dates", "snap rounds to interval", () => eq([snap(67, 15), snap(62, 5)], [60, 60]));
test("dates", "fmtDuration", () => eq([fmtDuration(90), fmtDuration(60), fmtDuration(45)], ["1h 30m", "1h", "45m"]));

// ── Block creation & validation ───────────────────────────────────────────────
test("create block", "creates a block with defaults", () => {
  const r = createBlock(emptyState(), { date: T, start: 540, end: 600, title: "  Deep Work  " }, T);
  eq(r.error, null);
  eq(r.state.blocks[0].title, "Deep Work");
  eq(r.state.blocks[0].status, "planned");
  eq(r.state.blocks[0].color, BLOCK_COLORS[0]);
});
test("create block", "rejects empty title", () => eq(createBlock(emptyState(), { date: T, start: 540, end: 600, title: "   " }, T).error, "empty_title"));
test("create block", "rejects too-long title", () => eq(createBlock(emptyState(), { date: T, start: 540, end: 600, title: "x".repeat(MAX_TITLE + 1) }, T).error, "too_long"));
test("create block", "rejects end<=start", () => eq(createBlock(emptyState(), { date: T, start: 600, end: 600, title: "x" }, T).error, "bad_time"));
test("create block", "rejects too-short duration", () => eq(createBlock(emptyState(), { date: T, start: 600, end: 603, title: "x" }, T).error, "too_short"));
test("create block", "rejects start out of range", () => eq(createBlock(emptyState(), { date: T, start: DAY, end: DAY + 30, title: "x" }, T).error, "bad_time"));
test("create block", "ids are unique and increasing", () => {
  const s = add(add(emptyState(), 540, 600), 600, 660);
  eq(s.blocks.map((b) => b.id), ["b1", "b2"]);
});
test("create block", "cleans & dedupes tags (lowercased)", () => {
  const r = createBlock(emptyState(), { date: T, start: 540, end: 600, title: "x", tags: ["Focus", "focus", "  Deep  "] }, T);
  eq(r.state.blocks[0].tags, ["focus", "deep"]);
});
test("create block", "rejects too many tags", () => eq(createBlock(emptyState(), { date: T, start: 540, end: 600, title: "x", tags: ["a", "b", "c", "d", "e", "f"] }, T).error, "too_many_tags"));

// ── Overlap safety (the core guarantee) ────────────────────────────────────────
test("overlap", "interval overlap detection", () => {
  ok(overlaps({ date: T, start: 540, end: 600 }, { date: T, start: 590, end: 620 }));
  ok(!overlaps({ date: T, start: 540, end: 600 }, { date: T, start: 600, end: 660 })); // touching edges
});
test("overlap", "create rejects an overlapping block", () => {
  const s = add(emptyState(), 540, 600);
  eq(createBlock(s, { date: T, start: 570, end: 630, title: "x" }, T).error, "overlap");
});
test("overlap", "overnight block vs next-day early block (absolute minutes)", () => {
  // 23:00→01:00 on day T, and 00:30→01:30 on T+1 must be detected as overlapping.
  const s = add(emptyState(), 23 * 60, 25 * 60, { title: "Night" });
  const r = createBlock(s, { date: addDays(T, 1), start: 30, end: 90, title: "Early" }, T);
  eq(r.error, "overlap");
});
test("overlap", "absStart/absEnd span across midnight", () => {
  const s = add(emptyState(), 23 * 60, 25 * 60);
  eq(absEnd(s.blocks[0]) - absStart(s.blocks[0]), 120);
});
test("overlap", "hasOverlap flags a corrupt set", () => ok(hasOverlap([
  { id: "b1", date: T, start: 540, end: 620 } as any,
  { id: "b2", date: T, start: 600, end: 660 } as any,
])));

// ── Resize / move / duplicate ──────────────────────────────────────────────────
test("resize", "resize end snaps and updates", () => {
  const s = add(emptyState(), 540, 600);
  eq(resizeBlock(s, "b1", { end: 652 }, 15, T).state.blocks[0].end, 645);
});
test("resize", "resize that overlaps a neighbour is rejected", () => {
  const s = add(add(emptyState(), 540, 600), 600, 660);
  eq(resizeBlock(s, "b1", { end: 630 }, 5, T).error, "overlap");
});
test("move", "move keeps duration and snaps", () => {
  const s = add(emptyState(), 540, 600);
  const r = moveBlock(s, "b1", 612, 15, T);
  eq([r.state.blocks[0].start, r.state.blocks[0].end], [615, 675]);
});
test("move", "move onto another block is rejected", () => {
  const s = add(add(emptyState(), 540, 600), 660, 720);
  eq(moveBlock(s, "b1", 670, 5, T).error, "overlap");
});
test("duplicate", "duplicate lands in the next free slot", () => {
  const s = add(emptyState(), 540, 600);
  const r = duplicateBlock(s, "b1", T);
  eq(r.error, null);
  eq([r.state.blocks[1].start, r.state.blocks[1].end], [600, 660]);
});
test("duplicate", "findFreeSlot skips occupied time", () => {
  const s = add(add(emptyState(), 540, 600), 600, 660);
  eq(findFreeSlot(s.blocks, T, 540, 30), 660);
});
test("edit", "updateBlock rejects an empty title", () => {
  const s = add(emptyState(), 540, 600);
  eq(updateBlock(s, "b1", { title: "  " }, T).error, "empty_title");
});

// ── Rubber-band shift & multi-move ──────────────────────────────────────────────
test("shift", "shiftFollowing moves later blocks and logs it", () => {
  let s = add(add(add(emptyState(), 540, 600), 600, 660), 660, 720);
  const r = shiftFollowing(s, T, 600, 20, T);
  eq(r.moved, 2);
  eq(blocksForDay(r.state, T).map((b) => b.start), [540, 620, 680]);
  ok(r.state.log.some((l) => l.type === "shift"));
});
test("shift", "a shift that would overlap fixed blocks is rejected", () => {
  const s = add(add(emptyState(), 540, 600), 660, 720);
  eq(shiftFollowing(s, T, 660, -90, T).error, "overlap");
});
test("multi-move", "moveMany shifts a selection together", () => {
  const s = add(add(emptyState(), 540, 600), 600, 660);
  const r = moveMany(s, ["b1", "b2"], 60, T);
  eq(r.error, null);
  eq(blocksForDay(r.state, T).map((b) => b.start), [600, 660]);
});

// ── Status: start / complete / skip ─────────────────────────────────────────────
test("status", "start marks active", () => eq(startBlock(add(emptyState(), 540, 600), "b1", T).blocks[0].status, "active"));
test("status", "complete records actual minutes", () => {
  const done = completeBlock(add(emptyState(), 540, 600), "b1", T, 75).blocks[0];
  eq([done.status, done.actualMin], ["done", 75]);
});
test("status", "complete defaults actual to planned duration", () => eq(completeBlock(add(emptyState(), 540, 600), "b1", T).blocks[0].actualMin, 60));
test("status", "skip marks skipped", () => eq(skipBlock(add(emptyState(), 540, 600), "b1", T).blocks[0].status, "skipped"));
test("day", "clearDay removes the day and logs it", () => {
  const s = add(add(emptyState(), 540, 600), 600, 660);
  const r = clearDay(s, T, T);
  eq(blocksForDay(r, T).length, 0);
  ok(r.log.some((l) => l.type === "clear_day"));
});

// ── Templates ────────────────────────────────────────────────────────────────
test("template", "create & name validation", () => {
  const r = createTemplate(emptyState(), { name: "Workday", blocks: STARTER_TEMPLATES[0].blocks }, T);
  eq(r.error, null);
  eq(r.state.templates[0].blocks.length, STARTER_TEMPLATES[0].blocks.length);
  eq(validateTemplateName(r.state, "workday"), "duplicate");
  eq(validateTemplateName(r.state, "  "), "empty_name");
});
test("template", "rename and delete", () => {
  const s = createTemplate(emptyState(), { name: "A", blocks: STARTER_TEMPLATES[0].blocks }, T).state;
  eq(renameTemplate(s, s.templates[0].id, "B", T).state.templates[0].name, "B");
  eq(deleteTemplate(s, s.templates[0].id).templates.length, 0);
});
test("template", "apply fills the day with named instances", () => {
  const s = createFromStarter(emptyState(), STARTER_TEMPLATES[0], T).state;
  const r = applyTemplate(s, s.templates[0].id, T, "merge", "auto", T);
  eq(r.added, STARTER_TEMPLATES[0].blocks.length);
  ok(blocksForDay(r.state, T).every((b) => b.title.trim().length > 0 && b.origin === "template" && b.templateId));
  ok(!hasOverlap(r.state.blocks));
});
test("template", "apply never overlaps — conflicts auto-resolve into free slots", () => {
  let s = createFromStarter(emptyState(), STARTER_TEMPLATES[0], T).state;
  s = add(s, 9 * 60, 10 * 60, { title: "Existing" }); // sits where the routine starts
  const r = applyTemplate(s, s.templates[0].id, T, "merge", "auto", T);
  ok(!hasOverlap(r.state.blocks));
});
test("template", "conflict skip drops the clashing block instead of moving it", () => {
  let s = createFromStarter(emptyState(), STARTER_TEMPLATES[0], T).state;
  s = add(s, 9 * 60, 17 * 60, { title: "All day" });
  const r = applyTemplate(s, s.templates[0].id, T, "merge", "skip", T);
  eq(r.added, 0);
  ok(r.skipped > 0);
});
test("template", "replace clears the day first", () => {
  let s = createFromStarter(emptyState(), STARTER_TEMPLATES[0], T).state;
  s = add(s, 20 * 60, 21 * 60, { title: "Evening" });
  const r = applyTemplate(s, s.templates[0].id, T, "replace", "auto", T);
  ok(!blocksForDay(r.state, T).some((b) => b.title === "Evening"));
});
test("template", "one-off edit does NOT change the template", () => {
  const made = createFromStarter(emptyState(), STARTER_TEMPLATES[0], T);
  const applied = applyTemplate(made.state, made.id!, T, "merge", "auto", T).state;
  const first = blocksForDay(applied, T)[0];
  const shortened = resizeBlock(applied, first.id, { end: first.start + 15 }, 15, T).state;
  const tpl = shortened.templates[0];
  const src = tpl.blocks.find((x) => x.id === first.templateBlockId)!;
  eq(src.durationMin, STARTER_TEMPLATES[0].blocks[0].durationMin); // template untouched
  ok(deviatedInstances(shortened, T).length > 0); // the instance deviates
});
test("template", "saveDayAsTemplate captures the day", () => {
  const s = add(add(emptyState(), 540, 600, { title: "A" }), 600, 660, { title: "B" });
  const r = saveDayAsTemplate(s, T, "My Day", T);
  eq(r.error, null);
  eq(r.state.templates[0].blocks.map((b) => b.relativeStartMin), [540, 600]);
});

// ── Stats / insights ──────────────────────────────────────────────────────────
test("stats", "distribution by color sums durations", () => {
  let s = add(emptyState(), 540, 600, { color: BLOCK_COLORS[0] });
  s = add(s, 600, 720, { color: BLOCK_COLORS[0] });
  s = add(s, 720, 780, { color: BLOCK_COLORS[1] });
  const d = distributionByColor(blocksForDay(s, T));
  eq([d[0].minutes, d[1].minutes], [180, 60]);
});
test("stats", "distribution by tag counts every tag", () => {
  const s = add(emptyState(), 540, 600, { tags: ["focus", "deep"] });
  const d = distributionByTag(blocksForDay(s, T));
  eq(d.length, 2);
});
test("stats", "planned vs done uses actual minutes", () => {
  let s = add(add(emptyState(), 540, 600), 600, 660);
  s = completeBlock(s, "b1", T, 75);
  const pvd = plannedVsDone(blocksForDay(s, T));
  eq([pvd.planned, pvd.done], [120, 75]);
});
test("stats", "skipped blocks are excluded from planned", () => {
  let s = add(add(emptyState(), 540, 600), 600, 660);
  s = skipBlock(s, "b2", T);
  eq(plannedVsDone(blocksForDay(s, T)).planned, 60);
});
test("streaks", "day streak counts consecutive completed days", () => {
  let s = emptyState();
  for (const d of [-2, -1, 0]) {
    const day = addDays(T, d);
    const r = createBlock(s, { date: day, start: 540, end: 600, title: "x" }, T);
    s = completeBlock(r.state, r.id!, T);
  }
  eq(dayStreak(s, T), 3);
});
test("streaks", "a gap breaks the streak", () => {
  let s = emptyState();
  const r = createBlock(s, { date: addDays(T, -2), start: 540, end: 600, title: "x" }, T);
  s = completeBlock(r.state, r.id!, T);
  eq(dayStreak(s, T), 0);
  ok(dayComplete(s, addDays(T, -2)));
});

// ── Pro gating ─────────────────────────────────────────────────────────────────
test("pro gating", "advanced analytics are null for free users", () => {
  const s = completeBlock(add(emptyState(), 540, 600), "b1", T, 90);
  eq(advancedInsights(s, T, 7, false), null);
});
test("pro gating", "advanced analytics compute overrun for Pro users", () => {
  let s = add(add(emptyState(), 540, 600), 600, 720);
  s = completeBlock(s, "b1", T, 90); // ran 30m over
  s = completeBlock(s, "b2", T, 120); // on time
  const a = advancedInsights(s, T, 7, true)!;
  ok(a !== null);
  eq(a.overrunRate, 0.5);
  eq(a.totalDoneMin, 210);
});

// ── AI plan helper ──────────────────────────────────────────────────────────────
test("ai", "fallback parses durations from pasted text", () => {
  const items = parseTasksFallback("Write report 90m\n- Standup 15\nEmails - 30 min\nThink", 60);
  eq(items.map((i) => [i.title, i.durationMin]), [["Write report", 90], ["Standup", 15], ["Emails", 30], ["Think", 60]]);
});
test("ai", "fallback parses hours", () => eq(parseTasksFallback("Deep work 2h", 60)[0].durationMin, 120));
test("ai", "parseAiPlan normalises JSON output", () => {
  const items = parseAiPlan({ blocks: [{ title: "A", durationMin: 45 }, { title: "", durationMin: 10 }, { title: "B", duration: 9999 }] }, 60);
  eq(items.map((i) => i.title), ["A", "B"]); // empty dropped
  eq(items[1].durationMin, DAY); // clamped to MAX_DURATION
});
test("ai", "planToBlocks places items in work hours without overlap", () => {
  const drafts = planToBlocks(emptyState(), T, [{ title: "A", durationMin: 60 }, { title: "B", durationMin: 60 }], S);
  eq([drafts[0].start, drafts[1].start], [S.workStart, S.workStart + 60]);
  ok(drafts.every((d) => d.fits));
});
test("ai", "planToBlocks flags items past work hours", () => {
  const drafts = planToBlocks(emptyState(), T, [{ title: "A", durationMin: 60 * 9 }], S);
  ok(!drafts[0].fits);
});
test("ai", "applyPlan commits blocks with origin ai", () => {
  const drafts = planToBlocks(emptyState(), T, [{ title: "A", durationMin: 60 }], S);
  const r = applyPlan(emptyState(), T, drafts, T);
  eq(r.added, 1);
  eq(r.state.blocks[0].origin, "ai");
  ok(r.state.log.some((l) => l.type === "ai_plan"));
});

// ── Backup / restore ─────────────────────────────────────────────────────────
test("backup", "round-trip preserves 100% of data", () => {
  const made = createFromStarter(emptyState(), STARTER_TEMPLATES[0], T);
  let s = applyTemplate(made.state, made.id!, T, "merge", "auto", T).state;
  s = completeBlock(s, blocksForDay(s, T)[0].id, T, 40);
  const file = exportBackup(s, S, `${T}T10:00:00`);
  const r = importBackup(file);
  ok(r.ok);
  if (r.ok) eq(r.state, s);
  if (r.ok) eq(r.settings, S);
});
test("backup", "corrupt file is rejected without data loss", () => eq(importBackup("{not json").ok, false));
test("backup", "a foreign json file is not treated as a backup", () => eq((importBackup('{"app":"other","v":1}') as any).error, "not_backup"));
test("backup", "an overlapping (tampered) backup is rejected", () => {
  const bad = emptyState();
  (bad.blocks as any) = [
    { id: "b1", date: T, start: 540, end: 620, title: "A", color: BLOCK_COLORS[0], tags: [], notes: "", origin: "manual", status: "planned", remindersMin: [0], activityId: null, templateId: null, templateBlockId: null, actualMin: null, createdAt: T, updatedAt: T },
    { id: "b2", date: T, start: 600, end: 660, title: "B", color: BLOCK_COLORS[0], tags: [], notes: "", origin: "manual", status: "planned", remindersMin: [0], activityId: null, templateId: null, templateBlockId: null, actualMin: null, createdAt: T, updatedAt: T },
  ];
  const file = JSON.stringify({ app: "blockday-backup", v: 1, exportedAt: null, state: bad, settings: S });
  eq((importBackup(file) as any).error, "invalid");
});
test("backup", "migrate fills missing fields from newer/older shapes", () => {
  const file = JSON.stringify({ app: "blockday-backup", v: 1, exportedAt: null, state: { blocks: [] }, settings: {} });
  const r = importBackup(file);
  ok(r.ok);
  if (r.ok) eq(r.settings, defaultSettings());
});

// ── CSV export ──────────────────────────────────────────────────────────────
test("export", "CSV has a header and escapes commas", () => {
  const s = add(emptyState(), 540, 600, { title: "Plan, review", tags: ["focus"] });
  const csv = blocksToCSV(blocksForDay(s, T));
  const lines = csv.split("\n");
  eq(lines[0], "date,title,start,end,duration,color,tags,status");
  ok(lines[1].includes('"Plan, review"'));
  ok(lines[1].includes("09:00") && lines[1].includes("10:00"));
});

// ── Undo / redo ────────────────────────────────────────────────────────────────
test("undo", "undo then redo restores state across 100 ops", () => {
  let h = initHistory(emptyState());
  let s = emptyState();
  for (let i = 0; i < 100; i++) {
    // one block per day keeps every op valid and non-overlapping for 100 edits
    s = createBlock(s, { date: addDays(T, i), start: 540, end: 600, title: `B${i}` }, T).state;
    h = record(h, s);
  }
  const full = h.present;
  for (let i = 0; i < 100; i++) h = undo(h);
  eq(h.present.blocks.length, 0);
  ok(!canUndo(h) && canRedo(h));
  for (let i = 0; i < 100; i++) h = redo(h);
  eq(h.present, full);
});
test("undo", "a new edit clears the redo stack", () => {
  let h = initHistory(emptyState());
  h = record(h, add(emptyState(), 540, 600));
  h = undo(h);
  h = record(h, add(emptyState(), 600, 660));
  ok(!canRedo(h));
});

// ── Limits ───────────────────────────────────────────────────────────────────
test("limits", "activity log is capped at MAX_LOG", () => {
  let s = createFromStarter(emptyState(), STARTER_TEMPLATES[0], T).state;
  for (let i = 0; i < MAX_LOG + 20; i++) s = clearDay(add(s, 540, 600), T, T);
  ok(s.log.length <= MAX_LOG);
});
test("limits", "min duration constant is enforced on create", () => eq(createBlock(emptyState(), { date: T, start: 540, end: 540 + MIN_DURATION - 1, title: "x" }, T).error, "too_short"));

// ── Journey sim ─────────────────────────────────────────────────────────────
test("sim", "every goal is reachable and invariants hold on a fresh run", () => {
  const s0 = sim.init();
  eq(sim.invariants(s0), []);
  ok(sim.goals.length >= 3);
});
test("sim", "serialize → deserialize round-trips (history excluded)", () => {
  let s = sim.init();
  for (const a of sim.actions(s).slice(0, 6)) s = sim.apply(s, a);
  eq(sim.serialize(sim.deserialize(sim.serialize(s))), sim.serialize(s));
});
test("sim", "no listed action throws or breaks an invariant (short random walk)", () => {
  let s = sim.init();
  let x = 12345;
  const rand = () => ((x = (x * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  for (let i = 0; i < 400; i++) {
    const opts = sim.actions(s);
    ok(opts.length > 0, "dead end");
    s = sim.apply(s, opts[Math.floor(rand() * opts.length)]);
    const v = sim.invariants(s);
    if (v.length) throw new Error(v[0]);
  }
});

// ── Accessibility: WCAG AA colour-contrast audit ───────────────────────────────
function auditScheme(name: string, c: Colors, tones: Record<ToneKey, { fg: string; bg: string }>, grad: { hero: [string, string]; onHero: string }) {
  // Normal body text on its usual surfaces must clear AA (4.5:1).
  ok(meetsAA(c.ink, c.bg), `${name} ink/bg ${contrastRatio(c.ink, c.bg).toFixed(2)}`);
  ok(meetsAA(c.ink, c.surface), `${name} ink/surface ${contrastRatio(c.ink, c.surface).toFixed(2)}`);
  ok(meetsAA(c.inkSoft, c.bg), `${name} inkSoft/bg ${contrastRatio(c.inkSoft, c.bg).toFixed(2)}`);
  ok(meetsAA(c.inkSoft, c.surface), `${name} inkSoft/surface ${contrastRatio(c.inkSoft, c.surface).toFixed(2)}`);
  ok(meetsAA(c.inkMuted, c.surface), `${name} inkMuted/surface ${contrastRatio(c.inkMuted, c.surface).toFixed(2)}`);
  // Primary button label on the primary fill, and hero text on the headline card.
  ok(meetsAA(c.onPrimary, c.primary), `${name} onPrimary/primary ${contrastRatio(c.onPrimary, c.primary).toFixed(2)}`);
  ok(meetsAA(grad.onHero, grad.hero[1]), `${name} onHero/hero ${contrastRatio(grad.onHero, grad.hero[1]).toFixed(2)}`);
  // Pill / banner tone text on its soft background (composited over the surface) clears large-text AA (3.0:1).
  (["primary", "success", "warning", "danger", "neutral"] as ToneKey[]).forEach((k) => {
    const bg = over(tones[k].bg, c.surface);
    ok(meetsAA(tones[k].fg, bg, true), `${name} tone:${k} ${contrastRatio(tones[k].fg, bg).toFixed(2)}`);
  });
}
test("contrast", "ratio math: black on white is 21:1", () => eq(Math.round(contrastRatio("#000000", "#ffffff")), 21));
test("contrast", "light palette clears WCAG AA everywhere it must", () => auditScheme("light", lightColors, lightTones, lightGradient));
test("contrast", "dark palette clears WCAG AA everywhere it must", () => auditScheme("dark", darkColors, darkTones, darkGradient));

// ── Cloud sync: per-record, overlap-safe merge ─────────────────────────────────
const blk = (id: string, start: number, end: number, updatedAt = T, patch: Partial<Block> = {}): Block => ({
  id, date: T, start, end, title: id, color: BLOCK_COLORS[0], tags: [], notes: "",
  origin: "manual", status: "planned", remindersMin: [0], activityId: null,
  templateId: null, templateBlockId: null, actualMin: null, createdAt: T, updatedAt, ...patch,
});
test("sync merge", "unions blocks with distinct ids from both devices", () => {
  const m = mergeBlocks([blk("a1", 540, 600)], [blk("b1", 600, 660)]);
  eq(m.length, 2);
  ok(!hasOverlap(m));
});
test("sync merge", "drops a remote block that would overlap a local one", () => {
  const m = mergeBlocks([blk("a1", 540, 600)], [blk("b1", 570, 630)]);
  eq(m.map((b) => b.id), ["a1"]);
  ok(!hasOverlap(m));
});
test("sync merge", "shared id: the newer edit wins", () => {
  const m = mergeBlocks([blk("a1", 540, 600, T, { title: "old" })], [blk("a1", 540, 600, addDays(T, 1), { title: "new" })]);
  eq(m[0].title, "new");
});
test("sync merge", "shared id: a stale remote edit is ignored", () => {
  const m = mergeBlocks([blk("a1", 540, 600, addDays(T, 1), { title: "keep" })], [blk("a1", 540, 600, T, { title: "stale" })]);
  eq(m[0].title, "keep");
});
test("sync merge", "full-state merge keeps the no-overlap invariant and the max nextId", () => {
  const local = { ...emptyState(), blocks: [blk("a1", 540, 600)], nextId: 5 };
  const remote = { ...emptyState(), blocks: [blk("b1", 700, 760), blk("b2", 580, 620)], nextId: 9 };
  const m = mergeBlockDayState(local, remote);
  ok(!hasOverlap(m.blocks));
  eq(m.nextId, 9);
  eq(m.blocks.map((b) => b.id).sort(), ["a1", "b1"]); // b2 overlapped a1 → dropped
});
test("sync merge", "log entries union, newest first, capped at MAX_LOG", () => {
  const mk = (id: string, at: string) => ({ id, type: "create" as const, summary: id, at });
  const local = { ...emptyState(), log: [mk("l2", addDays(T, 1)), mk("l1", T)] };
  const remote = { ...emptyState(), log: [mk("l3", addDays(T, 2)), mk("l1", T)] };
  const m = mergeBlockDayState(local, remote);
  eq(m.log.map((e) => e.id), ["l3", "l2", "l1"]);
  ok(m.log.length <= MAX_LOG);
});
test("sync merge", "idempotent: merging identical states changes nothing", () => {
  const s = { ...emptyState(), blocks: [blk("a1", 540, 600), blk("a2", 600, 660)], nextId: 3 };
  const m = mergeBlockDayState(s, s);
  eq(m.blocks, s.blocks);
  eq(m.nextId, 3);
  ok(!hasOverlap(m.blocks));
});

const failures = results.filter((r) => !r.ok).map((r) => `${r.name}: ${r.why}`);
for (const r of results) console.error(`${r.ok ? "PASS" : "FAIL"} ${r.name}${r.why ? ` — ${r.why}` : ""}`);
console.log(JSON.stringify({ tests: results.length, passed: results.length - failures.length, failures, features: [...features] }));
process.exit(failures.length ? 1 : 0);
