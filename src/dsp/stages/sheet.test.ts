import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS, type Controls } from '../../controls.ts'
import { packParams } from '../../engine/params.ts'
import { ModBus } from '../modbus.ts'
import { BLOCK, GLINT_REGS, type Ctx } from '../stage.ts'
import { highEnergy, rms, SR } from '../testRender.ts'
import { TriggerBus } from '../trigbus.ts'
import { Sheet, SHEET_KEY_CHOICE } from './sheet.ts'

const blank = (): Ctx => ({
  sr: SR,
  mic: new Float32Array(BLOCK),
  mic2: new Float32Array(BLOCK),
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

const KICK = 1

function run(
  board: Partial<Controls>,
  seconds: number,
  {
    input = (_t: number) => 0,
    key = -1,
    kick = -1,
  }: { input?: (t: number) => number; key?: number; kick?: number } = {},
) {
  const sheet = new Sheet(SR)
  const p = packParams({
    ...DEFAULT_CONTROLS,
    sheetMix: 1,
    sheetStrikes: 0,
    ...board,
  })
  const ctx = blank()
  const io = {
    l: new Float32Array(BLOCK),
    r: new Float32Array(BLOCK),
    n: BLOCK,
  }
  const blocks = Math.ceil((seconds * SR) / BLOCK)
  const out = new Float32Array(blocks * BLOCK)
  for (let b = 0; b < blocks; b++) {
    ctx.trig.key.fill(0)
    ctx.trig.drumBits.fill(0)
    ctx.trig.drumGain.fill(0)
    if (b === key) ctx.trig.key[0] = 1
    if (b === kick) {
      ctx.trig.drumBits[0] = KICK
      ctx.trig.drumGain[0] = 1
    }
    for (let i = 0; i < BLOCK; i++) {
      io.l[i] = input(b * BLOCK + i)
      io.r[i] = io.l[i]!
    }
    sheet.process(io, p, ctx)
    out.set(io.l, b * BLOCK)
  }
  return out
}

const span = (x: Float32Array, from: number, to: number) =>
  x.subarray(Math.round(from * SR), Math.round(to * SR))

test('left alone with nothing to shake it, the sheet is silent', () => {
  const out = run({}, 1)
  expect(out.every(v => v === 0)).toBe(true)
})

test('a key strikes it, and the ring loses its highs first', () => {
  const out = run(
    { sheetStruckBy: SHEET_KEY_CHOICE, sheetHard: 1, sheetRattle: 0 },
    1,
    { key: 2 },
  )
  const early = span(out, 0.006, 0.03)
  const late = span(out, 0.35, 0.5)
  expect(rms(early)).toBeGreaterThan(0.01)
  expect(highEnergy(late, 3000) / rms(late)).toBeLessThan(
    highEnergy(early, 3000) / rms(early) / 2,
  )
})

test('a kick strikes it only while it is struck by the kick', () => {
  const struck = run({ sheetStruckBy: KICK }, 0.3, { kick: 2 })
  const ignored = run({ sheetStruckBy: 0 }, 0.3, { kick: 2 })
  expect(rms(struck)).toBeGreaterThan(0.001)
  expect(ignored.every(v => v === 0)).toBe(true)
})

test('shake rings the sheet off the board’s own sound', () => {
  const drone = (t: number) => 0.3 * Math.sin((2 * Math.PI * 110 * t) / SR)
  const shaken = run({ sheetShake: 1 }, 1, { input: drone })
  const still = run({ sheetShake: 0 }, 1, { input: drone })
  expect(rms(span(shaken, 0.5, 1))).toBeGreaterThan(0.01)
  expect(rms(span(still, 0.5, 1))).toBe(0)
})

test('the hardest, smallest, longest-held, busiest sheet stays finite and in range', () => {
  const out = run(
    {
      sheetStrikes: 8,
      sheetHard: 1,
      sheetSize: 0.25,
      sheetHold: 1,
      sheetRattle: 1,
      sheetShake: 1,
    },
    3,
    { input: t => 0.5 * Math.sin((2 * Math.PI * 55 * t) / SR) },
  )
  expect(out.every(Number.isFinite)).toBe(true)
  expect(out.reduce((m, v) => Math.max(m, Math.abs(v)), 0)).toBeLessThan(8)
})
