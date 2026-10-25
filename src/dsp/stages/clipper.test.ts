import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS, type Controls } from '../../controls.ts'
import { packParams } from '../../engine/params.ts'
import { buildBender } from '../build.ts'
import { MIC } from '../micJacks.ts'
import { ModBus } from '../modbus.ts'
import { magnitudes, spectrum } from '../spectrum.ts'
import { BLOCK, type Ctx } from '../stage.ts'
import { SUPPLY, Supplies } from '../supplies.ts'
import { makeIo, rms, SR } from '../testRender.ts'
import { ToyRail } from '../toyRail.ts'
import { TriggerBus } from '../trigbus.ts'
import { boostOhms, Clipper } from './clipper.ts'

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
  heat: 0,
  fbDest: 0,
  mod: new ModBus(SR, 1),
  trig: new TriggerBus(),
})

const sineAt = (hz: number, amp: number) => (t: number) =>
  amp * Math.sin((2 * Math.PI * hz * t) / SR)

// The stage on its own, fully wet, on the bench unless the board says
// otherwise, with the shared cells held at `railV`: `input` feeds both
// channels and the left comes back.
function stage(
  board: Partial<Controls>,
  input: (t: number) => number,
  seconds = 1,
  wire: (ctx: Ctx, i: number, t: number) => void = () => {},
  railV = 1,
): Float32Array {
  const supplies = new Supplies(SR, new ToyRail(SR), 1)
  const clipper = new Clipper(SR, supplies)
  const p = packParams({ ...DEFAULT_CONTROLS, distMix: 1, ...board })
  const ctx = blank()
  const io = makeIo()
  const blocks = Math.ceil((seconds * SR) / BLOCK)
  const out = new Float32Array(blocks * BLOCK)
  for (let b = 0; b < blocks; b++) {
    for (let i = 0; i < BLOCK; i++) {
      const t = b * BLOCK + i
      io.l[i] = io.r[i] = input(t)
      wire(ctx, i, t)
    }
    supplies.shared.v = railV
    clipper.process(io, p, ctx)
    out.set(io.l, b * BLOCK)
  }
  return out
}

// The whole board with the toy playing its tune, and both rails read back a
// block at a time.
function playing(over: Partial<Controls>, seconds = 3) {
  const built = buildBender(SR)
  built.transport.tune = true
  const p = packParams({ ...DEFAULT_CONTROLS, distMix: 1, ...over })
  const io = makeIo()
  const shared: number[] = []
  const second: number[] = []
  const blocks = Math.ceil((seconds * SR) / BLOCK)
  const out = new Float32Array(blocks * BLOCK)
  for (let b = 0; b < blocks; b++) {
    built.chain.process(io, p)
    out.set(io.l, b * BLOCK)
    shared.push(built.supplies.shared.pitchFactor)
    second.push(built.supplies.second.v)
  }
  const settle = Math.round(SR / BLOCK / 2)
  return { out, shared: shared.slice(settle), second: second.slice(settle) }
}

const semitones = (factor: number) => 12 * Math.log2(factor)

// How many times a trace dips under its own mean and comes back.
function dips(trace: number[]) {
  const mean = trace.reduce((a, b) => a + b, 0) / trace.length
  let n = 0
  for (let i = 1; i < trace.length; i++)
    if (trace[i - 1]! >= mean && trace[i]! < mean) n++
  return n
}

const peakHz = (x: Float32Array) => {
  const n = 8192
  const m = magnitudes(x, 0, n)
  let best = 1
  for (let k = 2; k < m.length; k++) if (m[k]! > m[best]!) best = k
  return (best * SR) / n
}

test('the amp drawing on the shared cells motorboats the toy', () => {
  const quiet = playing({ distSupply: SUPPLY.shared })
  const loaded = playing({ distSupply: SUPPLY.shared, distDraw: 1 })
  expect(Math.min(...quiet.shared)).toBe(1)
  expect(semitones(Math.min(...loaded.shared))).toBeLessThan(-3)
  expect(dips(loaded.shared)).toBeGreaterThan(15)
})

test('on the bench the same draw leaves the toy alone', () => {
  const bench = playing({ distSupply: SUPPLY.bench, distDraw: 1 })
  expect(Math.min(...bench.shared)).toBe(1)
})

test('on the second cells the draw sags them and not the toy', () => {
  const second = playing({ distSupply: SUPPLY.second, distDraw: 1 })
  expect(Math.min(...second.shared)).toBe(1)
  expect(Math.min(...second.second)).toBeLessThan(0.8)
})

test('a starving supply takes the amp’s headroom down with it', () => {
  const tone = sineAt(220, 0.5)
  const peak = (x: Float32Array) => Math.max(...x.subarray(SR / 2))
  const full = stage({ distSupply: SUPPLY.shared }, tone)
  const starved = stage({ distSupply: SUPPLY.shared }, tone, 1, () => {}, 0.5)
  expect(peak(starved)).toBeLessThan(0.7 * peak(full))
})

test('past a few hundred times the gain cap makes the amp sing', () => {
  const tone = sineAt(220, 0.05)
  const at = (distPinGain: number) =>
    stage({ driveDb: 0, distPinGain }, tone).subarray(SR / 4)
  expect(rms(at(200))).toBeGreaterThan(5 * rms(at(20)))
  expect(peakHz(at(200))).toBeCloseTo(220, -1)
  const sings = peakHz(at(600))
  expect(sings).toBeGreaterThan(800)
  expect(sings).toBeLessThan(2000)
})

test('with pin 7 open the amp squeals, lower on a sagging supply', () => {
  const tone = sineAt(220, 0.2)
  const squeal = (rail: number) =>
    peakHz(
      stage(
        { distBypass: 1, distSupply: SUPPLY.shared },
        tone,
        1,
        () => {},
        rail,
      ).subarray(SR / 4),
    )
  const closed = peakHz(stage({ distSpeaker: 0.001 }, tone).subarray(SR / 4))
  expect(closed).toBeCloseTo(220, -1)
  expect(squeal(1)).toBeGreaterThan(1500)
  expect(squeal(0.6)).toBeLessThan(0.75 * squeal(1))
})

test('a loud hit charges the coupling cap and chokes what follows', () => {
  const hitThenHum = (t: number) =>
    (t < SR / 4 ? 0.8 : 0.05) * Math.sin((2 * Math.PI * 220 * t) / SR)
  const after = (x: Float32Array) => x.subarray(SR / 4, SR / 4 + SR / 10)
  const free = stage({ driveDb: 30, distPinGain: 21 }, hitThenHum, 0.5)
  const blocked = stage({ driveDb: 30, distBlock: 1 }, hitThenHum, 0.5)
  expect(rms(after(blocked))).toBeLessThan(0.5 * rms(after(free)))
})

test('a small speaker loses the bass and rattles at full travel', () => {
  const bass = sineAt(110, 0.8)
  const line = stage({ driveDb: 0, distPinGain: 21 }, bass)
  const cone = stage({ driveDb: 0, distSpeaker: 1 }, bass)
  const s = spectrum(cone.subarray(SR / 4), SR)
  expect(spectrum(line.subarray(SR / 4), SR).centroid).toBeLessThan(400)
  expect(s.centroid).toBeGreaterThan(2000)
})

test('the mic on the bypass pin comes out of the amp', () => {
  const voice = (ctx: Ctx, i: number, t: number) => {
    ctx.mic[i] = 0.05 * Math.sin((2 * Math.PI * 330 * t) / SR)
  }
  const silent = () => 0
  const patched = stage({ micPatch: MIC.clipBypass }, silent, 0.5, voice)
  const unpatched = stage({ distPinGain: 21 }, silent, 0.5, voice)
  expect(rms(unpatched)).toBeLessThan(0.01)
  expect(rms(patched)).toBeGreaterThan(0.1)
})

// The datasheet's bass boost, 10 kΩ and 0.033 µF from pin 5 to pin 1, leaves
// 10k/(15k + 10k) of the gain above its corners and all of it below: 8 dB.
test('pin 5 to pin 1 through the datasheet parts drops the top 8 dB and keeps the bass', () => {
  expect(boostOhms(0.5)).toBeCloseTo(10e3, -1)
  const level = (hz: number, distPinFb: number) =>
    rms(
      stage(
        { driveDb: 0, distPinGain: 21, distPinFb },
        sineAt(hz, 0.05),
      ).subarray(SR / 2),
    )
  const db = (hz: number) => 20 * Math.log10(level(hz, 0.5) / level(hz, 0))
  expect(db(30)).toBeGreaterThan(-1)
  expect(db(5000)).toBeCloseTo(20 * Math.log10(10 / 25), 0)
})
