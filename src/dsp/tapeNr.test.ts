import { expect, test } from 'vitest'

import {
  NR_DBX,
  NR_DOLBY_B,
  compander,
  type Compander,
} from './stages/tapeNr.ts'
import { bin, renderBender, sine } from './testRender.ts'

import type { Controls } from '../controls.ts'
import type { BuiltChain } from './build.ts'

const SR = 48000
const db = (x: number) => 20 * Math.log10(x)

// Bursts a few seconds apart at levels 40 dB apart, with noise riding on them,
// so both detectors have to move a long way and back.
function programme(seconds: number): Float32Array {
  const x = new Float32Array(seconds * SR)
  let seed = 1
  for (let i = 0; i < x.length; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0
    const level = [0.5, 0.005, 0.2, 0.0005][Math.floor(i / (SR / 2)) % 4]!
    x[i] =
      level *
      (0.7 * Math.sin((2 * Math.PI * 440 * i) / SR) +
        0.3 * (seed / 0x1_0000_0000 - 0.5))
  }
  return x
}

function through(c: Compander, x: number) {
  c.y = x
  c.process()
  return c.y
}

test('each decoder undoes its encoder through a flat tape', () => {
  for (const kind of [NR_DOLBY_B, NR_DBX]) {
    const enc = compander(kind, SR, false)!
    const dec = compander(kind, SR, true)!
    const x = programme(4)
    let err = 0
    let sig = 0
    for (let i = 0; i < x.length; i++) {
      const y = through(dec, through(enc, x[i]!))
      err += (y - x[i]!) ** 2
      sig += x[i]! ** 2
    }
    expect(db(Math.sqrt(err / sig)), `kind ${kind}`).toBeLessThan(-80)
  }
})

test('Dolby B still undoes itself when the tape sits between the two', () => {
  const enc = compander(NR_DOLBY_B, SR, false)!
  const dec = compander(NR_DOLBY_B, SR, true)!
  const x = programme(4)
  const gap = 7
  for (let i = 0; i < gap; i++) through(dec, 0)
  let err = 0
  let sig = 0
  for (let i = 0; i < x.length; i++) {
    const y = through(dec, through(enc, x[i]!))
    err += (y - x[i]!) ** 2
    sig += x[i]! ** 2
  }
  expect(db(Math.sqrt(err / sig))).toBeLessThan(-80)
})

const QUIET: Partial<Controls> = {
  chipLevel: 0,
  drumLevel: 0,
  tapeMix: 1,
  tapeHiss: 1,
  tapeWow: 0,
  tapeFlutter: 0,
}

// Energy above `hz`, by first-order high pass, in dBFS.
function above(x: Float32Array, hz: number): number {
  const a = Math.exp((-2 * Math.PI * hz) / SR)
  let y = 0
  let prev = 0
  let sum = 0
  for (let i = 0; i < x.length; i++) {
    y = a * (y + x[i]! - prev)
    prev = x[i]!
    sum += y * y
  }
  return db(Math.sqrt(sum / x.length))
}

const nr = (kind: number) => ({ tapeNrRec: kind, tapeNrPlay: kind })

test('dbx takes the hiss out of a silent tape and Dolby B takes its top off', () => {
  const floor = (over: Partial<Controls>, hz: number) =>
    above(renderBender({ ...QUIET, ...over }, 1.5).subarray(SR / 2), hz)
  expect(floor(nr(NR_DBX), 20) - floor({}, 20)).toBeLessThan(-30)
  const dolby = floor(nr(NR_DOLBY_B), 5000) - floor({}, 5000)
  expect(dolby).toBeLessThan(-6)
  expect(dolby).toBeGreaterThan(-12)
})

// The decoder opens up for a loud note and lets the hiss under it through, so
// the hiss rises and falls with the playing. Without noise reduction the hiss
// is the same under a note as under silence.
test('dbx hiss breathes with a loud low note', () => {
  const lift = (over: Partial<Controls>) => {
    const hiss = (amp: number) =>
      above(
        renderBender(
          { ...QUIET, sampleLevel: 1, tapeDrive: 0, tapeHyst: 0, ...over },
          1.5,
          (b: BuiltChain) => b.sampler.setBuffer(sine(110, 1, amp)),
        ).subarray(SR / 2),
        8000,
      )
    return hiss(0.4) - hiss(0)
  }
  expect(Math.abs(lift({}))).toBeLessThan(3)
  expect(lift(nr(NR_DBX))).toBeGreaterThan(15)
})

// A dbx tape played on a deck without dbx comes back at half its dynamic
// range: two tones 20 dB apart arrive about 10 dB apart.
test('an undecoded dbx tape comes back squashed 2:1', () => {
  const level = (amp: number) =>
    db(
      bin(
        renderBender(
          {
            ...QUIET,
            tapeHiss: 0,
            sampleLevel: 1,
            tapeDrive: 0,
            tapeHyst: 0,
            tapeNrRec: NR_DBX,
          },
          1.5,
          (b: BuiltChain) => b.sampler.setBuffer(sine(440, 1, amp)),
        ).subarray(SR / 2),
        440,
      ),
    )
  const spread = level(0.3) - level(0.03)
  expect(spread).toBeGreaterThan(8)
  expect(spread).toBeLessThan(12)
})

// A cassette at 1⅞ is a few dB down at 12 kHz. dbx reads that loss off the
// tape as a quieter signal and expands it, so the loss comes back at least
// doubled, and a little more because the pre-emphasis drives the top harder
// into the oxide.
test('dbx at least doubles the top end a cassette loses', () => {
  const loss = (over: Partial<Controls>) => {
    const at = (mix: number) =>
      bin(
        renderBender(
          {
            ...QUIET,
            tapeHiss: 0,
            sampleLevel: 1,
            tapeDrive: 0,
            tapeHyst: 0,
            tapeFormat: 1,
            tapeSpeed: -1,
            tapeMix: mix,
            ...over,
          },
          1.5,
          (b: BuiltChain) => b.sampler.setBuffer(sine(12000, 1, 0.01)),
        ).subarray(SR / 2),
        12000,
      )
    return db(at(1) / at(0))
  }
  const flat = loss({})
  expect(flat).toBeLessThan(-2)
  const ratio = loss(nr(NR_DBX)) / flat
  expect(ratio).toBeGreaterThan(1.8)
  expect(ratio).toBeLessThan(3.5)
})
