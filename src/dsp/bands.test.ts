import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS } from '../controls.ts'
import { BAND_ROWS, packParams, TAP_MIC } from '../engine/params.ts'
import { buildBender } from './build.ts'
import { Chain } from './chain.ts'
import { BLOCK, type Stage, type StereoBlock } from './stage.ts'
import { makeIo, SR } from './testRender.ts'
import { BAND_HZ, BandMeter, N_BANDS } from './util/bandMeter.ts'

const sineStage = (hz: number, amp: number): Stage => {
  let phase = 0
  return {
    label: `${hz} Hz`,
    process(io: StereoBlock) {
      for (let i = 0; i < io.n; i++) {
        const v = amp * Math.sin(phase)
        phase += (2 * Math.PI * hz) / SR
        io.l[i]! += v
        io.r[i]! += v
      }
    },
    panic: () => {},
  }
}

const row = (levels: Float32Array, r: number) =>
  Array.from(levels.subarray(r * N_BANDS, (r + 1) * N_BANDS))

const loudest = (bands: number[]) => bands.indexOf(Math.max(...bands))

test('each band reads a sine at its centre as the sine’s own amplitude', () => {
  const meter = new BandMeter(1, SR)
  meter.on = true
  for (const [b, hz] of BAND_HZ.entries()) {
    meter.reset()
    const x = new Float32Array(BLOCK)
    let phase = 0
    for (let block = 0; block < SR / BLOCK; block++) {
      for (let i = 0; i < BLOCK; i++) {
        x[i] = 0.5 * Math.sin(phase)
        phase += (2 * Math.PI * hz) / SR
      }
      if (block === SR / BLOCK / 2) meter.settle()
      meter.feed(0, x, 0, BLOCK)
      meter.pass(BLOCK)
    }
    meter.settle()
    const bands = row(meter.levels, 0)
    expect(loudest(bands)).toBe(b)
    expect(bands[b]).toBeCloseTo(0.5, 1)
  }
})

test('each source’s row follows the pitch of the sine it plays, and the mic’s its own', () => {
  const chain = new Chain(SR)
  const played = [
    { hz: 63, band: 1 },
    { hz: 1000, band: 5 },
    { hz: 8000, band: 8 },
  ]
  chain.sources = played.map(({ hz }) => sineStage(hz, 0.3))
  chain.bands.on = true
  const p = packParams({ ...DEFAULT_CONTROLS, micLevel: 1 })
  const mic = new Float32Array(BLOCK)
  let phase = 0
  const io = makeIo()
  for (let b = 0; b < 200; b++) {
    for (let i = 0; i < BLOCK; i++) {
      mic[i] = 0.3 * Math.sin(phase)
      phase += (2 * Math.PI * 250) / SR
    }
    if (b === 100) chain.bands.settle()
    chain.process(io, p, mic)
  }
  chain.bands.settle()
  for (const [k, { band }] of played.entries())
    expect(loudest(row(chain.bands.levels, k))).toBe(band)
  expect(loudest(row(chain.bands.levels, TAP_MIC))).toBe(3)
  for (let k = played.length; k < TAP_MIC; k++)
    expect(row(chain.bands.levels, k).every(v => v === 0)).toBe(true)
  expect(chain.bands.levels).toHaveLength(BAND_ROWS * N_BANDS)
})

test('watching the bands changes nothing about what comes out', () => {
  const p = packParams({
    ...DEFAULT_CONTROLS,
    chipLevel: 0.8,
    drumLevel: 0.8,
    noiseLevel: 0.3,
    monoLevel: 0.5,
    drumMute: 1,
  })
  const run = (watching: boolean) => {
    const built = buildBender(SR)
    built.transport.tune = true
    built.transport.drums = true
    built.chain.bands.on = watching
    const io = makeIo()
    const out = new Float32Array(200 * BLOCK)
    for (let b = 0; b < 200; b++) {
      built.chain.process(io, p)
      out.set(io.l, b * BLOCK)
    }
    return out
  }
  expect(run(true)).toEqual(run(false))
})

test('the bands stay empty while nobody is watching', () => {
  const built = buildBender(SR)
  built.transport.tune = true
  const p = packParams({ ...DEFAULT_CONTROLS, chipLevel: 0.9 })
  const io = makeIo()
  for (let b = 0; b < 100; b++) built.chain.process(io, p)
  built.chain.bands.settle()
  expect(built.chain.bands.levels.every(v => v === 0)).toBe(true)
})
