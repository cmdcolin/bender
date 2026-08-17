import { expect, test } from 'vitest'
import { DEFAULT_CONTROLS, type Controls } from '../controls'
import { mulberry32 } from '../dsp/util/rng'
import { romIndex } from '../dsp/stages/roms'
import { GRID_ROWS } from './drums'
import { applyPreset, mutate, PRESETS, randomLook } from './presets'

// A board mid-session: a song chosen, a pattern written, levels set by hand.
const mine = (): Controls => ({
  ...DEFAULT_CONTROLS,
  chipTune: romIndex('sakura'),
  drumKick: 0b1010_0000_1010_0000,
  drumClap: 0b0000_1000_0000_1000,
  drumAccent: 0b1000_0000_0000_0000,
  outGain: -6,
  micLevel: 1.4,
  sampleLevel: 0.7,
})

const yours = (c: Controls) => [
  c.chipTune,
  ...GRID_ROWS.map(r => c[r.key]),
  c.outGain,
  c.micLevel,
  c.sampleLevel,
]

test('mutate never moves the song, the pattern or your levels', () => {
  const before = mine()
  for (const amount of [0.04, 0.12, 0.3]) {
    expect(yours(mutate(before, amount, mulberry32(7)))).toEqual(yours(before))
  }
})

test('random rolls a whole new board and still leaves them alone', () => {
  const before = mine()
  for (let seed = 1; seed <= 60; seed++) {
    expect(yours(randomLook(before, mulberry32(seed)))).toEqual(yours(before))
  }
})

test('random does change the board it is rolling for', () => {
  const before = mine()
  const looks = new Set<string>()
  for (let seed = 1; seed <= 20; seed++) {
    looks.add(JSON.stringify(randomLook(before, mulberry32(seed))))
  }
  expect(looks.size).toBeGreaterThan(1)
  expect(looks.has(JSON.stringify(before))).toBe(false)
})

test('a preset moves what it names and keeps the rest of what is yours', () => {
  const before = mine()
  const grief = PRESETS.find(p => p.name === 'grief machine')!
  const after = applyPreset(grief, before)
  // it names the tune, so it gets the tune
  expect(after.chipTune).toBe(romIndex('funeral'))
  // it says nothing about the drums, so the pattern survives
  expect(GRID_ROWS.map(r => after[r.key])).toEqual(
    GRID_ROWS.map(r => before[r.key]),
  )
  expect(after.outGain).toBe(before.outGain)
  expect(after.chipStarve).toBe(grief.patch.chipStarve)
})

test('a preset that names the pattern writes it', () => {
  const before = mine()
  const along = PRESETS.find(p => p.name === 'clap along')!
  const after = applyPreset(along, before)
  expect(after.drumClap).toBe(along.patch.drumClap)
  expect(after.drumKick).not.toBe(before.drumKick)
})

test('every preset patches keys that exist', () => {
  for (const preset of PRESETS) {
    for (const key of Object.keys(preset.patch)) {
      expect(DEFAULT_CONTROLS, `${preset.name}/${key}`).toHaveProperty(key)
    }
  }
})
