import { expect, test } from 'vitest'

import {
  ALL_SLIDERS,
  sliderFor,
  snapToStep,
  type SliderDef,
} from './controls/index.ts'
import {
  formatValue,
  fromPos,
  ordinary,
  parseTyped,
  readoutChars,
  toPos,
} from './slider-scale.ts'

// The maths under every knob: where a value sits on a thousand-position track,
// what comes back when you drop the thumb there, and what the row prints.

const def = (over: Partial<SliderDef> = {}): SliderDef => ({
  key: 'outGain',
  label: 'test',
  min: 0,
  max: 1,
  step: 0.01,
  unit: '',
  help: '',
  ...over,
})

test('a linear track runs end to end', () => {
  const d = def({ min: 20, max: 120 })
  expect(toPos(d, 20)).toBe(0)
  expect(toPos(d, 120)).toBe(1)
  expect(toPos(d, 70)).toBeCloseTo(0.5)
  expect(fromPos(d, 0.5)).toBeCloseTo(70)
})

// A log control spends half its travel on its bottom decade, which is the whole
// point of one: 20 Hz to 200 Hz is as much of the sweep as 200 Hz to 2 kHz.
test('a log track is even in decades, not in hertz', () => {
  const d = def({ min: 20, max: 2000, step: 0.1, curve: 'log' })
  expect(toPos(d, 20)).toBe(0)
  expect(toPos(d, 2000)).toBe(1)
  expect(toPos(d, 200)).toBeCloseTo(0.5)
})

// A log slider has no zero to reach — the bottom of the travel is a floor four
// decades under the top — so the bottom of the *track* is wired to true zero
// instead, and a hair above it is already back on the curve.
test('a log control that starts at zero can still be turned off', () => {
  const d = def({ min: 0, max: 8000, step: 1, curve: 'log' })
  expect(fromPos(d, 0)).toBe(0)
  expect(fromPos(d, 0.01)).toBe(0)
  expect(fromPos(d, 0.03)).toBeGreaterThan(0)
  expect(toPos(d, 0)).toBe(0)
})

// A symlog control gives the run near its stop more of the track than the run
// out to its ends, on both sides of the turn alike.
test('a symlog track spends more travel near the split than the ends', () => {
  const d = def({
    min: -4,
    max: 4,
    step: 0.01,
    curve: 'symlog',
    split: { at: 0 },
  })
  expect(toPos(d, -4)).toBeCloseTo(0)
  expect(toPos(d, 0)).toBeCloseTo(0.5)
  expect(toPos(d, 4)).toBeCloseTo(1)
  // Half of one side's travel lands well short of half that side's range.
  expect(fromPos(d, 0.25)).toBeGreaterThan(-1)
  expect(fromPos(d, 0.75)).toBeLessThan(1)
})

// Naming a `normal` moves the run's centre off the stop and onto the value a
// hand actually rides near, an equal share of each half's own throw either
// side of it — the ends and the stop both give way to it.
test('a symlog split with a normal spends its travel there instead of at the stop', () => {
  const d = def({
    min: -4,
    max: 4,
    step: 0.001,
    curve: 'symlog',
    split: { at: 0, normal: 1 },
  })
  expect(toPos(d, -4)).toBeCloseTo(0)
  expect(toPos(d, 0)).toBeCloseTo(0.5)
  expect(toPos(d, 1)).toBeCloseTo(0.75)
  expect(toPos(d, -1)).toBeCloseTo(0.25)
  expect(toPos(d, 4)).toBeCloseTo(1)
  // A hair off the turn is already most of the way to ordinary speed — the
  // stop is the coarse end of this run now, not the fine one.
  expect(fromPos(d, 0.7)).toBeGreaterThan(0.9)
  expect(fromPos(d, 0.501)).toBeLessThan(0.1)
})

// Where the track resolves finer than the value can, a band of positions all
// snap to the same number and the thumb springs back out from under the hand.
// The sampler's speed used to spend 137 of its thousand positions doing that,
// all of them landing on frozen — a quarter of the throw fighting the drag. The
// floor is the control's own step now, so nothing collapses a band wider than
// the detent that is deliberately there. DETENT in Slider.tsx is 0.02 of the
// travel either side of the turn, so 20 positions is the pull you asked for.
const DEADBAND = 25

test('a curved split travel never springs the thumb further than its own detent', () => {
  const sprung: string[] = []
  for (const d of ALL_SLIDERS) {
    if (d.curve !== 'symlog' && !d.knots) continue
    for (let i = 0; i <= 1000; i++) {
      const back = Math.round(
        toPos(d, snapToStep(d, fromPos(d, i / 1000))) * 1000,
      )
      if (Math.abs(back - i) > DEADBAND)
        sprung.push(`${d.key} at ${i} → ${back}`)
    }
  }
  expect(sprung.slice(0, 5)).toEqual([])
})

test('a knot track runs straight through zero and in octaves either side', () => {
  const d = def({
    min: -4,
    max: 4,
    step: 0.001,
    knots: [
      [-4, 0],
      [-1, 0.1],
      [0, 0.25],
      [1, 0.75],
      [4, 1],
    ],
  })
  expect(toPos(d, -4)).toBe(0)
  expect(toPos(d, 0)).toBe(0.25)
  expect(toPos(d, 0.5)).toBeCloseTo(0.5)
  expect(toPos(d, 2)).toBeCloseTo(0.875)
  expect(toPos(d, -2)).toBeCloseTo(0.05)
  expect(fromPos(d, 0.625)).toBeCloseTo(0.75)
  expect(fromPos(d, 0.875)).toBeCloseTo(2)
  expect(fromPos(d, 0)).toBe(-4)
  expect(fromPos(d, 1)).toBe(4)
})

test('the tape slows from ×1 to frozen evenly over half the track', () => {
  const d = sliderFor('sampleSpeed')
  const span = toPos(d, 1) - toPos(d, 0)
  expect(span).toBeCloseTo(0.5)
  for (const v of [0.1, 0.3, 0.5, 0.7, 0.9])
    expect(toPos(d, v) - toPos(d, 0)).toBeCloseTo(v * span)
})

// Every control has to be able to reach both of its own ends off the track,
// because the track is the only way a pointer reaches it.
test('every slider reaches both of its ends', () => {
  for (const d of ALL_SLIDERS) {
    if (d.choices) continue
    expect([d.key, snapToStep(d, fromPos(d, 0))]).toEqual([d.key, d.min])
    expect([d.key, snapToStep(d, fromPos(d, 1))]).toEqual([d.key, d.max])
  }
})

test('a normal stretch takes three quarters of the track', () => {
  const d = def({ min: 0, max: 4, normal: [0, 1] })
  expect(toPos(d, 0)).toBe(0)
  expect(toPos(d, 1)).toBeCloseTo(0.75)
  expect(toPos(d, 4)).toBe(1)
  expect(fromPos(d, 0.375)).toBeCloseTo(0.5)
  expect(fromPos(d, 0.875)).toBeCloseTo(2.5)
})

test('a normal stretch in the middle shares the rest between both ends', () => {
  const d = def({ min: -2, max: 2, normal: [-1, 1] })
  expect(toPos(d, -1)).toBeCloseTo(0.125)
  expect(toPos(d, 0)).toBeCloseTo(0.5)
  expect(toPos(d, 1)).toBeCloseTo(0.875)
  expect(fromPos(d, 0)).toBe(-2)
  expect(fromPos(d, 1)).toBe(2)
})

test('every value on a normal-stretch slider maps back to itself', () => {
  for (const d of ALL_SLIDERS) {
    if (!d.normal) continue
    for (let v = d.min; v <= d.max; v += d.step * 7) {
      const back = snapToStep(d, fromPos(d, toPos(d, v)))
      expect([d.key, back]).toEqual([d.key, snapToStep(d, v)])
    }
  }
})

test('ordinary cuts a slider down to its normal stretch', () => {
  const d = sliderFor('fmFeedback')
  expect(ordinary(d)).toMatchObject({ min: 0, max: 7, normal: undefined })
  expect(ordinary(sliderFor('fmVoice'))).toBe(sliderFor('fmVoice'))
})

test('the readout keeps significant figures, not decimal places', () => {
  expect(formatValue(def({ unit: 'Hz' }), 8000)).toBe('8000 Hz')
  expect(formatValue(def({ unit: 'Hz' }), 123.456)).toBe('123.5 Hz')
  expect(formatValue(def(), 0.5)).toBe('0.50')
})

test('the readout stops at the places its step can reach', () => {
  const half = def({ min: -15, max: 15, step: 0.5, unit: 'dB' })
  expect(formatValue(half, 3.1667)).toBe('3.2 dB')
  expect(formatValue(def({ step: 1, unit: 'Hz' }), 50)).toBe('50 Hz')
})

// A step the readout cannot print is a knob you turn while the number sits
// still. Latch hold and the watchdog step in thousandths of a volt.
test('a step finer than two places gets a third', () => {
  const fine = def({ min: 0.01, max: 0.19, step: 0.005, unit: 'V' })
  expect(formatValue(fine, 0.01)).toBe('0.010 V')
  expect(formatValue(fine, 0.015)).not.toBe(formatValue(fine, 0.01))
})

// Every control that steps inside one printed place has to be able to show its
// own step, or the knob moves and the number sits still.
//
// Tune is the one left alone. Its step of 0.01 prints fine — but the control
// starts at 0.125, so every value it can hold sits on a rounding boundary and
// two neighbours occasionally land on the same reading: one step in eight
// hundred, against a third decimal place that would print 8.000× at the top of
// the same sweep.
test('a control stepping finer than the printed place can show it', () => {
  const blind: string[] = []
  for (const d of ALL_SLIDERS) {
    if (d.choices || d.step >= 0.01) continue
    for (let i = 0; ; i++) {
      const v = snapToStep(d, d.min + i * d.step)
      if (v >= d.max) break
      if (formatValue(d, v) === formatValue(d, snapToStep(d, v + d.step))) {
        blind.push(`${d.key} at ${v}`)
        break
      }
    }
  }
  expect(blind).toEqual([])
})

test('a choice reads as its own name', () => {
  const d = def({
    min: 0,
    max: 2,
    step: 1,
    choices: ['off', 'to ground', 'cut'],
  })
  expect(formatValue(d, 1)).toBe('to ground')
  expect(formatValue(d, 9)).toBe('9')
})

// The readout reserves its box up front, from a coarse walk of the travel. A
// reading that overran it would push the track sideways mid-drag, which is the
// one thing the box is there to stop — so walk the travel far finer than the
// box was cut from and check nothing sticks out.
test('the reserved readout fits every reading a control can print', () => {
  const over: string[] = []
  for (const d of ALL_SLIDERS) {
    if (d.choices) continue
    const box = readoutChars(d)
    for (let i = 0; i <= 1000; i++) {
      const reading = formatValue(d, snapToStep(d, fromPos(d, i / 1000)))
      if (reading.length > box) over.push(`${d.key}: ${reading}`)
    }
  }
  expect([...new Set(over)]).toEqual([])
})

test('a typed value lands stepped and clamped, in the control units', () => {
  const hz = def({ min: 20, max: 20000, step: 1, unit: 'Hz' })
  expect(parseTyped(hz, '440')).toBe(440)
  expect(parseTyped(hz, '8k')).toBe(8000)
  expect(parseTyped(hz, '2.5 kHz')).toBe(2500)
  expect(parseTyped(hz, '99999')).toBe(20000)
  expect(parseTyped(hz, 'loud')).toBeUndefined()
  const secs = def({ min: 0, max: 2, step: 0.01, unit: 's' })
  expect(parseTyped(secs, '250ms')).toBe(0.25)
  expect(parseTyped(secs, '0.5 s')).toBe(0.5)
  expect(parseTyped(def(), '.333')).toBe(0.33)
  expect(parseTyped(def({ min: -1 }), '-0.5')).toBe(-0.5)
})
