import { expect, test } from 'vitest'

import { IDX } from '../../engine/params.ts'
import { buildBender } from '../build.ts'
import { spectrum } from '../spectrum.ts'
import {
  envelope,
  pitchHz,
  render,
  renderBender,
  rms,
  SR,
} from '../testRender.ts'

import type { Controls } from '../../controls.ts'

const ALONE = { chipLevel: 0, drumLevel: 0, monoLevel: 1 }

test('the toy’s gate line plays the synth as a bass', () => {
  const x = render(ALONE, 3)
  expect(rms(x)).toBeGreaterThan(0.05)
  expect(spectrum(x, SR).bands[0]).toBeGreaterThan(0.6)
})

test('cutting the jumper silences it with nothing else striking', () => {
  expect(rms(render({ ...ALONE, monoKeyGate: 1 }, 2))).toBe(0)
})

test('the kick’s trigger line strikes it with the jumper cut', () => {
  const x = render(
    { ...ALONE, drumLevel: 0.001, monoKeyGate: 1, monoStruck: 1 },
    3,
  )
  expect(rms(x)).toBeGreaterThan(0.03)
})

test('a longer gate holds each note down longer', () => {
  const short = rms(render({ ...ALONE, monoGate: 0.1, monoAR: 0.01 }, 3))
  const long = rms(render({ ...ALONE, monoGate: 1, monoAR: 0.01 }, 3))
  expect(long).toBeGreaterThan(short * 1.3)
})

test('a key from its own bed sounds until it comes up', () => {
  const x = renderBender(
    { ...ALONE, monoKeyGate: 1, monoAR: 0.05 },
    2,
    undefined,
    undefined,
    (built, secs) => {
      if (secs === 0) built.monoSynth.noteOn(0)
      else if (Math.abs(secs - 1) < 0.002) built.monoSynth.noteOff(0)
    },
  )
  const held = rms(x.subarray(SR / 2, SR))
  const after = rms(x.subarray(1.5 * SR))
  expect(held).toBeGreaterThan(0.05)
  expect(after).toBeLessThan(held / 100)
})

test('the toy’s key-up leaves a note on its own bed alone', () => {
  const x = renderBender(
    { ...ALONE, monoKeyGate: 1, monoAR: 0.05 },
    1,
    built => {
      built.monoSynth.noteOn(0)
      built.toyChip.noteOn(0)
    },
    undefined,
    (built, secs) => {
      if (Math.abs(secs - 0.3) < 0.002) built.noteOff(0)
    },
  )
  expect(rms(x.subarray(0.8 * SR))).toBeGreaterThan(0.05)
})

test('keys played with the fader down queue one event per note', () => {
  const built = buildBender(SR)
  for (let i = 0; i < 10_000; i++) {
    built.monoSynth.noteOn(i % 12)
    built.monoSynth.noteOff(i % 12)
  }
  const { queued } = built.monoSynth as unknown as { queued: unknown[] }
  expect(queued.length).toBe(12)
})

test('a leaky VCA drones with no key down', () => {
  expect(
    rms(render({ ...ALONE, monoKeyGate: 1, monoLeak: 1 }, 2)),
  ).toBeGreaterThan(0.02)
})

test('with the fader down nothing on its panel reaches the board', () => {
  const stock = render({}, 1)
  const turned = render({ monoEmph: 1.1, monoLoop: 1, monoLeak: 1 }, 1)
  expect(turned).toEqual(stock)
})

// The rail takes a quarter of a second to come up, so the first note lands
// there and everything is timed from it.
const onsets = (x: Float32Array) => {
  const env = envelope(x, 0.01)
  const at: number[] = []
  let on = false
  env.forEach((v, i) => {
    if (!on && v > 0.03) {
      at.push(i * 0.01)
      on = true
    } else if (on && v < 0.01) on = false
  })
  return at
}

const sung = (notes: Record<number, number>, extra: Partial<Controls> = {}) =>
  ({
    ...ALONE,
    monoKeyGate: 1,
    monoSeqOn: 1,
    monoSeqLen: 4,
    monoSeqRate: 4,
    monoAR: 0.01,
    ...Object.fromEntries(
      Object.entries(notes).map(([i, n]) => [`monoSeqStep${i}`, n]),
    ),
    ...extra,
  }) as Partial<Controls>

const window = (x: Float32Array, from: number, to: number) =>
  x.subarray(Math.round(from * SR), Math.round(to * SR))

test('its own melody plays with the toy’s jumper cut', () => {
  expect(rms(render(sung({ 0: 0 }), 1))).toBeGreaterThan(0.03)
})

test('switched off it stays silent', () => {
  expect(rms(render(sung({ 0: 0 }, { monoSeqOn: 0 }), 1))).toBe(0)
})

test('it waits for the song to run', () => {
  const song = (running: boolean) =>
    renderBender(sung({ 0: 0 }), 1, built => {
      built.transport.tune = running
    })
  expect(rms(song(true))).toBeGreaterThan(0.03)
  expect(rms(song(false))).toBe(0)
})

test('notes land on their steps and the loop comes round', () => {
  const at = onsets(render(sung({ 0: 0, 2: 0 }), 2.3))
  const gaps = at.slice(1).map((t, i) => t - at[i]!)
  expect(at.length).toBeGreaterThanOrEqual(4)
  for (const gap of gaps) expect(gap).toBeCloseTo(0.5, 1)
})

test('a rest step is silent and the length decides the loop', () => {
  const at = onsets(render(sung({ 0: 0 }, { monoSeqLen: 2 }), 2.3))
  const gaps = at.slice(1).map((t, i) => t - at[i]!)
  expect(at.length).toBeGreaterThanOrEqual(4)
  for (const gap of gaps) expect(gap).toBeCloseTo(0.5, 1)
})

test('each step plays its own pitch', () => {
  const x = render(sung({ 0: 0, 1: 12 }), 1)
  const [first] = onsets(x)
  const low = pitchHz(window(x, first! + 0.03, first! + 0.12))
  const high = pitchHz(window(x, first! + 0.28, first! + 0.37))
  expect(high / low).toBeGreaterThan(1.7)
  expect(high / low).toBeLessThan(2.6)
})

test('a hold keeps the gate open across the step', () => {
  const alone = render(sung({ 0: 0 }), 1)
  const held = render(sung({ 0: 0, 1: -127 }), 1)
  const [first] = onsets(alone)
  const at = first! + 0.2
  expect(rms(window(alone, at, at + 0.05))).toBeLessThan(0.005)
  expect(rms(window(held, at, at + 0.05))).toBeGreaterThan(0.03)
})

test('a faster rate brings the next step sooner', () => {
  const [a, b] = onsets(render(sung({ 0: 0, 1: 0 }, { monoSeqRate: 8 }), 1))
  expect(b! - a!).toBeCloseTo(0.125, 1)
})

test('a sagging rail slows its counter', () => {
  const steps = { 0: 0, 1: 0, 2: 0, 3: 0 }
  const gap = (x: Float32Array) => {
    const [a, b] = onsets(x)
    return b! - a!
  }
  const fed = gap(render(sung(steps), 2))
  const sagging = gap(render(sung(steps, { chipStarve: 0.5 }), 2))
  expect(sagging).toBeGreaterThan(fed * 1.15)
})

test('switching it off mid-song lets the last note go', () => {
  const x = renderBender(
    sung({ 0: 0, 1: 0, 2: 0, 3: 0 }),
    3,
    built => {
      built.transport.tune = true
    },
    undefined,
    (_built, secs, p) => {
      if (secs >= 1) p[IDX.monoSeqOn] = 0
    },
  )
  expect(rms(window(x, 0.5, 1))).toBeGreaterThan(0.03)
  expect(rms(window(x, 2, 3))).toBeLessThan(1e-6)
})
