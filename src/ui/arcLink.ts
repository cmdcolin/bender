import { engine } from '../engine/engine.ts'
import { bench } from './bench.ts'
import { added, shownOn } from './fitted.ts'
import { wildBoard } from './wild.ts'

import type { WildPack } from '../dsp/arc.ts'

const same = (a: WildPack | null, b: WildPack | null) =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.idx.length === b.idx.length &&
    a.idx.every((v, k) => v === b.idx[k]) &&
    a.to.every((v, k) => v === b.to[k]) &&
    a.start.every((v, k) => v === b.start[k]))

/** Keeps the worklet's wild board rolled off the board as it stands, while the
    arc has any depth. */
export function linkArc(): () => void {
  let sent: WildPack | null = null
  const update = () => {
    const c = engine.controls.get()
    const wild =
      c.arcDepth > 0 ? wildBoard(c, Math.round(c.arcSeed), shownOn(c)) : null
    if (same(wild, sent)) return
    sent = wild
    engine.setWild(wild)
  }
  update()
  const offs = [
    engine.controls.subscribe(update),
    bench.subscribe(update),
    added.subscribe(update),
  ]
  return () => {
    for (const off of offs) off()
  }
}
