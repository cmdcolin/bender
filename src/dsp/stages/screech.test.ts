import { expect, test } from 'vitest'
import { render, rms } from '../testRender'

test('screech filter self-oscillates past unity resonance', () => {
  const out = render(
    {
      chipLevel: 0,
      crackleAmp: 0.4,
      crackleRate: 20,
      bendSlot0: 6,
      filtMix: 1,
      filtRes: 1.25,
      filtHz: 400,
    },
    2,
  )
  expect(rms(out.subarray(out.length - 4800))).toBeGreaterThan(0.02)
})
