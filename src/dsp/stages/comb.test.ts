import { expect, test } from 'vitest'

import { pitchHz, renderBender, sine, tail } from '../testRender'

import type { Controls } from '../../controls'
import type { BuiltChain } from '../build'

// Past unity the comb is a note, and the note is the pitch on the knob.
test('a comb driven into oscillation rings at the pitch it is tuned to', () => {
  const look: Partial<Controls> = {
    chipLevel: 0,
    sampleLevel: 1,
    sampleMode: 1,
    combHz: 500,
    combFb: 1.2,
    combMix: 1,
  }
  const tick = (b: BuiltChain) => b.sampler.setBuffer(sine(500, 0.02))
  expect(pitchHz(tail(renderBender(look, 1.5, tick)))).toBeCloseTo(500, -1)
})
