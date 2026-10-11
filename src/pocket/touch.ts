import { BEND_SLOT_KEYS } from '../ui/controls'
import { inChain } from '../ui/presets/scenarios'

import type { Controls } from '../controls'

export const TOUCH = 'pocket:touch'

const LOW_HZ = 120
const HIGH_HZ = 7000
const FILTER = 'Screech filter'
const FILTER_SLOT = 6

const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1)

/** A finger on the stage: across sweeps the screech filter, up feeds the tape
    delay back on itself, past 1 at the top. A board without the filter in its
    chain lends the last bend slot to it for as long as the finger is down. */
export function touchPush(
  x: number,
  y: number,
  c: Controls,
): Partial<Controls> {
  const across = clamp01(x)
  const up = clamp01(y)
  return {
    ...(inChain(c, FILTER) ? {} : { [BEND_SLOT_KEYS.at(-1)!]: FILTER_SLOT }),
    filtMix: 1,
    filtHz: Math.round(LOW_HZ * (HIGH_HZ / LOW_HZ) ** across),
    filtRes: Math.max(c.filtRes, 0.8),
    dlySend: 1,
    dlyMix: Math.max(c.dlyMix, 0.2 + 0.5 * up),
    dlyFb: Math.round((0.3 + 0.95 * up) * 100) / 100,
  }
}
