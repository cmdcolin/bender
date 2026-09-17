import { expect, test } from 'vitest'

import { deviation, renderStems, rms } from '../../dsp/testRender'
import { mulberry32 } from '../../dsp/util/rng'
import { randomLook } from './roll'
import { SCENARIOS } from './scenarios'
import { mine } from './testBoard'

// Every roll in the dice menu, played: a dud is a roll that hands back silence,
// or a board that sounds exactly like the one you pressed it on.
const SEEDS = 8

const ROLLS = [
  { name: 'random', roll: randomLook },
  ...SCENARIOS.map(s => ({ name: s.name, roll: s.roll })),
]

const play = (c: ReturnType<typeof mine>) => renderStems(c, 1.5).master

test.each(ROLLS)(
  '$name lands on a board you can hear, and nearly always a different one',
  ({ roll }) => {
    const before = mine()
    const dry = play(before)
    let moved = 0
    for (let seed = 1; seed <= SEEDS; seed++) {
      const out = play(roll(before, mulberry32(seed)))
      expect(rms(out), `seed ${seed}`).toBeGreaterThan(0.001)
      if (deviation(out, dry) > 0.05) moved++
    }
    expect(moved).toBeGreaterThanOrEqual(SEEDS - 2)
  },
)
