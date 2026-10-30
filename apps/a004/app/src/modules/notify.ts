import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { analytics } from "./analytics";
import { registerPush } from "./push";

/**
 * Notifications — factory-owned.
 *
 * LOCAL (always available, no server): reminders the user sets, daily/weekly habits, streak and comeback nudges.
 *   notify.daily("water", { hour: 9, minute: 0 }, { title, body })   notify.at("trip", date, {…})   notify.cancel(id)
 *   notify.comeback({ days: 3, title, body })   — re-armed on every launch, fires only if the user stays away.
 * PERMISSION: ask at a meaningful moment (after the user turns on a reminder or finishes the first core action) with
 *   notify.ask("why it helps") — never on first launch. Returns false if declined; the app keeps working.
 * REMOTE PUSH (when push.json has a registerUrl): the device token is registered with the factory's App Cloud so the
 *   studio can send re-engagement, content and event pushes. notify.ask() registers automatically once granted.
 * Taps on any notification are tracked as "notification_open" {id}.
 */
type Content = { title: string; body: string; data?: Record<string, unknown> };
let ready = false;

async function init(): Promise<void> {
  if (ready) return;
  ready = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", { name: "Reminders", importance: Notifications.AndroidImportance.DEFAULT }).catch(() => {});
  }
  Notifications.addNotificationResponseReceivedListener((r) => {
    const id = String(r.notification.request.content.data?.id ?? r.notification.request.identifier);
    analytics.track("notification_open", { id });
  });
  // Already granted (returning user): keep the push token fresh.
  if ((await Notifications.getPermissionsAsync().catch(() => null))?.granted) void registerPush();
}

async function granted(): Promise<boolean> {
  return !!(await Notifications.getPermissionsAsync().catch(() => null))?.granted;
}

/** Ask for permission (Android 13+ / iOS). `reason` is for your own pre-prompt UI; call after the user opts in. */
async function ask(_reason?: string): Promise<boolean> {
  await init();
  if (await granted()) return true;
  const r = await Notifications.requestPermissionsAsync().catch(() => null);
  const ok = !!r?.granted;
  analytics.track("notification_permission", { granted: ok });
  if (ok) void registerPush();
  return ok;
}

async function schedule(id: string, content: Content, trigger: Notifications.NotificationTriggerInput): Promise<void> {
  await init();
  await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
  await Notifications.scheduleNotificationAsync({
    identifier: id,
    content: { title: content.title, body: content.body, data: { ...(content.data ?? {}), id } },
    trigger,
  }).catch(() => {});
}

export const notify = {
  init,
  ask,
  granted,
  /** Every day at hour:minute. */
  daily: (id: string, at: { hour: number; minute: number }, content: Content) =>
    schedule(id, content, { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: at.hour, minute: at.minute }),
  /** Every week on weekday (1 = Sunday … 7 = Saturday) at hour:minute. */
  weekly: (id: string, at: { weekday: number; hour: number; minute: number }, content: Content) =>
    schedule(id, content, { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: at.weekday, hour: at.hour, minute: at.minute }),
  /** Once, at a date. */
  at: (id: string, date: Date, content: Content) => schedule(id, content, { type: Notifications.SchedulableTriggerInputTypes.DATE, date }),
  cancel: (id: string) => Notifications.cancelScheduledNotificationAsync(id).catch(() => {}),
  cancelAll: () => Notifications.cancelAllScheduledNotificationsAsync().catch(() => {}),
  /** A gentle nudge if the user hasn't opened the app for `days` days — call on every launch to push it back. */
  comeback: (o: { days: number; title: string; body: string }) =>
    schedule("comeback", { title: o.title, body: o.body }, { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: Math.max(3600, o.days * 86400), repeats: false }),
};
