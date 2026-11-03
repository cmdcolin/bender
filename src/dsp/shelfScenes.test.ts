import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS, type Controls } from '../controls.ts'
import { applyPreset } from '../ui/presets/apply.ts'
import { PRESETS } from '../ui/presets/table.ts'
import { envelope, renderBender, SR } from './testRender.ts'
import { mulberry32 } from './util/rng.ts'

const SECONDS = 60
const JUDGED_FROM_S = 45

function pianoSide(seconds: number) {
  const rand = mulberry32(78)
  const out = new Float32Array(seconds * SR)
  const scale = [220, 247, 277, 330, 370, 440, 494, 554, 659]
  let at = 0
  while (at < out.length) {
    const hz = scale[Math.floor(rand() * scale.length)]!
    const amp = 0.1 + 0.15 * rand()
    const ring = Math.min(out.length - at, 3 * SR)
    for (let i = 0; i < ring; i++) {
      const t = i / SR
      const fade = amp * Math.exp(-3 * t)
      out[at + i]! +=
        fade *
        (Math.sin(2 * Math.PI * hz * t) +
          0.4 * Math.sin(4 * Math.PI * hz * t) +
          0.2 * Math.sin(6 * Math.PI * hz * t))
    }
    at += Math.round((0.3 + 0.6 * rand()) * SR)
  }
  return out
}

const decibels = (env: Float32Array) =>
  Array.from(env, v => 20 * Math.log10(v + 1e-6))

function correlation(a: number[], b: number[]) {
  const n = Math.min(a.length, b.length)
  const mean = (x: number[]) => x.slice(0, n).reduce((s, v) => s + v, 0) / n
  const ma = mean(a)
  const mb = mean(b)
  let ab = 0
  let aa = 0
  let bb = 0
  for (let i = 0; i < n; i++) {
    ab += (a[i]! - ma) * (b[i]! - mb)
    aa += (a[i]! - ma) ** 2
    bb += (b[i]! - mb) ** 2
  }
  return ab / Math.sqrt(aa * bb)
}

const take = (board: Controls) =>
  renderBender(board, SECONDS, built => built.sampler.setBuffer(pianoSide(90)))

const judged = (x: Float32Array) =>
  decibels(envelope(x.subarray(JUDGED_FROM_S * SR), 0.05))

function presence(board: Controls) {
  const source = take({
    ...board,
    loopRec: 0,
    fourLevel: 0,
    rackMix: 0,
    tapeMix: 0,
    filtMix: 0,
  })
  return correlation(judged(source), judged(take(board)))
}

const shelved = PRESETS.filter(p => p.shelf)

test.each(shelved.map(p => [p.name, p] as const))(
  '%s still plays the tape it rolls after three quarters of a minute',
  (_, preset) => {
    const r = presence(applyPreset(preset, DEFAULT_CONTROLS))
    expect(r, `envelope correlation with the bare tape`).toBeGreaterThan(0.32)
  },
  180_000,
)
