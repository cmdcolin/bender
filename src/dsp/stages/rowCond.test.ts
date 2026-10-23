import { expect, test } from 'vitest'

import { CONDS, STEP_CONDS, STEPS } from '../../drums.ts'
import { renderBender } from '../testRender.ts'

import type { Controls } from '../../controls.ts'
import type { BuiltChain } from '../build.ts'

// The kick on every step and the clap on every fourth, counted per bar of the
// kit by the counter the kit fired on.
function barsPlayed(overrides: Partial<Controls>) {
  const kicks = new Map<number, number>()
  const claps = new Map<number, number>()
  renderBender(
    {
      chipLevel: 0,
      drumLevel: 1,
      drumBpm: 480,
      drumKick: 0xffff,
      drumClap: 0x8888,
      ...overrides,
    },
    4.2,
    (b: BuiltChain) => {
      b.transport.drums = true
      const kit = b.toyDrum as unknown as {
        tick: number
        hit: (bits: number, gain: number, ctx: unknown, i: number) => number
      }
      const own = kit.hit.bind(kit)
      kit.hit = (bits, gain, ctx, i) => {
        const bar = Math.floor(kit.tick / STEPS)
        if (bits & 1) kicks.set(bar, (kicks.get(bar) ?? 0) + 1)
        if (bits & 8) claps.set(bar, (claps.get(bar) ?? 0) + 1)
        return own(bits, gain, ctx, i)
      }
    },
  )
  const bars = [1, 2, 3, 4, 5, 6, 7]
  return {
    kick: bars.map(b => kicks.get(b) ?? 0),
    clap: bars.map(b => claps.get(b) ?? 0),
  }
}

const cond = (name: (typeof CONDS)[number]) => CONDS.indexOf(name)

test('a row on 2:2 plays every second bar and leaves the others alone', () => {
  const { kick, clap } = barsPlayed({ drumKickCond: cond('2:2') })
  expect(kick).toEqual([16, 0, 16, 0, 16, 0, 16])
  expect(clap).toEqual([4, 4, 4, 4, 4, 4, 4])
})

test('a row on !4:4 sits out the fourth bar of every four', () => {
  const { clap } = barsPlayed({ drumClapCond: cond('!4:4') })
  expect(clap).toEqual([4, 4, 0, 4, 4, 4, 0])
})

const step = (name: (typeof STEP_CONDS)[number]) => STEP_CONDS.indexOf(name)

test('a column on 2:2 rests every other bar, for every voice on it', () => {
  const { kick, clap } = barsPlayed({ drumStepCond4: step('2:2') })
  expect(kick).toEqual([16, 15, 16, 15, 16, 15, 16])
  expect(clap).toEqual([4, 3, 4, 3, 4, 3, 4])
})

test('pre plays after the last column with an A:B played, !pre after it rested', () => {
  const { kick } = barsPlayed({
    drumStepCond2: step('1:2'),
    drumStepCond6: step('pre'),
    drumStepCond10: step('!pre'),
  })
  expect(kick).toEqual([14, 15, 14, 15, 14, 15, 14])
})

test('a fill column plays only while the fill key is down', () => {
  expect(barsPlayed({ drumStepCond0: step('fill') }).kick).toEqual(
    Array(7).fill(15),
  )
  expect(barsPlayed({ drumStepCond0: step('fill'), drumFill: 1 }).kick).toEqual(
    Array(7).fill(16),
  )
  expect(
    barsPlayed({ drumStepCond0: step('!fill'), drumFill: 1 }).kick,
  ).toEqual(Array(7).fill(15))
})
