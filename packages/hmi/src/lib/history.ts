/**
 * Undo and redo.
 *
 * A drawing tool without undo is one people are afraid to use: every action
 * becomes a small decision about whether it can be reversed, and the answer
 * being "no" makes them tentative. So this is not a nicety.
 *
 * A stack of whole documents rather than a list of inverse operations. An HMI
 * document is small, the alternative needs an undo written for every action
 * and stays correct only as long as nobody forgets one, and the failure mode
 * of that is silent: undo appears to work and quietly leaves the document
 * subtly wrong. Snapshots cannot drift.
 *
 * Depth is capped because a long session would otherwise hold every state it
 * ever had. Fifty is well past what anybody reaches for and costs little.
 */

export const MAX_DEPTH = 50;

export interface History<T> {
  /** Oldest first. The last entry is the current document. */
  past: T[];
  future: T[];
}

export function emptyHistory<T>(present: T): History<T> {
  return { past: [present], future: [] };
}

export function current<T>(h: History<T>): T {
  return h.past[h.past.length - 1] as T;
}

export function canUndo<T>(h: History<T>): boolean {
  // One entry is the starting state, which there is nothing before.
  return h.past.length > 1;
}

export function canRedo<T>(h: History<T>): boolean {
  return h.future.length > 0;
}

/**
 * Record a new state.
 *
 * Redo is discarded, which is the standard behaviour and the right one: once
 * you have branched, the states you undid past are no longer reachable from
 * here and keeping them would let redo produce a document that never existed.
 */
export function push<T>(h: History<T>, next: T): History<T> {
  const past = [...h.past, next];
  return {
    past: past.length > MAX_DEPTH ? past.slice(past.length - MAX_DEPTH) : past,
    future: [],
  };
}

export function undo<T>(h: History<T>): History<T> {
  if (!canUndo(h)) return h;
  const last = h.past[h.past.length - 1] as T;
  return { past: h.past.slice(0, -1), future: [last, ...h.future] };
}

export function redo<T>(h: History<T>): History<T> {
  if (!canRedo(h)) return h;
  const [next, ...rest] = h.future;
  return { past: [...h.past, next as T], future: rest };
}

/** How many steps back are available, for a menu label. */
export function depth<T>(h: History<T>): number {
  return Math.max(0, h.past.length - 1);
}
