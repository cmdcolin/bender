import { expect, test } from 'vitest'
import { DEFAULT_CONTROLS } from '../controls'
import { IDX, N_PARAMS, PARAM_DEFS, packParams } from '../engine/params'
import { EDITOR_KEYS, sliderFor } from '../ui/controls'
import { buildChain } from './build'
import { Smoother } from './smoother'
import { BLOCK, type StereoBlock } from './stage'
import { mulberry32 } from './util/rng'

const LIMIT_CEIL = 0.891

function makeIo(): StereoBlock {
  return { l: new Float32Array(BLOCK), r: new Float32Array(BLOCK), n: BLOCK }
}

// The safety contract: whatever the params do — every feedback pinned past
// unity included — no NaN and nothing past the limiter ceiling ever leaves.
test('never-NaN torture: random param slams for 10 s', () => {
  const sr = 48000
  const chain = buildChain(sr)
  const smoother = new Smoother(sr, BLOCK)
  const rng = mulberry32(1234)
  const io = makeIo()
  const mic = new Float32Array(BLOCK)
  const target = packParams(DEFAULT_CONTROLS)

  const blocks = Math.ceil((10 * sr) / BLOCK)
  for (let b = 0; b < blocks; b++) {
    if (b % 8 === 0) {
      for (const [name] of PARAM_DEFS) {
        // the drum grid has no slider to slam; its steps are raw sixteen-bit masks
        if (EDITOR_KEYS.has(name)) {
          target[IDX[name]] = Math.floor(rng() * 65536)
          continue
        }
        const def = sliderFor(name)
        const r = rng()
        target[IDX[name]] =
          r < 0.15
            ? def.min
            : r < 0.3
              ? def.max
              : def.min + rng() * (def.max - def.min)
      }
      target[IDX.fbAmt] = rng() < 0.5 ? 1.5 : target[IDX.fbAmt]!
      target[IDX.dlyFb] = rng() < 0.5 ? 1.5 : target[IDX.dlyFb]!
      target[IDX.combFb] = rng() < 0.5 ? 1.2 : target[IDX.combFb]!
      target[IDX.outGain] = rng() < 0.3 ? 12 : target[IDX.outGain]!
    }
    for (let i = 0; i < BLOCK; i++) mic[i] = (rng() * 2 - 1) * 0.5
    smoother.step(target)
    chain.process(io, smoother.cur, mic)
    for (let i = 0; i < BLOCK; i++) {
      const l = io.l[i]!
      const r = io.r[i]!
      if (
        !Number.isFinite(l) ||
        !Number.isFinite(r) ||
        Math.abs(l) > LIMIT_CEIL + 1e-6 ||
        Math.abs(r) > LIMIT_CEIL + 1e-6
      ) {
        throw new Error(`unsafe sample at block ${b} index ${i}: l=${l} r=${r}`)
      }
    }
  }
  expect(true).toBe(true)
}, 60000)

test('panic silences the chain', () => {
  const sr = 48000
  const chain = buildChain(sr)
  const io = makeIo()
  const p = packParams({ ...DEFAULT_CONTROLS, fbAmt: 1.5, noiseLevel: 1 })
  for (let b = 0; b < 100; b++) chain.process(io, p)
  chain.panic()
  const quiet = packParams({
    ...DEFAULT_CONTROLS,
    chipLevel: 0,
    fbAmt: 0,
    noiseLevel: 0,
  })
  chain.process(io, quiet)
  for (let i = 0; i < BLOCK; i++) {
    expect(io.l[i]).toBe(0)
    expect(io.r[i]).toBe(0)
  }
})

test('smoother reaches targets', () => {
  const smoother = new Smoother(48000, BLOCK)
  const a = new Float32Array(N_PARAMS).fill(0)
  const b = new Float32Array(N_PARAMS).fill(1)
  smoother.step(a)
  for (let i = 0; i < 2000; i++) smoother.step(b)
  for (let i = 0; i < N_PARAMS; i++) expect(smoother.cur[i]!).toBeCloseTo(1, 3)
})
