import {
  MAX_SOURCES,
  SOURCE_TAPS,
  TAP_MIC,
  type SourceTap,
} from './engine/params.ts'
import { PEDALS } from './pedals.ts'

import type { ControlKey } from './controls.ts'

export const JACK_TAPS: readonly number[] = [
  -1,
  TAP_MIC,
  ...Array.from({ length: MAX_SOURCES }, (_, k) => k),
]

export const LINE_TAPS: readonly number[] = JACK_TAPS.slice(1)

export const LINE_COUNT = LINE_TAPS.length

export const ALL_LINES = 2 ** LINE_COUNT - 1

const TAP_BIT_OF_LINE = Int32Array.from(LINE_TAPS, t => 1 << t)

export function tapMaskOf(lines: number) {
  const v = Math.round(lines)
  let mask = 0
  for (let j = 0; j < LINE_COUNT; j++)
    if (v & (1 << j)) mask |= TAP_BIT_OF_LINE[j]!
  return mask
}

export function linesOfTaps(taps: number) {
  let lines = 0
  for (let j = 0; j < LINE_COUNT; j++)
    if (taps & TAP_BIT_OF_LINE[j]!) lines |= 1 << j
  return lines
}

export const lineOf = (tap: number) => {
  const j = LINE_TAPS.indexOf(tap)
  return j < 0 ? 0 : 2 ** j
}

export const lineFor = (...sources: SourceTap[]) =>
  sources.reduce((m, s) => m | lineOf(SOURCE_TAPS.indexOf(s)), 0)

export const linesFromJack = (jack: number) => {
  const v = Math.round(jack)
  return v > 0 && v <= LINE_COUNT ? 2 ** (v - 1) : 0
}

export const lineList = (lines: number) => {
  const v = Math.round(lines)
  return LINE_TAPS.flatMap((t, j) => (v & (1 << j) ? [t] : []))
}

export const BEND_LINE_KEYS = [
  'ringLines',
  'crushLines',
  'distLines',
  'combLines',
  'glitchLines',
  'filtLines',
  'shiftLines',
  'octLines',
  'codecLines',
  'rackLines',
] as const satisfies readonly ControlKey[]

export const UNIT_LINE_KEYS: readonly ControlKey[] = [
  ...BEND_LINE_KEYS,
  ...PEDALS.map(p => p.into),
]

export const JACK_KEYS: ReadonlySet<ControlKey> = new Set<ControlKey>(
  UNIT_LINE_KEYS,
)
