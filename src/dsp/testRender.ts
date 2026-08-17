// The rig the dsp tests render through: a board at 48 kHz run block by block,
// and the measurements that turn what came out of it into something to assert on.
import { DEFAULT_CONTROLS, type Controls } from '../controls'
import { packParams } from '../engine/params'
import { buildBender, buildChain, type BuiltChain } from './build'
import { BLOCK, type StereoBlock } from './stage'

export const SR = 48000

export function makeIo(): StereoBlock {
  return { l: new Float32Array(BLOCK), r: new Float32Array(BLOCK), n: BLOCK }
}

export function render(
  overrides: Partial<Controls>,
  seconds = 0.5,
): Float32Array {
  const chain = buildChain(SR)
  const p = packParams({ ...DEFAULT_CONTROLS, ...overrides })
  const io = makeIo()
  const blocks = Math.ceil((seconds * SR) / BLOCK)
  const out = new Float32Array(blocks * BLOCK)
  for (let b = 0; b < blocks; b++) {
    chain.process(io, p)
    out.set(io.l.subarray(0, BLOCK), b * BLOCK)
  }
  return out
}

// Cases that need the sampler, the mic or a stopped transport render through
// the built bender rather than the bare chain.
export function renderBender(
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

// Play the keyboard with the ROM sequencer stopped, so only the keys sound.
export const playKeys = (
  overrides: Partial<Controls>,
  script: (chip: BuiltChain['toyChip']) => void,
  seconds = 0.5,
) => renderBender(overrides, seconds, built => script(built.toyChip))

export const tail = (x: Float32Array, seconds = 0.5) =>
  x.subarray(x.length - seconds * SR)

export function sine(hz: number, seconds: number, amp = 0.6): Float32Array {
  const buf = new Float32Array(Math.round(seconds * SR))
  for (let i = 0; i < buf.length; i++)
    buf[i] = amp * Math.sin((2 * Math.PI * hz * i) / SR)
  return buf
}

// The sequencer advances before it fires, so step 1 only comes round after a
// whole lap — a solo hit goes somewhere the render will actually reach.
export const stepMask = (...steps: number[]) =>
  steps.reduce((m, s) => m | (1 << (15 - s)), 0)

export function rms(x: Float32Array): number {
  return Math.sqrt(x.reduce((a, v) => a + v * v, 0) / x.length)
}

// Positive-going crossings per second — the pitch of anything roughly periodic.
export function pitchHz(x: Float32Array): number {
  let cycles = 0
  for (let i = 1; i < x.length; i++) {
    if (x[i - 1]! <= 0 && x[i]! > 0) cycles++
  }
  return (cycles * SR) / x.length
}

// How much of one frequency is in there, by correlation — enough to tell a
// harmonic apart from the note that made it.
export function bin(x: Float32Array, hz: number): number {
  let re = 0
  let im = 0
  for (let i = 0; i < x.length; i++) {
    const w = (2 * Math.PI * hz * i) / SR
    re += x[i]! * Math.cos(w)
    im += x[i]! * Math.sin(w)
  }
  return Math.hypot(re, im) / x.length
}

// Peak over rms: a clean sine sits at √2 and clipping flattens it toward 1.
export function crest(x: Float32Array): number {
  return x.reduce((a, v) => Math.max(a, Math.abs(v)), 0) / rms(x)
}

// How much of the signal sits down where the kick lives.
export function lowEnergy(x: Float32Array, hz = 120): number {
  const c = 1 - Math.exp((-2 * Math.PI * hz) / SR)
  let y = 0
  let sum = 0
  for (let i = 0; i < x.length; i++) {
    y += c * (x[i]! - y)
    sum += y * y
  }
  return Math.sqrt(sum / x.length)
}
