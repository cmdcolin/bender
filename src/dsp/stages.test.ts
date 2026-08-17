import { expect, test } from 'vitest'
import { DEFAULT_CONTROLS, type Controls } from '../controls'
import { packParams } from '../engine/params'
import { buildBender, buildChain, type BuiltChain } from './build'
import { BLOCK, type StereoBlock } from './stage'

function makeIo(): StereoBlock {
  return { l: new Float32Array(BLOCK), r: new Float32Array(BLOCK), n: BLOCK }
}

const SR = 48000

function rms(x: Float32Array): number {
  return Math.sqrt(x.reduce((a, v) => a + v * v, 0) / x.length)
}

// Positive-going crossings per second — the pitch of anything roughly periodic.
function pitchHz(x: Float32Array): number {
  let cycles = 0
  for (let i = 1; i < x.length; i++) {
    if (x[i - 1]! <= 0 && x[i]! > 0) cycles++
  }
  return (cycles * SR) / x.length
}

function sine(hz: number, seconds: number, amp = 0.6): Float32Array {
  const buf = new Float32Array(Math.round(seconds * SR))
  for (let i = 0; i < buf.length; i++) buf[i] = amp * Math.sin((2 * Math.PI * hz * i) / SR)
  return buf
}

// Cases that need the sampler, the mic or a stopped transport render through
// the built bender rather than the bare chain.
function renderBender(
  overrides: Partial<Controls>,
  seconds: number,
  setup?: (built: BuiltChain) => void,
  micFill?: (mic: Float32Array, offset: number) => void,
): Float32Array {
  const built = buildBender(SR)
  setup?.(built)
  const p = packParams({ ...DEFAULT_CONTROLS, ...overrides })
  const io = makeIo()
  const mic = new Float32Array(BLOCK)
  const blocks = Math.ceil((seconds * SR) / BLOCK)
  const out = new Float32Array(blocks * BLOCK)
  for (let b = 0; b < blocks; b++) {
    micFill?.(mic, b * BLOCK)
    built.chain.process(io, p, micFill ? mic : undefined)
    out.set(io.l.subarray(0, BLOCK), b * BLOCK)
  }
  return out
}

const tail = (x: Float32Array, seconds = 0.5) => x.subarray(x.length - seconds * SR)

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

test('a wire soldered to nothing changes nothing', () => {
  const base: Partial<Controls> = { chipLevel: 0.6, filtMix: 1, filtRes: 1.1 }
  const a = render(base, 1)
  const b = render({ ...base, mod0Depth: 1, bodyX: 0.8, modLfoHz: 6 }, 1)
  expect(a).toEqual(b)
})

test('the body pad moves the filter once a wire lands on it', () => {
  const base: Partial<Controls> = {
    chipLevel: 0.6,
    bendSlot0: 6,
    filtMix: 1,
    filtRes: 1.1,
    filtHz: 500,
    bodyX: 0.9,
    mod0Dest: 0,
    mod0Depth: 1,
  }
  const unwired = render(base, 1)
  const wired = render({ ...base, mod0Src: 5 }, 1)
  expect(wired).not.toEqual(unwired)
  expect(pitchHz(tail(wired))).toBeGreaterThan(pitchHz(tail(unwired)))
})

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

test('the tape brake drags everything already on the tape down in pitch', () => {
  const look: Partial<Controls> = {
    chipLevel: 0,
    sampleLevel: 1,
    dlyMix: 1,
    delayMs: 200,
    dlyFb: 0,
  }
  const load = (b: BuiltChain) => b.sampler.setBuffer(sine(400, 1))
  const free = renderBender(look, 2, load)
  const braked = renderBender({ ...look, tapeBrake: 0.5 }, 2, load)
  expect(pitchHz(tail(free))).toBeCloseTo(400, -2)
  expect(pitchHz(tail(braked))).toBeLessThan(0.85 * pitchHz(tail(free)))
})

test('a sagging supply drags the tape motor with it', () => {
  const look: Partial<Controls> = {
    chipLevel: 0,
    sampleLevel: 1,
    dlyMix: 1,
    delayMs: 200,
    dlyFb: 0,
    brownAmt: 1,
    brownRate: 0,
  }
  const load = (b: BuiltChain) => b.sampler.setBuffer(sine(400, 1))
  const free = renderBender(look, 2, load)
  const dragged = renderBender({ ...look, tapeMotorRail: 1 }, 2, load)
  expect(pitchHz(tail(dragged))).toBeLessThan(0.9 * pitchHz(tail(free)))
})

test('the mic soldered onto the drum trigger fires the kit', () => {
  const clicks = (mic: Float32Array, offset: number) => {
    for (let i = 0; i < mic.length; i++) mic[i] = (offset + i) % 12000 < 40 ? 0.9 : 0
  }
  const look: Partial<Controls> = { chipLevel: 0, drumLevel: 1, micLevel: 1 }
  // the sequencer is stopped, so anything we hear came off the trigger line
  const trig = renderBender({ ...look, micPatch: 5 }, 1, undefined, clicks)
  const inert = renderBender({ ...look, micPatch: 4 }, 1, undefined, clicks)
  expect(rms(inert)).toBe(0)
  expect(rms(trig)).toBeGreaterThan(0.01)
})
