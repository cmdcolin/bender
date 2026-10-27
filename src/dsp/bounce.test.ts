import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS, type Controls } from '../controls.ts'
import { CYCLE, ROCK } from '../drums.ts'
import { packParams } from '../engine/params.ts'
import { buildBender } from './build.ts'
import { BLOCK } from './stage.ts'
import { makeIo, render, SR } from './testRender.ts'

const moves = (over: Partial<Controls>, secs = 4) => {
  const b = buildBender(SR)
  b.transport.drums = true
  b.transport.tune = true
  const p = packParams({ ...DEFAULT_CONTROLS, ...ROCK, ...over })
  const io = makeIo()
  let kit = 0
  let toy = 0
  let wasKit = b.toyDrum.tick
  let wasToy = b.toyChip.tunePos
  for (let k = 0; k < (secs * SR) / BLOCK; k++) {
    b.chain.process(io, p)
    kit += (b.toyDrum.tick - wasKit + CYCLE) % CYCLE
    wasKit = b.toyDrum.tick
    if (b.toyChip.tunePos !== wasToy) toy++
    wasToy = b.toyChip.tunePos
  }
  return { kit: kit / secs, toy: toy / secs }
}

test('ground bounce at zero is the board it always was', () => {
  expect(render({ gndBounce: 0 }, 1)).toEqual(render({}, 1))
})

test('loud hits on a bouncing ground clock both counters early', () => {
  const stock = moves({})
  const bounced = moves({ gndBounce: 0.75 })
  expect(bounced.kit).toBeGreaterThan(stock.kit * 2)
  expect(bounced.toy).toBeGreaterThan(stock.toy * 2)
})

test('a quieter board bounces less', () => {
  const loud = moves({ gndBounce: 0.5, outGain: 6 })
  const quiet = moves({ gndBounce: 0.5, chipLevel: 0.2, drumLevel: 0.2 })
  expect(loud.kit).toBeGreaterThan(quiet.kit * 1.5)
})
