import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS, type Controls } from '../../controls.ts'
import { packParams } from '../../engine/params.ts'
import { ModBus } from '../modbus.ts'
import { BLOCK, GLINT_REGS, type Ctx } from '../stage.ts'
import { highEnergy, rms, SR } from '../testRender.ts'
import { TriggerBus } from '../trigbus.ts'
import { RackVerb } from './rackVerb.ts'

const blank = (): Ctx => ({
  sr: SR,
  mic: new Float32Array(BLOCK),
  fb: new Float32Array(BLOCK),
  railV: new Float32Array(BLOCK).fill(1),
  sag: new Float32Array(BLOCK),
  droop: new Float32Array(BLOCK),
  env: new Float32Array(BLOCK),
  out: new Float32Array(BLOCK),
  step: new Float32Array(BLOCK),
  carrier: new Float32Array(BLOCK),
  logic: new Float32Array(BLOCK),
  toy: new Float32Array(BLOCK),
  fm: new Float32Array(BLOCK),
  send: new Float32Array(BLOCK),
  bright: new Float32Array(BLOCK),
  gnd: new Float32Array(BLOCK),
  regs: new Uint8Array(GLINT_REGS),
  heat: 0,
  fbDest: 0,
  mod: new ModBus(SR, 1),
  trig: new TriggerBus(),
})

const BURST_S = 0.1

const burst = (t: number) =>
  t < BURST_S * SR ? 0.5 * Math.sin((2 * Math.PI * 330 * t) / SR) : 0

function run(
  board: Partial<Controls>,
  seconds: number,
  later?: { at: number; board: Partial<Controls> },
  droop = 0,
) {
  const verb = new RackVerb(SR)
  const first = packParams({ ...DEFAULT_CONTROLS, rackMix: 1, ...board })
  const second = later
    ? packParams({ ...DEFAULT_CONTROLS, rackMix: 1, ...board, ...later.board })
    : first
  const ctx = blank()
  ctx.droop.fill(droop)
  const io = {
    l: new Float32Array(BLOCK),
    r: new Float32Array(BLOCK),
    n: BLOCK,
  }
  const blocks = Math.ceil((seconds * SR) / BLOCK)
  const l = new Float32Array(blocks * BLOCK)
  const r = new Float32Array(blocks * BLOCK)
  for (let b = 0; b < blocks; b++) {
    for (let i = 0; i < BLOCK; i++) io.l[i] = io.r[i] = burst(b * BLOCK + i)
    const p = later && b * BLOCK >= later.at * SR ? second : first
    verb.process(io, p, ctx)
    l.set(io.l, b * BLOCK)
    r.set(io.r, b * BLOCK)
  }
  return { l, r, verb }
}

const span = (x: Float32Array, from: number, to: number) =>
  x.subarray(Math.floor(from * SR), Math.floor(to * SR))

const finite = (x: Float32Array) => x.every(Number.isFinite)

test('a burst leaves a stereo tail that dies away', () => {
  const { l, r } = run({}, 4)
  const early = rms(span(l, 0.3, 0.8))
  const late = rms(span(l, 3, 3.5))
  expect(early).toBeGreaterThan(0.01)
  expect(late).toBeLessThan(early / 4)
  expect(rms(span(l, 0.3, 0.8))).not.toBeCloseTo(rms(span(r, 0.3, 0.8)), 4)
})

test('more decay rings longer', () => {
  const short = rms(span(run({ rackDecay: 0.4 }, 3).l, 2, 3))
  const long = rms(span(run({ rackDecay: 0.95 }, 3).l, 2, 3))
  expect(long).toBeGreaterThan(short * 4)
})

test('freeze holds the tank once the input is gone', () => {
  const { l } = run({}, 6, { at: 0.5, board: { rackFreeze: 1 } })
  const held = rms(span(l, 1, 2))
  expect(held).toBeGreaterThan(0.005)
  expect(rms(span(l, 5, 6))).toBeGreaterThan(held / 2)
})

test('a slow clock makes the room longer', () => {
  const stock = run({}, 3).l
  const slow = run({ rackClock: 0.25 }, 3).l
  expect(rms(span(slow, 2, 3))).toBeGreaterThan(rms(span(stock, 2, 3)))
})

test('a sagging supply with drag drags the clock down', () => {
  const firm = run({ rackDrag: 1 }, 3).l
  const sagging = run({ rackDrag: 1 }, 3, undefined, 0.8).l
  expect(rms(span(sagging, 2, 3))).toBeGreaterThan(rms(span(firm, 2, 3)))
})

test('decay past 1 keeps the tail going and stays bounded', () => {
  const { l } = run({ rackDecay: 1.1 }, 6)
  const out = span(l, 5, 6)
  expect(rms(out)).toBeGreaterThan(0.05)
  expect(finite(l)).toBe(true)
  expect(Math.max(...out.map(Math.abs))).toBeLessThanOrEqual(1.1)
})

test('a knife on a high address line changes the room', () => {
  const stock = span(run({}, 2).l, 0.3, 1.5)
  const cut = span(run({ rackAddrLine: 15, rackAddrFault: 1 }, 2).l, 0.3, 1.5)
  let diff = 0
  for (let i = 0; i < stock.length; i++) diff += (stock[i]! - cut[i]!) ** 2
  expect(Math.sqrt(diff / stock.length)).toBeGreaterThan(rms(stock) / 4)
  expect(finite(cut)).toBe(true)
})

test('refresh fail leaks noise into a silent memory', () => {
  const clean = run({ rackRefresh: 0 }, 2).l
  const leaky = run({ rackRefresh: 1 }, 2).l
  expect(highEnergy(span(leaky, 1, 2), 3000)).toBeGreaterThan(
    highEnergy(span(clean, 1, 2), 3000) * 2,
  )
})

test('a short word truncates the tail away sooner', () => {
  const full = rms(span(run({ rackBits: 16 }, 3).l, 2, 3))
  const short = rms(span(run({ rackBits: 6 }, 3).l, 2, 3))
  expect(short).not.toBeCloseTo(full, 3)
})

test('panic empties the memory', () => {
  const { verb } = run({ rackFreeze: 1 }, 0.5)
  verb.panic()
  const ctx = blank()
  const io = {
    l: new Float32Array(BLOCK),
    r: new Float32Array(BLOCK),
    n: BLOCK,
  }
  const p = packParams({ ...DEFAULT_CONTROLS, rackMix: 1 })
  verb.process(io, p, ctx)
  expect(rms(io.l)).toBe(0)
})
