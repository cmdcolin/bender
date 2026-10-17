import { expect, test } from 'vitest'

import { dampAt, Svf, svfF } from './svf.ts'

const SR = 48000

function tail(hz: number, res: number, mode: number) {
  const svf = new Svf()
  const f = svfF(hz, SR)
  const d = dampAt(res)
  let peak = 0
  for (let i = 0; i < SR / 2; i++) {
    const y = svf.process(i === 0 ? 1 : 0, f, d, mode)
    if (i > SR / 4) peak = Math.max(peak, Math.abs(y))
  }
  return peak
}

test('an impulse at 9 kHz with no resonance dies away in every mode', () => {
  for (const mode of [0, 1, 2]) expect(tail(9000, 0, mode)).toBeLessThan(1e-9)
})

test('the band top with no resonance dies away too', () => {
  expect(tail(12000, 0, 0)).toBeLessThan(1e-9)
})

test('resonance past 1 still holds a scream', () => {
  expect(tail(1000, 1.3, 1)).toBeGreaterThan(0.1)
})
