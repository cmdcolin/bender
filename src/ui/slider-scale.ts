import type { SliderDef } from './controls'

// Maps a slider's physical value to track position [0,1] and back, honoring
// the log curve. A log slider whose min is 0 gets a synthetic floor four
// decades under max; the bottom of the travel snaps to true zero.
const ZERO_DECADES = 10000

export function toPos(def: SliderDef, value: number): number {
  if (def.curve !== 'log') return (value - def.min) / (def.max - def.min)
  const floor = def.min > 0 ? def.min : def.max / ZERO_DECADES
  if (value <= floor) return 0
  return Math.log(value / floor) / Math.log(def.max / floor)
}

export function fromPos(def: SliderDef, pos: number): number {
  if (def.curve !== 'log') return def.min + pos * (def.max - def.min)
  const floor = def.min > 0 ? def.min : def.max / ZERO_DECADES
  const v = floor * Math.pow(def.max / floor, pos)
  if (def.min === 0 && pos < 0.02) return 0
  return v
}

export function formatValue(def: SliderDef, value: number): string {
  if (def.choices) return def.choices[Math.round(value) - def.min] ?? String(value)
  const abs = Math.abs(value)
  const text =
    abs >= 1000
      ? value.toFixed(0)
      : abs >= 100
        ? value.toFixed(1)
        : abs >= 10
          ? value.toFixed(1)
          : value.toFixed(2)
  return def.unit ? `${text} ${def.unit}` : text
}
