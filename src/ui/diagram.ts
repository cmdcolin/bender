import { useState } from 'react'

import {
  DEFAULT_CONTROLS,
  type ControlKey,
  type Controls,
} from '../controls.ts'
import { sliderFor, TRACK_NUMBERS } from './controls/index.ts'
import { useBoardValue } from './ControlsContext.ts'

// CROSS_REPO_SYNC(diagram-boxes)
export const LINE_H = 13
const PAD = 7

export interface BoxSpec {
  x: number
  y: number
  w: number
  /** Taller than its text needs, so a row of boxes shares one height. */
  h?: number
  /** A `\n` breaks the name over two lines. */
  name: string
  off?: boolean
  touched: boolean
  help: string
  /** Pressing the box picks it, and the rows under the drawing become its
      `keys`. A box with no keys is drawn and does nothing. */
  id?: string
  keys?: readonly ControlKey[]
  note?: string
}

// Which box the drawing has open. A second press on it puts the rows away.
export function useSelectedBox(initial: string | null = null) {
  const [selected, setSelected] = useState<string | null>(initial)
  return {
    selected,
    toggle: (id: string) => setSelected(now => (now === id ? null : id)),
  }
}

export const CHAR_W = 5.8

export const boxWidth = (name: string) =>
  Math.ceil(
    Math.max(...name.split('\n').map(line => line.length * CHAR_W)) + 2 * PAD,
  )

export const boxHeight = (name: string) =>
  PAD + LINE_H * name.split('\n').length
// CROSS_REPO_SYNC_END(diagram-boxes)

// Whether a row has anything to act on yet: a fault waits for a wire to be cut,
// and a row you have already moved stays whatever the switch beside it says.
export const rowShown = (key: ControlKey, c: Controls) => {
  const needs = sliderFor(key).needs
  return !needs || needs(c) || c[key] !== DEFAULT_CONTROLS[key]
}

// The knobs a drawing reads, off the board as one string so the drawing redraws
// only for a write that moved one of them.
export function useReadings<K extends ControlKey>(keys: readonly K[]) {
  const joined = useBoardValue(c => keys.map(k => c[k]).join('|'))
  const values = joined.split('|').map(Number)
  const value = (key: K) => values[keys.indexOf(key)]!
  return {
    value,
    touched: (...ks: K[]) => ks.some(k => value(k) !== DEFAULT_CONTROLS[k]),
  }
}

// The knobs of a strip that no lane carries: the input and the fader are in the
// lane, so every other control of the channel sits in one of the boxes.
const STRIP_SUFFIXES = [
  'Trim',
  'Low',
  'MidHz',
  'Mid',
  'High',
  'Send',
  'Pan',
  'Rec',
  'Erase',
  'Cue',
  'Len',
] as const

export const STRIP_KEYS = TRACK_NUMBERS.flatMap(t =>
  STRIP_SUFFIXES.map(n => `four${t}${n}` as const),
)

export const GLYPH_GAP = 4

/** The width of a box holding a glyph `glyphW` wide beside its name. */
export const glyphBoxWidth = (name: string, glyphW: number) =>
  boxWidth(name) + glyphW + GLYPH_GAP
