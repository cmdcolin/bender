import { expect, test } from 'vitest'
import type { Controls } from '../../controls'
import { bursts, render, rms } from '../testRender'
import { REST, TUNE_STEP_KEYS } from '../../tune'
import { YOURS } from './roms'

// The wire from the kit's step clock to the toy's timing chain. What has to
// hold is that it counts off the kit, that it replaces the song's own rate and
// nothing else, and that every bend which drags the toy's timebase goes on
// dragging it — a locked toy is still a toy on a dying battery.

// Alternating note and rest, so a step of the memory is a burst with silence
// after it and the step rate can be counted off the level. The kit is muted:
// these takes measure the toy.
const PULSES = Object.fromEntries(
  TUNE_STEP_KEYS.map((key, i) => [key, i % 2 === 0 ? 0 : REST]),
) as Partial<Controls>

const TOY: Partial<Controls> = {
  ...PULSES,
  chipLevel: 0.9,
  drumLevel: 0,
  chipTune: YOURS,
  tunePoly: 0,
  tuneRate: 3.2,
}

// Steps a second: two steps to a burst, since every other one is the rest.
const stepHz = (overrides: Partial<Controls>, seconds = 4) =>
  (2 * bursts(render({ ...TOY, ...overrides }, seconds))) / seconds

const SIXTEENTHS = 1
const EIGHTHS = 2
const QUARTERS = 3

// A board nobody has thrown the switch on is the board that shipped, down to
// the sample. Sixteen windows of the default take, measured before the wire
// went in — the toy's step clock reaches the pitch, the tempo and the
// envelopes, so anything that moved it at all would move these.
test('the default board is untouched with the wire off', () => {
  const x = render({}, 1)
  const slice = Math.floor(x.length / 16)
  const parts = Array.from({ length: 16 }, (_, i) =>
    rms(x.subarray(i * slice, (i + 1) * slice)),
  )
  expect(rms(x)).toBeCloseTo(0.17321623436422148, 8)
  expect(parts).toEqual(
    [
      0.2182551008860624, 0.18679726634328983, 0.15989697026282965,
      0.1364102711286228, 0.11935652910145307, 0.21822047909173792,
      0.18702790416179985, 0.15969848822977364, 0.16687436401922665,
      0.11947663420543239, 0.21854561806968054, 0.18706915565733864,
      0.16180853651169977, 0.13655285248836233, 0.11654977261179722,
      0.21844449828241969,
    ].map(v => expect.closeTo(v, 8)),
  )
})

test('locked, the tune counts off the kit rather than its own crystal', () => {
  // The kit counts sixteen steps to the bar, so 120 bpm is eight of them a
  // second and the three settings are that, half of it and a quarter of it.
  expect(stepHz({ chipSync: SIXTEENTHS, drumBpm: 120 })).toBeCloseTo(8, 5)
  expect(stepHz({ chipSync: EIGHTHS, drumBpm: 120 })).toBeCloseTo(4, 5)
  expect(stepHz({ chipSync: QUARTERS, drumBpm: 120 })).toBeCloseTo(2, 5)
  // and it follows the tempo knob rather than sitting on one number
  expect(stepHz({ chipSync: EIGHTHS, drumBpm: 90 })).toBeCloseTo(3, 5)
  expect(stepHz({ chipSync: EIGHTHS, drumBpm: 60 })).toBeCloseTo(2, 5)
})

test('the rate the song was written at is what the lock replaces', () => {
  // Off, the memory plays at its own knob; locked, that knob says nothing.
  expect(stepHz({ tuneRate: 8 })).toBeCloseTo(8, 5)
  expect(stepHz({ chipSync: EIGHTHS, drumBpm: 120, tuneRate: 8 })).toBeCloseTo(
    4,
    5,
  )
  expect(stepHz({ chipSync: EIGHTHS, drumBpm: 120, tuneRate: 20 })).toBeCloseTo(
    4,
    5,
  )
})

// The point of locking the nominal rate and not the timebase: the wire is on
// the timing pin, not on a phase detector, so everything that drags the toy
// still drags it.
test('locked, the clock knob still drags the tune', () => {
  const at = (chipClockX: number) =>
    stepHz({ chipSync: EIGHTHS, drumBpm: 120, chipClockX })
  expect(at(1)).toBeCloseTo(4, 5)
  expect(at(2)).toBeCloseTo(8, 5)
  expect(at(0.5)).toBeCloseTo(2, 5)
})

test('locked, a pot on the timing pin still runs the tune away', () => {
  const bent = stepHz({
    chipSync: EIGHTHS,
    drumBpm: 120,
    chipBendSpot: 1,
    chipBendPot: 0.05,
  })
  expect(bent).toBeGreaterThan(4 * 1.5)
})

test('locked, a starving rail still drags the tune late', () => {
  const flat = stepHz({ chipSync: EIGHTHS, drumBpm: 120, chipBattery: 0.8 })
  expect(flat).toBeLessThan(4 * 0.9)
  expect(flat).toBeGreaterThan(0)
})

// Both machines multiply their own step rate by the same divider, so the sag
// arrives on both sides on its own and the lock reads the tempo as written.
test('locked, the toy and the kit go flat together', () => {
  const KIT: Partial<Controls> = {
    drumKick: 0b1000_1000_1000_1000,
    drumSnare: 0,
    drumHat: 0,
    drumBpm: 120,
    drumDecay: 0.3,
  }
  const kitHz = (o: Partial<Controls>) =>
    bursts(render({ ...KIT, chipLevel: 0, drumLevel: 0.8, ...o }, 6)) / 6
  const toyHz = (o: Partial<Controls>) =>
    stepHz({ ...KIT, chipSync: QUARTERS, ...o }, 6)
  const flat = { chipBattery: 0.8 }
  expect(toyHz({}) / kitHz({})).toBeCloseTo(1, 0)
  expect(toyHz(flat) / kitHz(flat)).toBeCloseTo(1, 0)
  expect(kitHz(flat)).toBeLessThan(kitHz({}) * 0.95)
})
