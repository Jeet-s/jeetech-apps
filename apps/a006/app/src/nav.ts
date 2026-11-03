import { createContext, useContext } from "react";
import type { Id } from "./core/types";

export type Tab = "home" | "matches" | "tournaments" | "stats" | "more";

/** A pushed screen on top of the tabs. `scoring`/`setup`/`result` are full-screen (no tab bar). */
export type Route =
  | { t: "setup"; tournamentId?: Id; fixtureId?: Id }
  | { t: "scoring"; matchId: Id }
  | { t: "result"; matchId: Id }
  | { t: "match"; matchId: Id }
  | { t: "tournament"; id: Id }
  | { t: "player"; id: Id }
  | { t: "teams" }
  | { t: "support" };

export interface Nav {
  /** Push a detail/flow screen over the current context. */
  push(r: Route): void;
  /** Pop the top screen (back). */
  pop(): void;
  /** Replace the top screen (e.g. scoring → result). */
  replace(r: Route): void;
  /** Clear the whole stack back to the tabs. */
  reset(): void;
  /** Switch the active bottom tab (also clears the stack). */
  go(tab: Tab): void;
  /** Open the Pro sheet; `from` is tracked for analytics. */
  openPro(from: string): void;
}

export const NavContext = createContext<Nav | null>(null);

export function useNav(): Nav {
  const n = useContext(NavContext);
  if (!n) throw new Error("useNav must be used inside <NavContext.Provider>");
  return n;
}
