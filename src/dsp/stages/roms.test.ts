import { expect, test } from 'vitest'
import { DEFAULT_CONTROLS, type Controls } from '../../controls'
import { packParams } from '../../engine/params'
import { buildChain } from '../build'
import { BLOCK, type StereoBlock } from '../stage'
import { ROMS, ROM_NAMES } from './roms'

test('every ROM is playable: named, clocked, and made of legal steps', () => {
  expect(new Set(ROM_NAMES).size).toBe(ROMS.length)
  for (const rom of ROMS) {
    expect(rom.steps.length, rom.name).toBeGreaterThan(0)
    expect(rom.stepHz, rom.name).toBeGreaterThan(0)
    expect(rom.steps[0], `${rom.name} opens on a note`).toBeGreaterThanOrEqual(
      0,
    )
    for (const step of rom.steps) {
      expect(step, rom.name).toBeGreaterThanOrEqual(-2)
      expect(step, rom.name).toBeLessThanOrEqual(36)
    }
  }
})

// The auto bass-chord harmonizes against the declared key, so a ROM annotated
// in the wrong one would play its accompaniment against the tune.
test('every ROM sits in the key it declares', () => {
  const MAJOR = new Set([0, 2, 4, 5, 7, 9, 11])
  // the raised seventh comes along: these tunes lean on the harmonic minor
  const MINOR = new Set([0, 2, 3, 5, 7, 8, 10, 11])
  for (const rom of ROMS) {
    const scale = rom.minor ? MINOR : MAJOR
    const notes = rom.steps.filter(s => s >= 0)
    const inKey = notes.filter(n => scale.has((((n - rom.key) % 12) + 12) % 12))
    expect(
      inKey.length / notes.length,
      `${rom.name} is diatonic to its key`,
    ).toBeGreaterThan(0.8)
  }
})

function rms(overrides: Partial<Controls>, seconds: number): number {
  const sr = 48000
  const chain = buildChain(sr)
  const p = packParams({ ...DEFAULT_CONTROLS, ...overrides })
  const io: StereoBlock = {
    l: new Float32Array(BLOCK),
    r: new Float32Array(BLOCK),
    n: BLOCK,
  }
  let sum = 0
  const blocks = Math.ceil((seconds * sr) / BLOCK)
  for (let b = 0; b < blocks; b++) {
    chain.process(io, p)
    for (let i = 0; i < BLOCK; i++) sum += io.l[i]! * io.l[i]!
  }
  return Math.sqrt(sum / (blocks * BLOCK))
}

// Builds a chain and renders two seconds for every ROM, which is the slowest
// test here by a distance: a second and a half on an idle machine, and past the
// stock five-second timeout when the other twenty-eight files are running
// beside it. The work is the point, so it gets a budget that fits it.
test('every ROM makes sound on the default board', () => {
  ROMS.forEach((rom, i) => {
    expect(rms({ chipTune: i }, 2), rom.name).toBeGreaterThan(0.005)
  })
}, 30_000)
