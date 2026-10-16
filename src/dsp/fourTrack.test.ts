import { expect, test } from 'vitest'

import { IDX } from '../engine/params'
import { INPUT_AUX, INPUT_MIC } from './stages/fourTrack'
import { bin, pitchHz, renderBender, rms } from './testRender'

import type { Controls } from '../controls'

const SR = 48000
const db = (x: number) => 20 * Math.log10(x)

// The four-track alone on the board, its first channel on the mic, and the mic
// soldered somewhere it does nothing, so the only way the mic reaches the
// output is round the tape.
const DECK: Partial<Controls> = {
  chipLevel: 0,
  drumLevel: 0,
  micLevel: 1,
  micPatch: 4,
  fourLevel: 1,
  fourHiss: 0,
  fourWow: 0,
  fourFlutter: 0,
  four1In: INPUT_MIC,
  four1Rec: 1,
  four1Erase: 1,
  four1Cue: 1,
  four1Pan: 0,
  four2Cue: 0,
  four3Cue: 0,
  four4Cue: 0,
}

// A mic signal that is `f(t)` for `from <= t < to` seconds and silence after.
const burst =
  (f: (t: number) => number, from: number, to: number) =>
  (mic: Float32Array, offset: number) => {
    for (let i = 0; i < mic.length; i++) {
      const t = (offset + i) / SR
      mic[i] = t >= from && t < to ? f(t) : 0
    }
  }

const tone =
  (hz: number, amp = 0.3) =>
  (t: number) =>
    amp * Math.sin(2 * Math.PI * hz * t)

// RMS in 10 ms windows, so a burst can be found by when it is loud.
function windows(x: Float32Array, ms = 10): number[] {
  const n = (SR * ms) / 1000
  const out: number[] = []
  for (let i = 0; i + n <= x.length; i += n) out.push(rms(x.subarray(i, i + n)))
  return out
}

// The strongest frequency between two bounds, a hertz at a time, for a tone
// distorted enough that its zero crossings no longer count its cycles.
function peakHz(x: Float32Array, lo: number, hi: number): number {
  let best = lo
  let most = 0
  for (let hz = lo; hz <= hi; hz++) {
    const m = bin(x, hz)
    if (m > most) [best, most] = [hz, m]
  }
  return best
}

const at = (x: Float32Array, from: number, to: number) =>
  x.subarray(Math.round(from * SR), Math.round(to * SR))

test('a loop plays back what it recorded one length later', () => {
  const x = renderBender(
    { ...DECK, four1Len: 0.5 },
    1.2,
    undefined,
    burst(tone(440), 0.1, 0.15),
  )
  const w = windows(x)
  const loudest = w.indexOf(Math.max(...w.slice(30)))
  expect(loudest * 0.01).toBeCloseTo(0.6, 1)
  expect(db(rms(at(x, 0.7, 0.95)) / rms(at(x, 0.6, 0.65)))).toBeLessThan(-30)
})

// Recorded at 1⅞ and played at 3¾, the head passes the tape twice as fast.
test('double speed plays a take an octave up', () => {
  const x = renderBender(
    { ...DECK, four1Len: 1 },
    2,
    undefined,
    burst(tone(300), 0.05, 0.95),
    (_b, secs, p) => {
      if (secs >= 1) {
        p[IDX.fourSpeed] = 1
        p[IDX.four1Rec] = 0
      }
    },
  )
  expect(pitchHz(at(x, 1.1, 1.4)) / 300).toBeCloseTo(2, 1)
})

// Recording over a loop takes some of what was there off, and the top first.
test('a partly erased loop decays each lap, and darker each time', () => {
  const twoTone = (t: number) => tone(200, 0.2)(t) + tone(5000, 0.2)(t)
  const x = renderBender(
    { ...DECK, four1Len: 0.5, four1Erase: 0.3 },
    3.1,
    undefined,
    burst(twoTone, 0, 0.45),
  )
  const lap = (k: number) => at(x, 0.5 * k + 0.1, 0.5 * k + 0.4)
  const lows = [1, 4].map(k => bin(lap(k), 200))
  const highs = [1, 4].map(k => bin(lap(k), 5000))
  const lowLoss = db(lows[1]! / lows[0]!)
  const highLoss = db(highs[1]! / highs[0]!)
  expect(lowLoss).toBeLessThan(-3)
  expect(highLoss).toBeLessThan(lowLoss - 3)
})

// Shed oxide stays shed, so the holes come round in the same places.
test('a worn loop drops out at the same places every lap', () => {
  const x = renderBender(
    { ...DECK, four1Len: 0.5, four1Erase: 0, fourWear: 1 },
    16,
    undefined,
    burst(tone(440), 0, 0.5),
    (_b, secs, p) => {
      if (secs >= 0.5) p[IDX.four1Rec] = 0
    },
  )
  const lapA = windows(at(x, 15, 15.5))
  const lapB = windows(at(x, 15.5, 16))
  const median = lapA.toSorted((a, b) => a - b)[Math.floor(lapA.length / 2)]!
  const deepest = Math.min(...lapA)
  expect(db(deepest / median)).toBeLessThan(-6)
  const hole = lapA.indexOf(deepest)
  expect(db(lapB[hole]! / median)).toBeLessThan(-4)
})

// Nothing plugged in: channel 1 hears the aux return and sends to it, and the
// EQ's boost is where the loop gain is over one.
test('a channel on its own aux squeals where the mid is boosted', () => {
  const squeal = (hz: number, master = 1) =>
    renderBender(
      {
        ...DECK,
        micLevel: 0,
        four1In: INPUT_AUX,
        four1Rec: 0,
        four1Fader: 1,
        four1Send: 1,
        four1Mid: 15,
        four1MidHz: hz,
        fourAux: master,
      },
      1.5,
    ).subarray(SR)
  for (const hz of [600, 2000]) {
    const x = squeal(hz)
    expect(db(rms(x))).toBeGreaterThan(-20)
    expect(pitchHz(x) / hz).toBeGreaterThan(0.7)
    expect(pitchHz(x) / hz).toBeLessThan(1.4)
    expect(Math.max(...x.map(Math.abs))).toBeLessThan(2.5)
  }
  expect(rms(squeal(600, 0))).toBeLessThan(1e-3)
})

// Flat cells drag the one motor every loop is on.
test('flat batteries drag the loops flat', () => {
  const x = renderBender(
    { ...DECK, four1Len: 1 },
    3,
    undefined,
    burst(tone(400), 0.05, 0.95),
    (_b, secs, p) => {
      if (secs >= 1) {
        p[IDX.four1Rec] = 0
        p[IDX.fourBattery] = 1
      }
    },
  )
  expect(peakHz(at(x, 2.3, 2.7), 200, 500) / 400).toBeLessThan(0.85)
})

// Turned over, the tape runs the other way under the head, and the head's
// fourth track is the tape's first.
test('side B plays loop 1 backwards on channel 4', () => {
  const swell = (t: number) =>
    (t < 0.4 ? t / 0.4 : 0) * Math.sin(2 * Math.PI * 500 * t) * 0.3
  const x = renderBender(
    { ...DECK, four1Len: 0.5, four1Cue: 0, four4Cue: 1, four4Pan: 0 },
    1.5,
    undefined,
    burst(swell, 0, 0.5),
    (_b, secs, p) => {
      if (secs >= 0.5) {
        p[IDX.four1Rec] = 0
        p[IDX.fourSide] = 1
      }
    },
  )
  // A lap of side B starts on the silence at the swell's end and then plays
  // the swell as a fade: loud first and dying away.
  expect(rms(at(x, 1.12, 1.2))).toBeGreaterThan(3 * rms(at(x, 1.42, 1.5)))
})
