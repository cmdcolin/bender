import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS } from './controls.ts'
import {
  DRUM_ROMS,
  GRID_ROWS,
  heardStep,
  PATTERN_KEYS,
  STEPS,
  hasStep,
  parseRow,
  romMatching,
  rowText,
  stepBit,
  toggleStep,
  type DrumMasks,
} from './drums.ts'

test('parseRow reads hits, dice hits and rests, and rowText writes them back', () => {
  const row = parseRow('X...|?.x.')
  expect(row).toEqual({
    mask: stepBit(0) | stepBit(6),
    maybe: stepBit(4),
    len: 8,
  })
  expect(rowText(row.mask, row.maybe, row.len)).toBe('x...?.x.')
  expect(parseRow('')).toEqual({ mask: 0, maybe: 0, len: STEPS })
  expect(() => parseRow('x-x')).toThrow("'-' is not a step")
  expect(() => parseRow('.'.repeat(STEPS + 1))).toThrow(`${STEPS + 1} steps`)
})

test('step 1 is the high bit, so a mask literal reads like the grid', () => {
  expect(stepBit(0)).toBe(0b1000_0000_0000_0000)
  expect(stepBit(STEPS - 1)).toBe(1)
  expect(hasStep(0b0010_0010_0010_0010, 2)).toBe(true)
  expect(hasStep(0b0010_0010_0010_0010, 3)).toBe(false)
})

test('toggling a step leaves every other step alone', () => {
  const mask = 0b1000_0000_1001_0000
  for (let s = 0; s < STEPS; s++) {
    const flipped = toggleStep(mask, s)
    expect(hasStep(flipped, s)).toBe(!hasStep(mask, s))
    expect(toggleStep(flipped, s)).toBe(mask)
  }
})

test('every ROM fits sixteen steps', () => {
  for (const rom of DRUM_ROMS) {
    for (const row of GRID_ROWS) {
      const mask = rom.masks[row.key]
      expect(Number.isInteger(mask), `${rom.name}/${row.key}`).toBe(true)
      expect(mask, `${rom.name}/${row.key}`).toBeGreaterThanOrEqual(0)
      expect(mask, `${rom.name}/${row.key}`).toBeLessThan(1 << STEPS)
    }
  }
})

test('the machine boots blank', () => {
  const booted = Object.fromEntries(
    PATTERN_KEYS.map(k => [k, DEFAULT_CONTROLS[k]]),
  ) as DrumMasks
  expect(romMatching(booted)?.name).toBe('clear')
})

test('clear wipes every voice', () => {
  const cleared = DRUM_ROMS.find(r => r.name === 'clear')!
  expect(Object.values(cleared.masks).every(m => m === 0)).toBe(true)
})

const report = { tick: 8, clock: 0.2, stepMs: 100, ageMs: 0, latencyMs: 0 }

test('a hit is placed by carrying the counter forward from its report', () => {
  expect(heardStep(report)).toEqual({ tick: 8, phase: 0.2 })
  const later = heardStep({ ...report, ageMs: 50 })
  expect(later.tick).toBe(8)
  expect(later.phase).toBeCloseTo(0.7)
})

// The counter runs ahead of the ear, so the step heard trails the one reported,
// by more than a step on Bluetooth.
test('output latency puts the hit on the step the listener heard', () => {
  const heard = heardStep({ ...report, latencyMs: 250 })
  expect(heard.tick).toBe(5)
  expect(heard.phase).toBeCloseTo(0.7)
})

test('swing makes the steps a hit is carried across uneven', () => {
  const span = (t: number) => (t % 2 === 0 ? 1.4 : 0.6)
  const heard = heardStep({ ...report, clock: 1.2, ageMs: 30 }, span)
  expect(heard.tick).toBe(9)
  expect(heard.phase).toBeCloseTo(0.1 / 0.6)
})

// A report older than its own step comes from a clock nobody is reading: the
// tab is hidden or the audio never started.
test('a stale report is read as it stood', () => {
  expect(heardStep({ ...report, ageMs: 5000, latencyMs: 250 })).toEqual({
    tick: 8,
    phase: 0.2,
  })
})
