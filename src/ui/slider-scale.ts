import type { SliderDef } from './controls'

// Maps a slider's physical value to track position [0,1] and back, honoring
// the log curve. A log slider whose min is 0 gets a synthetic floor four
// decades under max; the bottom of the travel snaps to true zero.
const ZERO_DECADES = 10000

// A symlog track is a log track either side of the split's turn, mirrored so
// the turn sits where a linear track would put it — the two halves keep
// whatever share of the travel their own span earns, rather than splitting
// the track down the middle regardless of how far each side runs.
function symlogTurn(def: SliderDef): number {
  const at = def.split!.at
  return (at - def.min) / (def.max - def.min)
}

// Where each half of a symlog travel starts counting: the smallest number the
// control can actually hold, which is its own step. A floor under that is
// travel the value cannot follow — the positions there all snap to the same
// number, and the thumb springs back out from under the hand. The sampler's
// speed spent a quarter of its throw doing exactly that, springing back to
// frozen, before the floor was tied to the step.
//
// The clamp is only against a degenerate curve: a step as wide as the span
// would leave nothing to be logarithmic about.
function symlogFloor(step: number, span: number) {
  return Math.min(step, span / 2)
}

// A half of a symlog travel whose split names a `normal` is not really about
// its stop — it is ridden near `normal`, so the half splits again there, an
// equal share of its own throw either side, each side its own log run down to
// the same step-wide floor the plain curve uses at the turn. `near` and `far`
// are real distances from the stop: how far the stop is from `normal`, and
// how much span is left from `normal` out to this half's own end.
function pivotedPos(dist: number, near: number, far: number, step: number) {
  if (dist <= near) {
    const floor = symlogFloor(step, near)
    const d = near - dist
    const frac = d <= floor ? 0 : Math.log(d / floor) / Math.log(near / floor)
    return 0.5 - frac * 0.5
  }
  const floor = symlogFloor(step, far)
  const d = dist - near
  const frac = d <= floor ? 0 : Math.log(d / floor) / Math.log(far / floor)
  return 0.5 + frac * 0.5
}

function pivotedDist(t: number, near: number, far: number, step: number) {
  if (t <= 0.5) {
    const floor = symlogFloor(step, near)
    const frac = 1 - t / 0.5
    return frac < 0.02 ? near : near - floor * Math.pow(near / floor, frac)
  }
  const floor = symlogFloor(step, far)
  const frac = (t - 0.5) / 0.5
  return frac < 0.02 ? near : near + floor * Math.pow(far / floor, frac)
}

export function toPos(def: SliderDef, value: number): number {
  if (def.curve === 'symlog') {
    const { at, normal } = def.split!
    const turn = symlogTurn(def)
    if (value === at) return turn
    const below = value < at
    const span = below ? at - def.min : def.max - at
    const edge = below ? 0 : 1
    const dist = Math.abs(value - at)
    const pivot = normal === undefined ? undefined : Math.abs(normal - at)
    if (pivot !== undefined && pivot > 0 && pivot < span)
      return (
        turn + pivotedPos(dist, pivot, span - pivot, def.step) * (edge - turn)
      )
    const floor = symlogFloor(def.step, span)
    const frac =
      dist <= floor ? 0 : Math.log(dist / floor) / Math.log(span / floor)
    return turn + frac * (edge - turn)
  }
  if (def.curve !== 'log') return (value - def.min) / (def.max - def.min)
  const floor = def.min > 0 ? def.min : def.max / ZERO_DECADES
  if (value <= floor) return 0
  return Math.log(value / floor) / Math.log(def.max / floor)
}

export function fromPos(def: SliderDef, pos: number): number {
  if (def.curve === 'symlog') {
    const { at, normal } = def.split!
    const turn = symlogTurn(def)
    if (pos === turn) return at
    const below = pos < turn
    const span = below ? at - def.min : def.max - at
    const edge = below ? 0 : 1
    const t = (pos - turn) / (edge - turn)
    const pivot = normal === undefined ? undefined : Math.abs(normal - at)
    if (pivot !== undefined && pivot > 0 && pivot < span) {
      const dist = pivotedDist(t, pivot, span - pivot, def.step)
      return below ? at - dist : at + dist
    }
    const floor = symlogFloor(def.step, span)
    if (t < 0.02) return at
    const dist = floor * Math.pow(span / floor, t)
    return below ? at - dist : at + dist
  }
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

// The reading grows and shrinks with what it says — the sampler's speed is
// "frozen" in the middle and "2.40× reverse" a nudge off it — and a box cut to
// the current one drags the track sideways under the hand that is moving it. So
// the box is cut to the widest thing the control can ever print, which means
// walking its travel once and keeping the answer.
const READOUT_STOPS = 101
const readoutWidths = new Map<SliderDef, number>()

export function readoutChars(def: SliderDef): number {
  const kept = readoutWidths.get(def)
  if (kept !== undefined) return kept
  let chars = 0
  for (let i = 0; i < READOUT_STOPS; i++) {
    const at = fromPos(def, i / (READOUT_STOPS - 1))
    chars = Math.max(chars, formatValue(def, at).length)
  }
  readoutWidths.set(def, chars)
  return chars
}
