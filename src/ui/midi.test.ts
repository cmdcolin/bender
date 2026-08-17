import { expect, test } from 'vitest'
import { CONTROL_KEYS } from '../controls'
import { ALL_SLIDERS, sliderFor } from './controls'
import {
  AUTOMAP_KEYS,
  bpmFromPulses,
  ccToValue,
  hasCaught,
  omit,
  parseBindings,
} from './midi'

test('a CC sweeps the whole of a control and lands on its grid', () => {
  const def = sliderFor('filtHz')
  expect(ccToValue(def, 0)).toBe(def.min)
  expect(ccToValue(def, 127)).toBe(def.max)
  for (let cc = 0; cc <= 127; cc++) {
    const v = ccToValue(def, cc)
    expect(v).toBeGreaterThanOrEqual(def.min)
    expect(v).toBeLessThanOrEqual(def.max)
  }
})

// A knob on a log control should feel like the slider on screen: half way round
// is half way along the travel, not half the frequency.
test('a curved control takes the knob through its own travel', () => {
  const def = sliderFor('filtHz')
  expect(def.curve).toBe('log')
  const mid = ccToValue(def, 64)
  expect(mid).toBeLessThan((def.min + def.max) / 2)
  expect(mid).toBeGreaterThan(def.min)
})

test('an enum control gets one step per choice', () => {
  const def = sliderFor('distMode')
  const seen = new Set<number>()
  for (let cc = 0; cc <= 127; cc++) seen.add(ccToValue(def, cc))
  expect(seen.size).toBe((def.choices ?? []).length)
})

test('a knob with nothing to catch drives at once', () => {
  const span = { min: 0, max: 1, step: 0.01 }
  expect(hasCaught(span, undefined, undefined, 0.9)).toBe(true)
})

test('a first message catches only when it lands near the value', () => {
  const span = { min: 0, max: 1, step: 0.01 }
  expect(hasCaught(span, 0.5, undefined, 0.5)).toBe(true)
  expect(hasCaught(span, 0.5, undefined, 0.51)).toBe(true)
  expect(hasCaught(span, 0.5, undefined, 0.9)).toBe(false)
})

test('a knob catches by sweeping through the value, from either side', () => {
  const span = { min: 0, max: 1, step: 0.01 }
  expect(hasCaught(span, 0.5, 0.2, 0.4)).toBe(false)
  expect(hasCaught(span, 0.5, 0.2, 0.6)).toBe(true)
  expect(hasCaught(span, 0.5, 0.9, 0.3)).toBe(true)
})

test('tempo comes off a run of ticks, and not off too few', () => {
  // 120 BPM is two beats a second, so 24 ticks a beat is one every 20.833ms.
  const at = (n: number) =>
    Array.from({ length: n }, (_, i) => i * (60000 / (120 * 24)))
  expect(bpmFromPulses(at(6))).toBeNull()
  expect(bpmFromPulses(at(25))).toBe(120)
  expect(bpmFromPulses([])).toBeNull()
})

test('a stored map keeps what still names a control and drops the rest', () => {
  const raw = JSON.stringify({
    filtHz: { channel: 0, controller: 12 },
    gonePlace: { channel: 0, controller: 13 },
    drumKick: { channel: 0, controller: 14 },
    dlyMix: { channel: 'nine', controller: 15 },
  })
  // drumKick is a control, but a sixteen-step mask no slider turns — a knob on
  // it could never be listed, and so could never be taken off again.
  expect(parseBindings(raw)).toEqual({ filtHz: { channel: 0, controller: 12 } })
})

test('a map that will not parse is no bindings, not a crash', () => {
  expect(parseBindings(null)).toEqual({})
  expect(parseBindings('{{')).toEqual({})
  expect(parseBindings('"a string"')).toEqual({})
})

test('the auto-map spine covers every slider exactly once', () => {
  expect(AUTOMAP_KEYS.length).toBe(ALL_SLIDERS.length)
  expect(new Set(AUTOMAP_KEYS).size).toBe(AUTOMAP_KEYS.length)
  for (const key of AUTOMAP_KEYS) expect(CONTROL_KEYS).toContain(key)
})

// The first row of knobs on any device should reach whether each stage is there
// at all, which is what the mixes and levels are.
test('the mixes and levels take the head of the spine', () => {
  const roles = ALL_SLIDERS.filter(s => s.role).length
  expect(roles).toBeGreaterThan(0)
  for (const key of AUTOMAP_KEYS.slice(0, roles))
    expect(sliderFor(key).role).toBeDefined()
})

test('omit copies without the key', () => {
  const map = { a: 1, b: 2 }
  expect(omit(map, 'a')).toEqual({ b: 2 })
  expect(map).toEqual({ a: 1, b: 2 })
})
