import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS } from '../controls.ts'
import { packParams } from '../engine/params.ts'
import { Chain } from './chain.ts'
import { BLOCK, type Stage } from './stage.ts'
import { makeIo, SR } from './testRender.ts'

const source: Stage = {
  label: 'steady',
  process(io) {
    for (let i = 0; i < io.n; i++) {
      io.l[i]! += 0.5
      io.r[i]! += 0.5
    }
  },
  panic: () => {},
}

const halver: Stage = {
  label: 'halver',
  process(io) {
    for (let i = 0; i < io.n; i++) {
      io.l[i]! *= 0.5
      io.r[i]! *= 0.5
    }
  },
  panic: () => {},
}

// What the pedals hand on, seen from a stage that runs straight after them.
function rig() {
  const seen = new Float32Array(BLOCK)
  const probe: Stage = {
    label: 'probe',
    process(io) {
      seen.set(io.l.subarray(0, io.n))
    },
    panic: () => {},
  }
  const chain = new Chain(SR)
  chain.sources = [source]
  chain.pedals = [halver]
  chain.post = [probe]
  const run = (stompMute: number) =>
    chain.process(makeIo(), packParams({ ...DEFAULT_CONTROLS, stompMute }))
  return { seen, run }
}

test('a bypassed pedal hands on what it was given', () => {
  const { seen, run } = rig()
  run(0)
  const wet = seen[BLOCK - 1]!
  run(1)
  run(1)
  expect(seen[BLOCK - 1]).toBeCloseTo(2 * wet, 6)
})

test('a bypass switch fades over the block instead of cutting', () => {
  const { seen, run } = rig()
  run(0)
  const wet = seen[0]!
  run(1)
  expect(seen[0]).toBeLessThan(wet * 2)
  expect(seen[0]).toBeGreaterThan(wet)
  expect(seen[BLOCK - 1]).toBeCloseTo(2 * wet, 6)
  for (let i = 1; i < BLOCK; i++)
    expect(seen[i]! - seen[i - 1]!).toBeGreaterThanOrEqual(-1e-9)
})

test('switching a pedal back on fades up to the sound it had', () => {
  const { seen, run } = rig()
  run(0)
  const wet = seen[BLOCK - 1]!
  run(1)
  run(1)
  run(0)
  expect(seen[BLOCK - 1]).toBeCloseTo(wet, 6)
})
