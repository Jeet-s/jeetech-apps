import type { SessionSpec } from "./AttemptSession";

/** Launch a full-screen attempt flow; `onFinish` runs when the whole set completes. */
export type StartSession = (spec: SessionSpec, onFinish?: (attemptIds: string[]) => void) => void;

export type TabId = "practice" | "mock" | "progress" | "learn" | "settings";

/** Common props every main screen receives from App. */
export interface ScreenProps {
  bottomInset: number;
  onPro: (from: string) => void;
  onStart: StartSession;
  onTab: (t: TabId) => void;
}
