import { expect, test } from 'vitest'

import { landingTick, msUntilTick } from './phraseClock.ts'

const at = (tick: number, clock = 0) => ({
  tick,
  clock,
  stepMs: 125,
  ageMs: 0,
})

test('a cut lands on the next downbeat of the run', () => {
  expect(landingTick(at(5), 1, 0)).toBe(16)
  expect(landingTick(at(16), 4, 0)).toBe(64)
  expect(landingTick(at(64), 4, 0)).toBe(128)
})

test('a morph lands on the first downbeat it can reach in full', () => {
  expect(landingTick(at(12), 1, 1)).toBe(32)
  expect(landingTick(at(4), 1, 1)).toBe(16)
})

test('without a tempo there is nothing to wait for', () => {
  expect(landingTick({ ...at(3), stepMs: 0 }, 4, 0)).toBeNull()
})

test('the wait counts from where the report stood and how old it is', () => {
  expect(msUntilTick(16, { ...at(15, 0.5), ageMs: 20 })).toBe(42.5)
})

test('a change chained to one that just set off lands a run later', () => {
  expect(landingTick(at(4), 1, 1)).toBe(16)
  expect(landingTick(at(4), 1, 1, 16)).toBe(32)
})
