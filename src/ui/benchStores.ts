import { createStore, type Store } from '../listeners.ts'

import type { Cable, End } from './benchCables.ts'
import type { Facing, Point } from './cablePaths.ts'

interface JackAt {
  el: HTMLElement
  facing: Facing
  /** What the machine behind an input is sounding, for a cable that glows. */
  notes?: Store<ReadonlySet<number>>
}

/** Every jack on the bench, by `jackKey`. */
export const jacks = createStore<ReadonlyMap<string, JackAt>>(new Map())

export function placeJack(key: string, at: JackAt | null) {
  const next = new Map(jacks.get())
  if (at === null) next.delete(key)
  else next.set(key, at)
  jacks.set(next)
}

/** A cable in the hand: the end still plugged in, and the cable it was if it
    came out of an input. */
export type Drag = Point & { fixed: End; carried: Cable | null }

export const dragging = createStore<Drag | null>(null)
