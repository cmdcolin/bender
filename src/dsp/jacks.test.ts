import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS, type Controls } from '../controls.ts'
import { packParams, SOURCE_TAPS, TAP_MIC } from '../engine/params.ts'
import { BEND_INTO_KEYS, JACK_KEYS, jackOf, jackTap } from '../jacks.ts'
import { PEDALS } from '../pedals.ts'
import { BENDS } from '../ui/controls/bends.ts'
import { Chain } from './chain.ts'
import { BLOCK, type Stage, type StereoBlock } from './stage.ts'
import { makeIo, renderBender, rms, SR } from './testRender.ts'

const writer = (label: string, v: number): Stage => ({
  label,
  process(io: StereoBlock) {
    for (let i = 0; i < io.n; i++) {
      io.l[i]! += v
      io.r[i]! += v
    }
  },
  panic: () => {},
})

// A unit that halves what it is handed and remembers each block it saw.
function spy(label: string, gain = 0.5) {
  const heard: number[] = []
  const stage: Stage = {
    label,
    process(io: StereoBlock) {
      heard.push(io.l[io.n - 1]!)
      for (let i = 0; i < io.n; i++) {
        io.l[i]! *= gain
        io.r[i]! *= gain
      }
    },
    panic: () => {},
  }
  return { stage, heard }
}

const EMPTY: Partial<Controls> = {
  bendSlot0: 0,
  bendSlot1: 0,
  bendSlot2: 0,
  bendSlot3: 0,
  bendSlot4: 0,
  bendSlot5: 0,
}

function rig() {
  const out: number[] = []
  const probe: Stage = {
    label: 'probe',
    process(io) {
      out.push(io.l[BLOCK - 1]!)
    },
    panic: () => {},
  }
  const chain = new Chain(SR)
  chain.sources = [writer('a', 0.5), writer('b', 0.2)]
  const pedal = spy('pedal')
  const bend = spy('bend', 0.25)
  chain.pedals = [pedal.stage]
  chain.bendById = [undefined, undefined, bend.stage]
  chain.post = [probe]
  const run = (c: Partial<Controls>) => {
    chain.process(makeIo(), packParams({ ...DEFAULT_CONTROLS, ...EMPTY, ...c }))
    return out.at(-1)!
  }
  return { run, pedal: pedal.heard, bend: bend.heard, chain }
}

test('a pedal patched into one machine processes only that machine', () => {
  const { run, pedal } = rig()
  expect(run({})).toBeCloseTo((0.5 + 0.2) * 0.5, 6)
  expect(run({ stompInto: jackOf(0) })).toBeCloseTo(0.5 * 0.5 + 0.2, 6)
  expect(pedal.at(-1)).toBeCloseTo(0.5, 6)
  expect(run({ stompInto: jackOf(1) })).toBeCloseTo(0.5 + 0.2 * 0.5, 6)
  expect(pedal.at(-1)).toBeCloseTo(0.2, 6)
})

test('a patched pedal leaves the master run', () => {
  const { run, pedal } = rig()
  run({})
  run({ stompInto: jackOf(1) })
  expect(pedal).toHaveLength(2)
})

test('a bend patched into a machine leaves its socket and runs there', () => {
  const { run, bend } = rig()
  expect(run({ bendSlot0: 2 })).toBeCloseTo(0.7 * 0.25 * 0.5, 6)
  expect(run({ bendSlot0: 2, crushInto: jackOf(0) })).toBeCloseTo(
    (0.5 * 0.25 + 0.2) * 0.5,
    6,
  )
  expect(bend).toHaveLength(2)
  expect(bend.at(-1)).toBeCloseTo(0.5, 6)
})

test('a patched bend runs on its machine without a socket', () => {
  const { run, bend } = rig()
  expect(run({ crushInto: jackOf(1) })).toBeCloseTo((0.5 + 0.2 * 0.25) * 0.5, 6)
  expect(bend).toHaveLength(1)
})

test('units on one machine run bends first, then pedals', () => {
  const { run, bend, pedal } = rig()
  run({ crushInto: jackOf(0), stompInto: jackOf(0) })
  expect(bend.at(-1)).toBeCloseTo(0.5, 6)
  expect(pedal.at(-1)).toBeCloseTo(0.5 * 0.25, 6)
})

test('a machine’s meter reads its patched line', () => {
  const { run, chain } = rig()
  chain.taps.fill(0)
  run({ stompInto: jackOf(0) })
  expect(chain.taps[0]).toBeCloseTo(0.25, 6)
  expect(chain.taps[1]).toBeCloseTo(0.2, 6)
})

test('a unit patched into the mic hears the mic alone', () => {
  const mic = new Float32Array(BLOCK).fill(0.4)
  const chain = new Chain(SR)
  chain.sources = [writer('a', 0.5)]
  const unit = spy('pedal')
  chain.pedals = [unit.stage]
  chain.process(
    makeIo(),
    packParams({
      ...DEFAULT_CONTROLS,
      micLevel: 1,
      micPatch: 0,
      stompInto: jackOf(TAP_MIC),
    }),
    mic,
  )
  expect(unit.heard).toEqual([expect.closeTo(0.4, 6)])
})

test('every unit has a jack, and every machine and the mic is a target', () => {
  expect(BENDS.map(b => b.into)).toEqual(BEND_INTO_KEYS)
  expect(JACK_KEYS.size).toBe(BENDS.length + PEDALS.length)
  for (const key of JACK_KEYS) expect(DEFAULT_CONTROLS[key]).toBe(0)
  expect(jackTap(0)).toBe(-1)
  for (let k = 0; k < SOURCE_TAPS.length; k++)
    expect(jackTap(jackOf(k))).toBe(k)
  expect(jackTap(jackOf(TAP_MIC))).toBe(TAP_MIC)
})

const KIT = SOURCE_TAPS.indexOf('toyDrum')
const EMBER = { ampMix: 1, ampGain: 0.9, ampLevel: 0.5 }
const play = (c: Partial<Controls>) =>
  renderBender(c, 0.5, built => built.runTransport(true, true))

test('Ember on Clatter leaves Plinky dry', () => {
  const toyAlone = { chipLevel: 0.8, drumLevel: 0 }
  const dry = play(toyAlone)
  const jacked = play({ ...toyAlone, ...EMBER, ampInto: jackOf(KIT) })
  expect(jacked).toEqual(dry)
  const both = { chipLevel: 0.8, drumLevel: 0.9 }
  const onKit = play({ ...both, ...EMBER, ampInto: jackOf(KIT) })
  const onMaster = play({ ...both, ...EMBER })
  expect(rms(dry)).toBeGreaterThan(0.01)
  expect(rms(onKit)).toBeGreaterThan(0.01)
  expect(onKit).not.toEqual(onMaster)
  expect(onKit).not.toEqual(play(both))
})
