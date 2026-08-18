import { expect, test } from 'vitest'
import {
  DEFAULT_CONTROLS,
  type ControlKey,
  type Controls,
} from '../../controls'
import { GRID_ROWS } from '../../drums'
import { HOLD_KEYS } from '../controls'
import { applyPreset, presetPath } from './apply'
import { renderBender, rms } from '../../dsp/testRender'
import { PRESETS } from './table'
import { mine } from './testBoard'

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
