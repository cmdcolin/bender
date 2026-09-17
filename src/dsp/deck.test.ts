import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS, type Controls } from '../controls'
import {
  MAX_SOURCES,
  N_PARAMS,
  packParams,
  SOURCE_TAPS,
} from '../engine/params'
import { buildBender, type BuiltChain } from './build'
import { Deck } from './deck'
import { DEST } from './modbus'
import { Smoother } from './smoother'
import { BLOCK } from './stage'
import { bin, makeIo, pitchHz, rms, sine, SR } from './testRender'

// The deck's own rig, because testRender's is deliberately not it: renderBender
// hands the mic straight to the chain, which is what the alignment tests over
// there measure, and the whole point down here is that the deck does not.
const SEED = 3

interface Run {
  out: Float32Array
  built: BuiltChain
  stems: Float32Array[]
}

interface Opts {
  setup?: (built: BuiltChain) => void
  mic?: (buf: Float32Array, offset: number) => void
  /** A hand on a knob part way through, as the seconds so far. */
  each?: (secs: number) => Partial<Controls> | undefined
  stems?: boolean
}

function runDeck(
  overrides: Partial<Controls>,
  seconds: number,
  opts: Opts = {},
): Run {
  const built = buildBender(SR, SEED)
  opts.setup?.(built)
  if (opts.stems) built.chain.capturing = true
  const deck = new Deck(built.chain, SR)
  const smoother = new Smoother(SR, BLOCK)
  let board: Controls = { ...DEFAULT_CONTROLS, ...overrides }
  const target = new Float32Array(N_PARAMS)
  packParams(board, target)
  const io = makeIo()
  const mic = new Float32Array(BLOCK)
  const blocks = Math.ceil((seconds * SR) / BLOCK)
  const out = new Float32Array(blocks * BLOCK)
  const stems = Array.from(
    { length: MAX_SOURCES },
    () => new Float32Array(blocks * BLOCK),
  )
  for (let b = 0; b < blocks; b++) {
    const moved = opts.each?.((b * BLOCK) / SR)
    if (moved) {
      board = { ...board, ...moved }
      packParams(board, target)
    }
    if (opts.mic) {
      opts.mic(mic, b * BLOCK)
      deck.pushMic(mic, BLOCK)
    } else deck.pushMic(null, BLOCK)
    smoother.step(target)
    deck.process(io, smoother.cur)
    out.set(io.l, b * BLOCK)
    if (opts.stems) {
      for (let k = 0; k < MAX_SOURCES; k++) {
        stems[k]!.set(
          deck.stems.subarray(k * BLOCK, (k + 1) * BLOCK),
          b * BLOCK,
        )
      }
    }
  }
  return { out, built, stems }
}

/** The same board with no deck in the way at all. */
function runChain(
  overrides: Partial<Controls>,
  seconds: number,
  setup?: (built: BuiltChain) => void,
): Float32Array {
  const built = buildBender(SR, SEED)
  setup?.(built)
  const p = packParams({ ...DEFAULT_CONTROLS, ...overrides })
  const io = makeIo()
  const blocks = Math.ceil((seconds * SR) / BLOCK)
  const out = new Float32Array(blocks * BLOCK)
  for (let b = 0; b < blocks; b++) {
    built.chain.process(io, p)
    out.set(io.l, b * BLOCK)
  }
  return out
}

const QUIET: Partial<Controls> = { chipLevel: 0, drumLevel: 0 }
const TONE_HZ = 1000
// A whole number of cycles of the rate, so the loop splices without a click and
// what comes out is the frequency and nothing else.
const TONE: Partial<Controls> = { ...QUIET, sampleLevel: 1 }
const loadTone = (built: BuiltChain) =>
  built.sampler.setBuffer(sine(TONE_HZ, 1))

const playing = (built: BuiltChain) => {
  built.transport.tune = true
  built.transport.drums = true
}

/** How much of a take sits in the top twentieth of the band, where a decimating
    deck with no lid on it puts its images. */
function topBand(x: Float32Array): number {
  let sum = 0
  const stops = 24
  for (let i = 0; i < stops; i++) {
    sum += bin(x, 0.45 * SR + (i * 0.05 * SR) / stops)
  }
  return sum / stops
}

test('at ×1 the deck hands back the chain’s own output, sample for sample', () => {
  const board: Partial<Controls> = { chipLevel: 0.8, drumLevel: 0.6 }
  const through = runDeck(board, 0.5, { setup: playing }).out
  const direct = runChain(board, 0.5, playing)
  let worst = 0
  for (let i = 0; i < direct.length; i++) {
    worst = Math.max(worst, Math.abs(through[i]! - direct[i]!))
  }
  expect(rms(direct)).toBeGreaterThan(0.01)
  expect(worst).toBeLessThan(1e-7)
})

test('at ×0.5 the board comes out an octave down', () => {
  const at = (deckSpeed: number) =>
    pitchHz(
      runDeck({ ...TONE, deckSpeed }, 1, { setup: loadTone }).out.subarray(
        SR / 2,
      ),
    )
  expect(at(1)).toBeCloseTo(TONE_HZ, -2)
  expect(at(0.5)).toBeCloseTo(TONE_HZ / 2, -2)
})

test('at ×0.5 a second of output is half a second of board', () => {
  const at = (deckSpeed: number) =>
    runDeck({ ...QUIET, drumLevel: 0.7, deckSpeed }, 2, { setup: playing })
      .built.toyDrum.tick
  const full = at(1)
  expect(full).toBeGreaterThan(8)
  expect(at(0.5) / full).toBeCloseTo(0.5, 1)
})

test('at ×2 the board comes out an octave up, with the lid on the images', () => {
  const tone = runDeck({ ...TONE, deckSpeed: 2 }, 1, { setup: loadTone }).out
  expect(pitchHz(tone.subarray(SR / 2))).toBeCloseTo(2 * TONE_HZ, -2)

  // Noise is the case that tells whether the lid is there at all: folded noise
  // and the noise it folded into are the same measurement, so what has to be
  // shown is that the top of the band came down rather than that it stayed put.
  const hiss = { ...QUIET, noiseLevel: 1, noiseColor: 1 }
  const plain = runDeck(hiss, 1).out.subarray(SR / 2)
  const fast = runDeck({ ...hiss, deckSpeed: 2 }, 1).out.subarray(SR / 2)
  expect(topBand(plain)).toBeGreaterThan(0)
  expect(topBand(fast)).toBeLessThan(0.3 * topBand(plain))
})

test('at the stop the deck is silent, and finite about it', () => {
  const out = runDeck({ chipLevel: 0.8, drumLevel: 0.6, deckSpeed: 0 }, 0.5, {
    setup: playing,
  }).out
  expect(out.every(v => Number.isFinite(v))).toBe(true)
  expect(rms(out)).toBe(0)
})

test('the mic comes out at the pitch it went in, whatever the deck is doing', () => {
  const hz = 700
  const shout = (buf: Float32Array, at: number) => {
    for (let i = 0; i < buf.length; i++) {
      buf[i] = 0.5 * Math.sin((2 * Math.PI * hz * (at + i)) / SR)
    }
  }
  const out = runDeck({ ...QUIET, micLevel: 1, deckSpeed: 0.5 }, 3, {
    mic: shout,
  }).out.subarray(2 * SR)
  expect(rms(out)).toBeGreaterThan(0.05)
  expect(Math.abs(pitchHz(out) - hz) / hz).toBeLessThan(0.02)
})

test('a hand dragging the trimmer to the stop and back leaves nothing broken', () => {
  const { out } = runDeck(
    { chipLevel: 0.8, drumLevel: 0.6, deckInertia: 0.4, deckSpeed: 2 },
    1,
    {
      setup: playing,
      each: secs => ({ deckSpeed: secs < 0.5 ? 2 - 4 * secs : 4 * secs - 2 }),
    },
  )
  expect(out.every(v => Number.isFinite(v))).toBe(true)
  expect(rms(out)).toBeGreaterThan(0.01)
})

test('the stems come off the deck at the speed the mix did', () => {
  const at = (deckSpeed: number) =>
    pitchHz(
      runDeck({ ...TONE, deckSpeed }, 1, {
        setup: loadTone,
        stems: true,
      }).stems[SOURCE_TAPS.indexOf('sampler')]!.subarray(SR / 2),
    )
  expect(at(1)).toBeCloseTo(TONE_HZ, -2)
  expect(at(0.5)).toBeCloseTo(TONE_HZ / 2, -2)
})

test('a wire onto the lane drags the whole board with it', () => {
  const look: Partial<Controls> = {
    ...TONE,
    mod0Src: 5,
    mod0Dest: DEST.deckSpeed,
    mod0Depth: 1,
  }
  const still = runDeck({ ...look, bodyX: 0 }, 1, { setup: loadTone }).out
  const pushed = runDeck({ ...look, bodyX: 1 }, 1, { setup: loadTone }).out
  expect(pitchHz(pushed.subarray(SR / 2))).toBeGreaterThan(
    1.5 * pitchHz(still.subarray(SR / 2)),
  )
})
