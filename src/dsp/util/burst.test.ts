import { expect, test } from 'vitest'

import { Burst } from './burst.ts'
import { mulberry32 } from './rng.ts'

const SR = 48000
const ROLLS = 400_000

test.each([128, 256, 512])(
  'clustered faults rolled every %i samples keep the rate asked for',
  interval => {
    const prob = 0.02
    const burst = new Burst(SR, 0.4)
    const rng = mulberry32(1)
    let hits = 0
    for (let i = 0; i < ROLLS; i++) {
      burst.coolFor(interval)
      if (burst.roll(prob, 0.5, rng, interval)) hits++
    }
    expect(hits / ROLLS / prob).toBeGreaterThan(0.9)
    expect(hits / ROLLS / prob).toBeLessThan(1.1)
  },
)
