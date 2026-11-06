/**
 * 3-question placement: 1 goal tap + 2 listen-and-pick level probes.
 * Pure scoring → a start level and the day the course should begin on.
 * Skippable: a skipped placement defaults to A1 / daily goal / day 1.
 */
import type { Goal, Level } from "./types";

export interface PlacementAnswers {
  goal: Goal | null;
  /** Each probe: true = answered correctly (understood the English). */
  probes: boolean[];
}

export interface PlacementQuestion {
  id: string;
  kind: "goal" | "listen";
  prompt_bn: string;
  options: { value: string; label_bn: string; correct?: boolean }[];
  /** For "listen" probes, the audio the user hears. */
  audioUri?: string;
}

export const PLACEMENT_QUESTIONS: PlacementQuestion[] = [
  {
    id: "goal",
    kind: "goal",
    prompt_bn: "আপনি কেন ইংরেজি শিখতে চান?",
    options: [
      { value: "job", label_bn: "চাকরির জন্য" },
      { value: "study", label_bn: "পড়াশোনার জন্য" },
      { value: "daily", label_bn: "দৈনন্দিন কথাবার্তার জন্য" },
    ],
  },
  {
    id: "probe1",
    kind: "listen",
    prompt_bn: "শুনুন — কোনটা আপনি শুনলেন?",
    audioUri: "audio/placement_1.m4a",
    options: [
      { value: "a", label_bn: "আপনি কেমন আছেন?", correct: true },
      { value: "b", label_bn: "আপনার নাম কী?" },
      { value: "c", label_bn: "এটার দাম কত?" },
    ],
  },
  {
    id: "probe2",
    kind: "listen",
    prompt_bn: "শুনুন — কোনটা আপনি শুনলেন?",
    audioUri: "audio/placement_2.m4a",
    options: [
      { value: "a", label_bn: "আমি আগামী সপ্তাহে শুরু করতে পারি।" },
      { value: "b", label_bn: "স্টেশনে কীভাবে যাব?", correct: true },
      { value: "c", label_bn: "আমার জ্বর হয়েছে।" },
    ],
  },
];

export interface PlacementResult {
  level: Level;
  goal: Goal;
  startDay: number; // the 30-day course day to begin on
}

/** Score placement → level/goal/start. More correct probes ⇒ higher level. */
export function scorePlacement(a: PlacementAnswers): PlacementResult {
  const correct = a.probes.filter(Boolean).length;
  const level: Level = correct >= 2 ? "B1" : correct === 1 ? "A2" : "A1";
  // Even confident learners start on day 1 so the streak and path stay intact;
  // the level tunes scenario difficulty and quiz leniency, not where the path begins.
  return { level, goal: a.goal ?? "daily", startDay: 1 };
}

/** The default used when the learner taps "skip". */
export const skippedPlacement = (): PlacementResult => ({ level: "A1", goal: "daily", startDay: 1 });
