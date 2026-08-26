import { expect, test } from 'vitest'
import type { Controls } from '../controls'
import { bursts, crest, render, rms } from './testRender'

// Nothing plugged in but the contact crackle the loop feeds on, which is the
// board a no-input desk is played on.
const NO_INPUT: Partial<Controls> = { chipLevel: 0, crackleAmp: 0.2 }

const ONE: Partial<Controls> = {
  ...NO_INPUT,
  fbAmt: 1.4,
  fbDelayMs: 5,
  fbTone: 0.3,
}

const THREE: Partial<Controls> = {
  ...NO_INPUT,
  fbAmt: 1.2,
  fbDelayMs: 5,
  fbTone: 0.3,
  fb2Amt: 1.1,
  fb2Ms: 37,
  fb2Tone: -0.4,
  fb3Amt: 1,
  fb3Ms: 121,
  fb3Tone: 0.1,
}

test('a desk with two strips down is the one loop this always was', () => {
  expect(render(ONE, 1)).toEqual(
    render({ ...ONE, fb2Amt: 0, fb3Amt: 0, fb2Ms: 200, fb3Ms: 9 }, 1),
  )
})

test('the return amps at rest are the softclip that was here before', () => {
  expect(render(THREE, 1)).toEqual(
    render(
      { ...THREE, fbRails: 0, fbAsym: 0, fbSlew: 0, fbBlock: 0, fbSag: 0 },
      1,
    ),
  )
})

// Cross patches each strip across to the next one that is up. With one strip
// there is no next one, and a knob that quietly changed a board with nothing to
// change would be the kind of thing a link cannot promise.
test('cross does nothing with a single strip up', () => {
  expect(render(ONE, 1)).toEqual(render({ ...ONE, fbCross: 1 }, 1))
})

test('cross changes what three strips do', () => {
  const straight = render(THREE, 1)
  const ringed = render({ ...THREE, fbCross: 0.6 }, 1)
  expect(ringed).not.toEqual(straight)
})

// Rails is the difference between rolling off into the ceiling and stopping at
// it: what comes back is flatter against its own peak.
test('rails square the loop off', () => {
  const soft = crest(render({ ...THREE, fbCross: 0.5 }, 2))
  const hard = crest(render({ ...THREE, fbCross: 0.5, fbRails: 1 }, 2))
  expect(hard).toBeLessThan(soft)
})

test('an unbalanced pair of rails is not the balanced one', () => {
  const even = render({ ...THREE, fbRails: 1 }, 1)
  const odd = render({ ...THREE, fbRails: 1, fbAsym: 0.6 }, 1)
  expect(odd).not.toEqual(even)
})

// The one knob here that produces something with no harmonic structure to fall
// back on: an amp that cannot keep up puts out neither tone's harmonics.
test('slew fills the loop with something that is not the loop', () => {
  const clean = render({ ...THREE, fbCross: 0.5, fbRails: 1 }, 1)
  const slewed = render({ ...THREE, fbCross: 0.5, fbRails: 1, fbSlew: 0.5 }, 1)
  expect(slewed).not.toEqual(clean)
})

// The whole point of the amps: a wall that sits at one level for a minute is
// what one loop through one tanh always gave. A stage that blocks lets go.
test('blocking turns the wall into something that erupts and dies', () => {
  const wall = render({ ...THREE, fbCross: 0.55, fbRails: 1, fbAsym: 0.4 }, 8)
  const broken = render(
    { ...THREE, fbCross: 0.55, fbRails: 1, fbAsym: 0.4, fbBlock: 0.9 },
    8,
  )
  expect(crest(wall)).toBeLessThan(1.3)
  expect(crest(broken)).toBeGreaterThan(2)
  expect(bursts(broken)).toBeGreaterThan(5 * bursts(wall))
})

test('a sagging supply costs the desk the level it was holding', () => {
  const held = rms(render({ ...THREE, fbCross: 0.5, fbRails: 1 }, 3))
  const sagged = rms(
    render({ ...THREE, fbCross: 0.5, fbRails: 1, fbSag: 0.9 }, 3),
  )
  expect(sagged).toBeLessThan(held * 0.9)
})

// Three strips crossed, driven into amps that block, is the loudest and least
// predictable thing on the board. It still has to come back bounded, and it
// still has to come back the same way twice.
test('the whole desk stays inside the ceiling and stays deterministic', () => {
  const all: Partial<Controls> = {
    ...THREE,
    fbCross: 0.7,
    fbRails: 1,
    fbAsym: -0.5,
    fbSlew: 0.5,
    fbSag: 0.8,
    fbBlock: 0.7,
    mixDrive: 12,
  }
  const out = render(all, 3)
  const peak = out.reduce((a, v) => Math.max(a, Math.abs(v)), 0)
  expect(peak).toBeLessThanOrEqual(0.891 + 1e-6)
  expect(rms(out)).toBeGreaterThan(0.01)
  expect(render(all, 1)).toEqual(render(all, 1))
})
