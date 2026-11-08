import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS, type Controls } from '../controls.ts'
import { packParams, TAP_MIC } from '../engine/params.ts'
import { BEND_LINE_KEYS, lineOf } from '../jacks.ts'
import { Chain } from './chain.ts'
import { BLOCK, type Stage, type StereoBlock } from './stage.ts'
import { makeIo, SR } from './testRender.ts'

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

function spy(label: string, gain: number) {
  const heard: number[] = []
  const panics = { count: 0 }
  const stage: Stage = {
    label,
    process(io: StereoBlock) {
      heard.push(io.l[io.n - 1]!)
      for (let i = 0; i < io.n; i++) {
        io.l[i]! *= gain
        io.r[i]! *= gain
      }
    },
    panic: () => {
      panics.count++
    },
  }
  return { stage, heard, panics }
}

const EMPTY: Partial<Controls> = {
  bendSlot0: 0,
  bendSlot1: 0,
  bendSlot2: 0,
  bendSlot3: 0,
  bendSlot4: 0,
  bendSlot5: 0,
  dlyLines: lineOf(3),
}

const A = lineOf(0)
const B = lineOf(1)
const C = lineOf(2)

function rig() {
  const out: number[] = []
  const chain = new Chain(SR)
  chain.sources = [writer('a', 0.5), writer('b', 0.2), writer('c', 0.1)]
  const stomp = spy('stomp', 0.5)
  const tape = spy('tape', 0.25)
  const crush = spy('crush', 0.1)
  chain.pedals = [stomp.stage, tape.stage]
  chain.bendById = [undefined, undefined, crush.stage]
  chain.post = [
    {
      label: 'probe',
      process(io) {
        out.push(io.l[BLOCK - 1]!)
      },
      panic: () => {},
    },
  ]
  const run = (c: Partial<Controls>, blocks = 3) => {
    const p = packParams({ ...DEFAULT_CONTROLS, ...EMPTY, ...c })
    for (let b = 0; b < blocks; b++) chain.process(makeIo(), p)
    return out.at(-1)!
  }
  return { run, stomp, tape, crush, chain }
}

test('a unit on two machines hears both lines and leaves the third dry', () => {
  const { run, stomp } = rig()
  expect(run({ stompLines: A | B })).toBeCloseTo(0.7 * 0.5 + 0.1, 6)
  expect(stomp.heard.at(-1)).toBeCloseTo(0.7, 6)
})

test('a unit on a set nested in another runs first, so the wider set hears its return', () => {
  const { run, stomp, tape } = rig()
  expect(run({ stompLines: A | B, dlyLines: A | B | C })).toBeCloseTo(
    (0.7 * 0.5 + 0.1) * 0.25,
    6,
  )
  expect(stomp.heard.at(-1)).toBeCloseTo(0.7, 6)
  expect(tape.heard.at(-1)).toBeCloseTo(0.45, 6)
})

test('the nesting decides the order whatever the rack order', () => {
  const { run, stomp, tape } = rig()
  run({ stompLines: A | B | C, dlyLines: A | B })
  expect(tape.heard.at(-1)).toBeCloseTo(0.7, 6)
  expect(stomp.heard.at(-1)).toBeCloseTo(0.7 * 0.25 + 0.1, 6)
})

test('two sets that share a line run side by side on the dry lines', () => {
  const { run, stomp, tape } = rig()
  const out = run({ stompLines: A | B, dlyLines: B | C })
  expect(stomp.heard.at(-1)).toBeCloseTo(0.7, 6)
  expect(tape.heard.at(-1)).toBeCloseTo(0.3, 6)
  expect(out).toBeCloseTo(0.8 + (0.35 - 0.7) + (0.075 - 0.3), 6)
})

test('units on the same set run one after another, bends first', () => {
  const { run, stomp, crush } = rig()
  expect(run({ stompLines: A | B, crushLines: A | B })).toBeCloseTo(
    0.7 * 0.1 * 0.5 + 0.1,
    6,
  )
  expect(crush.heard.at(-1)).toBeCloseTo(0.7, 6)
  expect(stomp.heard.at(-1)).toBeCloseTo(0.07, 6)
})

test('a unit on one of the lines runs before a set that holds that line', () => {
  const { run, stomp } = rig()
  run({ crushLines: A, stompLines: A | B })
  expect(stomp.heard.at(-1)).toBeCloseTo(0.05 + 0.2, 6)
})

test('a set with the mic in it hears the mic, read from bit 0 of the mask', () => {
  const { chain, stomp } = rig()
  const mic = new Float32Array(BLOCK).fill(0.4)
  const p = packParams({
    ...DEFAULT_CONTROLS,
    ...EMPTY,
    micLevel: 1,
    micPatch: 0,
    stompLines: lineOf(TAP_MIC) | B,
  })
  for (let b = 0; b < 3; b++) chain.process(makeIo(), p, mic)
  expect(lineOf(TAP_MIC)).toBe(1)
  expect(stomp.heard.at(-1)).toBeCloseTo(0.6, 6)
})

test('adding a line to a unit already on one keeps its state and fades the new line in', () => {
  const { run, stomp } = rig()
  run({ stompLines: A })
  const before = stomp.heard.length
  run({ stompLines: A | B }, 1)
  expect(stomp.heard.length).toBe(before + 1)
  expect(stomp.heard.at(-1)).toBeCloseTo(0.7, 6)
  run({ stompLines: A | B })
  run({ stompLines: B })
  expect(stomp.panics.count).toBe(0)
  expect(stomp.heard.at(-1)).toBeCloseTo(0.2, 6)
})

test('a move onto lines it shares nothing with, or off master, fades out and flushes the unit', () => {
  const { run, stomp } = rig()
  run({ stompLines: A | B })
  run({ stompLines: C })
  expect(stomp.panics.count).toBe(1)
  run({ stompLines: 0 })
  expect(stomp.panics.count).toBe(2)
  run({ stompLines: A | C })
  expect(stomp.panics.count).toBe(3)
})

test('a line fading in during the crossfade passes the rest of itself dry', () => {
  const { chain } = rig()
  const p0 = packParams({ ...DEFAULT_CONTROLS, ...EMPTY, stompLines: A })
  const p1 = packParams({ ...DEFAULT_CONTROLS, ...EMPTY, stompLines: A | B })
  for (let b = 0; b < 3; b++) chain.process(makeIo(), p0)
  const io = makeIo()
  const seen: number[] = []
  chain.post = [
    {
      label: 'probe',
      process(block) {
        seen.push(block.l[0]!, block.l[BLOCK - 1]!)
      },
      panic: () => {},
    },
  ]
  chain.process(io, p1)
  const g = 1 / BLOCK
  expect(seen[0]).toBeCloseTo(0.25 + 0.2 * (1 - g) + 0.1 * g + 0.1, 6)
  expect(seen[1]).toBeCloseTo(0.35 + 0.1, 6)
})

test('each unit posts the peak of what it added to its input, so a muted share reads 0', () => {
  const { run, chain } = rig()
  const STOMP = BEND_LINE_KEYS.length
  chain.returns.fill(0)
  run({ stompLines: A | B })
  expect(chain.returns[STOMP]).toBeCloseTo(0.35, 6)
  run({ stompLines: A | B, stompMute: 1 })
  chain.returns.fill(0)
  run({ stompLines: A | B, stompMute: 1 }, 1)
  expect(chain.returns[STOMP]).toBeCloseTo(0, 6)
})
