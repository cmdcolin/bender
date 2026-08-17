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

// How many beats a length of time or a rate works out to at the given tempo.
const beats = (bpm: number, seconds: number) => seconds / (60 / bpm)

// On the grid if it is a note length, or that note halved or doubled any number
// of times.
const onGrid = (beatCount: number) => {
  const notes = [0.25, 1 / 3, 0.5, 2 / 3, 0.75, 1, 1.5, 2, 3, 4]
  return notes.some(note => {
    const octaves = Math.log2(beatCount / note)
    return Math.abs(octaves - Math.round(octaves)) < 0.02
  })
}

test('mutate leaves the tempo where it is', () => {
  for (const bpm of [96, 118, 170]) {
    const before = { ...mine(), drumBpm: bpm }
    for (let seed = 1; seed <= 30; seed++) {
      expect(mutate(before, 0.3, mulberry32(seed)).drumBpm).toBe(bpm)
    }
  }
})

test('mutate puts what counts in time back on the beat', () => {
  const starts = [
    { delayMs: 350, glitchSliceMs: 120, drumRetrigHz: 16, modLfoHz: 1 },
    { delayMs: 24, glitchSliceMs: 800, drumRetrigHz: 700, modLfoHz: 12 },
    // A retrigger switched off is free to come on, but only in time.
    { delayMs: 1200, glitchSliceMs: 30, drumRetrigHz: 0, modLfoHz: 0.3 },
  ]
  for (const start of starts) {
    const before = { ...mine(), drumBpm: 120, ...start }
    for (let seed = 1; seed <= 40; seed++) {
      const after = mutate(before, 0.3, mulberry32(seed))
      expect(onGrid(beats(120, after.delayMs / 1000))).toBe(true)
      expect(onGrid(beats(120, after.glitchSliceMs / 1000))).toBe(true)
      expect(onGrid(beats(120, 1 / after.modLfoHz))).toBe(true)
      if (after.drumRetrigHz > 0) {
        expect(onGrid(beats(120, 1 / after.drumRetrigHz))).toBe(true)
      }
    }
  }
})

test('a tempo too fast to be a pulse frees the timed controls again', () => {
  const before = { ...mine(), drumBpm: 2400, delayMs: 350 }
  const times = new Set<number>()
  for (let seed = 1; seed <= 20; seed++) {
    times.add(mutate(before, 0.12, mulberry32(seed)).delayMs)
  }
  expect(times.size).toBeGreaterThan(4)
})

test('mutate moves a log control by a proportion of where it sits', () => {
  const quiet = { ...mine(), delayMs: 40, drumBpm: 2400 }
  for (let seed = 1; seed <= 40; seed++) {
    const after = mutate(quiet, 0.12, mulberry32(seed)).delayMs
    expect(after).toBeGreaterThan(20)
    expect(after).toBeLessThan(120)
  }
})

test('mutate lands the toy clock on a ratio of the one it had', () => {
  const wanted = [
    1 / 8,
    1 / 6,
    1 / 4,
    1 / 3,
    1 / 2,
    2 / 3,
    3 / 4,
    1,
    4 / 3,
    3 / 2,
    2,
    3,
    4,
    6,
    8,
  ].map(r => Number(r.toFixed(2)))
  for (let seed = 1; seed <= 40; seed++) {
    const after = mutate(mine(), 0.3, mulberry32(seed)).chipClockX
    expect(wanted).toContain(Number(after.toFixed(2)))
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
