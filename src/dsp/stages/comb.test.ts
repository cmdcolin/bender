import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS, type Controls } from '../../controls.ts'
import { packParams } from '../../engine/params.ts'
import { ModBus } from '../modbus.ts'
import { spectrum } from '../spectrum.ts'
import { BLOCK, GLINT_REGS, type Ctx } from '../stage.ts'
import {
  bin,
  envelope,
  pitchHz,
  quiet,
  renderBender,
  rms,
  sine,
  SR,
  tail,
} from '../testRender.ts'
import { DEAD_V } from '../toyRail.ts'
import { TriggerBus } from '../trigbus.ts'
import { COMB_CHIP, Comb } from './comb.ts'

import type { BuiltChain } from '../build.ts'

// Past unity the comb is a note, and the note is the pitch on the knob.
test('a comb driven into oscillation rings at the pitch it is tuned to', () => {
  const look: Partial<Controls> = {
    chipLevel: 0,
    sampleLevel: 1,
    sampleMode: 1,
    combHz: 500,
    combFb: 1.2,
    combMix: 1,
  }
  const tick = (b: BuiltChain) => b.sampler.setBuffer(sine(500, 0.02))
  expect(pitchHz(tail(renderBender(look, 1.5, tick)))).toBeCloseTo(500, -1)
})

const chip = (name: string) => COMB_CHIP.indexOf(name)

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

const BBD: Partial<Controls> = {
  combChip: chip('1024 buckets'),
  combMix: 1,
}

// The stage on its own: `input` feeds both channels, `wire` sets the buses a
// sample at a time, and the left channel comes back.
function stage(
  board: Partial<Controls>,
  input: (t: number) => number,
  seconds = 1,
  wire: (ctx: Ctx, i: number, t: number) => void = () => {},
  comb = new Comb(SR),
): Float32Array {
  const p = packParams({ ...DEFAULT_CONTROLS, ...BBD, ...board })
  const ctx = blank()
  const io = {
    l: new Float32Array(BLOCK),
    r: new Float32Array(BLOCK),
    n: BLOCK,
  }
  const blocks = Math.ceil((seconds * SR) / BLOCK)
  const out = new Float32Array(blocks * BLOCK)
  for (let b = 0; b < blocks; b++) {
    for (let i = 0; i < BLOCK; i++) {
      const t = b * BLOCK + i
      io.l[i] = io.r[i] = input(t)
      ctx.trig.drumBits[i] = 0
      ctx.trig.drumGain[i] = 0
      wire(ctx, i, t)
    }
    comb.process(io, p, ctx)
    out.set(io.l, b * BLOCK)
  }
  return out
}

const silence = () => 0
// A click to set the line ringing, then nothing.
const click = (t: number) => (t < 24 ? 0.5 : 0)
// A tone that plays for a tenth of a second in every half.
const bursts = (t: number) =>
  t % (SR / 2) < SR / 10 ? 0.3 * Math.sin((2 * Math.PI * 220 * t) / SR) : 0
// A kit hit every quarter of a second.
const kit = (ctx: Ctx, i: number, t: number) => {
  if (t % (SR / 4) === 0) {
    ctx.trig.drumBits[i] = 1
    ctx.trig.drumGain[i] = 1
  }
}

// The lag a ring repeats at, which is its pitch whatever its harmonics do to
// the zero crossings.
function ringHz(x: Float32Array) {
  const take = tail(x)
  let best = 0
  let at = 0
  for (let lag = 40; lag < 2000; lag++) {
    let sum = 0
    for (let i = 0; i + lag < take.length; i++) sum += take[i]! * take[i + lag]!
    if (sum > best) {
      best = sum
      at = lag
    }
  }
  return SR / at
}

test.each(['1024 buckets', '256 buckets', '64 buckets'])(
  'the %s bucket brigade rings at the pitch it is tuned to',
  name => {
    const ring = stage(
      { combChip: chip(name), combHz: 220, combFb: 1.1 },
      click,
      1.5,
    )
    expect(ringHz(ring)).toBeCloseTo(220, -1)
  },
)

// 64 buckets at 55 Hz clock at 3520 Hz, and a 220 Hz tone held at that rate
// comes back with an image either side of the clock.
test('a short chip on a low note folds the input around its clock', () => {
  const tone = (t: number) => 0.3 * Math.sin((2 * Math.PI * 220 * t) / SR)
  const image = (name: string) =>
    bin(tail(stage({ combChip: chip(name), combHz: 55 }, tone)), 3520 - 220)
  expect(image('64 buckets')).toBeGreaterThan(10 * image('1024 buckets'))
})

test('kit hits pluck the comb with nothing at its input', () => {
  const board = { combFb: 0.95 }
  expect(rms(stage(board, silence, 1, kit))).toBe(0)
  expect(
    rms(stage({ ...board, combPluck: 1 }, silence, 1, kit)),
  ).toBeGreaterThan(0.05)
})

test('the loop amp at its rails motorboats a ringing comb', () => {
  const tone = (t: number) => 0.3 * Math.sin((2 * Math.PI * 220 * t) / SR)
  const board = { combFb: 0.9 }
  expect(quiet(stage(board, tone, 2))).toBe(0)
  expect(quiet(stage({ ...board, combRail: 1 }, tone, 2))).toBeGreaterThan(0.2)
})

test('compander pump blooms a hit that follows a gap', () => {
  const board = { combFb: 0.85 }
  const peak = (x: Float32Array) =>
    envelope(x).reduce((a, v) => Math.max(a, v), 0)
  expect(peak(stage({ ...board, combPump: 1 }, bursts, 2))).toBeGreaterThan(
    1.5 * peak(stage(board, bursts, 2)),
  )
})

test('the clock whistles once it comes into earshot', () => {
  const board = { combChip: chip('64 buckets'), combHz: 110 }
  const tone = (t: number) => 0.3 * Math.sin((2 * Math.PI * 220 * t) / SR)
  const clock = 64 * 110
  const at = (x: Float32Array) => bin(tail(x), clock)
  expect(at(stage({ ...board, combWhistle: 1 }, tone))).toBeGreaterThan(
    20 * at(stage(board, tone)),
  )
})

test('1024 buckets never clock into earshot, so they never whistle', () => {
  const tone = (t: number) => 0.3 * Math.sin((2 * Math.PI * 220 * t) / SR)
  const board = { combHz: 20 }
  const clean = stage(board, tone)
  const whistled = stage({ ...board, combWhistle: 1 }, tone)
  expect(whistled).toEqual(clean)
})

test('the comb pulling its own clock smears its harmonics into noise', () => {
  const board = { combFb: 1.1 }
  const flat = (x: Float32Array) => spectrum(tail(x, 1), SR).flatness
  expect(flat(stage({ ...board, combPull: 1 }, click, 2))).toBeGreaterThan(
    3 * flat(stage(board, click, 2)),
  )
})

test('a clock on a sagging rail drags the comb down with it', () => {
  const board = { combHz: 220, combFb: 1.1 }
  const sagging = (ctx: Ctx, i: number) => {
    ctx.railV[i] = 0.6
  }
  const pitch = (b: Partial<Controls>) => ringHz(stage(b, click, 1.5, sagging))
  expect(pitch(board)).toBeCloseTo(220, -1)
  expect(pitch({ ...board, combSag: 1 })).toBeCloseTo(110, -1)
})

test.each([
  ['1024 buckets', 'Karplus'],
  ['Karplus', '1024 buckets'],
])(
  'a %s ring left for %s does not come back when the chip does',
  (from, to) => {
    const comb = new Comb(SR)
    const scream = { combChip: chip(from), combHz: 220, combFb: 1.1 }
    const away = { combChip: chip(to), combFb: 0 }
    const keep = () => {}
    expect(rms(tail(stage(scream, click, 1, keep, comb)))).toBeGreaterThan(0.05)
    stage(away, silence, 0.2, keep, comb)
    expect(rms(stage(scream, silence, 0.5, keep, comb))).toBe(0)
  },
)

test('a clock on a dead rail holds the echo back as long as it is slowed', () => {
  const dead = (ctx: Ctx, i: number) => {
    ctx.railV[i] = DEAD_V
  }
  const out = stage({ combHz: 220, combFb: 0.5, combSag: 1 }, click, 0.5, dead)
  const echo = out.findIndex((v, i) => i > 1000 && Math.abs(v) > 1e-3)
  const slowed = SR / 220 / 0.02
  expect(echo).toBeGreaterThan(0.95 * slowed)
  expect(echo).toBeLessThan(1.05 * slowed)
})
