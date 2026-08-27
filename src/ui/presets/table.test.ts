import { expect, test } from 'vitest'
import { DEFAULT_CONTROLS, type ControlKey } from '../../controls'
import { GRID_ROWS } from '../../drums'
import { HOLD_KEYS } from '../controls'
import { applyPreset, presetPath } from './apply'
import { render, renderBender, rms } from '../../dsp/testRender'
import { PRESETS } from './table'
import { mine } from './testBoard'

test('a preset moves what it names and keeps the rest of what is yours', () => {
  const before = mine()
  const toy = PRESETS.find(p => p.name === 'dying toy')!
  const after = applyPreset(toy, before)
  // it says nothing about the drums, so the pattern survives
  expect(GRID_ROWS.map(r => after[r.key])).toEqual(
    GRID_ROWS.map(r => before[r.key]),
  )
  expect(after.outGain).toBe(before.outGain)
  expect(after.chipStarve).toBe(toy.patch.chipStarve)
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
  const along = PRESETS.find(p => p.name === 'backbeat')!
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
// mode. What is yours holds the whole way across — unless the preset names it,
// which is the one thing that makes it the preset's to move. The tape presets
// name the sampler's fader, because a tape machine whose output is down is a
// preset that sounds like the board without it.
const YOURS_ON_A_DRAG = [
  'chipTune',
  'outGain',
  'micLevel',
  'sampleLevel',
] as const

test('a preset dragged part way still leaves what is yours alone', () => {
  const before = mine()
  for (const preset of PRESETS) {
    const held = YOURS_ON_A_DRAG.filter(k => !(k in preset.patch))
    expect(held.length, preset.name).toBeGreaterThan(2)
    for (const t of [0.1, 0.5, 0.9]) {
      const part = presetPath(preset, before).at(before, t)
      expect(
        held.map(k => part[k]),
        `${preset.name} at ${t}`,
      ).toEqual(held.map(k => before[k]))
    }
  }
})

// And the other half of the rule: one that names a fader of yours gets it, or
// the line of the catalog is a board you cannot hear on one press.
test('a preset that names the sampler brings its fader up', () => {
  const before = { ...mine(), sampleLevel: 0 }
  const named = PRESETS.filter(p => 'sampleLevel' in p.patch)
  expect(named.length).toBeGreaterThan(1)
  for (const preset of named) {
    expect(applyPreset(preset, before).sampleLevel, preset.name).toBe(
      preset.patch.sampleLevel,
    )
  }
})

test('every preset patches keys that exist', () => {
  for (const preset of PRESETS) {
    for (const key of Object.keys(preset.patch)) {
      expect(DEFAULT_CONTROLS, `${preset.name}/${key}`).toHaveProperty(key)
    }
  }
})

// A preset naming an effect is a preset whose whole point is a script running,
// and the effect it names is an index into a list that grows. Render each one
// and listen: silence here means the catalog is pointing at the wrong entry, or
// at a bend that turned the chip off on the way past.
test('every preset that names an effect makes a sound', () => {
  const named = PRESETS.filter(p => p.patch.fmEffect)
  expect(named.length).toBeGreaterThan(3)
  for (const preset of named)
    expect(rms(renderBender(preset.patch, 3)), preset.name).toBeGreaterThan(
      0.01,
    )
})

// A preset naming the delay pedal is a preset whose point is the repeats. Render
// each one with the pedal in and with it out: a board that measures the same
// either way is a line of the catalog advertising something you cannot hear.
test('every preset that names the delay pedal is one you can hear it on', () => {
  const named = PRESETS.filter(p => p.patch.echoLevel)
  expect(named.length).toBeGreaterThan(2)
  for (const preset of named) {
    const wet = rms(render(preset.patch, 3))
    const dry = rms(render({ ...preset.patch, echoLevel: 0 }, 3))
    expect(wet, preset.name).toBeGreaterThan(1.02 * dry)
  }
})

// A preset naming the record head is a preset whose point is the tape. Render
// it with the sampler in and with its fader down: a board that measures the
// same either way is a line of the catalog advertising a reel nobody hears.
// Long enough for the reel to have come round, or the take is all first lap.
test('every preset that names the record head is one you can hear the tape on', () => {
  const named = PRESETS.filter(p => p.patch.loopRec)
  expect(named.length).toBeGreaterThan(1)
  for (const preset of named) {
    const wet = rms(render(preset.patch, 8))
    const dry = rms(render({ ...preset.patch, sampleLevel: 0 }, 8))
    expect(wet, preset.name).toBeGreaterThan(1.02 * dry)
  }
})
