import { expect, test } from 'vitest'

import { SR, bin, highEnergy, renderStereo, rms, sine } from '../testRender'
import { ENS_MODE } from './ensemble'

import type { Controls } from '../../controls'
import type { BuiltChain } from '../build'

// A steady 400 Hz tone off the sampler, so what the pedal did to it is the only
// thing moving in the take.
const tone = (b: BuiltChain) => b.sampler.setBuffer(sine(400, 4))

const look: Partial<Controls> = {
  chipLevel: 0,
  sampleLevel: 1,
  sampleMode: 1,
  ensMix: 1,
  ensWidth: 1,
  ensClock: 6,
  ensRate: 2,
  ensDepth: 0.6,
}

const mono = (l: Float32Array, r: Float32Array) =>
  Float32Array.from(l, (v, i) => 0.5 * (v + r[i]!))

const wet = (over: Partial<Controls>, seconds = 1.5) =>
  renderStereo({ ...look, ...over }, seconds, tone)

const after = (x: Float32Array, seconds = 0.5) => x.subarray(seconds * SR)

// How far the note's own period wanders, cycle by cycle, off crossings
// interpolated to the sample. Counting whole samples is 50 Hz of resolution on
// a 20 ms window, which is coarser than every wobble on this pedal.
function wobble(x: Float32Array): number {
  const at: number[] = []
  for (let i = 1; i < x.length; i++) {
    const a = x[i - 1]!
    const b = x[i]!
    if (a <= 0 && b > 0) at.push(i - 1 + a / (a - b))
  }
  const gaps = at.slice(1).map((v, i) => v - at[i]!)
  const mean = gaps.reduce((a, v) => a + v, 0) / gaps.length
  return (
    Math.sqrt(gaps.reduce((a, v) => a + (v - mean) ** 2, 0) / gaps.length) /
    mean
  )
}

// The clock sweeping is frequency modulation, so what a steady tone comes back
// as is a pair of skirts a sweep-rate away from where it went in — and at rest
// it comes back as itself.
test('a swept clock puts sidebands an LFO-rate either side of the note', () => {
  const skirt = (ensDepth: number) => {
    const x = after(wet({ ensMode: ENS_MODE.chorus, ensRate: 8, ensDepth }).l)
    return (bin(x, 408) + bin(x, 392)) / bin(x, 400)
  }
  expect(skirt(0)).toBeLessThan(0.02)
  expect(skirt(0.8)).toBeGreaterThan(50 * skirt(0))
})

// The string machine's three lines sit 120° apart, so the two sides are never
// the same signal — which is the whole of why it sounds like a section rather
// than like one voice with vibrato on it.
test('the three lines put a different signal on each side', () => {
  const wide = wet({ ensMode: ENS_MODE.ensemble, ensRate: 0.6 })
  const apart = rms(Float32Array.from(wide.l, (v, i) => v - wide.r[i]!))
  expect(apart).toBeGreaterThan(0.3 * rms(wide.l))
  // And width is the whole of it: at nothing the pedal is mono, exactly.
  const flat = wet({ ensMode: ENS_MODE.ensemble, ensRate: 0.6, ensWidth: 0 })
  expect([...flat.l]).toEqual([...flat.r])
})

// Dimension's two lines are swept against each other, so summing the sides
// cancels the pitch move and leaves the width. That is the one thing it does
// that a chorus cannot, and the only way to see it is in mono.
test('dimension keeps its pitch steady in mono where a chorus does not', () => {
  const at = (ensMode: number) => {
    const { l, r } = wet({ ensMode, ensRate: 4, ensDepth: 0.3, ensClock: 3 }, 2)
    return wobble(after(mono(l, r)))
  }
  expect(at(ENS_MODE.dimension)).toBeLessThan(0.7 * at(ENS_MODE.chorus))
})

// Vibrato is the line on its own. Held a half-period of the note late, a mode
// carrying dry cancels against itself and one that is not comes back whole.
test('vibrato leaves no dry to cancel against', () => {
  const at = (ensMode: number) =>
    bin(after(wet({ ensMode, ensDepth: 0, ensClock: 1.25 }, 1).r, 0.4), 400)
  expect(at(ENS_MODE.vibrato)).toBeGreaterThan(5 * at(ENS_MODE.chorus))
  expect(at(ENS_MODE.vibrato)).toBeGreaterThan(5 * at(ENS_MODE.flange))
})

// The compander's soft clip is what bounds the flanger: the loop is inside it,
// so a feedback knob past anything sensible saturates rather than climbing.
test('a flanger wound past sense stays bounded', () => {
  const { l } = wet(
    { ensMode: ENS_MODE.flange, ensFeedback: 0.9, ensClock: 1.5 },
    3,
  )
  expect(Number.isFinite(rms(l))).toBe(true)
  expect(l.reduce((a, v) => Math.max(a, Math.abs(v)), 0)).toBeLessThan(1.1)
})

test('the mix at zero is the board without the pedal on it', () => {
  const off: Partial<Controls> = { chipLevel: 0, sampleLevel: 1, sampleMode: 1 }
  expect([...wet({ ensMix: 0 }, 0.5).l]).toEqual([
    ...renderStereo(off, 0.5, tone).l,
  ])
})

// Five hundred buckets at twenty-five milliseconds is a clock at twenty
// kilohertz, and the filters can only take so much of it out: the longest
// setting has the clock itself in the take, where the shortest is half a
// megahertz away and silent.
test('the clock whistles through at the longest delay', () => {
  const quiet: Partial<Controls> = {
    chipLevel: 0,
    ensMix: 1,
    ensMode: ENS_MODE.vibrato,
    ensDepth: 0,
  }
  const clockHz = 512 / 0.025
  const long = after(renderStereo({ ...quiet, ensClock: 25 }, 1).l)
  expect(bin(long, clockHz)).toBeGreaterThan(100 * bin(long, 0.8 * clockHz))
  expect(highEnergy(long, 10000)).toBeGreaterThan(
    3 * highEnergy(after(renderStereo({ ...quiet, ensClock: 2 }, 1).l), 10000),
  )
})
