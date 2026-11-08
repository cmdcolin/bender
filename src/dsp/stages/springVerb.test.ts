import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS, type Controls } from '../../controls.ts'
import { packParams } from '../../engine/params.ts'
import { DEST, ModBus } from '../modbus.ts'
import { magnitudes } from '../spectrum.ts'
import { BLOCK, GLINT_REGS, type Ctx } from '../stage.ts'
import { playHeldKey, render, renderBender, rms, SR } from '../testRender.ts'
import { TriggerBus } from '../trigbus.ts'
import { bandpass, BiquadState } from '../util/biquad.ts'
import { SpringVerb } from './springVerb.ts'

const kit = (overrides: Partial<Controls>) =>
  rms(
    renderBender(overrides, 2, built => {
      built.transport.drums = true
    }),
  )

// The kit kicks the amp down its trigger line rather than through the mix: a
// kit barely audible still throws the springs, and the crash is most of what
// the tank hands back.
const look: Partial<Controls> = {
  chipLevel: 0,
  drumLevel: 0.01,
  revMix: 1,
  revDry: 0,
  revDecayS: 1,
}

test('a drum hit throws the springs against the housing', () => {
  const still = kit(look)
  const kicked = kit({ ...look, revKick: 1 })
  expect(kicked).toBeGreaterThan(10 * still)
})

test('low down the knob only an accent gets through', () => {
  const flat = { ...look, drumAccent: 0 }
  const still = kit(flat)
  expect(kit({ ...flat, revKick: 0.2 })).toBeLessThan(1.5 * still)
  expect(kit({ ...flat, revKick: 0.6 })).toBeGreaterThan(10 * still)
})

// One note into a twenty-second tank, and the tail after it: a static tank
// rings on the same few resonances window after window, which is what Warble
// is there to break up.
function tail(revWarble: number) {
  const x = playHeldKey(
    {
      chipLevel: 0.8,
      drumLevel: 0,
      revMix: 1,
      revDry: 0,
      revDecayS: 20,
      revWarble,
    },
    0,
    0.3,
    4,
  ).subarray(SR)
  const N = 4096
  const frames: Float64Array[] = []
  for (let at = 0; at + N <= x.length; at += N) {
    const m = magnitudes(x, at, N).subarray(0, 256)
    frames.push(m.map(v => v * v))
  }
  return frames
}

const likeness = (a: Float64Array, b: Float64Array) => {
  let ab = 0
  let aa = 0
  let bb = 0
  for (let i = 0; i < a.length; i++) {
    ab += a[i]! * b[i]!
    aa += a[i]! ** 2
    bb += b[i]! ** 2
  }
  return ab / Math.sqrt(aa * bb)
}

const steadiness = (frames: Float64Array[]) =>
  frames.slice(1).reduce((s, f, i) => s + likeness(frames[i]!, f), 0) /
  (frames.length - 1)

// Bins holding nine tenths of the tail's power, summed over the whole take.
const spread = (frames: Float64Array[]) => {
  const sum = new Float64Array(frames[0]!.length)
  for (const f of frames) for (let k = 0; k < f.length; k++) sum[k]! += f[k]!
  const p = Array.from(sum).toSorted((a, b) => b - a)
  const total = p.reduce((a, v) => a + v, 0)
  let held = 0
  let bins = 0
  while (held < 0.9 * total) held += p[bins++]!
  return bins
}

test('warble keeps a long tail from ringing on the same notes', () => {
  const still = tail(0)
  const seasick = tail(1)
  expect(steadiness(still)).toBeGreaterThan(0.85)
  expect(steadiness(seasick)).toBeLessThan(0.75)
  expect(spread(seasick)).toBeGreaterThan(3 * spread(still))
})

test('a held wire on the warble is the knob turned there', () => {
  const tank: Partial<Controls> = {
    chipLevel: 0.8,
    revMix: 1,
    revDry: 0,
    revDecayS: 8,
  }
  const wired = render(
    { ...tank, bodyX: 1, mod0Src: 5, mod0Dest: DEST.revWarble, mod0Depth: 0.6 },
    1,
  )
  expect(wired).toEqual(render({ ...tank, revWarble: 0.6 }, 1))
  expect(wired).not.toEqual(render(tank, 1))
})

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

test('an offset at the input does not lift the tank', () => {
  const verb = new SpringVerb(SR)
  const p = packParams({
    ...DEFAULT_CONTROLS,
    revMix: 1,
    revDry: 0,
    revDecayS: 30,
  })
  const ctx = blank()
  const io = {
    l: new Float32Array(BLOCK),
    r: new Float32Array(BLOCK),
    n: BLOCK,
  }
  const seconds = 6
  const blocks = (seconds * SR) / BLOCK
  let sum = 0
  for (let b = 0; b < blocks; b++) {
    for (let i = 0; i < BLOCK; i++)
      io.l[i] = io.r[i] =
        0.02 + 0.2 * Math.sin((2 * Math.PI * 440 * (b * BLOCK + i)) / SR)
    verb.process(io, p, ctx)
    if (b * BLOCK >= (seconds - 1) * SR)
      for (let i = 0; i < BLOCK; i++) sum += io.l[i]!
  }
  expect(Math.abs(sum / SR)).toBeLessThan(0.01)
})

const square = (t: number) =>
  0.2 * (Math.sin((2 * Math.PI * 110 * t) / SR) > 0 ? 1 : -1)

function energy(
  verb: SpringVerb,
  p: Float32Array,
  ctx: Ctx,
  from: number,
  blocks: number,
) {
  const io = {
    l: new Float32Array(BLOCK),
    r: new Float32Array(BLOCK),
    n: BLOCK,
  }
  let sq = 0
  for (let b = 0; b < blocks; b++) {
    for (let i = 0; i < BLOCK; i++)
      io.l[i] = io.r[i] = square(from + b * BLOCK + i)
    verb.process(io, p, ctx)
    for (let i = 0; i < BLOCK; i++) sq += io.l[i]! ** 2
  }
  return sq
}

test('turning Kick up from off does not crash the tank by itself', () => {
  const verb = new SpringVerb(SR)
  const tank = { ...DEFAULT_CONTROLS, revMix: 1, revDry: 0 }
  const off = packParams({ ...tank, revKick: 0 })
  const on = packParams({ ...tank, revKick: 1 })
  const ctx = blank()
  const settle = Math.floor(SR / BLOCK)
  energy(verb, off, ctx, 0, settle)
  const before = energy(verb, off, ctx, settle * BLOCK, 40)
  const after = energy(verb, on, ctx, (settle + 40) * BLOCK, 40)
  expect(after).toBeLessThan(1.2 * before)
})

const noiseBurst = (seed: number) => {
  let s = seed
  return (t: number) => {
    s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x165667b1) | 0
    return t < 0.5 * SR ? ((s >>> 0) / 4294967296 - 0.5) * 0.6 : 0
  }
}

function rt60(revDecayS: number) {
  const verb = new SpringVerb(SR)
  const p = packParams({ ...DEFAULT_CONTROLS, revMix: 1, revDry: 0, revDecayS })
  const ctx = blank()
  const io = {
    l: new Float32Array(BLOCK),
    r: new Float32Array(BLOCK),
    n: BLOCK,
  }
  const burst = noiseBurst(7)
  const blocks = Math.ceil(((2 * revDecayS + 2) * SR) / BLOCK)
  const out = new Float32Array(blocks * BLOCK)
  for (let b = 0; b < blocks; b++) {
    for (let i = 0; i < BLOCK; i++) io.l[i] = io.r[i] = burst(b * BLOCK + i)
    verb.process(io, p, ctx)
    out.set(io.l, b * BLOCK)
  }
  const win = Math.floor(0.05 * SR)
  const env: number[] = []
  for (let at = Math.floor(0.55 * SR); at + win <= out.length; at += win)
    env.push(20 * Math.log10(rms(out.subarray(at, at + win)) + 1e-12))
  const top = env[0]!
  const a = env.findIndex(v => v < top - 10)
  const b = env.findIndex(v => v < top - 30)
  return ((b - a) * 0.05 * 60) / 20
}

test('Decay is the time the tail takes to fall sixty decibels', () => {
  for (const seconds of [0.5, 2, 8]) {
    const measured = rt60(seconds)
    expect(measured).toBeGreaterThan(0.75 * seconds)
    expect(measured).toBeLessThan(1.25 * seconds)
  }
})

function firstEcho(revBoing: number) {
  const verb = new SpringVerb(SR)
  const p = packParams({
    ...DEFAULT_CONTROLS,
    revMix: 1,
    revDry: 0,
    revDecayS: 0.1,
    revToneHz: 12000,
    revBoing,
  })
  const ctx = blank()
  const io = {
    l: new Float32Array(BLOCK),
    r: new Float32Array(BLOCK),
    n: BLOCK,
  }
  const blocks = Math.ceil((0.3 * SR) / BLOCK)
  const out = new Float32Array(blocks * BLOCK)
  for (let b = 0; b < blocks; b++) {
    io.l.fill(0)
    io.r.fill(0)
    if (b === 0) io.l[0] = io.r[0] = 1
    verb.process(io, p, ctx)
    out.set(io.l, b * BLOCK)
  }
  return out
}

const arrivalMs = (x: Float32Array, hz: number) => {
  const c = bandpass(hz, 4, SR)
  const s = new BiquadState()
  let num = 0
  let den = 0
  for (let i = 0; i < 0.25 * SR; i++) {
    const y = s.process(x[i]!, c)
    num += y * y * i
    den += y * y
  }
  return (1000 * num) / den / SR
}

test('Boing makes each echo a chirp that falls', () => {
  const fall = (x: Float32Array) => arrivalMs(x, 300) - arrivalMs(x, 2000)
  const stiff = fall(firstEcho(0))
  const boingy = fall(firstEcho(1))
  expect(stiff).toBeLessThan(8)
  expect(boingy).toBeGreaterThan(15)
})

function howled(revHowl: number, rail = 1, seconds = 4) {
  const verb = new SpringVerb(SR)
  const p = packParams({
    ...DEFAULT_CONTROLS,
    revMix: 1,
    revDry: 0,
    revDecayS: 1,
    revHowl,
  })
  const ctx = blank()
  ctx.railV.fill(rail)
  const io = {
    l: new Float32Array(BLOCK),
    r: new Float32Array(BLOCK),
    n: BLOCK,
  }
  const burst = noiseBurst(7)
  const blocks = Math.ceil((seconds * SR) / BLOCK)
  const out = new Float32Array(blocks * BLOCK)
  for (let b = 0; b < blocks; b++) {
    for (let i = 0; i < BLOCK; i++) io.l[i] = io.r[i] = burst(b * BLOCK + i)
    verb.process(io, p, ctx)
    out.set(io.l, b * BLOCK)
  }
  return out
}

const afterBurst = (x: Float32Array) => rms(x.subarray(1.5 * SR, 2.5 * SR))
const late = (x: Float32Array) => rms(x.subarray(3 * SR))

test('a little howl rings the tail on past where it stopped', () => {
  expect(afterBurst(howled(0.6))).toBeGreaterThan(
    10 * afterBurst(howled(0)) + 1e-4,
  )
})

test('howl near the top holds a drone after the input stops', () => {
  const drone = howled(0.9)
  expect(late(drone)).toBeGreaterThan(0.05)
  let peak = 0
  for (const v of drone) peak = Math.max(peak, Math.abs(v))
  expect(peak).toBeLessThan(1)
})

test('a sagging rail chokes the howl', () => {
  expect(late(howled(1, 0.3))).toBeLessThan(0.5 * late(howled(1)))
})
