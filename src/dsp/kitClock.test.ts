import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS, type Controls } from '../controls.ts'
import { packParams } from '../engine/params.ts'
import { MEMORY_SYNC_MODES } from './melodyMemory.ts'
import {
  LFO_SYNC_MODES,
  ModBus,
  PHRASE_BARS,
  PHRASE_SHAPES,
  type ModSources,
} from './modbus.ts'
import { BLOCK } from './stage.ts'
import { DELAY_SYNC_MODES } from './stages/tapeDelay.ts'
import { render, renderBender, SR } from './testRender.ts'
import { TriggerBus } from './trigbus.ts'

const MEMORY: Partial<Controls> = {
  chipLevel: 0,
  monoSeqOn: 1,
  monoSeqLen: 32,
  monoSeqRate: 3,
  drumBpm: 120,
}

function memorySteps(overrides: Partial<Controls>, drums = true, seconds = 4) {
  let steps = 0
  let last = -1
  renderBender(
    { ...MEMORY, ...overrides },
    seconds,
    built => {
      built.transport.tune = true
      built.transport.drums = drums
    },
    undefined,
    built => {
      const at = built.chain.melody!.at
      if (at !== last) steps++
      last = at
    },
  )
  return steps / seconds
}

const memorySync = (name: string) => MEMORY_SYNC_MODES.indexOf(name)

test('synced, the memory steps on the kit’s strobes', () => {
  const at = (name: string) => memorySteps({ monoSeqSync: memorySync(name) })
  expect(at('sixteenths')).toBeCloseTo(8, 0)
  expect(at('eighths')).toBeCloseTo(4, 0)
  expect(at('dotted eighths')).toBeCloseTo(8 / 3, 0)
  expect(at('quarters')).toBeCloseTo(2, 0)
  expect(memorySteps({})).toBeCloseTo(3, 0)
})

test('synced, the memory stands still while the kit is stopped', () => {
  expect(
    memorySteps({ monoSeqSync: memorySync('sixteenths') }, false),
  ).toBeLessThan(0.5)
})

test('synced, the memory keeps stepping with the kit’s fader down', () => {
  const sync = { monoSeqSync: memorySync('sixteenths'), drumLevel: 0 }
  expect(memorySteps(sync)).toBeCloseTo(8, 0)
  const out = renderBender(
    { chipLevel: 0, drumLevel: 0, drumKick: 0xffff },
    1,
    built => {
      built.transport.drums = true
    },
  )
  expect(Math.max(...out.map(Math.abs))).toBeLessThan(1e-4)
})

test('synced, a slipping kit clock stalls the memory with it', () => {
  const locked = { monoSeqSync: memorySync('eighths') }
  expect(memorySteps({ ...locked, drumSlip: 0.5 })).toBeLessThan(
    0.8 * memorySteps(locked),
  )
})

function bay(overrides: Partial<Controls>) {
  const bus = new ModBus(SR)
  const trig = new TriggerBus()
  const zero = new Float32Array(BLOCK)
  const src: ModSources = {
    mic: zero,
    droop: zero,
    env: zero,
    fb: zero,
    step: zero,
    trig,
    heat: 0,
  }
  const p = packParams({
    ...DEFAULT_CONTROLS,
    modLfoShape: 1,
    mod0Src: 1,
    mod0Dest: 0,
    mod0Depth: 1,
    ...overrides,
  })
  // One block of the LFO, with a kit strobe at `tick` on the first sample.
  return (tick?: number) => {
    trig.kitClocking(8)
    if (tick !== undefined) trig.stepClocked(0, tick)
    trig.swap(BLOCK)
    bus.build(BLOCK, p, src)
    return bus.read(0)!
  }
}

const lfoSync = (name: string) => LFO_SYNC_MODES.indexOf(name)

test('synced, the LFO runs a cycle per division of the kit’s tempo', () => {
  const block = bay({ modLfoSync: lfoSync('bars'), drumBpm: 120 })
  const first = block()[0]!
  const blocks = Math.round((2 * SR) / BLOCK)
  for (let b = 1; b < blocks; b++) block()
  expect(block()[0]).toBeCloseTo(first, 1)
})

test('synced, a strobe on the bar puts the LFO back on the one', () => {
  const block = bay({ modLfoSync: lfoSync('bars'), drumBpm: 120 })
  for (let b = 0; b < 100; b++) block()
  expect(block(17)[0]).toBeGreaterThan(-0.9)
  expect(block(16)[0]).toBeCloseTo(-1, 2)
})

test('the delay synced to quarters at 120 bpm is a 500 ms delay', () => {
  const look: Partial<Controls> = {
    chipLevel: 1,
    dlyMix: 1,
    dlyFb: 0.6,
    drumBpm: 120,
  }
  const quarters = DELAY_SYNC_MODES.indexOf('quarters')
  const synced = render({ ...look, dlySync: quarters }, 1.5)
  expect(synced).toEqual(render({ ...look, delayMs: 500 }, 1.5))
  expect(synced).not.toEqual(render({ ...look, delayMs: 350 }, 1.5))
})

const phrase = (bars: number, shape: string) =>
  bay({
    mod0Src: 14,
    modPhraseBars: PHRASE_BARS.indexOf(bars),
    modPhraseShape: PHRASE_SHAPES.indexOf(shape),
  })

test('a phrase rises over its bars and drops back on the downbeat', () => {
  const block = phrase(4, 'rise')
  expect(block(0)[0]).toBeCloseTo(0, 3)
  expect(block(32)[0]).toBeCloseTo(0.5, 3)
  expect(block(63)[0]).toBeCloseTo(63 / 64, 3)
  expect(block(64)[0]).toBeCloseTo(0, 3)
})

test('a build saves its climb for the end of the phrase', () => {
  const block = phrase(8, 'build')
  expect(block(64)[0]).toBeCloseTo(0.125, 3)
  expect(block(112)[0]).toBeGreaterThan(0.6)
})

test('stairs climb a notch a bar', () => {
  const block = phrase(8, 'stairs')
  expect(block(15)[0]).toBe(0)
  expect(block(16)[0]).toBeCloseTo(1 / 7, 3)
  expect(block(127)[0]).toBe(1)
})

test('between strobes the phrase runs on at the kit’s tempo', () => {
  const block = phrase(1, 'rise')
  block(0)
  const perStep = SR / 8 / BLOCK
  let last = 0
  for (let b = 1; b < Math.round(perStep * 4); b++) last = block()[BLOCK - 1]!
  expect(last).toBeCloseTo(4 / 16, 1)
})

test('the phrase grows a wire’s depth under a fast LFO', () => {
  const block = bay({
    mod0Depth: 0,
    modLfoSync: lfoSync('sixteenths'),
    mod1Src: 14,
    mod1Dest: 17,
    mod1Depth: 1,
    modPhraseBars: PHRASE_BARS.indexOf(1),
  })
  const swing = (tick: number) => {
    let peak = Math.max(...block(tick).map(Math.abs))
    for (let b = 1; b < Math.round(SR / 8 / BLOCK); b++)
      peak = Math.max(peak, ...block().map(Math.abs))
    return peak
  }
  expect(swing(1)).toBeLessThan(0.2)
  expect(swing(14)).toBeGreaterThan(0.8)
})
