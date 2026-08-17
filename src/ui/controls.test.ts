import { expect, test } from 'vitest'
import { CONTROL_KEYS, DEFAULT_CONTROLS } from '../controls'
import { ALL_SLIDERS, sliderFor } from './controls'

test('every control has exactly one slider', () => {
  const keys = ALL_SLIDERS.map(s => s.key)
  expect(new Set(keys).size).toBe(keys.length)
  expect([...keys].sort()).toEqual([...CONTROL_KEYS].sort())
})

test('defaults sit inside slider ranges', () => {
  for (const k of CONTROL_KEYS) {
    const def = sliderFor(k)
    const v = DEFAULT_CONTROLS[k]
    expect(v, k).toBeGreaterThanOrEqual(def.min)
    expect(v, k).toBeLessThanOrEqual(def.max)
  }
})

test('choice sliders are integer enums covering their range', () => {
  for (const def of ALL_SLIDERS) {
    if (!def.choices) continue
    expect(def.step, def.key).toBe(1)
    expect(def.choices.length, def.key).toBe(def.max - def.min + 1)
  }
})

test('log sliders have a positive floor or zero minimum', () => {
  for (const def of ALL_SLIDERS) {
    if (def.curve === 'log') expect(def.min, def.key).toBeGreaterThanOrEqual(0)
  }
})
