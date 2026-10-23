/**
 * Unlimited per-session undo/redo over immutable snapshots. Each edit records
 * the previous state; undo/redo walk the stack. Not persisted (a fresh session
 * starts empty) — which is why sim.ts excludes it from serialize().
 */
export interface History<T> {
  past: T[];
  present: T;
  future: T[];
}

export const initHistory = <T>(present: T): History<T> => ({ past: [], present, future: [] });

export const canUndo = <T>(h: History<T>): boolean => h.past.length > 0;
export const canRedo = <T>(h: History<T>): boolean => h.future.length > 0;

/** Commit a new present, pushing the old one onto the undo stack and clearing redo. */
export function record<T>(h: History<T>, next: T): History<T> {
  if (next === h.present) return h; // no-op edits don't pollute history
  return { past: [...h.past, h.present], present: next, future: [] };
}

export function undo<T>(h: History<T>): History<T> {
  if (!h.past.length) return h;
  const prev = h.past[h.past.length - 1];
  return { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future] };
}

export function redo<T>(h: History<T>): History<T> {
  if (!h.future.length) return h;
  const next = h.future[0];
  return { past: [...h.past, h.present], present: next, future: h.future.slice(1) };
}
