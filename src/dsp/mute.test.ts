import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS, type Controls } from '../controls.ts'
import { ROCK, STEPS } from '../drums.ts'
import { SOURCE_TAPS, packParams } from '../engine/params.ts'
import { buildBender } from './build.ts'
import { Chain } from './chain.ts'
import { BLOCK, type Stage } from './stage.ts'
import { makeIo, renderStems, rms, SR } from './testRender.ts'

const TOY = SOURCE_TAPS.indexOf('toyChip')
const KIT = SOURCE_TAPS.indexOf('toyDrum')

const steady = (level: number): Stage => ({
  label: 'steady',
  process(io) {
    for (let i = 0; i < io.n; i++) {
      io.l[i]! += level
      io.r[i]! += level
    }
  },
  panic: () => {},
})

test('a muted machine puts nothing on the bus and its neighbour keeps playing', () => {
  const board = { chipLevel: 0.9, drumLevel: 0.9 }
  const live = renderStems(board, 2)
  const muted = renderStems({ ...board, drumMute: 1 }, 2)
  expect(rms(live.stems[KIT]!)).toBeGreaterThan(0)
  expect(muted.stems[KIT]!.every(v => v === 0)).toBe(true)
  expect(muted.stems[TOY]).toEqual(live.stems[TOY])
})

test('a mute switch fades over the block instead of cutting', () => {
  const chain = new Chain(SR)
  chain.sources = [steady(0.5)]
  chain.capturing = true
  chain.process(makeIo(), packParams(DEFAULT_CONTROLS))
  chain.process(makeIo(), packParams({ ...DEFAULT_CONTROLS, chipMute: 1 }))
  const stem = chain.stems.slice(0, BLOCK)
  const step = 0.5 / BLOCK
  expect(stem[0]).toBeGreaterThan(0.5 - 2 * step)
  expect(stem[BLOCK - 1]).toBeCloseTo(0, 6)
  for (let i = 1; i < BLOCK; i++)
    expect(stem[i - 1]! - stem[i]!).toBeLessThan(step * 1.01)
})

test('unmuting fades back up to the level the machine had', () => {
  const chain = new Chain(SR)
  chain.sources = [steady(0.5)]
  chain.capturing = true
  const muted = packParams({ ...DEFAULT_CONTROLS, chipMute: 1 })
  chain.process(makeIo(), muted)
  chain.process(makeIo(), muted)
  chain.process(makeIo(), packParams(DEFAULT_CONTROLS))
  const stem = chain.stems.slice(0, BLOCK)
  expect(stem[0]).toBeLessThan(0.01)
  expect(stem[BLOCK - 1]).toBeCloseTo(0.5, 6)
})

const KICK = 1
const SNARE = 2

function firedInABar(c: Partial<Controls>, strike = 0): number {
  const built = buildBender(SR)
  built.transport.drums = true
  const p = packParams({
    ...DEFAULT_CONTROLS,
    ...ROCK,
    chipLevel: 0,
    drumBpm: 240,
    ...c,
  })
  const io = makeIo()
  if (strike) built.toyDrum.strike(strike, 1)
  let fired = 0
  while (built.toyDrum.tick < STEPS) {
    built.chain.process(io, p)
    fired |= built.toyDrum.takeFired()
  }
  return fired
}

test('a muted row keeps the pattern off its voice, and the pad still strikes it', () => {
  expect(firedInABar({}) & (KICK | SNARE)).toBe(KICK | SNARE)
  expect(firedInABar({ drumRowMute: KICK }) & (KICK | SNARE)).toBe(SNARE)
  expect(firedInABar({ drumRowMute: KICK }, KICK) & KICK).toBe(KICK)
})
