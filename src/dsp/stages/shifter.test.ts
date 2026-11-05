import { expect, test } from 'vitest'

import { DEST } from '../modbus.ts'
import { spectrum } from '../spectrum.ts'
import {
  bin,
  pitchHz,
  renderBender,
  renderStereo,
  rms,
  sine,
  SR,
  stepMask,
  tail,
} from '../testRender.ts'

import type { Controls } from '../../controls.ts'
import type { BuiltChain } from '../build.ts'

test('the frequency shifter moves a sine by its shift, both ways', () => {
  const look: Partial<Controls> = {
    chipLevel: 0,
    sampleLevel: 1,
    bendSlot0: 7,
    shiftMix: 1,
    shiftHz: 300,
  }
  const load = (b: BuiltChain) => b.sampler.setBuffer(sine(500, 1))
  const up = renderBender({ ...look, shiftDir: 0 }, 1, load)
  const down = renderBender({ ...look, shiftDir: 1 }, 1, load)
  expect(pitchHz(tail(up))).toBeCloseTo(800, -2)
  expect(pitchHz(tail(down))).toBeCloseTo(200, -2)
})

test('a wire onto the shifter moves the shift itself', () => {
  const look: Partial<Controls> = {
    chipLevel: 0,
    sampleLevel: 1,
    bendSlot0: 7,
    shiftMix: 1,
    shiftHz: 100,
    bodyX: 1,
    mod0Src: 5,
    mod0Dest: DEST.shiftHz,
    mod0Depth: 1,
  }
  const load = (b: BuiltChain) => b.sampler.setBuffer(sine(500, 1))
  // body X pinned at 1 lifts a 100 Hz shift four octaves, to 1600
  expect(pitchHz(tail(renderBender(look, 1, load)))).toBeCloseTo(2100, -2)
})

// 500 Hz shifted up 300: the sideband kept is at 800, the one turned away at 200.
const BODE: Partial<Controls> = {
  chipLevel: 0,
  drumLevel: 0,
  sampleLevel: 1,
  bendSlot0: 7,
  shiftMix: 1,
  shiftHz: 300,
}
const held = (b: BuiltChain) => b.sampler.setBuffer(sine(500, 4, 0.35))
const leakDb = (x: Float32Array) => 20 * Math.log10(bin(x, 200) / bin(x, 800))

// The turned-away sideband against the kept one, every 50 ms.
const leakEnvelope = (x: Float32Array) => {
  const out: number[] = []
  for (let at = SR / 2; at + SR / 20 <= x.length; at += SR / 20)
    out.push(leakDb(x.subarray(at, at + SR / 20)))
  return out
}

test('drifting pairs leak the turned-away sideband, more while the programme is loud', () => {
  const swell = sine(500, 3, 0.35)
  for (let i = 0; i < swell.length; i++)
    if (Math.floor(i / (SR / 2)) % 2 === 1) swell[i]! *= 0.2
  const load = (b: BuiltChain) => b.sampler.setBuffer(swell)
  const sides = (over: Partial<Controls>) => {
    const x = renderBender({ ...BODE, ...over }, 3, load)
    return {
      loud: leakDb(x.subarray(2 * SR + SR / 4, 2.5 * SR)),
      quiet: leakDb(x.subarray(2.5 * SR + SR / 4, 3 * SR)),
    }
  }
  const stock = sides({})
  const drift = sides({ shiftDrift: 1 })
  expect(stock.loud).toBeLessThan(-40)
  expect(drift.loud).toBeGreaterThan(-3)
  expect(drift.loud - drift.quiet).toBeGreaterThan(6)
})

test('a mistrimmed quadrature lets both sidebands through, equal at full trim', () => {
  const at = (shiftQuad: number) =>
    leakDb(tail(renderBender({ ...BODE, shiftQuad }, 1.5, held)))
  expect(at(0)).toBeLessThan(-40)
  expect(at(0.3)).toBeGreaterThan(-16)
  expect(at(0.3)).toBeLessThan(-10)
  expect(Math.abs(at(1))).toBeLessThan(1)
})

test('each kit hit knocks the oscillator out of quadrature and it settles back', () => {
  const kick = (b: BuiltChain) => {
    held(b)
    b.transport.drums = true
  }
  const board = { ...BODE, drumBpm: 120, drumKick: stepMask(0, 4, 8, 12) }
  const swing = (shiftKnock: number) => {
    const env = leakEnvelope(renderBender({ ...board, shiftKnock }, 3, kick))
    return { most: Math.max(...env), least: Math.min(...env) }
  }
  const still = swing(0)
  const knocked = swing(1)
  expect(still.most).toBeLessThan(-25)
  expect(knocked.most).toBeGreaterThan(0)
  expect(knocked.most - knocked.least).toBeGreaterThan(20)
})

test('both outputs at once put the up shift left and the down shift right', () => {
  const look = { ...BODE, shiftSplit: 1 }
  const split = renderStereo(look, 1, held)
  expect(pitchHz(tail(split.l))).toBeCloseTo(800, -2)
  expect(pitchHz(tail(split.r))).toBeCloseTo(200, -2)
  const swapped = renderStereo({ ...look, shiftDir: 1 }, 1, held)
  expect(pitchHz(tail(swapped.l))).toBeCloseTo(200, -2)
  expect(pitchHz(tail(swapped.r))).toBeCloseTo(800, -2)
})

test('a clipping loop amp shifts its own harmonics and lets the carrier through', () => {
  const at = (shiftClip: number) => {
    const x = tail(renderBender({ ...BODE, shiftClip }, 1.5, held))
    return {
      harmonic: bin(x, 1300) / bin(x, 800),
      carrier: bin(x, 300) / bin(x, 800),
    }
  }
  const stock = at(0)
  const clipped = at(1)
  expect(stock.harmonic).toBeLessThan(0.01)
  expect(clipped.harmonic).toBeGreaterThan(0.1)
  expect(clipped.carrier).toBeGreaterThan(0.05)
})

// A brownout with no depth to speak of still owns the sag, which follows the
// sine's envelope: a steady droop of about a third.
test('an oscillator on a sagging rail runs the shift backwards and smears it', () => {
  const sagging = { ...BODE, brownAmt: 0.01, brownRate: 0 }
  const at = (shiftRail: number) =>
    tail(renderBender({ ...sagging, shiftRail }, 1.5, held))
  const regulated = at(0)
  const railed = at(1)
  expect(bin(regulated, 800) / rms(regulated)).toBeGreaterThan(0.6)
  expect(bin(railed, 800) / rms(railed)).toBeLessThan(0.1)
  expect(spectrum(railed, SR).flatness).toBeGreaterThan(
    3 * spectrum(regulated, SR).flatness,
  )
})

test('an unbalanced multiplier lets the carrier through', () => {
  const at = (shiftLeak: number) => {
    const x = tail(renderBender({ ...BODE, shiftLeak }, 1.5, held))
    return bin(x, 300) / bin(x, 800)
  }
  expect(at(0)).toBeLessThan(0.01)
  expect(at(1)).toBeGreaterThan(0.5)
})
