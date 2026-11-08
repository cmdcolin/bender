import { expect, test } from 'vitest'

import { highEnergy, lowEnergy, pitchHz, render, rms } from '../testRender.ts'

import type { Controls } from '../../controls.ts'

const GROWLER: Partial<Controls> = {
  chipLevel: 0,
  drumLevel: 0,
  monoLevel: 1,
  monoMix1: 0,
  monoMix2: 0,
  monoMix3: 0,
}

const fizz = (x: Float32Array) => highEnergy(x, 3000) / rms(x)

test('Plinky’s pin sounds through Growler with its oscillators down', () => {
  const fed = rms(render({ ...GROWLER, monoToyIn: 1 }, 3))
  const unfed = rms(render(GROWLER, 3))
  expect(fed).toBeGreaterThan(0.08)
  expect(unfed).toBeLessThan(fed / 20)
})

test('the pin is taken ahead of Plinky’s volume and mute', () => {
  const muted = (chipLevel: number) =>
    rms(render({ ...GROWLER, monoToyIn: 1, chipLevel, chipMute: 1 }, 3))
  expect(muted(0)).toBeGreaterThan(0.08)
  expect(muted(1)).toBeCloseTo(muted(0), 3)
})

test('the ladder takes the fizz off Plinky’s squares', () => {
  const dry = fizz(render({ chipLevel: 0.6, drumLevel: 0 }, 3))
  const filtered = fizz(render({ ...GROWLER, monoToyIn: 1 }, 3))
  expect(filtered).toBeLessThan(dry * 0.6)
})

test('past 1 the pin overdrives the ladder', () => {
  const at = (monoToyIn: number) => rms(render({ ...GROWLER, monoToyIn }, 3))
  const one = at(1)
  const two = at(2)
  expect(two).toBeGreaterThan(one * 1.2)
  expect(two).toBeLessThan(one * 1.7)
})

test('Howler takes the pin on its own mixer', () => {
  const lead: Partial<Controls> = {
    chipLevel: 0,
    drumLevel: 0,
    leadLevel: 1,
    leadMix1: 0,
    leadMix2: 0,
    leadMix3: 0,
    leadFold: 0,
  }
  const fed = rms(render({ ...lead, leadToyIn: 1 }, 3))
  expect(fed).toBeGreaterThan(0.03)
  expect(rms(render(lead, 3))).toBeLessThan(fed / 20)
})

const divided = (monoToyDiv: number) =>
  render({ ...GROWLER, monoToyIn: 1, monoToyDiv }, 4)

test('each flip-flop on the cord drops Plinky an octave', () => {
  const pin = pitchHz(divided(0))
  expect(pitchHz(divided(1))).toBeCloseTo(pin / 2, -1)
  expect(pitchHz(divided(2))).toBeCloseTo(pin / 4, -1)
  expect(pitchHz(divided(3))).toBeCloseTo(pin / 8, -1)
})

test('a divided cord puts most of Growler’s power under 120 Hz', () => {
  const low = (x: Float32Array) => lowEnergy(x) / rms(x)
  expect(low(divided(0))).toBeLessThan(0.45)
  expect(low(divided(2))).toBeGreaterThan(0.65)
})
