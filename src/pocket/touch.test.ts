import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS } from '../controls'
import { BEND_SLOT_KEYS } from '../ui/controls'
import { touchPush } from './touch'

const LAST_SLOT = BEND_SLOT_KEYS.at(-1)!

test('across sweeps the filter from low to high', () => {
  const left = touchPush(0, 0.5, DEFAULT_CONTROLS)
  const right = touchPush(1, 0.5, DEFAULT_CONTROLS)
  expect(left.filtHz).toBeLessThan(200)
  expect(right.filtHz).toBeGreaterThan(5000)
  expect(left.filtMix).toBe(1)
})

test('the top of the stage feeds the delay back past 1', () => {
  expect(touchPush(0.5, 0, DEFAULT_CONTROLS).dlyFb).toBeLessThan(1)
  expect(touchPush(0.5, 1, DEFAULT_CONTROLS).dlyFb).toBeGreaterThan(1)
})

test('a board without the filter in its chain lends it the last slot', () => {
  expect(touchPush(0.5, 0.5, DEFAULT_CONTROLS)).not.toHaveProperty(LAST_SLOT)
  const noFilter = { ...DEFAULT_CONTROLS }
  for (const k of BEND_SLOT_KEYS) noFilter[k] = 0
  expect(touchPush(0.5, 0.5, noFilter)[LAST_SLOT]).toBe(6)
})
