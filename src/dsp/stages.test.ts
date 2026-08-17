import { expect, test } from 'vitest'
import { DEFAULT_CONTROLS, type Controls } from '../controls'
import { packParams } from '../engine/params'
import { buildChain } from './build'
import { BLOCK, type StereoBlock } from './stage'

function makeIo(): StereoBlock {
  return { l: new Float32Array(BLOCK), r: new Float32Array(BLOCK), n: BLOCK }
}

function render(overrides: Partial<Controls>, seconds = 0.5): Float32Array {
  const sr = 48000
  const chain = buildChain(sr)
  const p = packParams({ ...DEFAULT_CONTROLS, ...overrides })
  const io = makeIo()
  const blocks = Math.ceil((seconds * sr) / BLOCK)
  const out = new Float32Array(blocks * BLOCK)
  for (let b = 0; b < blocks; b++) {
    chain.process(io, p)
    out.set(io.l.subarray(0, BLOCK), b * BLOCK)
  }
  return out
}

test('default board makes sound (the toy chip demo tune)', () => {
  const out = render({}, 1)
  const rms = Math.sqrt(out.reduce((a, x) => a + x * x, 0) / out.length)
  expect(rms).toBeGreaterThan(0.005)
})

test('all-mixes-zero equals no bends: same output with slots emptied', () => {
  const base: Partial<Controls> = { chipLevel: 0.5 }
  const a = render(base)
  const b = render({ ...base, bendSlot0: 0, bendSlot1: 0, bendSlot2: 0, bendSlot3: 0, bendSlot4: 0 })
  expect(a).toEqual(b)
})

test('deterministic: same params render bit-identically twice', () => {
  const look: Partial<Controls> = {
    chipStarve: 0.8,
    drumLevel: 0.7,
    drumRetrigHz: 90,
    crushMix: 0.7,
    bits: 4,
    glitchMix: 0.6,
    dlyMix: 0.4,
    fbAmt: 1.1,
  }
  expect(render(look, 1)).toEqual(render(look, 1))
})

test('starve reboots restart the tune', () => {
  const sr = 48000
  const chain = buildChain(sr)
  const p = packParams({ ...DEFAULT_CONTROLS, chipLevel: 1, chipStarve: 1 })
  const io = makeIo()
  let sawSilentBoot = false
  let sawSound = false
  for (let b = 0; b < Math.ceil((3 * sr) / BLOCK); b++) {
    chain.process(io, p)
    // the safety tail's dc blocker leaves a decaying residue, so "silent"
    // means below anything audible rather than exactly zero
    const peak = Math.max(...io.l.subarray(0, BLOCK).map(Math.abs))
    if (peak < 1e-9) sawSilentBoot = true
    else sawSound = true
  }
  expect(sawSound).toBe(true)
  expect(sawSilentBoot).toBe(true)
})

test('runaway delay feedback stays bounded and audible', () => {
  const out = render({ chipLevel: 0.6, dlyMix: 0.6, dlyFb: 1.5, delayMs: 80 }, 3)
  const tail = out.subarray(out.length - 4800)
  const rms = Math.sqrt(tail.reduce((a, x) => a + x * x, 0) / tail.length)
  expect(rms).toBeGreaterThan(0.01)
  expect(Math.max(...tail.map(Math.abs))).toBeLessThanOrEqual(0.891 + 1e-6)
})

test('screech filter self-oscillates past unity resonance', () => {
  const out = render(
    {
      chipLevel: 0,
      crackleAmp: 0.4,
      crackleRate: 20,
      bendSlot0: 6,
      filtMix: 1,
      filtRes: 1.25,
      filtHz: 400,
    },
    2,
  )
  const tail = out.subarray(out.length - 4800)
  const rms = Math.sqrt(tail.reduce((a, x) => a + x * x, 0) / tail.length)
  expect(rms).toBeGreaterThan(0.02)
})

test('feedback patched into the delay still loops', () => {
  const out = render(
    { chipLevel: 0.5, fbAmt: 1.3, fbDest: 3, dlyMix: 0.8, delayMs: 150, dlyFb: 0.7 },
    2,
  )
  const tail = out.subarray(out.length - 4800)
  const rms = Math.sqrt(tail.reduce((a, x) => a + x * x, 0) / tail.length)
  expect(rms).toBeGreaterThan(0.01)
})

test('no-input feedback bus self-oscillates from nothing', () => {
  const out = render({ chipLevel: 0, fbAmt: 1.4, fbDelayMs: 2, crackleAmp: 0.2 }, 2)
  const tail = out.subarray(out.length - 4800)
  const rms = Math.sqrt(tail.reduce((a, x) => a + x * x, 0) / tail.length)
  expect(rms).toBeGreaterThan(0.01)
})
