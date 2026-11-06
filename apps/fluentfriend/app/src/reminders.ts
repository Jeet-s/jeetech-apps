/**
 * Local reminders — one optional daily nudge tied to the streak (max 1/day) and
 * a gentle "welcome back" if the learner has been away. All Bangla, no
 * promotions. Wraps the factory notify module (never expo-notifications direct).
 */
import { notify } from "./modules/notify";
import { parseTime } from "./core/dates";

const DAILY_ID = "daily_lesson";

/**
 * Schedule (or clear) the single daily reminder. Call after the learner sets a
 * time or toggles reminders. `time` is "HH:MM" (24h); null/off cancels it.
 */
export async function scheduleDaily(time: string | null, streak: number): Promise<void> {
  if (!time) {
    await notify.cancel(DAILY_ID);
    return;
  }
  const mins = parseTime(time);
  if (mins == null) return;
  const body =
    streak > 0
      ? `আজকের ৫ মিনিটের ক্লাস অপেক্ষা করছে — আপনার ${streak} দিনের ধারা চলছে 🔥`
      : "আজকের ৫ মিনিটের ইংরেজি ক্লাস অপেক্ষা করছে। চলুন শুরু করি!";
  await notify.daily(DAILY_ID, { hour: Math.floor(mins / 60), minute: mins % 60 }, {
    title: "Fluent Friend",
    body,
  });
}

/** A one-off warm nudge if the app isn't opened for a week. Call on every launch. */
export async function scheduleComeback(): Promise<void> {
  await notify.comeback({
    days: 7,
    title: "আবার দেখা হবে?",
    body: "আপনার ইংরেজি বলার অভ্যাস চালিয়ে যান — আজ মাত্র ৫ মিনিট।",
  });
}
