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

// Significant figures rather than decimal places: 8 kHz wants none and a mix
// wants two, and a readout that gave both the same is either noise at the top or
// a number that will not move at the bottom.
//
// Which is the other half of it — a step finer than the printed place is a knob
// you can turn while the number sits still, so a control stepping in
// thousandths gets the third place to show it. The tiers above it are all
// coarser than their own step by a wide margin and mean to be.
export function formatValue(def: SliderDef, value: number): string {
  if (def.reads) return def.reads(value)
  if (def.choices)
    return def.choices[Math.round(value) - def.min] ?? String(value)
  const abs = Math.abs(value)
  const text =
    abs >= 1000
      ? value.toFixed(0)
      : abs >= 10
        ? value.toFixed(1)
        : value.toFixed(def.step < 0.01 ? 3 : 2)
  return def.unit ? `${text} ${def.unit}` : text
}
