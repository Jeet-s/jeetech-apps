import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import type { Block, BlockDaySettings } from "../core/model";
import { fmtDuration } from "../core/time";

/**
 * Local block reminders — the ONLY use of notifications, and only ever on-device
 * (no push, no network). Reminders are opt-in (Settings → Reminders): we ask for
 * POST_NOTIFICATIONS in context, and every call is guarded so a denied
 * permission, an unsupported device or a cold module never crashes the app — the
 * always-visible in-app Active Block banner is the fallback cue.
 */
const CHANNEL = "block-reminders";
const ACTIVE_CHANNEL = "active-block";
const ACTIVE_ID = "blockday-active-block"; // stable id so the ongoing notice is replaced, never duplicated
const CATEGORY = "block-actions";
let configured = false;
let categorySet = false;

// A reschedule (cancel-all + up to 48 native schedule round-trips) is the single
// heaviest native operation the plan can trigger. During a soak — or a routine
// that adds a dozen blocks at once — the plan mutates faster than one reschedule
// finishes. Running them concurrently floods the OS notification/alarm service
// and wedges the app (ANR). So only ONE reschedule ever runs at a time; newer
// requests just overwrite a single "pending" slot and the in-flight run applies
// the latest plan when it finishes (intermediate states are safely dropped).
let syncing = false;
let pendingSync: { blocks: Block[]; settings: BlockDaySettings; now: Date } | null = null;

function configure(): void {
  if (configured) return;
  configured = true;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  } catch {
    // older/newer signature — non-critical
  }
}

async function ensureChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: "Block reminders",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 200, 120, 200],
      lightColor: "#0F62FE",
    });
    // A quiet, ongoing channel for the persistent "Active block" notice.
    await Notifications.setNotificationChannelAsync(ACTIVE_CHANNEL, {
      name: "Active block",
      importance: Notifications.AndroidImportance.LOW,
      vibrationPattern: [0],
      lightColor: "#0F62FE",
    });
  } catch {
    // ignore
  }
}

/** Register the Done / Snooze / Skip buttons that ride on each reminder. */
async function ensureCategory(): Promise<void> {
  if (categorySet) return;
  categorySet = true;
  try {
    await Notifications.setNotificationCategoryAsync(CATEGORY, [
      { identifier: "done", buttonTitle: "Done", options: { opensAppToForeground: false } },
      { identifier: "snooze", buttonTitle: "Snooze 10m", options: { opensAppToForeground: false } },
      { identifier: "skip", buttonTitle: "Skip", options: { opensAppToForeground: false } },
    ]);
  } catch {
    // categories unsupported on this runtime — reminders still fire, just without buttons
  }
}

/** Minutes-from-midnight on `date` → a local Date (handles overnight minutes ≥ 1440). */
function at(date: string, minute: number): Date {
  const [y, m, d] = date.split("-").map(Number);
  const base = new Date(y, m - 1, d, 0, 0, 0, 0);
  return new Date(base.getTime() + minute * 60_000);
}

export const notify = {
  /** Has the user already granted notification permission? */
  async hasPermission(): Promise<boolean> {
    try {
      const { status } = await Notifications.getPermissionsAsync();
      return status === "granted";
    } catch {
      return false;
    }
  },

  /** Ask for permission in context (returns whether it's granted after the prompt). */
  async requestPermission(): Promise<boolean> {
    try {
      configure();
      await ensureChannel();
      const current = await Notifications.getPermissionsAsync();
      if (current.status === "granted") return true;
      const res = await Notifications.requestPermissionsAsync();
      return res.status === "granted";
    } catch {
      return false;
    }
  },

  /** Cancel every scheduled reminder (used when the user turns reminders off). */
  async cancelAll(): Promise<void> {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
    } catch {
      // ignore
    }
  },

  /**
   * Re-schedule all future reminders from the current plan. Clears the old
   * schedule first so edits/deletes never leave a stale alert behind. A no-op
   * (after cancelling) when reminders are off or permission isn't granted.
   *
   * Coalesced + single-flight (see `syncing`/`pendingSync` above): if a
   * reschedule is already running, the latest request is stashed and applied
   * once the in-flight one finishes, so concurrent plan changes never stack up
   * native scheduling work.
   */
  async sync(blocks: Block[], settings: BlockDaySettings, now: Date = new Date()): Promise<void> {
    if (syncing) {
      pendingSync = { blocks, settings, now };
      return;
    }
    syncing = true;
    try {
      await notify.runSync(blocks, settings, now);
    } finally {
      syncing = false;
      if (pendingSync) {
        const next = pendingSync;
        pendingSync = null;
        // Apply only the most recent plan; earlier coalesced states are stale.
        void notify.sync(next.blocks, next.settings, next.now);
      }
    }
  },

  /** The actual reschedule. Never call directly — go through `sync` for coalescing. */
  async runSync(blocks: Block[], settings: BlockDaySettings, now: Date = new Date()): Promise<void> {
    await notify.cancelAll();
    if (!settings.remindersEnabled) return;
    try {
      configure();
      await ensureChannel();
      await ensureCategory();
      if (!(await notify.hasPermission())) return;
      const jobs: { date: Date; title: string; body: string; blockId: string }[] = [];
      for (const b of blocks) {
        if (b.status === "done" || b.status === "skipped") continue;
        const start = at(b.date, b.start);
        for (const r of b.remindersMin) {
          const d = new Date(start.getTime() - r * 60_000);
          if (d.getTime() > now.getTime() + 1000)
            jobs.push({ date: d, title: b.title, body: r === 0 ? "Starting now" : `Starts in ${fmtDuration(r)}`, blockId: b.id });
        }
        // Pre-end nudges (ADHD transition ramp) for the active/next block.
        for (const n of settings.preEndNudgesMin) {
          const d = new Date(at(b.date, b.end).getTime() - n * 60_000);
          if (d.getTime() > now.getTime() + 1000 && d.getTime() > start.getTime())
            jobs.push({ date: d, title: b.title, body: `Wrapping up — ${fmtDuration(n)} left`, blockId: b.id });
        }
      }
      jobs.sort((a, z) => a.date.getTime() - z.date.getTime());
      for (const j of jobs.slice(0, 48)) {
        await Notifications.scheduleNotificationAsync({
          content: { title: j.title, body: j.body, categoryIdentifier: CATEGORY, data: { blockId: j.blockId } },
          trigger: { type: "date", date: j.date, channelId: CHANNEL } as unknown as Notifications.NotificationTriggerInput,
        });
      }
    } catch {
      // scheduling is best-effort; the in-app banner still shows now/next
    }
  },

  /**
   * Keep a persistent, ongoing "Active block" notice in the shade while a block
   * is running (opt-in: Settings → "Keep active block in the notification
   * shade"). It carries Done / Snooze / Skip buttons and the time remaining, so
   * the plan is one glance away without opening the app. Best-effort and silent.
   */
  async showActiveBlock(title: string, minutesLeft: number, blockId?: string): Promise<void> {
    if (Platform.OS === "web") return;
    try {
      configure();
      await ensureChannel();
      await ensureCategory();
      if (!(await notify.hasPermission())) return;
      await Notifications.scheduleNotificationAsync({
        identifier: ACTIVE_ID,
        content: {
          title: `Now · ${title}`,
          body: minutesLeft > 0 ? `${fmtDuration(minutesLeft)} left` : "Wrapping up",
          categoryIdentifier: CATEGORY,
          data: { blockId: blockId ?? null },
          sticky: true,
          autoDismiss: false,
        },
        trigger: Platform.OS === "android" ? ({ type: "date", date: new Date(Date.now() + 500), channelId: ACTIVE_CHANNEL } as unknown as Notifications.NotificationTriggerInput) : null,
      });
    } catch {
      // ongoing notice is a convenience; the in-app banner is the real cue
    }
  },

  /** Clear the ongoing "Active block" notice (no block is running). */
  async clearActiveBlock(): Promise<void> {
    try {
      await Notifications.dismissNotificationAsync(ACTIVE_ID);
    } catch {
      // ignore
    }
    try {
      await Notifications.cancelScheduledNotificationAsync(ACTIVE_ID);
    } catch {
      // ignore
    }
  },

  /**
   * Subscribe to the Done / Snooze / Skip buttons on a reminder. The callback
   * receives the action id and the block it refers to (from the notification's
   * data payload) so the app can mutate the plan through src/core — even when
   * tapped from the shade with the app in the background.
   */
  onAction(cb: (action: string, blockId: string | null) => void): () => void {
    let sub: { remove: () => void } | null = null;
    try {
      sub = Notifications.addNotificationResponseReceivedListener((res) => {
        const id = res.actionIdentifier;
        const data = res.notification?.request?.content?.data as { blockId?: string | null } | undefined;
        if (id && id !== Notifications.DEFAULT_ACTION_IDENTIFIER) cb(id, data?.blockId ?? null);
      });
    } catch {
      // listener unsupported — buttons simply won't call back
    }
    return () => sub?.remove();
  },
};
