import { expect, test } from 'vitest'

import { type Controls, DEFAULT_CONTROLS } from '../controls.ts'
import { packParams } from '../engine/params.ts'
import { Chain } from './chain.ts'
import { BLOCK, type Stage } from './stage.ts'
import { makeIo, SR } from './testRender.ts'

const steady: Stage = {
  label: 'steady',
  process(io) {
    for (let i = 0; i < io.n; i++) {
      io.l[i]! += 0.2
      io.r[i]! += 0.2
    }
  },
  panic: () => {},
}

const largestJump = (from: Partial<Controls>, to: Partial<Controls>) => {
  const chain = new Chain(SR)
  chain.sources = [steady]
  const before = packParams({ ...DEFAULT_CONTROLS, ...from })
  for (let b = 0; b < 4; b++) chain.process(makeIo(), before)
  const io = makeIo()
  chain.process(io, before)
  const last = io.l[BLOCK - 1]!
  const next = makeIo()
  chain.process(next, packParams({ ...DEFAULT_CONTROLS, ...to }))
  let jump = Math.abs(next.l[0]! - last)
  for (let i = 1; i < BLOCK; i++)
    jump = Math.max(jump, Math.abs(next.l[i]! - next.l[i - 1]!))
  return { jump, settled: next.l[BLOCK - 1]! }
}

test('the output gain ramps across the block instead of stepping at its edge', () => {
  const { jump, settled } = largestJump({ outGain: 0 }, { outGain: -12 })
  expect(settled).toBeLessThan(0.1)
  expect(jump).toBeLessThan(0.005)
})

test('the summing drive ramps in from unity and back out to it', () => {
  expect(largestJump({ mixDrive: 0 }, { mixDrive: 12 }).jump).toBeLessThan(
    0.005,
  )
  expect(largestJump({ mixDrive: 12 }, { mixDrive: 0 }).jump).toBeLessThan(
    0.005,
  )
})
