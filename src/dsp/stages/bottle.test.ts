import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS, type Controls } from '../../controls.ts'
import { packParams } from '../../engine/params.ts'
import { ModBus } from '../modbus.ts'
import { BLOCK, GLINT_REGS, type Ctx } from '../stage.ts'
import { highEnergy, rms, SR } from '../testRender.ts'
import { TriggerBus } from '../trigbus.ts'
import { Bottle } from './bottle.ts'
import { KEY_CHOICE } from './struck.ts'

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
    hand = -1,
  }: {
    input?: (t: number) => number
    key?: number
    kick?: number
    hand?: number
  } = {},
) {
  const bottle = new Bottle(SR)
  const p = packParams({
    ...DEFAULT_CONTROLS,
    bottleLevel: 1,
    bottleStrikes: 0,
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
    ctx.trig.swap(BLOCK)
    if (b === key) ctx.trig.key[0] = 1
    if (b === kick) ctx.trig.drumFired(0, KICK, 1)
    if (b === hand) bottle.strikeAt(0.4, 0.6, 1)
    for (let i = 0; i < BLOCK; i++) ctx.out[i] = input(b * BLOCK + i)
    io.l.fill(0)
    io.r.fill(0)
    bottle.process(io, p, ctx)
    out.set(io.l, b * BLOCK)
  }
  return out
}

const span = (x: Float32Array, from: number, to: number) =>
  x.subarray(Math.round(from * SR), Math.round(to * SR))

test('left alone with nothing to shake it, the bottle is silent', () => {
  const out = run({}, 1)
  expect(out.every(v => v === 0)).toBe(true)
})

test('a key taps it, and once the thunk is gone the glass loses its highs first', () => {
  const out = run(
    { bottleStruckBy: KEY_CHOICE, bottleHard: 1, bottleRattle: 0 },
    1,
    { key: 2 },
  )
  const early = span(out, 0.05, 0.12)
  const late = span(out, 0.5, 0.7)
  expect(rms(early)).toBeGreaterThan(0.01)
  expect(highEnergy(late, 6000) / rms(late)).toBeLessThan(
    highEnergy(early, 6000) / rms(early),
  )
})

test('a hand strikes it from the face', () => {
  expect(rms(run({}, 0.3, { hand: 2 }))).toBeGreaterThan(0.001)
})

test('a kick strikes it only while it is struck by the kick', () => {
  const struck = run({ bottleStruckBy: KICK }, 0.3, { kick: 2 })
  const ignored = run({ bottleStruckBy: 0 }, 0.3, { kick: 2 })
  expect(rms(struck)).toBeGreaterThan(0.001)
  expect(ignored.every(v => v === 0)).toBe(true)
})

test('shake rings the bottle off the board’s own output', () => {
  const drone = (t: number) => 0.3 * Math.sin((2 * Math.PI * 110 * t) / SR)
  const shaken = run({ bottleShake: 1 }, 1, { input: drone })
  const still = run({ bottleShake: 0 }, 1, { input: drone })
  expect(rms(span(shaken, 0.5, 1))).toBeGreaterThan(0.01)
  expect(rms(span(still, 0.5, 1))).toBe(0)
})

test('the hardest, smallest, fullest, longest-held, busiest bottle stays finite and in range', () => {
  const out = run(
    {
      bottleStrikes: 8,
      bottleHard: 1,
      bottleSize: 0.25,
      bottleFill: 1,
      bottleHold: 1,
      bottleRattle: 1,
      bottleShake: 1,
    },
    3,
    { input: t => 0.5 * Math.sin((2 * Math.PI * 55 * t) / SR) },
  )
  expect(out.every(Number.isFinite)).toBe(true)
  expect(out.reduce((m, v) => Math.max(m, Math.abs(v)), 0)).toBeLessThan(8)
})

test('water lowers the ring', () => {
  const pitch = (fill: number) => {
    const out = run(
      { bottleStruckBy: KEY_CHOICE, bottleFill: fill, bottleRattle: 0 },
      0.6,
      { key: 2 },
    )
    let crossings = 0
    const tail = span(out, 0.15, 0.5)
    for (let i = 1; i < tail.length; i++)
      if (tail[i - 1]! <= 0 && tail[i]! > 0) crossings++
    return crossings
  }
  expect(pitch(1)).toBeLessThan(pitch(0))
})
