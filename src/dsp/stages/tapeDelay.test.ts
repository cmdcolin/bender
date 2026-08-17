import { expect, test } from 'vitest'
import type { Controls } from '../../controls'
import type { BuiltChain } from '../build'
import { pitchHz, renderBender, sine, tail } from '../testRender'

const load = (b: BuiltChain) => b.sampler.setBuffer(sine(400, 1))

test('the tape brake drags everything already on the tape down in pitch', () => {
  const look: Partial<Controls> = {
    chipLevel: 0,
    sampleLevel: 1,
    dlyMix: 1,
    delayMs: 200,
    dlyFb: 0,
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
    dlyMix: 1,
    delayMs: 200,
    dlyFb: 0,
    brownAmt: 1,
    brownRate: 0,
  }
  const free = renderBender(look, 2, load)
  const dragged = renderBender({ ...look, tapeMotorRail: 1 }, 2, load)
  expect(pitchHz(tail(dragged))).toBeLessThan(0.9 * pitchHz(tail(free)))
})
