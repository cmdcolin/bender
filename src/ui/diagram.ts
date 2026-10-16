import { useState } from 'react'

import { DEFAULT_CONTROLS, type ControlKey } from '../controls'
import { sliderFor, TRACK_NUMBERS } from './controls'
import { useBoardValue } from './ControlsContext'
import { formatValue } from './slider-scale'

export const LINE_H = 11
const PAD = 6

export interface BoxSpec {
  x: number
  y: number
  w: number
  name: string
  value: string | string[]
  off?: boolean
  touched: boolean
  help: string
  /** What the box is called when it is pressed: it picks the box, and the
      rows under the drawing become its `keys`. A box with no keys is drawn and
      does nothing. */
  id?: string
  keys?: readonly ControlKey[]
  /** A line said above the rows, for the box whose knobs overwrite something. */
  note?: string
}

// Which box the drawing has open. A second press on it puts the rows away.
export function useSelectedBox() {
  const [selected, setSelected] = useState<string | null>(null)
  return {
    selected,
    toggle: (id: string) => setSelected(now => (now === id ? null : id)),
  }
}

export const boxHeight = (value: string | string[]) =>
  PAD + LINE_H * (1 + (Array.isArray(value) ? value.length : 1))

// The figures a drawing prints, read off the board as one string so the drawing
// redraws only for a write that moved one of them.
export function useReadings<K extends ControlKey>(keys: readonly K[]) {
  const joined = useBoardValue(c => keys.map(k => c[k]).join('|'))
  const values = joined.split('|').map(Number)
  const value = (key: K) => values[keys.indexOf(key)]!
  return {
    value,
    read: (key: K) => formatValue(sliderFor(key), value(key)),
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
