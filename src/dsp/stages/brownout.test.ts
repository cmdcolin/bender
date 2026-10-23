import { expect, test } from 'vitest'

import { renderBender, rms, SR } from '../testRender.ts'

import type { Controls } from '../../controls.ts'

// Steady noise under a muted kit whose kick still strikes on every beat at
// 120 bpm, so the mix is only the noise and any movement in it is the supply.
function beats(overrides: Partial<Controls>) {
  const out = renderBender(
    {
      chipLevel: 0,
      noiseLevel: 0.4,
      drumLevel: 1,
      drumMute: 1,
      drumBpm: 120,
      drumKick: 0x8888,
      ...overrides,
    },
    4,
    b => {
      b.transport.drums = true
    },
  )
  const at = (s: number) => rms(out.subarray(s * SR, s * SR + 0.02 * SR))
  const after: number[] = []
  const before: number[] = []
  for (let beat = 2; beat < 7; beat++) {
    const kick = beat * 0.5
    after.push(at(kick + 0.03))
    before.push(at(kick + 0.45))
  }
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
  return { after: mean(after), before: mean(before) }
}

test('the kick pump ducks the board after each kick and lets it back', () => {
  const still = beats({})
  expect(still.after / still.before).toBeGreaterThan(0.85)
  const pumped = beats({ brownKick: 1 })
  expect(pumped.after / pumped.before).toBeLessThan(0.45)
  expect(pumped.before / still.before).toBeGreaterThan(0.8)
})
