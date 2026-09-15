import { expect, test } from 'vitest'
import type { Controls } from '../../controls'
import type { BuiltChain } from '../build'
import { SR, bin, pitchHz, renderBender, rms, sine, tail } from '../testRender'

// The echo returns on a fader of its own, so the dry is always in the room
// with it. These play a one-shot second and listen to the last half of the
// next one, where the only thing left sounding is what came off the tape.

const load = (b: BuiltChain) => b.sampler.setBuffer(sine(400, 1))

test('the tape brake drags everything already on the tape down in pitch', () => {
  const look: Partial<Controls> = {
    chipLevel: 0,
    sampleLevel: 1,
    sampleMode: 1,
    dlyMix: 1,
    delayMs: 200,
    dlyFb: 0.7,
  }
  const free = renderBender(look, 2, load)
  const braked = renderBender({ ...look, tapeBrake: 0.5 }, 2, load)
  expect(pitchHz(tail(free))).toBeCloseTo(400, -2)
  expect(pitchHz(tail(braked))).toBeLessThan(0.85 * pitchHz(tail(free)))
})

test('a sagging supply drags the tape motor with it', () => {
  const look: Partial<Controls> = {
    chipLevel: 0,
    sampleLevel: 1,
    sampleMode: 1,
    dlyMix: 1,
    delayMs: 200,
    dlyFb: 0.7,
    brownAmt: 1,
    brownRate: 0,
  }
  const free = renderBender(look, 2, load)
  const dragged = renderBender({ ...look, tapeMotorRail: 1 }, 2, load)
  expect(pitchHz(tail(dragged))).toBeLessThan(0.9 * pitchHz(tail(free)))
})

// The reel is 5.3 s of tape joined once, so the join passes the record head at
// 5.3 s and the play head reads the gap it left one delay later.
test('the splice leaves a gap on the tape that comes round once a lap', () => {
  const look: Partial<Controls> = {
    chipLevel: 0,
    sampleLevel: 1,
    sampleMode: 1,
    dlyMix: 1,
    delayMs: 200,
  }
  const take = (over: Partial<Controls>) =>
    renderBender({ ...look, ...over }, 6, b =>
      b.sampler.setBuffer(sine(400, 6)),
    )
  const tone = (out: Float32Array, sec: number) =>
    bin(out.subarray(sec * SR, (sec + 0.01) * SR), 400)
  const clean = take({})
  const spliced = take({ dlySplice: 1 })
  // The dry never leaves the board, so a gap in the repeats halves the tone
  // rather than removing it.
  expect(tone(spliced, 5.501)).toBeLessThan(0.6 * tone(clean, 5.501))
  expect(tone(spliced, 5.4)).toBeCloseTo(tone(clean, 5.4), 1)
  expect(tone(spliced, 5.6)).toBeCloseTo(tone(clean, 5.6), 1)
})

test('a dead erase head lets the last lap of the reel through', () => {
  const look: Partial<Controls> = {
    chipLevel: 0,
    sampleLevel: 1,
    sampleMode: 1,
    dlyMix: 1,
    delayMs: 100,
    dlyFb: 0,
  }
  const lap = (over: Partial<Controls>) =>
    rms(renderBender({ ...look, ...over }, 5.8, load).subarray(5.5 * SR))
  expect(lap({ dlyErase: 1 })).toBeGreaterThan(20 * lap({}))
})

test('a second head up is a second repeat at twice the spacing', () => {
  const look: Partial<Controls> = {
    chipLevel: 0,
    sampleLevel: 1,
    sampleMode: 1,
    dlyMix: 1,
    delayMs: 200,
    dlyFb: 0,
  }
  const burst = (b: BuiltChain) => b.sampler.setBuffer(sine(400, 0.1))
  const second = (over: Partial<Controls>) =>
    rms(
      renderBender({ ...look, ...over }, 1, burst).subarray(
        0.42 * SR,
        0.48 * SR,
      ),
    )
  expect(second({ dlyHeads: 1 })).toBeGreaterThan(10 * second({}))
})
