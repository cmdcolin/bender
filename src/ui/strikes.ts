import { engine } from '../engine/engine.ts'
import { createStore } from '../listeners.ts'

import type { StruckHitMsg } from '../engine/messages.ts'

export type Struck = StruckHitMsg['target']

export interface Strike {
  id: number
  x: number
  y: number
}

const RING_MS = 600

/** Where a hit with no spot named lands. */
export const STRUCK_HOME: Record<Struck, { x: number; y: number }> = {
  sheet: { x: 0.5, y: 0.5 },
  bottle: { x: 0.5, y: 0.7 },
}

export const strikes = createStore<Record<Struck, readonly Strike[]>>({
  sheet: [],
  bottle: [],
})

let nextId = 0

function edit(target: Struck, change: (shown: readonly Strike[]) => Strike[]) {
  const all = strikes.get()
  strikes.set({ ...all, [target]: change(all[target]) })
}

/** Hits the sheet or the bottle at x and y, fractions of its face, and rings
    the spot on the face for as long as its animation runs. */
export function strike(
  target: Struck,
  x = STRUCK_HOME[target].x,
  y = STRUCK_HOME[target].y,
  gain = 1,
) {
  engine.struckHit(target, x, y, gain)
  const id = nextId++
  edit(target, shown => [...shown, { id, x, y }])
  setTimeout(
    () => edit(target, shown => shown.filter(s => s.id !== id)),
    RING_MS,
  )
}
