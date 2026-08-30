import { expect, test } from 'vitest'
import { BANDS, spectrum } from './spectrum'
import { sine, SR } from './testRender'
import { mulberry32 } from './util/rng'

const noise = (seconds: number, amp = 0.6) => {
  const rng = mulberry32(11)
  const x = new Float32Array(Math.round(seconds * SR))
  for (let i = 0; i < x.length; i++) x[i] = amp * (rng() * 2 - 1)
  return x
}

// The two ends the measurement exists to tell apart, and the whole reason it is
// here rather than another one-pole: a sine and a hiss can be the same level,
// the same crest and the same weight in every band, and flatness is what puts
// them at opposite ends of a scale.
test('flatness runs from a sine at nothing to noise at one', () => {
  expect(spectrum(sine(440, 1), SR).flatness).toBeLessThan(0.01)
  expect(spectrum(noise(1), SR).flatness).toBeGreaterThan(0.7)
})

test('the centroid is where the energy actually is', () => {
  // A sine's balance point is the sine, within a bin either way.
  for (const hz of [220, 1000, 4000]) {
    const c = spectrum(sine(hz, 1), SR).centroid
    expect(Math.abs(c - hz), `${hz} Hz`).toBeLessThan(SR / 4096)
  }
  // And two tones an octave apart at equal level balance between them.
  const both = sine(400, 1)
  const upper = sine(1600, 1)
  for (let i = 0; i < both.length; i++) both[i]! += upper[i]!
  expect(spectrum(both, SR).centroid).toBeGreaterThan(700)
  expect(spectrum(both, SR).centroid).toBeLessThan(1300)
})

test('the bands say where it sat, and add up to all of it', () => {
  const at = (hz: number) => spectrum(sine(hz, 1), SR).bands
  for (const bands of [at(60), at(300), at(1000), at(4000), at(12000)])
    expect(bands.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5)
  // Each of the five, named in order, catches the tone that belongs to it.
  const inBand = [60, 300, 1000, 4000, 12000]
  inBand.forEach((hz, b) => {
    const bands = at(hz)
    expect(bands[b], `${hz} Hz in ${BANDS[b]}`).toBeGreaterThan(0.9)
  })
})

// Averaged over the whole take rather than one window of it, because a bend
// that changes what it is doing halfway through is one sound and not two.
test('a take that is half tone and half hiss reads as neither', () => {
  const half = new Float32Array(SR)
  half.set(sine(440, 0.5), 0)
  half.set(noise(0.5), SR / 2)
  const flat = spectrum(half, SR).flatness
  expect(flat).toBeGreaterThan(spectrum(sine(440, 1), SR).flatness)
  expect(flat).toBeLessThan(spectrum(noise(1), SR).flatness)
})
