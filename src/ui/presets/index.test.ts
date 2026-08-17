import { expect, test } from 'vitest'
import {
  CONTROL_KEYS,
  DEFAULT_CONTROLS,
  type ControlKey,
  type Controls,
} from '../../controls'
import { mulberry32 } from '../../dsp/util/rng'
import { romIndex } from '../../dsp/stages/roms'
import {
  BENDS,
  BEND_SLOT_KEYS,
  GROUPS,
  type Group,
  groupKeys,
  HOLD_KEYS,
  sliderFor,
} from '../controls'
import { GRID_ROWS, hasStep } from '../drums'
import {
  applyPreset,
  mutate,
  PRESETS,
  presetPath,
  randomLook,
  resetGroup,
  rollGroup,
  SCENARIOS,
} from '.'

const groupNamed = (name: string): Group =>
  GROUPS.find(g => g.name === name) as Group

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

// Enough seeds that a shake lands on the one control being watched a good few
// times: a shake moves a handful of controls rather than all of them, so any
// given control sits most rolls out.
test('a tempo too fast to be a pulse frees the timed controls again', () => {
  const before = { ...mine(), drumBpm: 2400, delayMs: 350 }
  const times = new Set<number>()
  for (let seed = 1; seed <= 80; seed++) {
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
  // it says nothing about the drums, so the pattern survives
  expect(GRID_ROWS.map(r => after[r.key])).toEqual(
    GRID_ROWS.map(r => before[r.key]),
  )
  expect(after.outGain).toBe(before.outGain)
  expect(after.chipStarve).toBe(grief.patch.chipStarve)
})

// A preset is a statement about the circuit. Naming the tune as well means
// auditioning one costs you the song you were judging it by, so none may.
test('no preset picks the demo song', () => {
  for (const preset of PRESETS) {
    expect(preset.patch, preset.name).not.toHaveProperty('chipTune')
  }
  const before = mine()
  for (const preset of PRESETS) {
    expect(applyPreset(preset, before).chipTune, preset.name).toBe(
      before.chipTune,
    )
  }
})

test('a preset that names the pattern writes it', () => {
  const before = mine()
  const along = PRESETS.find(p => p.name === 'clap along')!
  const after = applyPreset(along, before)
  expect(after.drumClap).toBe(along.patch.drumClap)
  expect(after.drumKick).not.toBe(before.drumKick)
})

// A morph holds these whatever the destination says (engine/glide.ts), and
// every way of reaching a preset goes through one — so a patch that names one
// is a line of the catalog that has never done anything. Two of them named
// micLevel, and clicking either did nothing to the mic on any morph setting.
test('no preset names a control the trip will hold back', () => {
  for (const preset of PRESETS) {
    for (const key of Object.keys(preset.patch)) {
      expect(HOLD_KEYS.has(key as ControlKey), `${preset.name}/${key}`).toBe(
        false,
      )
    }
  }
})

// The drag on a preset chip. Both ends have to be somewhere you could have got
// to another way, or the chip is a slider onto boards nothing else can reach.
test('a preset dragged to either end is a board you already had', () => {
  const before = mine()
  for (const preset of PRESETS) {
    const path = presetPath(preset, before)
    expect(path.at(before, 0), preset.name).toEqual(before)
    expect(path.at(before, 1), preset.name).toEqual(applyPreset(preset, before))
  }
})

// The pattern is left out: two presets name it, and a step mask cannot be half
// written, so those cut theirs in at the midpoint of the drag like any other
// mode. The song and the levels no preset names at all, so they hold the whole
// way across.
test('a preset dragged part way still leaves the song and the levels alone', () => {
  const before = mine()
  const held = (c: Controls) => [
    c.chipTune,
    c.outGain,
    c.micLevel,
    c.sampleLevel,
  ]
  for (const preset of PRESETS) {
    for (const t of [0.1, 0.5, 0.9]) {
      const part = presetPath(preset, before).at(before, t)
      expect(held(part), `${preset.name} at ${t}`).toEqual(held(before))
    }
  }
})

test('every preset patches keys that exist', () => {
  for (const preset of PRESETS) {
    for (const key of Object.keys(preset.patch)) {
      expect(DEFAULT_CONTROLS, `${preset.name}/${key}`).toHaveProperty(key)
    }
  }
})

test('the bend table lines up with the slots that name it', () => {
  expect(BENDS.length).toBe((sliderFor('bendSlot0').choices?.length ?? 0) - 1)
  for (const bend of BENDS) {
    expect(GROUPS.map(g => g.name)).toContain(bend.group)
    expect(DEFAULT_CONTROLS).toHaveProperty(bend.mix)
  }
})

test('rolling a stage leaves every other stage alone', () => {
  const before = mine()
  for (const name of ['Spring verb', 'Ring mod', 'Tape machine']) {
    const group = groupNamed(name)
    const own = new Set(groupKeys(group))
    for (let seed = 1; seed <= 12; seed++) {
      const after = rollGroup(group, before, mulberry32(seed))
      for (const key of CONTROL_KEYS) {
        if (!own.has(key))
          expect(after[key], `${name}/${key}`).toBe(before[key])
      }
    }
  }
})

test('rolling a stage moves it somewhere', () => {
  const group = groupNamed('Spring verb')
  const boards = new Set<string>()
  for (let seed = 1; seed <= 20; seed++) {
    const after = rollGroup(group, mine(), mulberry32(seed))
    boards.add(JSON.stringify(groupKeys(group).map(k => after[k])))
  }
  expect(boards.size).toBeGreaterThan(4)
})

test('rolling the kit writes a pattern, keeps the tempo and the song', () => {
  const before = { ...mine(), drumBpm: 96 }
  const kit = groupNamed('Toy drums')
  for (let seed = 1; seed <= 20; seed++) {
    const after = rollGroup(kit, before, mulberry32(seed))
    expect(after.drumBpm).toBe(96)
    expect(after.chipTune).toBe(before.chipTune)
    // the downbeat is the one step every pattern it writes agrees on
    expect(hasStep(after.drumKick, 0)).toBe(true)
    // and a kit rolled to be heard is not rolled silent
    expect(after.drumLevel).toBeGreaterThan(0.3)
  }
})

test('resetting a stage puts that stage back and nothing else', () => {
  const played = { ...mine(), revMix: 0.8, revDecayS: 6, dlyMix: 0.5 }
  const after = resetGroup(groupNamed('Spring verb'), played)
  expect(after.revMix).toBe(DEFAULT_CONTROLS.revMix)
  expect(after.revDecayS).toBe(DEFAULT_CONTROLS.revDecayS)
  expect(after.dlyMix).toBe(played.dlyMix)
  expect(yours(after)).toEqual(yours(played))
})

test('resetting the kit wipes the pattern it owns', () => {
  const after = resetGroup(groupNamed('Toy drums'), mine())
  expect(after.drumKick).toBe(DEFAULT_CONTROLS.drumKick)
  expect(after.drumClap).toBe(DEFAULT_CONTROLS.drumClap)
})

test('the cross-cutting rolls keep the song, the pattern and your levels', () => {
  const before = mine()
  for (const scenario of SCENARIOS) {
    for (let seed = 1; seed <= 20; seed++) {
      const after = scenario.roll(before, mulberry32(seed))
      expect(yours(after), scenario.name).toEqual(yours(before))
      expect(after.drumBpm, scenario.name).toBe(before.drumBpm)
    }
  }
})

test('rewire shuffles the slots without retuning a single bend', () => {
  const before = {
    ...mine(),
    bendSlot0: 1,
    bendSlot1: 4,
    bendSlot2: 0,
    ringHz: 412,
    combHz: 91,
    filtRes: 1.1,
  }
  const wiring = new Set<string>()
  for (let seed = 1; seed <= 20; seed++) {
    const after = SCENARIOS.find(s => s.name === 'rewire')!.roll(
      before,
      mulberry32(seed),
    )
    expect(BEND_SLOT_KEYS.map(k => after[k]).sort()).toEqual(
      BEND_SLOT_KEYS.map(k => before[k]).sort(),
    )
    expect(after.ringHz).toBe(before.ringHz)
    expect(after.combHz).toBe(before.combHz)
    expect(after.filtRes).toBe(before.filtRes)
    wiring.add(JSON.stringify(BEND_SLOT_KEYS.map(k => after[k])))
  }
  expect(wiring.size).toBeGreaterThan(1)
})

test('one bend puts exactly one bend on the board, turned up', () => {
  const roll = SCENARIOS.find(s => s.name === 'one bend')!.roll
  for (let seed = 1; seed <= 30; seed++) {
    const after = roll(mine(), mulberry32(seed))
    const patched = BEND_SLOT_KEYS.map(k => after[k]).filter(v => v !== 0)
    expect(patched.length).toBe(1)
    const bend = BENDS[patched[0]! - 1]!
    expect(after[bend.mix]).toBeGreaterThan(0.5)
  }
})

test('wreck it winds up everything that can run away', () => {
  const roll = SCENARIOS.find(s => s.name === 'wreck it')!.roll
  for (let seed = 1; seed <= 20; seed++) {
    const after = roll(mine(), mulberry32(seed))
    expect(after.fbAmt).toBeGreaterThan(0.9)
    expect(after.dlyFb).toBeGreaterThan(1)
    expect(after.bits).toBeLessThan(8)
  }
})
