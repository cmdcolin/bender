import { engine } from '../engine/engine.ts'
import { createStore, type Store } from '../listeners.ts'
import { jackKey, type Cable, type End } from './benchCables.ts'

import type { Controls } from '../controls.ts'
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

/** A cable in the hand: the end still plugged in, the cable it was if it came
    out of an input, and the pointer, which is null when a press picked it up. */
export interface Drag {
  fixed: End
  carried: Cable | null
  at: Point | null
}

export const dragging = createStore<Drag | null>(null)

const escape = (k: KeyboardEvent) => {
  if (k.key === 'Escape') putDown()
}

const away = (e: PointerEvent) => {
  if (!(e.target instanceof Element && e.target.closest('[data-jack]')))
    putDown()
}

export function putDown() {
  window.removeEventListener('keydown', escape)
  window.removeEventListener('pointerdown', away, true)
  dragging.set(null)
}

/** Picks up a fresh cable from an output by a press, or puts it back down
    when it is already in the hand. */
export function carry(fixed: End) {
  const d = dragging.get()
  if (d && jackKey(d.fixed) === jackKey(fixed)) {
    putDown()
    return
  }
  window.addEventListener('keydown', escape)
  window.addEventListener('pointerdown', away, true)
  dragging.set({ fixed, carried: null, at: null })
}

/** Writes the board a change makes, as one step to walk back. */
export function rewire(change: (c: Controls) => Controls) {
  const was = engine.controls.get()
  const next = change(was)
  if (next === was) return
  engine.armStep()
  engine.writeBoard(next)
}

export const hasAny = (s: ReadonlySet<number>) => s.size > 0
