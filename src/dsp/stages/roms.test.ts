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
    expect(rom.steps[0], `${rom.name} opens on a note`).toBeGreaterThanOrEqual(0)
    for (const step of rom.steps) {
      expect(step, rom.name).toBeGreaterThanOrEqual(-2)
      expect(step, rom.name).toBeLessThanOrEqual(36)
    }
  }
})

function rms(overrides: Partial<Controls>, seconds: number): number {
  const sr = 48000
  const chain = buildChain(sr)
  const p = packParams({ ...DEFAULT_CONTROLS, ...overrides })
  const io: StereoBlock = { l: new Float32Array(BLOCK), r: new Float32Array(BLOCK), n: BLOCK }
  let sum = 0
  const blocks = Math.ceil((seconds * sr) / BLOCK)
  for (let b = 0; b < blocks; b++) {
    chain.process(io, p)
    for (let i = 0; i < BLOCK; i++) sum += io.l[i]! * io.l[i]!
  }
  return Math.sqrt(sum / (blocks * BLOCK))
}

test('every ROM makes sound on the default board', () => {
  ROMS.forEach((rom, i) => {
    expect(rms({ chipTune: i }, 2), rom.name).toBeGreaterThan(0.005)
  })
})
