import { expect, test } from 'vitest'

import { IDX } from '../../engine/params.ts'
import { renderBender, SR } from '../testRender.ts'
import { mulberry32 } from '../util/rng.ts'
import { PEAK_BINS, peaksOf, type Sampler } from './sampler.ts'

import type { Controls } from '../../controls.ts'

function noise(frames: number, amp = 0.8) {
  const rng = mulberry32(frames)
  const out = new Float32Array(frames)
  for (let i = 0; i < frames; i++)
    out[i] = i % 97 === 0 ? 0 : amp * (rng() * 2 - 1)
  return out
}

function peaksByDivision(mono: Float32Array) {
  const out = new Float32Array(PEAK_BINS)
  const n = mono.length
  for (let i = 0; i < n; i++) {
    const bin = ((i * PEAK_BINS) / n) | 0
    const v = mono[i]! < 0 ? -mono[i]! : mono[i]!
    if (v > out[bin]!) out[bin] = v
  }
  return out
}

const bits = (peaks: Float32Array) => Array.from(new Uint32Array(peaks.buffer))

test.each([
  ['90 s', Math.round(90 * SR)],
  ['20 s', Math.round(20 * SR)],
  ['7.3 s', Math.round(7.3 * SR)],
  ['5 s', Math.round(5 * SR)],
  ['257 frames', 257],
  ['255 frames', 255],
  ['100 frames', 100],
  ['1 frame', 1],
  ['nothing', 0],
])(
  'the envelope of %s is bit for bit the one a bin per sample gives',
  (_, n) => {
    const mono = noise(n)
    expect(bits(peaksOf(mono))).toEqual(bits(peaksByDivision(mono)))
  },
)

test('the envelope of silence is positive zero', () => {
  const silent = new Float32Array(1000)
  silent[3] = -0
  expect(bits(peaksOf(silent))).toEqual(bits(new Float32Array(PEAK_BINS)))
})

const equalsTape = (peaks: Float32Array, mono: Float32Array | null) =>
  mono !== null && bits(peaks).join() === bits(peaksOf(mono)).join()

function redrawsUntilDrawn(sampler: Sampler) {
  let calls = 0
  while (!equalsTape(sampler.peaks, sampler.mono) && calls < PEAK_BINS) {
    sampler.redraw()
    calls++
  }
  return calls
}

const QUIET: Partial<Controls> = {
  chipLevel: 0,
  drumLevel: 0,
  sampleLevel: 0,
}

test('an undo redraws only the stretch it swapped, a slice a block', () => {
  let calls = -1
  renderBender(
    { ...QUIET, loopRec: 1, loopErase: 1 },
    1.6,
    built => built.sampler.setBuffer(noise(30 * SR)),
    undefined,
    (built, secs, p) => {
      if (secs >= 1.5 && p[IDX.loopRec] === 1) {
        p[IDX.loopRec] = 0
        expect(built.sampler.undoState).toBe(1)
        built.sampler.undo()
        calls = redrawsUntilDrawn(built.sampler)
      }
    },
  )
  expect(calls).toBe(2)
})

test('closing a take redraws the cut reel a slice a block', () => {
  let calls = -1
  let loudest = 0
  renderBender(
    { ...QUIET, oscLevel: 0.5, noiseLevel: 0.3, loopRec: 1, loopSecs: 20 },
    2.1,
    undefined,
    undefined,
    (built, secs) => {
      if (secs >= 2 && built.sampler.open) {
        built.sampler.closeTake()
        calls = redrawsUntilDrawn(built.sampler)
        loudest = Math.max(...built.sampler.peaks)
      }
    },
  )
  expect(calls).toBe(2)
  expect(loudest).toBeGreaterThan(0.01)
})
