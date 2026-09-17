import { expect, test } from 'vitest'

import { deviation, renderStems, rms } from '../../dsp/testRender'
import { mulberry32 } from '../../dsp/util/rng'
import { randomLook } from './roll'
import { SCENARIOS } from './scenarios'
import { mine } from './testBoard'

// Every roll in the dice menu, played: a dud is a roll that hands back silence,
// or a board that sounds exactly like the one you pressed it on.
const SEEDS = 8

test('every roll lands on a board you can hear, and nearly always a different one', () => {
  const before = mine()
  const play = (c: typeof before) => renderStems(c, 1.5).master
  const dry = play(before)
  const rolls = [
    { name: 'random', roll: randomLook },
    ...SCENARIOS.map(s => ({ name: s.name, roll: s.roll })),
  ]
  for (const { name, roll } of rolls) {
    let moved = 0
    for (let seed = 1; seed <= SEEDS; seed++) {
      const out = play(roll(before, mulberry32(seed)))
      expect(rms(out), `${name} seed ${seed}`).toBeGreaterThan(0.001)
      if (deviation(out, dry) > 0.05) moved++
    }
    expect(moved, name).toBeGreaterThanOrEqual(SEEDS - 2)
  }
})
