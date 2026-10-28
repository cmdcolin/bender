import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS, type Controls } from '../../controls.ts'
import { packParams } from '../../engine/params.ts'
import { DEST, ModBus } from '../modbus.ts'
import { BLOCK, GLINT_REGS, type Ctx } from '../stage.ts'
import { bin, highEnergy, quiet, render, rms, SR } from '../testRender.ts'
import { TriggerBus } from '../trigbus.ts'
import { Codec } from './codec.ts'

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

const LATENCY = 1024

const buzz = (hz: number) => (t: number) =>
  0.4 * Math.sign(Math.sin((2 * Math.PI * hz * t) / SR)) +
  0.05 * Math.sin((2 * Math.PI * 5000 * t) / SR)

function stage(
  board: Partial<Controls>,
  left: (t: number) => number,
  right = left,
  seconds = 1,
  droop = 0,
): { l: Float32Array; r: Float32Array } {
  const codec = new Codec(SR)
  const p = packParams({ ...DEFAULT_CONTROLS, codecMix: 1, ...board })
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
    for (let i = 0; i < BLOCK; i++) {
      io.l[i] = left(b * BLOCK + i)
      io.r[i] = right(b * BLOCK + i)
    }
    codec.process(io, p, ctx)
    l.set(io.l, b * BLOCK)
    r.set(io.r, b * BLOCK)
  }
  return { l, r }
}

function apart(out: Float32Array, input: (t: number) => number) {
  let err = 0
  let sig = 0
  for (let t = SR / 4; t < out.length - LATENCY; t++) {
    const x = input(t)
    err += (out[t + LATENCY]! - x) ** 2
    sig += x * x
  }
  return Math.sqrt(err / sig)
}

test('a high bitrate passes the input two frames late', () => {
  const tone = buzz(220)
  expect(apart(stage({ codecRate: 320 }, tone).l, tone)).toBeLessThan(0.05)
})

test('a starved bitrate tears the signal and takes the top off', () => {
  const tone = buzz(220)
  const at = (codecRate: number) => stage({ codecRate }, tone).l
  expect(apart(at(8), tone)).toBeGreaterThan(apart(at(128), tone) * 3)
  expect(bin(at(8), 5000)).toBeLessThan(bin(at(320), 5000) / 10)
})

test('the side channel starves first, so a thin stream narrows', () => {
  const width = (codecRate: number) => {
    const { l, r } = stage({ codecRate }, buzz(220), buzz(330))
    return rms(l.map((v, i) => v - r[i]!)) / rms(l.map((v, i) => v + r[i]!))
  }
  expect(width(12)).toBeLessThan(width(320) / 2)
})

test('bit errors throw the decode away from the clean one', () => {
  const tone = buzz(220)
  const clean = apart(stage({ codecRate: 320 }, tone).l, tone)
  const broken = apart(stage({ codecRate: 320, codecErrors: 1 }, tone).l, tone)
  expect(broken).toBeGreaterThan(clean * 5)
})

test('lost frames go silent on mute and keep sounding on repeat', () => {
  const tone = buzz(220)
  const lossy = { codecLoss: 0.6, codecFrame: 3 }
  const muted = stage({ ...lossy, codecConceal: 1 }, tone).l
  const repeated = stage({ ...lossy, codecConceal: 0 }, tone).l
  expect(quiet(muted)).toBeGreaterThan(quiet(repeated) * 2 + 0.05)
})

test('a sagging supply makes a loaded decoder miss its frames', () => {
  const tone = buzz(220)
  const loaded = { codecCpu: 0.5, codecConceal: 1 }
  expect(quiet(stage(loaded, tone, tone, 1, 0).l)).toBeLessThan(0.1)
  expect(quiet(stage(loaded, tone, tone, 1, 0.5).l)).toBeGreaterThan(0.6)
})

test('freeze keeps sounding after the input stops', () => {
  const burst = (t: number) => (t < SR / 2 ? buzz(220)(t) : 0)
  const late = (codecFreeze: number) => {
    const codec = new Codec(SR)
    const ctx = blank()
    const io = {
      l: new Float32Array(BLOCK),
      r: new Float32Array(BLOCK),
      n: BLOCK,
    }
    let level = 0
    for (let b = 0; b < (1.5 * SR) / BLOCK; b++) {
      const freeze = b * BLOCK > SR / 2 ? codecFreeze : 0
      const p = packParams({
        ...DEFAULT_CONTROLS,
        codecMix: 1,
        codecFreeze: freeze,
      })
      for (let i = 0; i < BLOCK; i++) io.l[i] = io.r[i] = burst(b * BLOCK + i)
      codec.process(io, p, ctx)
      if (b * BLOCK > SR) level += rms(io.l)
    }
    return level
  }
  expect(late(0)).toBe(0)
  expect(late(1)).toBeGreaterThan(1)
})

test('a wire on codec rate does what turning Bitrate down does', () => {
  const look = { bendSlot0: 9, codecMix: 1, codecRate: 320 }
  const wired = render(
    { ...look, bodyX: 1, mod0Src: 5, mod0Dest: DEST.codecRate, mod0Depth: -1 },
    1,
  )
  expect(highEnergy(wired, 6000)).toBeLessThan(
    highEnergy(render(look, 1), 6000) * 0.8,
  )
})

test('the codec at no mix leaves the board as it was', () => {
  const off = render({ bendSlot0: 9, codecMix: 0 }, 0.5)
  const empty = render({ bendSlot0: 0 }, 0.5)
  expect(rms(off)).toBeGreaterThan(0)
  expect(off).toEqual(empty)
})
