import { expect, test } from 'vitest'

import { Halfband, LATENCY, Upsampler } from './halfband.ts'

const SR = 48000

function lap(hz: number, n = 2000): number[] {
  const up = new Upsampler()
  const down = new Halfband()
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    up.process(Math.sin((2 * Math.PI * hz * i) / SR))
    out.push(down.process(up.pair[0]!, up.pair[1]!))
  }
  return out
}

test('a tone comes back out of the lap through both filters, late by LATENCY', () => {
  for (const hz of [200, 1000, 6000, 12000]) {
    const out = lap(hz)
    let worst = 0
    for (let i = 400; i < out.length; i++) {
      const want = Math.sin((2 * Math.PI * hz * (i - LATENCY)) / SR)
      worst = Math.max(worst, Math.abs(out[i]! - want))
    }
    expect(worst).toBeLessThan(0.01)
  }
})

test('the doubled-rate pair is the signal and its own midpoint, no louder', () => {
  const up = new Upsampler()
  let peak = 0
  for (let i = 0; i < 1000; i++) {
    up.process(Math.sin((2 * Math.PI * 3000 * i) / SR))
    if (i > 100)
      peak = Math.max(peak, Math.abs(up.pair[0]!), Math.abs(up.pair[1]!))
  }
  expect(peak).toBeGreaterThan(0.97)
  expect(peak).toBeLessThan(1.03)
})
