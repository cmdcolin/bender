import { expect, test } from 'vitest'
import { DEFAULT_CONTROLS } from './controls'
import {
  DRUM_ROMS,
  GRID_ROWS,
  PATTERN_KEYS,
  STEPS,
  hasStep,
  romMatching,
  stepBit,
  toggleStep,
  type DrumMasks,
} from './drums'

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

test('the machine boots on the rock ROM', () => {
  const booted = Object.fromEntries(
    PATTERN_KEYS.map(k => [k, DEFAULT_CONTROLS[k]]),
  ) as DrumMasks
  expect(romMatching(booted)?.name).toBe('rock')
})

test('clear wipes every voice', () => {
  const cleared = DRUM_ROMS.find(r => r.name === 'clear')!
  expect(Object.values(cleared.masks).every(m => m === 0)).toBe(true)
})
