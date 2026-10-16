import { DEFAULT_CONTROLS, type ControlKey } from '../controls'
import { sliderFor } from './controls'
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
