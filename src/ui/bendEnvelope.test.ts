import { expect, test } from 'vitest'

import {
  attackFrom,
  bendEnvelope,
  heldLevel,
  releasedLevel,
  settles,
} from './bendEnvelope.ts'

const BEAT = 0.5

test('a snap lands whole and lets go at once', () => {
  const e = bendEnvelope('snap', BEAT, 2)
  expect(heldLevel(e, 0)).toBe(1)
  expect(settles(e)).toBe(0)
  expect(releasedLevel(e, 1, 0)).toBeNull()
})

test('a riser climbs over four bars, most of it at the end', () => {
  const e = bendEnvelope('riser', BEAT, 0)
  expect(heldLevel(e, 4)).toBeCloseTo(0.125, 3)
  expect(heldLevel(e, 7.9)).toBeGreaterThan(0.9)
  expect(heldLevel(e, 8)).toBe(1)
  expect(releasedLevel(e, 1, 0)).toBeNull()
})

test('a pluck sinks to its sustain and falls away over a beat', () => {
  const e = bendEnvelope('pluck', BEAT, 0)
  expect(heldLevel(e, 0)).toBe(1)
  expect(heldLevel(e, BEAT)).toBeCloseTo(0.6, 3)
  expect(heldLevel(e, 3)).toBeCloseTo(0.2, 3)
  expect(releasedLevel(e, 0.2, BEAT / 2)).toBeCloseTo(0.1, 3)
  expect(releasedLevel(e, 0.2, BEAT)).toBeNull()
})

test('a wobble keeps moving for as long as it is held', () => {
  const e = bendEnvelope('wobble', BEAT, 0)
  expect(settles(e)).toBe(Infinity)
  const crest = heldLevel(e, 10)
  const trough = heldLevel(e, 10 + BEAT / 4)
  expect(crest).toBeCloseTo(1, 3)
  expect(trough).toBeCloseTo(0.2, 3)
})

test('a swell keeps the morph time, a second at least', () => {
  expect(bendEnvelope('swell', BEAT, 3).attack).toBe(3)
  expect(bendEnvelope('swell', BEAT, 0).release).toBe(1)
})

test('pressed again on the way out, a key climbs on from where it fell', () => {
  const e = bendEnvelope('riser', BEAT, 0)
  expect(heldLevel(e, attackFrom(e, 0.3))).toBeCloseTo(0.3, 6)
})
