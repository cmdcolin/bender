import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS, type Controls } from '../../controls.ts'
import { packParams } from '../../engine/params.ts'
import { ModBus } from '../modbus.ts'
import { BLOCK, GLINT_REGS, type Ctx } from '../stage.ts'
import {
  SR,
  bin,
  envelope,
  pitchHz,
  renderBender,
  rms,
  sine,
  tail,
} from '../testRender.ts'
import { TriggerBus } from '../trigbus.ts'
import { spacingPoles, TapeDelay } from './tapeDelay.ts'

import type { BuiltChain } from '../build.ts'

// The echo returns on a fader of its own, so the dry is always in the room
// with it. These play a one-shot second and listen to the last half of the
// next one, where the only thing left sounding is what came off the tape.

const load = (b: BuiltChain) => b.sampler.setBuffer(sine(400, 1))

test('the tape brake drags everything already on the tape down in pitch', () => {
  const look: Partial<Controls> = {
    chipLevel: 0,
    sampleLevel: 1,
    sampleMode: 1,
    dlyMix: 1,
    delayMs: 200,
    dlyFb: 0.7,
  }
  const free = renderBender(look, 2, load)
  const braked = renderBender({ ...look, tapeBrake: 0.5 }, 2, load)
  expect(pitchHz(tail(free))).toBeCloseTo(400, -2)
  expect(pitchHz(tail(braked))).toBeLessThan(0.85 * pitchHz(tail(free)))
})

test('a sagging supply drags the tape motor with it', () => {
  const look: Partial<Controls> = {
    chipLevel: 0,
    sampleLevel: 1,
    sampleMode: 1,
    dlyMix: 1,
    delayMs: 200,
    dlyFb: 0.7,
    brownAmt: 1,
    brownRate: 0,
  }
  const free = renderBender(look, 2, load)
  const dragged = renderBender({ ...look, tapeMotorRail: 1 }, 2, load)
  expect(pitchHz(tail(dragged))).toBeLessThan(0.9 * pitchHz(tail(free)))
})

// The reel is 5.3 s of tape joined once, so the join passes the record head at
// 5.3 s and the play head reads the gap it left one delay later.
test('the splice leaves a gap on the tape that comes round once a lap', () => {
  const look: Partial<Controls> = {
    chipLevel: 0,
    sampleLevel: 1,
    sampleMode: 1,
    dlyMix: 1,
    delayMs: 200,
  }
  const take = (over: Partial<Controls>) =>
    renderBender({ ...look, ...over }, 6, b =>
      b.sampler.setBuffer(sine(400, 6)),
    )
  const tone = (out: Float32Array, sec: number) =>
    bin(out.subarray(sec * SR, (sec + 0.01) * SR), 400)
  const clean = take({})
  const spliced = take({ dlySplice: 1 })
  // The dry never leaves the board, so a gap in the repeats halves the tone
  // rather than removing it.
  expect(tone(spliced, 5.501)).toBeLessThan(0.6 * tone(clean, 5.501))
  expect(tone(spliced, 5.4)).toBeCloseTo(tone(clean, 5.4), 1)
  expect(tone(spliced, 5.6)).toBeCloseTo(tone(clean, 5.6), 1)
})

test('a dead erase head lets the last lap of the reel through', () => {
  const look: Partial<Controls> = {
    chipLevel: 0,
    sampleLevel: 1,
    sampleMode: 1,
    dlyMix: 1,
    delayMs: 100,
    dlyFb: 0,
  }
  const lap = (over: Partial<Controls>) =>
    rms(renderBender({ ...look, ...over }, 5.8, load).subarray(5.5 * SR))
  expect(lap({ dlyErase: 1 })).toBeGreaterThan(20 * lap({}))
})

test('a second head up is a second repeat at twice the spacing', () => {
  const look: Partial<Controls> = {
    chipLevel: 0,
    sampleLevel: 1,
    sampleMode: 1,
    dlyMix: 1,
    delayMs: 200,
    dlyFb: 0,
  }
  const burst = (b: BuiltChain) => b.sampler.setBuffer(sine(400, 0.1))
  const second = (over: Partial<Controls>) =>
    rms(
      renderBender({ ...look, ...over }, 1, burst).subarray(
        0.42 * SR,
        0.48 * SR,
      ),
    )
  expect(second({ dlyHeads: 1 })).toBeGreaterThan(10 * second({}))
})

// A square burst, then the echoes on their own. The carrier lands on the tap
// before the regen sum, so what it does compounds lap by lap and the tail is
// where it shows.
function square(hz: number, seconds: number, amp = 0.6): Float32Array {
  const buf = new Float32Array(Math.round(seconds * SR))
  for (let i = 0; i < buf.length; i++)
    buf[i] = amp * (Math.sign(Math.sin((2 * Math.PI * hz * i) / SR)) || 1)
  return buf
}

const BURST: Partial<Controls> = {
  chipLevel: 0,
  sampleLevel: 1,
  sampleMode: 1,
  dlyMix: 1,
  delayMs: 375,
  dlyFb: 0.7,
}

// One second of A3 in, then two seconds of nothing but repeats.
const echoes = (o: Partial<Controls>) =>
  renderBender({ ...BURST, ...o }, 3, b =>
    b.sampler.setBuffer(square(220, 1)),
  ).subarray(SR)

// A square has no even harmonics, and the tail of a plain tape machine has none
// either. At unison the product writes them in, a lap at a time.
test('a unison carrier fills the even harmonics into the repeats', () => {
  const plain = echoes({})
  const ringed = echoes({ dlyRing: 1, dlyRingHz: 220 })
  expect(bin(plain, 440)).toBeLessThan(0.001)
  expect(bin(ringed, 440)).toBeGreaterThan(20 * bin(plain, 440))
  expect(bin(ringed, 880)).toBeGreaterThan(20 * bin(plain, 880))
})

// An octave under puts a new fundamental in the echoes and leaves the note that
// went in clean, since the carrier only reaches what is already on the tape.
test('a sub carrier writes a fundamental an octave under into the echoes', () => {
  const plain = echoes({})
  const ringed = echoes({ dlyRing: 1, dlyRingHz: 110 })
  expect(bin(plain, 110)).toBeLessThan(0.001)
  expect(bin(ringed, 110)).toBeGreaterThan(20 * bin(plain, 110))
  expect(bin(ringed, 330)).toBeGreaterThan(20 * bin(plain, 330))
})

// Modulation costs 3 dB, and the ring path hands it back, so turning the depth
// up is a change of sound rather than a shorter tail. Unison is the worst case
// — the dc block takes the product's constant term with it — and measures
// 2.9 dB down.
test('the ring path costs the tail no level', () => {
  const plain = echoes({})
  for (const dlyRingHz of [220, 110, 3]) {
    const ringed = echoes({ dlyRing: 1, dlyRingHz })
    expect(rms(ringed), String(dlyRingHz)).toBeGreaterThan(
      rms(plain) / Math.SQRT2,
    )
  }
})

const ECHO: Partial<Controls> = {
  chipLevel: 0,
  sampleLevel: 1,
  sampleMode: 1,
  dlyMix: 1,
  delayMs: 200,
  dlyFb: 0.7,
}

test('a band-pass in the loop keeps its band and drops the rest', () => {
  const chord = (b: BuiltChain) => {
    const hi = sine(2500, 0.5)
    b.sampler.setBuffer(sine(400, 0.5).map((v, i) => 0.5 * (v + hi[i]!)))
  }
  const tones = (over: Partial<Controls>) => {
    const t = renderBender({ ...ECHO, ...over }, 2.5, chord).subarray(1.2 * SR)
    return { low: bin(t, 400), high: bin(t, 2500) }
  }
  const open = tones({})
  const band = tones({ dlyLoopMode: 2, dlyLoopHz: 2500, dlyLoopRes: 0.6 })
  expect(band.low).toBeLessThan(open.low / 100)
  expect(band.high).toBeGreaterThan(open.high / 2)
})

const swing = (x: Float32Array) => {
  const e = envelope(x, 0.05)
  const mean = e.reduce((a, v) => a + v, 0) / e.length
  return Math.sqrt(e.reduce((a, v) => a + (v - mean) ** 2, 0) / e.length) / mean
}

test('a lamp in the loop breathes where runaway feedback would pin', () => {
  const runaway = { ...ECHO, dlyFb: 1.5, delayMs: 150 }
  const ping = (b: BuiltChain) => b.sampler.setBuffer(sine(400, 0.3))
  const pinned = renderBender(runaway, 8, ping).subarray(2 * SR)
  const lit = renderBender(
    { ...runaway, dlyLamp: 1, dlyLampS: 1.5 },
    8,
    ping,
  ).subarray(2 * SR)
  expect(swing(pinned)).toBeLessThan(0.01)
  expect(swing(lit)).toBeGreaterThan(0.15)
  expect(rms(lit)).toBeGreaterThan(0.05)
})

// Wallace: spacing d off a gap loses 54.6 d/λ dB, a straight line in frequency.
// The two poles stand in for it from the -3 dB point through a decade up.
test('dirt on a head loses treble the way spacing loss says it does', () => {
  const pole = (c: number, hz: number) => {
    const w = (2 * Math.PI * hz) / SR
    return c / Math.hypot(1 - (1 - c) * Math.cos(w), (1 - c) * Math.sin(w))
  }
  for (const [um, umPerS] of [
    [6, 19e4],
    [2, 9.5e4],
    [12, 28.5e4],
  ] as const) {
    const [a, b] = spacingPoles(um, umPerS, SR)
    const f3 = (3 * umPerS) / (54.6 * um)
    for (let hz = f3; hz <= Math.min(8 * f3, 0.4 * SR); hz *= 1.5) {
      const wallace = (54.6 * um * hz) / umPerS
      const ours = -20 * Math.log10(pole(a, hz) * pole(b, hz))
      expect(Math.abs(ours - wallace), `${um} µm at ${hz} Hz`).toBeLessThan(4)
    }
  }
})

test('dirty heads dull the repeats and leave the bass', () => {
  const look: Partial<Controls> = {
    chipLevel: 0,
    sampleLevel: 1,
    sampleMode: 1,
    dlyMix: 1,
    delayMs: 200,
    dlyFb: 0.6,
  }
  const two = (b: BuiltChain) => {
    const low = sine(300, 1)
    const high = sine(6000, 1)
    b.sampler.setBuffer(low.map((v, i) => 0.5 * (v + high[i]!)))
  }
  const clean = tail(renderBender(look, 2, two))
  const dirty = tail(renderBender({ ...look, dlyHeadDirt: 1 }, 2, two))
  expect(bin(dirty, 300)).toBeGreaterThan(0.85 * bin(clean, 300))
  expect(bin(dirty, 6000)).toBeLessThan(0.3 * bin(clean, 6000))
})

test('a head that clogs again starts from clean filters', () => {
  const tape = new TapeDelay(SR, 1)
  const zeros = () => new Float32Array(BLOCK)
  const ctx: Ctx = {
    sr: SR,
    mic: zeros(),
    fb: zeros(),
    railV: zeros().fill(1),
    sag: zeros(),
    droop: zeros(),
    env: zeros(),
    out: zeros(),
    step: zeros(),
    carrier: zeros(),
    logic: zeros(),
    toy: zeros(),
    fm: zeros(),
    send: zeros(),
    bright: zeros(),
    gnd: zeros(),
    regs: new Uint8Array(GLINT_REGS),
    heat: 0,
    fbDest: 0,
    mod: new ModBus(SR, 1),
    trig: new TriggerBus(),
  }
  const look = { dlyMix: 1, delayMs: 50, dlyFb: 0, wowDepthMs: 0, flutter: 0 }
  const dirty = packParams({ ...DEFAULT_CONTROLS, ...look, dlyHeadDirt: 1 })
  const clean = packParams({ ...DEFAULT_CONTROLS, ...look, dlyHeadDirt: 0 })
  const io = { l: zeros(), r: zeros(), n: BLOCK }
  const tone = sine(400, 0.5)
  for (let at = 0; at + BLOCK <= tone.length; at += BLOCK) {
    io.l.set(tone.subarray(at, at + BLOCK))
    io.r.set(io.l)
    tape.process(io, dirty, ctx)
  }
  ;(tape as unknown as { lift: number[] }).lift.fill(0)
  for (let b = 0; b < SR / BLOCK; b++) {
    io.l.fill(0)
    io.r.fill(0)
    tape.process(io, clean, ctx)
  }
  io.l.fill(0)
  io.r.fill(0)
  tape.process(io, dirty, ctx)
  expect(Math.max(...io.l.map(Math.abs))).toBeLessThan(1e-6)
})
