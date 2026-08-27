import { expect, test } from 'vitest'
import { ALL_SLIDERS, snapToStep, type SliderDef } from './controls'
import { formatValue, fromPos, toPos } from './slider-scale'

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

// Every control has to be able to reach both of its own ends off the track,
// because the track is the only way a pointer reaches it.
test('every slider reaches both of its ends', () => {
  for (const d of ALL_SLIDERS) {
    if (d.choices) continue
    expect([d.key, snapToStep(d, fromPos(d, 0))]).toEqual([d.key, d.min])
    expect([d.key, snapToStep(d, fromPos(d, 1))]).toEqual([d.key, d.max])
  }
})

test('the readout keeps significant figures, not decimal places', () => {
  expect(formatValue(def({ unit: 'Hz' }), 8000)).toBe('8000 Hz')
  expect(formatValue(def({ unit: 'Hz' }), 123.456)).toBe('123.5 Hz')
  expect(formatValue(def(), 0.5)).toBe('0.50')
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
