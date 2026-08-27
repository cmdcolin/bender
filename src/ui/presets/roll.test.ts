import { expect, test } from 'vitest'
import { CONTROL_KEYS, DEFAULT_CONTROLS } from '../../controls'
import { hasStep } from '../../drums'
import { mulberry32 } from '../../dsp/util/rng'
import { BENDS, GROUPS, type Group, groupKeys, sliderFor } from '../controls'
import { mutate, randomLook, resetGroup, rollGroup, rollKeys } from './roll'
import { mine, yours } from './testBoard'

const groupNamed = (name: string): Group =>
  GROUPS.find(g => g.name === name) as Group

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

test('mutate never moves the song, the pattern or your levels', () => {
  const before = mine()
  for (const amount of [0.04, 0.12, 0.3]) {
    expect(yours(mutate(before, amount, mulberry32(7)))).toEqual(yours(before))
  }
})

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

// The one you press over and over, so the thing it hands you unasked is the
// thing you hear a hundred times. Crackle covers whatever else the roll did.
test('random rarely brings crackle on, and never loud', () => {
  const before = mine()
  let on = 0
  for (let seed = 1; seed <= 300; seed++) {
    const after = randomLook(before, mulberry32(seed))
    for (const key of ['crackleAmp', 'brownCrackle'] as const) {
      expect(after[key], `${key}/${seed}`).toBeLessThanOrEqual(0.3)
      if (after[key] > 0) on++
    }
  }
  expect(on).toBeGreaterThan(0)
  expect(on / 600).toBeLessThan(0.15)
})

// A shy control on a list of choices is still shy — it sits most rolls out. But
// the low end of a list is not the quiet end of it, so the rare roll that does
// bring one on has to be able to reach the whole list. Reading the bottom of
// the travel as the gentle end put four of the five effects, and most of the
// wires on both buses, past anything a roll could hand you.
test('a shy control on a list of choices can still reach the whole list', () => {
  const before = mine()
  const seen: Record<string, Set<number>> = {}
  const keys = ['fmEffect', 'fmDataLine', 'fmAddrLine', 'chipDataLine'] as const
  for (const k of keys) seen[k] = new Set()
  let on = 0
  for (let seed = 1; seed <= 600; seed++) {
    const after = randomLook(before, mulberry32(seed))
    for (const k of keys) {
      seen[k]!.add(after[k])
      if (after[k] > 0) on++
    }
  }
  for (const k of keys) {
    const def = sliderFor(k)
    // every choice the control has, off included
    expect(seen[k]!.size, k).toBe(def.choices!.length)
  }
  // and still shy: on is the exception across all four, not the rule
  expect(on / (600 * keys.length)).toBeLessThan(0.15)
})

test('mutate does not turn crackle on from nothing', () => {
  const off = { ...mine(), crackleAmp: 0, brownCrackle: 0 }
  for (let seed = 1; seed <= 60; seed++) {
    const after = mutate(off, 0.3, mulberry32(seed))
    expect(after.crackleAmp).toBe(0)
    expect(after.brownCrackle).toBe(0)
  }
})

test('a crackle you dialled in is a control like any other', () => {
  const dialled = { ...mine(), crackleAmp: 0.7 }
  const seen = new Set<number>()
  for (let seed = 1; seed <= 60; seed++) {
    seen.add(mutate(dialled, 0.3, mulberry32(seed)).crackleAmp)
  }
  expect(seen.size).toBeGreaterThan(4)
  expect(Math.max(...seen)).toBeGreaterThan(0.7)
})

test('pressing the dice on the crackle stage asks for crackle', () => {
  const levels = new Set<number>()
  for (let seed = 1; seed <= 40; seed++) {
    levels.add(
      rollGroup(groupNamed('Noise & crackle'), mine(), mulberry32(seed))
        .crackleAmp,
    )
  }
  expect(Math.max(...levels)).toBeGreaterThan(0.5)
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

// A fold's roll button names the controls under one heading, and the panel
// shows only the rows with something to act on — so on a stock FM chip it is
// pointed at four, three of them a choice of which line to cut. Every control
// the toy boots off stays off a third of the time under a roll, which over four
// of them left the board exactly where it stood one press in thirty-seven: the
// button pressed, the panel silent, nothing to say why.
test('a roll you pointed at lands somewhere you were not', () => {
  const rows = groupNamed('FM chip')
    .sliders.filter(s => s.part === 'knife on the bus')
    .filter(s => !s.needs || s.needs(DEFAULT_CONTROLS))
    .map(s => s.key)
  expect(rows.length).toBeGreaterThan(0)
  for (let seed = 1; seed <= 200; seed++) {
    const after = rollKeys(DEFAULT_CONTROLS, rows, mulberry32(seed), true)
    expect(
      rows.some(k => after[k] !== DEFAULT_CONTROLS[k]),
      `seed ${seed}`,
    ).toBe(true)
  }
})

// The rack borrows all seven dry/wets, so without thinning its own dice hand
// back six bends half there and none of them the thing you are hearing.
test('the slot rack rolls a chain you can pick apart', () => {
  const rack = GROUPS.find(g => g.name === 'Signal chain')!
  const rand = mulberry32(9)
  for (let i = 0; i < 40; i++) {
    const rolled = rollGroup(rack, DEFAULT_CONTROLS, rand)
    expect(BENDS.filter(b => rolled[b.mix] > 0).length).toBeLessThanOrEqual(3)
  }
})
