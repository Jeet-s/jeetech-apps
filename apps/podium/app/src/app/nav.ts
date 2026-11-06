import type { RecordRequest } from "./engine";

/** Meta passed to the report viewer after a fresh take or from history. */
export interface ReportMeta {
  quota?: boolean;
  offline?: boolean;
  fresh?: boolean;
  req?: RecordRequest;
}

/** The single navigation surface passed to every screen. App.tsx owns the
 * actual stack / overlays; screens just call these. */
export interface AppNav {
  /** Open the full-screen record → analyse flow. */
  record(req: RecordRequest): void;
  /** Open a saved (or just-made) report. */
  openReport(reportId: string, meta?: ReportMeta): void;
  openPack(packId: string): void;
  openLesson(lessonId: string): void;
  /** Event prep: a specific event, or the setup when no id. */
  openEvent(eventId?: string): void;
  openHistory(): void;
  openSupport(): void;
  /** Backup & sync screen (cloud backup status + optional email sign-in). */
  openBackup(): void;
  /** Streak & skill badges screen. */
  openAchievements(): void;
  /** Open the Pro sheet; `from` is tracked for the paywall funnel. */
  pro(from: string): void;
  /** Switch the active bottom tab. */
  go(tab: "home" | "practice" | "progress" | "settings"): void;
}

export type ScreenProps = { bottomInset: number; nav: AppNav };
