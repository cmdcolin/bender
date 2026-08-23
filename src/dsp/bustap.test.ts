import { expect, test } from 'vitest'
import { DEFAULT_CONTROLS, type Controls } from '../controls'
import { CHANNELS } from '../ui/controls'
import { SOURCE_TAPS, TAP_BUS, TAP_MIC, packParams } from '../engine/params'
import { buildBender, buildChain } from './build'
import { makeIo, rms, SR } from './testRender'
import { BLOCK } from './stage'

// Every source silent, so a board can be built up one channel at a time.
const HUSH: Partial<Controls> = {
  chipLevel: 0,
  drumLevel: 0,
  fmLevel: 0,
  oscLevel: 0,
  noiseLevel: 0,
  sampleLevel: 0,
  crackleAmp: 0,
  micLevel: 0,
}

function render(overrides: Partial<Controls>, seconds = 2) {
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

const crest = (x: Float32Array) =>
  x.reduce((a, v) => Math.max(a, Math.abs(v)), 0) / rms(x)

function taps(overrides: Partial<Controls>, seconds = 4, mic?: Float32Array) {
  const chain = buildChain(SR)
  const p = packParams({ ...DEFAULT_CONTROLS, ...HUSH, ...overrides })
  const io = makeIo()
  for (let b = 0; b < Math.ceil((seconds * SR) / BLOCK); b++)
    chain.process(io, p, mic)
  return chain.taps
}

// The one that has to hold for the mixer to mean anything: the tap beside a
// fader is that machine and no other. Read off the bus as a difference, so a
// source wired into the wrong slot would show up as somebody else's meter
// moving — which is exactly what the panel would then draw.
test('each channel meters its own source and nobody else', () => {
  // The sampler has no file in it under a bare chain, and the mic is a wire
  // rather than a stage; both are checked on their own below.
  const wired: Partial<Controls>[] = [
    { chipLevel: 1 },
    { drumLevel: 1 },
    // Nothing over on the toy strikes a note unless the toy's own sequencer is
    // running, which it is: the FM chip has no keys of its own.
    { fmLevel: 1 },
    { oscLevel: 1 },
    { noiseLevel: 1 },
  ]
  for (const [i, only] of wired.entries()) {
    const t = taps(only)
    expect(t[i], `${CHANNELS[i]!.name} reads its own tap`).toBeGreaterThan(0)
    for (let other = 0; other < SOURCE_TAPS.length; other++) {
      if (other === i) continue
      expect(t[other], `${CHANNELS[i]!.name} moved ${other}`).toBe(0)
    }
    expect(t[TAP_BUS]).toBeGreaterThan(0)
  }
})

// The channel list on the panel is the order the chain sums in, by construction
// rather than by hope: the taps come home in that order and the mixer reads them
// off it.
test('the desk names the sources the chain is built with, in order', () => {
  expect(buildBender(SR).chain.sources.map(s => s.label)).toEqual([
    ...SOURCE_TAPS,
  ])
  expect(CHANNELS.map(c => c.tap)).toEqual([0, 1, 2, 3, 4, 5, TAP_MIC])
})

test('the mic meters where it is soldered, on the bus or off it', () => {
  const shout = new Float32Array(BLOCK).fill(0.5)
  // On the mix, so it is on the bus as well as on its own tap.
  const onMix = taps({ micLevel: 1 }, 1, shout)
  expect(onMix[TAP_MIC]).toBeGreaterThan(0.4)
  expect(onMix[TAP_BUS]).toBeGreaterThan(0.4)
  // Soldered onto the toy's supply rail instead: still a live wire, and the
  // meter says so, but nothing of it reaches the bus on its own.
  const onRail = taps({ micLevel: 1, micPatch: 1 }, 1, shout)
  expect(onRail[TAP_MIC]).toBeGreaterThan(0.4)
  expect(onRail[TAP_BUS]).toBe(0)
})

// The lie the meters exist to catch: a fader three quarters up on a chip that
// nothing has struck.
test('a fader up on a silent chip meters at nothing', () => {
  const chain = buildBender(SR)
  const p = packParams({ ...DEFAULT_CONTROLS, ...HUSH, fmLevel: 0.75 })
  const io = makeIo()
  for (let b = 0; b < Math.ceil(SR / BLOCK); b++) chain.chain.process(io, p)
  // No transport, no key: the FM chip's gate line is soldered to a toy that is
  // not playing, so the fader is turned up to nothing at all.
  expect(chain.chain.taps[2]).toBe(0)
})

// The desk's own knob. Unity has to be a wire and not a soft clipper set to
// nearly nothing, because everything upstream of the bends would otherwise be
// squashed by a control nobody moved.
test('the bus drive is a wire at unity and a saturator off it', () => {
  const board: Partial<Controls> = { chipLevel: 0.9, drumLevel: 0.9 }
  const flat = render(board)
  expect(render({ ...board, mixDrive: 0 })).toEqual(flat)

  const driven = render({ ...board, mixDrive: 18 })
  expect(driven).not.toEqual(flat)
  // Driven, not merely louder: the peaks come in against the rms.
  expect(crest(driven)).toBeLessThan(crest(flat))
  // And trimmed the other way it is quieter, with the shape left alone.
  expect(rms(render({ ...board, mixDrive: -12 }))).toBeLessThan(rms(flat))
})

// Half the gain given back was the rule here for a long time, and half of a
// fixed ceiling is still a fixed ceiling: the amp's own maximum came down a
// decibel for every two on the knob, so the bus peaked at +6 and was a fader
// above it — six dB down by the top, on the one saturation upstream of the
// bends and the one the feedback return lands in. A board wound up to slam them
// arrived quieter instead. The travel has to buy density the whole way without
// ever spending level to do it.
test('the bus drive is denser all the way up and never quieter', () => {
  const board: Partial<Controls> = { chipLevel: 0.9, drumLevel: 0.9 }
  const up = [0, 6, 12, 18, 24].map(mixDrive => render({ ...board, mixDrive }))
  for (let i = 1; i < up.length; i++) {
    expect(rms(up[i]!), `${i}`).toBeGreaterThan(rms(up[i - 1]!))
    expect(crest(up[i]!), `${i}`).toBeLessThan(crest(up[i - 1]!))
  }
})

// Nothing reads the taps on the audio thread, and a panic is the board going
// quiet — a meter left holding the peak of a howl that has been killed is the
// one number on the panel still saying the howl is there.
test('a panic empties the meters', () => {
  const chain = buildChain(SR)
  const p = packParams({ ...DEFAULT_CONTROLS, chipLevel: 1 })
  const io = makeIo()
  for (let b = 0; b < 200; b++) chain.process(io, p)
  expect(chain.taps[0]).toBeGreaterThan(0)
  chain.panic()
  expect([...chain.taps].every(v => v === 0)).toBe(true)
})
