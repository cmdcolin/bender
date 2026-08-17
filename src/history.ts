// A bounded undo/redo walk over whole-board snapshots.
//
// One step back would be enough if every destructive move were deliberate. It
// stops being enough the moment finding a sound becomes a search: mutate,
// mutate, random, mutate, and the board worth keeping is three steps behind the
// one you can hear, with no way back to it. So the walk is retraceable in both
// directions — which is also what makes a wild jitter safe to try, since the
// cost of a bad roll is one keystroke rather than the board you had.
//
// Pure and generic on purpose: the interesting behaviour is the dedupe, the cap
// and when the redo tail dies, and all three are worth pinning down in a test.

// Deep enough to cover a run of rolls, small enough that a snapshot per entry
// stays free — a couple of hundred numbers each.
export const HISTORY_MAX = 24

export interface History<T> {
  // Oldest first, so the most recent step back is the last element.
  readonly past: readonly T[]
  // Nearest first: the state undo just left, ready to be stepped back into.
  readonly future: readonly T[]
}

export const EMPTY_HISTORY: History<never> = { past: [], future: [] }

// Record the state being replaced. `same` decides what counts as no movement:
// more than one path snapshots the same board on the way to a single change, and
// a stack of identical entries turns undo into a key you press four times to
// hear anything.
export function record<T>(
  h: History<T>,
  prev: T,
  same: (a: T, b: T) => boolean,
): History<T> {
  const top = h.past.at(-1)
  if (top !== undefined && same(top, prev)) {
    // Still a new branch: the redo tail belonged to a walk this write leaves.
    return h.future.length === 0 ? h : { past: h.past, future: [] }
  }
  return { past: [...h.past, prev].slice(-HISTORY_MAX), future: [] }
}

// Step back. `current` is the live state, which becomes the head of the redo
// tail — the caller owns it, so it is passed in rather than kept here and left
// to drift.
export function stepBack<T>(
  h: History<T>,
  current: T,
): { history: History<T>; value: T } | null {
  const value = h.past.at(-1)
  if (value === undefined) return null
  return {
    history: { past: h.past.slice(0, -1), future: [current, ...h.future] },
    value,
  }
}

export function stepForward<T>(
  h: History<T>,
  current: T,
): { history: History<T>; value: T } | null {
  const [value, ...rest] = h.future
  if (value === undefined) return null
  return {
    history: { past: [...h.past, current].slice(-HISTORY_MAX), future: rest },
    value,
  }
}
