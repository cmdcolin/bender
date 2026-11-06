import {
  MAX_SOURCES,
  SOURCE_TAPS,
  TAP_MIC,
  type SourceTap,
} from './engine/params.ts'
import { PEDALS } from './pedals.ts'

import type { ControlKey } from './controls.ts'

/** What each choice of a unit's Patched into control cables it onto, as a
    meter tap: −1 for the master run, then the mic, then the sources in
    SOURCE_TAPS order, so a machine added to that list joins on the end. */
export const JACK_TAPS: readonly number[] = [
  -1,
  TAP_MIC,
  ...Array.from({ length: MAX_SOURCES }, (_, k) => k),
]

export const jackTap = (v: number) => JACK_TAPS[Math.round(v)] ?? -1

export const jackOf = (tap: number) => Math.max(JACK_TAPS.indexOf(tap), 0)

export const jackFor = (source: SourceTap) =>
  jackOf(SOURCE_TAPS.indexOf(source))

/** The bends' jacks, in bend id order (id 1 first). */
export const BEND_INTO_KEYS = [
  'ringInto',
  'crushInto',
  'distInto',
  'combInto',
  'glitchInto',
  'filtInto',
  'shiftInto',
  'octInto',
  'codecInto',
  'rackInto',
] as const satisfies readonly ControlKey[]

export const JACK_KEYS: ReadonlySet<ControlKey> = new Set<ControlKey>([
  ...BEND_INTO_KEYS,
  ...PEDALS.map(p => p.into),
])
