import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS } from '../controls.ts'
import { IDX, packParams } from '../engine/params.ts'
import {
  Arc,
  ARC_BARS,
  ARC_SHAPES,
  arcShape,
  BLEND_LINEAR,
  BLEND_LOG,
  BLEND_STEP,
  type WildPack,
} from './arc.ts'

import type { Controls } from '../controls.ts'

const SR = 48000
const BPM = 120
const BAR_S = (4 * 60) / BPM
const shape = (name: (typeof ARC_SHAPES)[number]) => ARC_SHAPES.indexOf(name)
const bars = (n: (typeof ARC_BARS)[number]) => ARC_BARS.indexOf(n)

const board = (over: Partial<Controls>) =>
  packParams({
    ...DEFAULT_CONTROLS,
    drumBpm: BPM,
    arcShape: shape('hold'),
    ...over,
  })

const wild = (
  moves: {
    key: keyof typeof IDX
    to: number
    start?: number
    blend?: number
  }[],
): WildPack => ({
  idx: Int16Array.from(moves, m => IDX[m.key]),
  to: Float32Array.from(moves, m => m.to),
  start: Float32Array.from(moves, m => m.start ?? 0),
  blend: Uint8Array.from(moves, m => m.blend ?? BLEND_LINEAR),
})

const run = (arc: Arc, p: Float32Array, seconds: number) => {
  let out = p
  for (let t = 0; t < seconds * SR; t += 128)
    out = arc.step(p, 128, SR, 0, false)
  return out
}

test('the shapes run between calm and wild over the cycle', () => {
  expect(arcShape(shape('hold'), 3.3, 16, 0)).toBe(1)
  expect(arcShape(shape('rise, snap back'), 4, 16, 0)).toBeCloseTo(0.25)
  expect(arcShape(shape('rise, snap back'), 16, 16, 0)).toBe(0)
  expect(arcShape(shape('snap, fall back'), 0, 16, 0)).toBe(1)
  expect(arcShape(shape('swell'), 8, 16, 0)).toBeCloseTo(1)
  expect(arcShape(shape('swell'), 0, 16, 0)).toBeCloseTo(0)
  for (const name of ARC_SHAPES)
    for (let b = 0; b < 64; b += 0.37) {
      const v = arcShape(shape(name), b, 16, 5)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
})

test('spikes leave most bars calm and throw some bars wild', () => {
  let spiked = 0
  for (let b = 0; b < 400; b++)
    if (arcShape(shape('spikes'), b, 16, 9) === 1) spiked++
  expect(spiked).toBeGreaterThan(80)
  expect(spiked).toBeLessThan(160)
})

test('at no depth the arc hands back the board itself', () => {
  const arc = new Arc()
  arc.setWild(wild([{ key: 'filtHz', to: 4000 }]))
  const p = board({ arcDepth: 0 })
  expect(arc.step(p, 128, SR, 0, false)).toBe(p)
  expect(arc.pos).toBe(0)
})

test('held at full depth every moved param reaches its wild end', () => {
  const arc = new Arc()
  arc.setWild(
    wild([
      { key: 'filtRes', to: 0.95 },
      { key: 'drumDataLine', to: 3, blend: BLEND_STEP },
      { key: 'filtHz', to: 4000, blend: BLEND_LOG },
    ]),
  )
  const out = arc.step(board({ arcDepth: 1 }), 128, SR, 0, false)
  expect(out[IDX.filtRes]).toBeCloseTo(0.95)
  expect(out[IDX.drumDataLine]).toBe(3)
  expect(out[IDX.filtHz]).toBeCloseTo(4000)
  expect(out[IDX.chipLevel]).toBeCloseTo(DEFAULT_CONTROLS.chipLevel)
})

test('each param waits for its own start, and a switch flips halfway', () => {
  const arc = new Arc()
  arc.setWild(
    wild([
      { key: 'filtRes', to: 1, start: 0 },
      { key: 'drumSlip', to: 1, start: 0.5 },
      { key: 'drumDataLine', to: 3, start: 0, blend: BLEND_STEP },
    ]),
  )
  const out = arc.step(
    board({ arcDepth: 0.4, filtRes: 0, drumSlip: 0, drumDataLine: 0 }),
    128,
    SR,
    0,
    false,
  )
  expect(out[IDX.filtRes]).toBeCloseTo(0.4)
  expect(out[IDX.drumSlip]).toBe(0)
  expect(out[IDX.drumDataLine]).toBe(0)
})

test('a log knob travels in ratios', () => {
  const arc = new Arc()
  arc.setWild(wild([{ key: 'filtHz', to: 8000, blend: BLEND_LOG }]))
  const out = arc.step(board({ arcDepth: 0.5, filtHz: 80 }), 128, SR, 0, false)
  expect(out[IDX.filtHz]).toBeCloseTo(800, 0)
})

test('a rise climbs over its bars at the kit tempo and snaps back', () => {
  const arc = new Arc()
  arc.setWild(wild([{ key: 'filtRes', to: 1 }]))
  const p = board({
    arcDepth: 1,
    filtRes: 0,
    arcShape: shape('rise, snap back'),
    arcBars: bars(4),
  })
  run(arc, p, BAR_S * 2)
  expect(arc.pos).toBeCloseTo(0.5, 1)
  run(arc, p, BAR_S * 1.98)
  expect(arc.pos).toBeGreaterThan(0.95)
  run(arc, p, BAR_S * 0.05)
  expect(arc.pos).toBeLessThan(0.05)
})

test('jump holds a bar where it started and snaps to calm, halfway or full', () => {
  const arc = new Arc()
  arc.setWild(wild([{ key: 'filtRes', to: 1 }]))
  const p = board({
    arcDepth: 1,
    arcShape: shape('rise, snap back'),
    arcBars: bars(4),
    arcMoves: 1,
  })
  const seen = new Set<number>()
  for (let t = 0; t < 4 * BAR_S * SR; t += 128) {
    arc.step(p, 128, SR, 0, false)
    seen.add(arc.pos)
  }
  expect([...seen].toSorted((a, b) => a - b)).toEqual([0, 0.5, 1])
})

test("the arc's bar line locks to the kit's downbeat", () => {
  const arc = new Arc()
  arc.setWild(wild([{ key: 'filtRes', to: 1 }]))
  const p = board({
    arcDepth: 1,
    arcShape: shape('rise, snap back'),
    arcBars: bars(4),
  })
  run(arc, p, BAR_S * 0.7)
  arc.step(p, 128, SR, 16, true)
  expect(arc.pos).toBeCloseTo(0.25, 2)
})
