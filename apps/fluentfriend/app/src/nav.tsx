import { createContext, useContext } from "react";
import type { Topic } from "./core";

/** Bottom tabs (Bangla labels in the TabBar). */
export type Tab = "home" | "speak" | "learn" | "me";

/** Full-screen routes pushed over the tabs (each has a close/back). */
export type Route =
  | { name: "lesson"; lessonId: string }
  | { name: "courseMap"; courseId: string }
  | { name: "conversation"; scenarioId: string }
  | { name: "review" }
  | { name: "placement" }
  | { name: "certificate"; courseId: string }
  | { name: "downloads" }
  | { name: "settings" }
  | { name: "backup" }
  | { name: "phrasebook"; topic?: Topic }
  | { name: "dictionary" }
  | { name: "grammar" }
  | { name: "favorites" }
  | { name: "drills" };

export interface Nav {
  /** Push a full-screen route. */
  go: (r: Route) => void;
  /** Pop the top route (back to the tabs, or the previous route). */
  back: () => void;
  /** Switch the active bottom tab (and clear the stack). */
  tab: (t: Tab) => void;
  /** Open the Pro sheet; `from` is tracked for analytics. */
  openPro: (from: string) => void;
}

const NavCtx = createContext<Nav | null>(null);
export const NavProvider = NavCtx.Provider;

export function useNav(): Nav {
  const n = useContext(NavCtx);
  if (!n) throw new Error("useNav must be used inside NavProvider");
  return n;
}
