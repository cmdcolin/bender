import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS, type Controls } from '../controls.ts'
import {
  MAX_SOURCES,
  packParams,
  SOURCE_TAPS,
  TAP_MIC,
} from '../engine/params.ts'
import {
  ALL_LINES,
  BEND_LINE_KEYS,
  JACK_KEYS,
  LINE_COUNT,
  lineOf,
  linesFromJack,
  linesOfTaps,
  tapMaskOf,
} from '../jacks.ts'
import { PEDALS } from '../pedals.ts'
import { BENDS } from '../ui/controls/bends.ts'
import { Chain } from './chain.ts'
import { BLOCK, NEEDS_TOY, type Stage, type StereoBlock } from './stage.ts'
import { Amp } from './stages/amp.ts'
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

// A unit moving lines takes a block to fade out and one to fade in.
const SETTLE = 3

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
    const p = packParams({ ...DEFAULT_CONTROLS, ...EMPTY, ...c })
    for (let b = 0; b < SETTLE; b++) chain.process(makeIo(), p)
    return out.at(-1)!
  }
  return { run, pedal: pedal.heard, bend: bend.heard, chain }
}

test('a pedal patched into one machine processes only that machine', () => {
  const { run, pedal } = rig()
  expect(run({})).toBeCloseTo((0.5 + 0.2) * 0.5, 6)
  expect(run({ stompLines: lineOf(0) })).toBeCloseTo(0.5 * 0.5 + 0.2, 6)
  expect(pedal.at(-1)).toBeCloseTo(0.5, 6)
  expect(run({ stompLines: lineOf(1) })).toBeCloseTo(0.5 + 0.2 * 0.5, 6)
  expect(pedal.at(-1)).toBeCloseTo(0.2, 6)
})

test('a patched pedal leaves the master run', () => {
  const { run, pedal } = rig()
  run({})
  run({ stompLines: lineOf(1) })
  expect(pedal).toHaveLength(2 * SETTLE)
})

test('a bend patched into a machine leaves its socket and runs there', () => {
  const { run, bend } = rig()
  expect(run({ bendSlot0: 2 })).toBeCloseTo(0.7 * 0.25 * 0.5, 6)
  expect(run({ bendSlot0: 2, crushLines: lineOf(0) })).toBeCloseTo(
    (0.5 * 0.25 + 0.2) * 0.5,
    6,
  )
  expect(bend).toHaveLength(2 * SETTLE)
  expect(bend.at(-1)).toBeCloseTo(0.5, 6)
})

test('a patched bend runs on its machine without a socket', () => {
  const { run, bend } = rig()
  expect(run({ crushLines: lineOf(1) })).toBeCloseTo(
    (0.5 + 0.2 * 0.25) * 0.5,
    6,
  )
  expect(bend).toHaveLength(SETTLE)
})

test('units on one machine run bends first, then pedals', () => {
  const { run, bend, pedal } = rig()
  run({ crushLines: lineOf(0), stompLines: lineOf(0) })
  expect(bend.at(-1)).toBeCloseTo(0.5, 6)
  expect(pedal.at(-1)).toBeCloseTo(0.5 * 0.25, 6)
})

test('a machine’s meter reads its patched line', () => {
  const { run, chain } = rig()
  chain.taps.fill(0)
  run({ stompLines: lineOf(0) })
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
      stompLines: lineOf(TAP_MIC),
    }),
    mic,
  )
  expect(unit.heard).toEqual([expect.closeTo(0.4, 6)])
})

test('every unit has a jack, and every machine and the mic is a target', () => {
  expect(BENDS.map(b => b.into)).toEqual(BEND_LINE_KEYS)
  expect(JACK_KEYS.size).toBe(BENDS.length + PEDALS.length)
  for (const key of JACK_KEYS) expect(DEFAULT_CONTROLS[key]).toBe(0)
  expect(tapMaskOf(0)).toBe(0)
  for (let k = 0; k < SOURCE_TAPS.length; k++)
    expect(tapMaskOf(lineOf(k))).toBe(1 << k)
  expect(tapMaskOf(lineOf(TAP_MIC))).toBe(1 << TAP_MIC)
})

test('a lines mask keeps the mic at bit 0 and source k at bit 1 + k, and the chain reads it in tap bits', () => {
  expect(lineOf(TAP_MIC)).toBe(1)
  for (let k = 0; k < SOURCE_TAPS.length; k++)
    expect(lineOf(k)).toBe(2 ** (1 + k))
  const lines = lineOf(TAP_MIC) | lineOf(0) | lineOf(5)
  expect(tapMaskOf(lines)).toBe((1 << TAP_MIC) | 1 | (1 << 5))
  for (let mask = 0; mask <= ALL_LINES; mask += 37)
    expect(linesOfTaps(tapMaskOf(mask))).toBe(mask)
  expect(tapMaskOf(ALL_LINES)).toBe((1 << (TAP_MIC + 1)) - 1)
})

test('an old Into value moves to the one line it named', () => {
  expect(linesFromJack(0)).toBe(0)
  expect(linesFromJack(1)).toBe(lineOf(TAP_MIC))
  for (let k = 0; k < SOURCE_TAPS.length; k++)
    expect(linesFromJack(k + 2)).toBe(lineOf(k))
})

test('every line fits the sixteen bits a packed link and a mask hold', () => {
  expect(MAX_SOURCES + 1).toBeLessThanOrEqual(16)
  expect(LINE_COUNT).toBe(MAX_SOURCES + 1)
})

const KIT = SOURCE_TAPS.indexOf('toyDrum')
const EMBER = { ampMix: 1, ampGain: 0.9, ampLevel: 0.5 }
const play = (c: Partial<Controls>) =>
  renderBender(c, 0.5, built => built.runTransport(true, true))

test('Ember on Clatter leaves Plinky dry', () => {
  const toyAlone = { chipLevel: 0.8, drumLevel: 0 }
  const dry = play(toyAlone)
  const jacked = play({ ...toyAlone, ...EMBER, ampLines: lineOf(KIT) })
  expect(jacked).toEqual(dry)
  const both = { chipLevel: 0.8, drumLevel: 0.9 }
  const onKit = play({ ...both, ...EMBER, ampLines: lineOf(KIT) })
  const onMaster = play({ ...both, ...EMBER })
  expect(rms(dry)).toBeGreaterThan(0.01)
  expect(rms(onKit)).toBeGreaterThan(0.01)
  expect(onKit).not.toEqual(onMaster)
  expect(onKit).not.toEqual(play(both))
})

const sine = (label: string, hz: number, amp: number): Stage => {
  let phase = 0
  return {
    label,
    process(io: StereoBlock) {
      for (let i = 0; i < io.n; i++) {
        const v = amp * Math.sin(phase)
        phase += (2 * Math.PI * hz) / SR
        io.l[i]! += v
        io.r[i]! += v
      }
    },
    panic: () => {},
  }
}

const idle = (label: string): Stage => ({
  label,
  when: () => false,
  process: () => {},
  panic: () => {},
})

// The biggest sample-to-sample step in the blocks around a change made at
// block 200, with Ember on a sine.
function switchStep(change: Partial<Controls>) {
  const chain = new Chain(SR)
  chain.sources = [sine('a', 110, 0.3), sine('b', 0, 0)]
  chain.pedals = [...PEDALS.slice(0, -1).map(p => idle(p.label)), new Amp(SR)]
  const board = {
    ...DEFAULT_CONTROLS,
    ...EMPTY,
    ampMix: 1,
    ampGain: 0.05,
    ampLevel: -24,
  }
  const before = packParams(board)
  const after = packParams({ ...board, ...change })
  const io = makeIo()
  let last = 0
  let worst = 0
  for (let b = 0; b < 210; b++) {
    chain.process(io, b < 200 ? before : after)
    for (let i = 0; i < BLOCK; i++) {
      if (b >= 199) worst = Math.max(worst, Math.abs(io.l[i]! - last))
      last = io.l[i]!
    }
  }
  return worst
}

test('moving a unit between lines mid-play fades like its footswitch', () => {
  const footswitch = switchStep({ ampMute: 1 })
  expect(switchStep({ ampLines: lineOf(1) })).toBeLessThan(2 * footswitch)
  expect(switchStep({ ampLines: lineOf(0) })).toBeLessThan(2 * footswitch)
})

// A unit that plays back the block before the one it is handed.
function late(label: string): Stage {
  const held = new Float32Array(BLOCK)
  return {
    label,
    process(io: StereoBlock) {
      for (let i = 0; i < io.n; i++) {
        const v = io.l[i]!
        io.l[i] = held[i]!
        io.r[i] = held[i]!
        held[i] = v
      }
    },
    panic: () => held.fill(0),
  }
}

test('a unit moved onto a machine brings none of the master run with it', () => {
  const chain = new Chain(SR)
  chain.sources = [writer('a', 0.5), writer('b', 0)]
  chain.pedals = [late('stomp')]
  const out: number[] = []
  chain.post = [
    {
      label: 'probe',
      process(io: StereoBlock) {
        out.push(...io.l)
      },
      panic: () => {},
    },
  ]
  const hold = (c: Partial<Controls>) => {
    const p = packParams({ ...DEFAULT_CONTROLS, ...EMPTY, ...c })
    for (let b = 0; b < 4; b++) chain.process(makeIo(), p)
  }
  hold({})
  hold({ stompLines: lineOf(1) })
  for (const v of out.slice(2 * BLOCK)) expect(v).toBeCloseTo(0.5, 6)
})

test('a machine going bad drops only what the bus held, patched lines too', () => {
  let blow = false
  const bad: Stage = {
    label: 'bad',
    process(io: StereoBlock) {
      if (blow) io.l[3] = Number.NaN
    },
    panic: () => {},
  }
  const silencer: Stage = {
    label: 'stomp',
    process(io: StereoBlock) {
      io.l.fill(0, 0, io.n)
      io.r.fill(0, 0, io.n)
    },
    panic: () => {},
  }
  const out: number[] = []
  const chain = new Chain(SR)
  chain.sources = [writer('a', 0.5), bad, writer('c', 0.1)]
  chain.pedals = [silencer]
  chain.post = [
    {
      label: 'probe',
      process(io: StereoBlock) {
        out.push(io.l[BLOCK - 1]!)
      },
      panic: () => {},
    },
  ]
  const p = packParams({ ...DEFAULT_CONTROLS, ...EMPTY, stompLines: lineOf(0) })
  chain.process(makeIo(), p)
  blow = true
  chain.process(makeIo(), p)
  expect(out).toEqual([expect.closeTo(0.1, 6), expect.closeTo(0.1, 6)])
  expect(chain.faults).toBe(1)
})

test('the mic’s meter reads its patched line', () => {
  const mic = new Float32Array(BLOCK).fill(0.4)
  const chain = new Chain(SR)
  chain.sources = [writer('a', 0.5)]
  chain.pedals = [spy('pedal').stage]
  chain.taps.fill(0)
  chain.process(
    makeIo(),
    packParams({
      ...DEFAULT_CONTROLS,
      micLevel: 1,
      micPatch: 0,
      stompLines: lineOf(TAP_MIC),
    }),
    mic,
  )
  expect(chain.taps[TAP_MIC]).toBeCloseTo(0.2, 6)
})

// The toy at 0.5 with a halving pedal on it, and the kit at 0.2; the ring mod
// multiplies by the toy and reports the carrier it was handed.
function carrierHeard(c: Partial<Controls>) {
  const heard: number[] = []
  const ring: Stage = {
    label: 'ring',
    process(_io, _p, ctx) {
      heard.push(ctx.carrier[BLOCK - 1]!)
    },
    panic: () => {},
  }
  const chain = new Chain(SR)
  chain.sources = [writer('toy', 0.5), writer('kit', 0.2)]
  chain.pedals = [spy('pedal').stage]
  chain.bendById = [undefined, ring]
  const p = packParams({
    ...DEFAULT_CONTROLS,
    ...EMPTY,
    bendSlot0: 1,
    ringFrom: 1,
    stompLines: lineOf(0),
    ...c,
  })
  for (let b = 0; b < SETTLE; b++) chain.process(makeIo(), p)
  return heard.at(-1)
}

test('a carrier off a patched machine is its wet line, but dry to a unit on it', () => {
  expect(carrierHeard({ stompLines: 0 })).toBeCloseTo(0.5, 6)
  expect(carrierHeard({})).toBeCloseTo(0.25, 6)
  expect(carrierHeard({ ringLines: lineOf(1) })).toBeCloseTo(0.25, 6)
  expect(carrierHeard({ ringLines: lineOf(0) })).toBeCloseTo(0.5, 6)
})

test('the kit’s DAC hears the toy’s patched line a block on, as off a cable', () => {
  const heard: number[] = []
  const kit: Stage = {
    label: 'kit',
    needs: () => NEEDS_TOY,
    process(_io, _p, ctx) {
      heard.push(ctx.toy[BLOCK - 1]!)
    },
    panic: () => {},
  }
  const chain = new Chain(SR)
  chain.sources = [writer('toy', 0.5), kit]
  chain.pedals = [spy('pedal').stage]
  const run = (c: Partial<Controls>) => {
    const p = packParams({ ...DEFAULT_CONTROLS, ...c })
    for (let b = 0; b < SETTLE; b++) chain.process(makeIo(), p)
    return heard.at(-1)
  }
  expect(run({})).toBeCloseTo(0.5, 6)
  expect(run({ stompLines: lineOf(0) })).toBeCloseTo(0.25, 6)
})
