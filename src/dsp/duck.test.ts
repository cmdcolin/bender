import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS, type Controls } from '../controls.ts'
import { VOICE_LABELS } from '../drums.ts'
import { MAX_SOURCES, packParams, SOURCE_TAPS } from '../engine/params.ts'
import { Chain } from './chain.ts'
import { BLOCK, type Stage } from './stage.ts'
import { makeIo, SR } from './testRender.ts'
import { ANY_CHOICE } from './trigbus.ts'

const KIT = SOURCE_TAPS.indexOf('toyDrum')
const NOISE = SOURCE_TAPS.indexOf('noise')
const LEAD = SOURCE_TAPS.indexOf('leadSynth')
const KICK_BIT = 1
const SNARE_BIT = 2
const BEAT = Math.round(0.4 * SR)
const LEVEL = 0.5

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

// A kit that strikes `bits` on every beat and puts nothing on the bus, so the
// duck is all the noise channel hears of it.
const kit = (bits: number): Stage => {
  let t = 0
  return {
    label: 'kit',
    process(io, _p, ctx) {
      for (let i = 0; i < io.n; i++, t++)
        if (t % BEAT === 0) ctx.trig.drumFired(i, bits, 1)
    },
    panic: () => {},
  }
}

function listen(c: Partial<Controls>, bits = KICK_BIT, seconds = 1.2) {
  const chain = new Chain(SR)
  chain.sources = Array.from({ length: MAX_SOURCES }, (_, k) =>
    k === KIT ? kit(bits) : k === NOISE ? steady(LEVEL) : steady(0.25),
  )
  chain.capturing = true
  const p = packParams({ ...DEFAULT_CONTROLS, ...c })
  const io = makeIo()
  const blocks = Math.ceil((seconds * SR) / BLOCK)
  const noise = new Float32Array(blocks * BLOCK)
  const lead = new Float32Array(blocks * BLOCK)
  const out = new Float32Array(blocks * BLOCK)
  for (let b = 0; b < blocks; b++) {
    chain.process(io, p)
    noise.set(
      chain.stems.subarray(NOISE * BLOCK, (NOISE + 1) * BLOCK),
      b * BLOCK,
    )
    lead.set(chain.stems.subarray(LEAD * BLOCK, (LEAD + 1) * BLOCK), b * BLOCK)
    out.set(io.l, b * BLOCK)
  }
  return { noise, lead, out, ldr: chain.ldr[NOISE]! }
}

const db = (x: number) => 20 * Math.log10(x / LEVEL)
const ms = (i: number) => (i / SR) * 1000

function recovery(stem: Float32Array) {
  const deepest = stem.subarray(0, BEAT).reduce((a, v) => Math.min(a, v), 1)
  const floor = stem.indexOf(deepest)
  let back = floor
  while (back < BEAT && db(stem[back]!) < -1) back++
  return { depthDb: db(deepest), floorMs: ms(floor), backMs: ms(back) }
}

test('a ducked channel dips on the key voice and climbs back along the vactrol curve', () => {
  const { noise, ldr } = listen({ noiseDuck: 1 })
  const { depthDb, floorMs, backMs } = recovery(noise)
  expect(depthDb).toBeLessThan(-24)
  expect(db(noise[Math.round(0.005 * SR)]!)).toBeLessThan(-20)
  expect(floorMs).toBeLessThan(20)
  expect(backMs).toBeGreaterThan(250)
  expect(backMs).toBeLessThan(400)
  expect(ldr).toBeGreaterThan(0.9)

  // Steady in decibels and late in level: halfway back in time it is still
  // under a third of the way back in level, where a VCA's ramp would be half.
  const at = (f: number) =>
    noise[Math.round(((floorMs + f * (backMs - floorMs)) / 1000) * SR)]! / LEVEL
  expect(at(0.5)).toBeLessThan(0.33)
  expect(db(at(0.5) * LEVEL) - db(at(0) * LEVEL)).toBeGreaterThan(10)
  for (let i = Math.round((floorMs / 1000) * SR) + 1; i < BEAT; i++)
    expect(noise[i]!).toBeGreaterThanOrEqual(noise[i - 1]!)

  // Every beat ducks it again.
  expect(db(noise[BEAT + Math.round(0.005 * SR)]!)).toBeLessThan(-20)
})

test('a light duck lets go far sooner than a deep one', () => {
  const light = recovery(listen({ noiseDuck: 0.05 }).noise)
  const deep = recovery(listen({ noiseDuck: 1 }).noise)
  expect(light.depthDb).toBeGreaterThan(deep.depthDb + 10)
  expect(light.backMs).toBeGreaterThan(30)
  expect(light.backMs).toBeLessThan(80)
  expect(deep.backMs).toBeGreaterThan(4 * light.backMs)
  const quick = recovery(listen({ noiseDuck: 1, duckRelease: 0.5 }).noise)
  expect(quick.backMs).toBeLessThan(deep.backMs * 0.7)
})

test('only the voice keying it ducks the channel', () => {
  const snare = VOICE_LABELS.indexOf('snare') + 1
  expect(recovery(listen({ noiseDuck: 1 }, SNARE_BIT).noise).depthDb).toBe(0)
  expect(
    recovery(listen({ noiseDuck: 1, duckKey: snare }, SNARE_BIT).noise).depthDb,
  ).toBeLessThan(-24)
  expect(
    recovery(listen({ noiseDuck: 1, duckKey: ANY_CHOICE }, SNARE_BIT).noise)
      .depthDb,
  ).toBeLessThan(-24)
})

test('a channel without a duck is untouched by its neighbour’s', () => {
  const { lead, noise } = listen({ noiseDuck: 1 })
  expect(recovery(noise).depthDb).toBeLessThan(-24)
  expect(lead.every(v => v === 0.25)).toBe(true)
})

test('with every duck at 0 the key and release change nothing', () => {
  const stock = listen({}).out
  const moved = listen({ duckKey: ANY_CHOICE, duckRelease: 3 }).out
  expect(moved).toEqual(stock)
})

test('a duck turned back to 0 leaves the channel once its cell is dark', () => {
  const chain = new Chain(SR)
  chain.sources = Array.from({ length: MAX_SOURCES }, (_, k) =>
    k === KIT ? kit(KICK_BIT) : k === NOISE ? steady(LEVEL) : steady(0),
  )
  chain.capturing = true
  const io = makeIo()
  const ducked = packParams({ ...DEFAULT_CONTROLS, noiseDuck: 1 })
  for (let b = 0; b < 4; b++) chain.process(io, ducked)
  const off = packParams(DEFAULT_CONTROLS)
  chain.process(io, off)
  expect(chain.stems[NOISE * BLOCK]!).toBeLessThan(LEVEL / 4)
  for (let b = 0; b < 400; b++) chain.process(io, off)
  chain.ldr.fill(0)
  chain.process(io, off)
  const stem = chain.stems.subarray(NOISE * BLOCK, (NOISE + 1) * BLOCK)
  expect(stem.every(v => v === LEVEL)).toBe(true)
  expect(chain.ldr[NOISE]).toBe(0)
})
