/**
 * Scenario library, lessons and event-plan logic. Prompts are generated
 * deterministically from curated, on-context seeds per pack (so a chosen
 * scenario never shows an off-context prompt) plus coaching framings, giving
 * 600+ prompts across 12 packs. All pure — the UI just reads these.
 */
import type { Difficulty, EventType, PlanItem, EventPlan } from "./types";
import { addDays, daysBetween, type DateKey } from "./dates";

export interface Pack {
  id: string;
  name: string;
  icon: string;
  blurb: string;
}

export interface Prompt {
  id: string;
  packId: string;
  text: string;
  difficulty: Difficulty;
  tags: string[];
  language: string;
}

export const PACKS: Pack[] = [
  { id: "impromptu", name: "Impromptu", icon: "shuffle", blurb: "Random topics to think on your feet" },
  { id: "opening30", name: "Opening 30 Seconds", icon: "flag", blurb: "Nail the first half minute" },
  { id: "interview", name: "Job Interview", icon: "briefcase", blurb: "Answer like the role is yours" },
  { id: "presentation", name: "Work Presentation", icon: "chart", blurb: "Present with clarity and calm" },
  { id: "meeting", name: "Meeting Update", icon: "users", blurb: "Crisp status in under a minute" },
  { id: "pitch", name: "Startup Pitch", icon: "rocket", blurb: "Hook investors fast" },
  { id: "viva", name: "Viva / Thesis Defence", icon: "grad", blurb: "Defend your work with confidence" },
  { id: "class", name: "Class Presentation", icon: "book", blurb: "Explain so everyone follows" },
  { id: "toast", name: "Wedding Toast", icon: "glass", blurb: "Warm, short, unforgettable" },
  { id: "eulogy", name: "Eulogy", icon: "leaf", blurb: "Honour someone with grace" },
  { id: "bestman", name: "Best Man / Maid of Honour", icon: "star", blurb: "Funny, kind and brief" },
  { id: "sales", name: "Sales Call", icon: "phone", blurb: "Lead the conversation" },
];

/** On-context seeds per pack. Every seed is clearly about that scenario. */
const SEEDS: Record<string, string[]> = {
  impromptu: [
    "Describe a skill everyone should learn and why.",
    "Argue for or against working from home.",
    "Talk about a book or film that changed how you think.",
    "If you could fix one everyday problem, what would it be?",
    "Describe your ideal weekend from start to finish.",
    "Convince me to visit your hometown.",
    "What does success mean to you?",
    "Explain a hobby to someone who's never tried it.",
    "Describe a time you changed your mind about something.",
    "What invention would improve daily life the most?",
    "Talk about a person you admire and one trait you'd borrow.",
    "Should every student learn to code? Make your case.",
    "Describe the best piece of advice you've ever received.",
    "What's one small habit that has a big payoff?",
    "Explain why kindness is underrated.",
    "Describe a challenge you overcame and what it taught you.",
    "Pitch a brand-new public holiday and how we'd celebrate it.",
  ],
  opening30: [
    "Open a talk about your proudest achievement in one line.",
    "Start a presentation with a surprising statistic you invent.",
    "Hook an audience with a question about the future of work.",
    "Open with a 10-second story that sets up your topic.",
    "Begin a pitch by naming the problem everyone feels.",
    "Introduce yourself memorably in two sentences.",
    "Open a toast with a warm line about the couple.",
    "Start a lesson by making the topic feel urgent.",
    "Open with a bold claim you'll spend the talk proving.",
    "Begin with a vivid image the audience can picture.",
    "Open a meeting update by leading with the headline.",
    "Start with the one thing you want people to remember.",
    "Hook listeners by promising what they'll gain.",
    "Open with a contrast: how it was vs how it could be.",
    "Begin by naming the elephant in the room.",
    "Start with a short, relatable confession.",
    "Open a Q&A by framing the question that matters most.",
  ],
  interview: [
    "Tell me about yourself in under a minute.",
    "Why do you want this role?",
    "Describe your greatest professional strength.",
    "Tell me about a weakness and how you manage it.",
    "Walk me through a project you're proud of.",
    "Describe a time you handled conflict at work.",
    "Why are you leaving your current job?",
    "Where do you see yourself in five years?",
    "Tell me about a time you failed and what you learned.",
    "How do you prioritise when everything is urgent?",
    "Describe a time you led without authority.",
    "Why should we hire you over other candidates?",
    "Tell me about a time you received tough feedback.",
    "How do you handle a tight deadline?",
    "Describe a decision you made with incomplete information.",
    "What questions do you have for us?",
    "Tell me about a time you went beyond your job description.",
  ],
  presentation: [
    "Present this quarter's results and the one takeaway.",
    "Explain a complex idea to a non-technical audience.",
    "Pitch a new process and why the team should adopt it.",
    "Summarise a project's status for leadership.",
    "Present three options and your recommendation.",
    "Walk through a roadmap for the next three months.",
    "Explain what went wrong and how you'll fix it.",
    "Present a customer insight and what to do about it.",
    "Introduce a new tool and its benefits in a minute.",
    "Make the case for a budget increase.",
    "Present data without reading the slide word for word.",
    "Explain a decision and the trade-offs behind it.",
    "Give a product demo focusing on the main benefit.",
    "Present a risk and your mitigation plan.",
    "Close a presentation with a clear call to action.",
    "Recap a workshop in under a minute.",
    "Present your team's wins this month.",
  ],
  meeting: [
    "Give a 60-second status update on your current task.",
    "Report a blocker and what you need to unblock it.",
    "Share one win and one risk from this week.",
    "Summarise a decision the group needs to make.",
    "Update the team on a slipping deadline.",
    "Hand off work clearly to a teammate.",
    "Flag a dependency on another team.",
    "Propose an agenda for the next meeting.",
    "Give a stand-up update: yesterday, today, blockers.",
    "Summarise action items at the end of a meeting.",
    "Share progress on a goal and the next step.",
    "Raise a concern without derailing the meeting.",
    "Report a metric and whether it's on track.",
    "Suggest cutting a low-value task and why.",
    "Update stakeholders on a launch date.",
    "Recap a customer call for the team.",
    "Ask for a decision and set a deadline for it.",
  ],
  pitch: [
    "Pitch your startup in 60 seconds.",
    "Describe the problem you solve and for whom.",
    "Explain why now is the right time for your idea.",
    "Describe your unfair advantage.",
    "Explain how you make money in one line.",
    "Describe your traction so far.",
    "Pitch the market size without drowning in numbers.",
    "Explain what makes you different from competitors.",
    "Describe your dream customer and their pain.",
    "Make the ask: what you want from investors.",
    "Explain your product in one sentence a child understands.",
    "Describe the vision five years out.",
    "Handle the question: what if a big company copies you?",
    "Explain your team's superpower.",
    "Pitch the one metric that proves this is working.",
    "Describe how you'll use the investment.",
    "Open your pitch with a hook, not your name.",
  ],
  viva: [
    "Summarise your thesis contribution in one minute.",
    "Explain your research question and why it matters.",
    "Defend your choice of methodology.",
    "Explain a limitation of your study honestly.",
    "Describe how your work differs from prior research.",
    "Explain your most important finding.",
    "Handle the question: how would you extend this work?",
    "Justify your sample or dataset.",
    "Explain a surprising result and your interpretation.",
    "Describe the theoretical framework you used.",
    "Defend a decision an examiner might challenge.",
    "Explain how your results generalise.",
    "Summarise your literature gap in plain terms.",
    "Explain what you would do differently next time.",
    "Describe the real-world impact of your work.",
    "Walk through your argument from question to conclusion.",
    "Answer: why is this contribution original?",
  ],
  class: [
    "Explain today's topic as if teaching a classmate.",
    "Summarise a chapter in under a minute.",
    "Present your project's main finding.",
    "Explain a concept using a simple analogy.",
    "Give a book report's key message.",
    "Present the cause and effect of a historical event.",
    "Explain a science experiment and its result.",
    "Argue one side of a class debate.",
    "Present a solution to a maths problem out loud.",
    "Summarise a group project and your part in it.",
    "Explain why this topic matters today.",
    "Present three facts that surprised you.",
    "Teach one new word and use it in a sentence.",
    "Explain a diagram without pointing at it.",
    "Give a confident introduction to your presentation.",
    "Close your talk with a memorable takeaway.",
    "Answer a classmate's question clearly.",
  ],
  toast: [
    "Raise a toast to the newlyweds in 45 seconds.",
    "Share one short story that captures the couple.",
    "Welcome the guests and thank them for coming.",
    "Say what you love about how they are together.",
    "Offer a warm wish for their future.",
    "Toast to the parents who raised them.",
    "Share a funny, kind memory of the couple.",
    "Describe the moment you knew they were right for each other.",
    "Give the couple one piece of heartfelt advice.",
    "Toast an anniversary with gratitude.",
    "Welcome someone into the family.",
    "Keep a toast warm and under a minute.",
    "Open a toast with a line that gets a smile.",
    "Close a toast by inviting everyone to raise a glass.",
    "Toast a friend on their big milestone.",
    "Say thank you to the hosts of the celebration.",
    "Honour the couple with a short blessing.",
  ],
  eulogy: [
    "Share one memory that captures who they were.",
    "Describe a value they lived by every day.",
    "Thank everyone for coming to remember them.",
    "Describe how they made people feel.",
    "Share a small moment that meant a lot.",
    "Describe a lesson they taught you.",
    "Speak about the legacy they leave behind.",
    "Describe their sense of humour warmly.",
    "Offer comfort to the family with a few words.",
    "Describe what you'll carry forward from them.",
    "Honour their work or passion in a sentence.",
    "Share a line they often said.",
    "Describe a tradition they kept.",
    "Close with a gentle farewell.",
    "Speak to who they were at their best.",
    "Thank them, simply and sincerely.",
    "Describe the quiet way they helped others.",
  ],
  bestman: [
    "Introduce yourself and your friendship with the groom.",
    "Share one funny, kind story about the couple.",
    "Roast the groom gently, then turn it warm.",
    "Welcome the partner into your circle of friends.",
    "Describe how the couple complete each other.",
    "Give the couple a tongue-in-cheek piece of advice.",
    "Thank the bridal party and the hosts.",
    "Describe the first time you met the partner.",
    "Share the moment you knew they were serious.",
    "Keep the roast short and the heart big.",
    "Open with a line that gets the room laughing.",
    "Tell the story of a loyal friend.",
    "Describe a shared adventure in a sentence.",
    "Close by inviting a toast to the couple.",
    "Balance one joke with one sincere wish.",
    "Describe how the groom has changed for the better.",
    "Say the one true thing under all the jokes.",
  ],
  sales: [
    "Open a cold call and earn the next 30 seconds.",
    "Describe the problem your product solves for them.",
    "Handle the objection: it's too expensive.",
    "Handle the objection: we already have a solution.",
    "Explain your product's value in one sentence.",
    "Ask a question that uncovers the real need.",
    "Summarise next steps and set a follow-up.",
    "Differentiate from a competitor without bashing them.",
    "Explain pricing with confidence.",
    "Handle: send me an email instead.",
    "Describe a relevant customer success story.",
    "Ask for the meeting without being pushy.",
    "Re-open a deal that went quiet.",
    "Explain the cost of doing nothing.",
    "Confirm you understood their need before pitching.",
    "Close by asking for a small, clear commitment.",
    "Turn a gatekeeper into an ally.",
  ],
};

/** Coaching framings appended to seeds — context-neutral, keep prompts on-topic. */
const FRAMINGS: string[] = [
  "",
  "Keep it under 60 seconds and land one clear point.",
  "Focus on a confident opening line.",
  "Avoid filler words and let pauses do the work.",
  "End with a line they'll remember.",
  "Speak at a steady, unhurried pace.",
];

const DIFFS: Difficulty[] = ["easy", "medium", "hard"];

/** Deterministically build the full prompt library (600+ prompts). */
export function buildPrompts(): Prompt[] {
  const out: Prompt[] = [];
  for (const pack of PACKS) {
    const seeds = SEEDS[pack.id] ?? [];
    seeds.forEach((seed, si) => {
      // 3 framings per seed → ~51 prompts per pack, ~612 total, all on-context.
      for (let f = 0; f < 3; f++) {
        const framing = FRAMINGS[(si + f) % FRAMINGS.length];
        const text = framing ? `${seed} ${framing}` : seed;
        out.push({
          id: `p_${pack.id}_${si}_${f}`,
          packId: pack.id,
          text,
          difficulty: DIFFS[(si + f) % DIFFS.length],
          tags: [pack.id, DIFFS[(si + f) % DIFFS.length]],
          language: "en",
        });
      }
    });
  }
  return out;
}

export const PROMPTS = buildPrompts();
export const PROMPT_COUNT = PROMPTS.length;
export const promptsForPack = (packId: string) => PROMPTS.filter((p) => p.packId === packId);
export const getPrompt = (id: string) => PROMPTS.find((p) => p.id === id);
export const getPack = (id: string) => PACKS.find((p) => p.id === id);

/** Prompts that make good 60-second daily drills (varied, broadly useful). */
const DAILY_POOL = PROMPTS.filter((p) => ["impromptu", "opening30", "interview", "pitch", "meeting", "class"].includes(p.packId));

/** The day's drill — deterministic from the local date, so it's stable through
 * the day and fresh on day 2, 7 and 30 (rotates across the pool). */
export function dailyPrompt(today: DateKey): Prompt {
  let h = 0;
  for (let i = 0; i < today.length; i++) h = (h * 31 + today.charCodeAt(i)) >>> 0;
  return DAILY_POOL[h % DAILY_POOL.length] ?? PROMPTS[0];
}

/** Deterministic "shuffle": pick the next unseen prompt in a pack from a seed. */
export function nextPrompt(packId: string, seen: string[], seed: number): Prompt | null {
  const pool = promptsForPack(packId);
  if (!pool.length) return null;
  const seenSet = new Set(seen);
  const fresh = pool.filter((p) => !seenSet.has(p.id));
  const list = fresh.length ? fresh : pool; // every prompt seen → cycle, never dead-end
  return list[Math.abs(seed) % list.length];
}

// --- Lessons ---
export interface Lesson {
  id: string;
  title: string;
  skill: string;
  steps: string[];
  focusPrompt: string;
}

export const LESSONS: Lesson[] = [
  { id: "l_openers", title: "Strong Openers", skill: "opening", steps: ["Why the first line decides attention", "Three opener shapes: question, story, claim", "Write your own in 10 seconds"], focusPrompt: "Open a talk with a line that earns the next 30 seconds." },
  { id: "l_pacing", title: "Pacing & Pauses", skill: "pace", steps: ["The 130–150 WPM sweet spot", "Pausing on purpose", "Read a line slowly, then naturally"], focusPrompt: "Speak for 45 seconds at a steady, unhurried pace." },
  { id: "l_fillers", title: "Beating Fillers", skill: "fillers", steps: ["Why we say 'um'", "Replace fillers with silence", "Catch and pause instead"], focusPrompt: "Describe your day with zero filler words." },
  { id: "l_story", title: "Storytelling", skill: "structure", steps: ["Setup, turn, payoff", "One story, one point", "Tell a 40-second story"], focusPrompt: "Tell a short story that makes one clear point." },
  { id: "l_nerves", title: "Handling Nerves", skill: "confidence", steps: ["Reframe the jitters", "Breath and grounding", "Speak through a shaky start"], focusPrompt: "Introduce yourself calmly, even if nervous." },
  { id: "l_qa", title: "Q&A Under Pressure", skill: "confidence", steps: ["Buy a beat before answering", "Answer, then evidence", "Handle a tough question"], focusPrompt: "Answer a hard question clearly in under a minute." },
  { id: "l_structure", title: "Opening · Point · Close", skill: "structure", steps: ["The three-part spine", "One point per talk", "Map a talk aloud"], focusPrompt: "Give a 60-second talk with a clear opening, point and close." },
  { id: "l_closing", title: "Memorable Closings", skill: "closing", steps: ["Why endings stick", "Call back to your opener", "Land a final line"], focusPrompt: "End a talk with a line people will repeat." },
];
export const getLesson = (id: string) => LESSONS.find((l) => l.id === id);

/** Placement: 3 adaptive prompts, optional and skippable. */
export const PLACEMENT_PROMPTS = ["p_impromptu_0_0", "p_opening30_0_0", "p_interview_0_0"];
export function levelFromScores(scores: number[]): "beginner" | "intermediate" | "advanced" {
  if (!scores.length) return "beginner";
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  if (avg >= 75) return "advanced";
  if (avg >= 55) return "intermediate";
  return "beginner";
}

// --- Event Prep ---
const EVENT_TITLES: Record<EventType, string> = {
  interview: "Job interview",
  viva: "Viva / thesis defence",
  pitch: "Startup pitch",
  toast: "Wedding toast",
  presentation: "Work presentation",
  meeting: "Big meeting",
};
const EVENT_PACK: Record<EventType, string> = {
  interview: "interview",
  viva: "viva",
  pitch: "pitch",
  toast: "toast",
  presentation: "presentation",
  meeting: "meeting",
};
const EVENT_FOCUS: Record<EventType, string[]> = {
  interview: ["Tell me about yourself", "Your strongest story", "A tough question", "Your questions for them"],
  viva: ["Your contribution in a minute", "Defend your method", "A limitation, honestly", "Extend the work"],
  pitch: ["The problem", "Why now", "Traction & ask", "Handle the hard question"],
  toast: ["Open warmly", "One short story", "A heartfelt wish", "Raise the glass"],
  presentation: ["Lead with the headline", "Explain simply", "Handle a question", "Clear call to action"],
  meeting: ["The headline update", "A blocker & the ask", "Keep it to a minute", "Confirm next steps"],
};

/**
 * Build a countdown plan: one short drill per day up to the event, and a final
 * full run-through on the event day. Compressed to 1–2 items if the event is
 * within 24 hours. Never produces a plan with a "failed" state.
 */
export function buildEventPlan(args: { id: string; type: EventType; title?: string; date: DateKey; today: DateKey }): EventPlan {
  const days = Math.max(0, daysBetween(args.today, args.date));
  const focuses = EVENT_FOCUS[args.type];
  const items: PlanItem[] = [];
  const pack = EVENT_PACK[args.type];
  if (days <= 1) {
    // Compressed plan: one quick drill today + the final run.
    items.push({ id: `${args.id}_i0`, day: args.today, title: `Quick drill: ${focuses[0]}`, focus: pack, minutes: 2, done: false, isFinalRun: false });
  } else {
    const n = Math.min(days, focuses.length);
    for (let i = 0; i < n; i++) {
      items.push({
        id: `${args.id}_i${i}`,
        day: addDays(args.today, Math.min(i, days - 1)),
        title: `Drill: ${focuses[i % focuses.length]}`,
        focus: pack,
        minutes: 2,
        done: false,
        isFinalRun: false,
      });
    }
  }
  items.push({ id: `${args.id}_run`, day: args.date, title: "Full run-through", focus: pack, minutes: 5, done: false, isFinalRun: true });
  return {
    id: args.id,
    type: args.type,
    title: args.title?.trim() || EVENT_TITLES[args.type],
    date: args.date,
    planItems: items,
    readiness: 0,
    archived: false,
  };
}

/** Re-flow a plan when days are skipped: pull overdue, undone drills to today. */
export function reflowPlan(plan: EventPlan, today: DateKey): EventPlan {
  const planItems = plan.planItems.map((it) =>
    !it.done && !it.isFinalRun && it.day < today ? { ...it, day: today } : it,
  );
  return { ...plan, planItems };
}

/** Readiness 0..100 from completed drills blended with the final-run flag. */
export function computeReadiness(plan: EventPlan, finalRunScore: number | null): number {
  const drills = plan.planItems.filter((i) => !i.isFinalRun);
  const doneDrills = drills.filter((i) => i.done).length;
  const drillPart = drills.length ? (doneDrills / drills.length) * 70 : 70;
  const runItem = plan.planItems.find((i) => i.isFinalRun);
  const runPart = runItem?.done ? Math.max(30, Math.round((finalRunScore ?? 70) * 0.3)) : 0;
  return Math.max(0, Math.min(100, Math.round(drillPart + runPart)));
}

export const isEventPast = (plan: EventPlan, today: DateKey) => plan.date < today;
