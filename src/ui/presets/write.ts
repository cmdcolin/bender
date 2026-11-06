import {
  GRID_ROWS,
  parseCells,
  parseRow,
  RATCHET_KEYS,
  RATCHETS,
  RETRIG_KEYS,
  EVENT_KEYS,
  rowMasks,
} from '../../drums.ts'
import { MEMORY_SYNC_MODES } from '../../dsp/melodyMemory.ts'
import { YOURS as YOUR_TUNE } from '../../dsp/stages/roms.ts'
import { SYNC_MODES } from '../../dsp/stages/toyChip.ts'
import {
  LEAD_SEQ_STEP_KEYS,
  MONO_SEQ_STEP_KEYS,
  parseLane,
  parseSeqFlags,
  REST,
  TUNE_LANE_KEYS,
} from '../../tune.ts'

import type { Controls } from '../../controls.ts'

/** Growler's memory stepping with the kit's sixteenths, its gate jumper cut so
    the toy's tune stays off it. */
export function line(
  notes: string,
  accent = '',
  slide = '',
): Partial<Controls> {
  const steps = parseLane(notes)
  const [monoSeqAccentLo, monoSeqAccentHi] = parseSeqFlags(accent)
  const [monoSeqSlideLo, monoSeqSlideHi] = parseSeqFlags(slide)
  return {
    ...Object.fromEntries(
      MONO_SEQ_STEP_KEYS.map((k, i) => [k, steps[i] ?? REST]),
    ),
    monoSeqOn: 1,
    monoSeqTo: 0,
    monoSeqSync: MEMORY_SYNC_MODES.indexOf('sixteenths'),
    monoSeqLen: steps.length,
    monoSeqAccentLo,
    monoSeqAccentHi,
    monoSeqSlideLo,
    monoSeqSlideHi,
    monoKeyGate: 1,
  }
}

/** Howler's memory, the same way, with Howler's own gate jumper cut. */
export function lead(
  notes: string,
  accent = '',
  slide = '',
): Partial<Controls> {
  const steps = parseLane(notes)
  const [leadSeqAccentLo, leadSeqAccentHi] = parseSeqFlags(accent)
  const [leadSeqSlideLo, leadSeqSlideHi] = parseSeqFlags(slide)
  return {
    ...Object.fromEntries(
      LEAD_SEQ_STEP_KEYS.map((k, i) => [k, steps[i] ?? REST]),
    ),
    leadSeqOn: 1,
    leadSeqSync: MEMORY_SYNC_MODES.indexOf('sixteenths'),
    leadSeqLen: steps.length,
    leadSeqAccentLo,
    leadSeqAccentHi,
    leadSeqSlideLo,
    leadSeqSlideHi,
    leadKeyGate: 1,
  }
}

/** The toy's melody memory, a lane of notes and up to two of chord under it,
    counted off the kit's sixteenths. */
export function tune(melody: string, ...stacks: string[]): Partial<Controls> {
  const lanes = [melody, ...stacks].map(parseLane)
  return {
    ...Object.fromEntries(
      TUNE_LANE_KEYS.flatMap((keys, lane) =>
        keys.map((k, i) => [k, lanes[lane]?.[i] ?? REST]),
      ),
    ),
    chipTune: YOUR_TUNE,
    tuneLen: Math.max(...lanes.map(l => l.length)),
    tunePoly: stacks.length > 0 ? 1 : 0,
    chipSync: SYNC_MODES.indexOf('sixteenths'),
  }
}

type KitRow =
  | (typeof GRID_ROWS)[number]['label']
  | 'ratchet'
  | 'retrig'
  | 'event'

/** The kit's grid, a row of text a voice, as the grid reads it back. */
export function kit(rows: Partial<Record<KitRow, string>>): Partial<Controls> {
  const out: Partial<Controls> = Object.fromEntries(
    GRID_ROWS.flatMap(r => rowMasks(r).map(k => [k, 0])),
  )
  for (const row of GRID_ROWS) {
    const text = rows[row.label]
    if (text !== undefined) {
      const { mask, maybe, ghost, len, ratchets } = parseRow(text)
      out[row.key] = mask
      if (row.maybe) out[row.maybe] = maybe
      if (row.ghost) out[row.ghost] = ghost
      out[row.len] = len
      for (const [s, count] of Object.entries(ratchets))
        out[RATCHET_KEYS[Number(s)]!] = RATCHETS.indexOf(count)
    }
  }
  if (rows.ratchet !== undefined)
    for (const [s, v] of parseCells('ratchet', rows.ratchet).entries())
      out[RATCHET_KEYS[s]!] = v
  if (rows.retrig !== undefined)
    for (const [s, v] of parseCells('retrig', rows.retrig).entries())
      out[RETRIG_KEYS[s]!] = v
  if (rows.event !== undefined)
    for (const [s, v] of parseCells('event', rows.event).entries())
      out[EVENT_KEYS[s]!] = v
  return out
}
