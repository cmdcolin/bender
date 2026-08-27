import { expect, test } from 'vitest'
import { DEFAULT_CONTROLS, type ControlKey } from '../../controls'
import { render, rms } from '../../dsp/testRender'
import { groupKeys, sliderFor, snapToStep } from '../controls'
import { applyRig, RIGS, rigStands, rigsFor } from './rigs'
import { mine } from './testBoard'

const diff = (a: Float32Array, b: Float32Array) => a.map((v, i) => v - b[i]!)

test('every rig names controls that exist and lands on their travel', () => {
  for (const rig of RIGS) {
    expect(groupKeys(rig.group).length, rig.group).toBeGreaterThan(0)
    for (const key of Object.keys(rig.patch) as ControlKey[]) {
      const def = sliderFor(key)
      const value = rig.patch[key]!
      expect(value, `${rig.name}/${key}`).toBeGreaterThanOrEqual(def.min)
      expect(value, `${rig.name}/${key}`).toBeLessThanOrEqual(def.max)
      expect(snapToStep(def, value), `${rig.name}/${key}`).toBe(value)
    }
  }
})

// One rig on a stage, not two: pressing a second is that second rig rather than
// whatever the first left standing.
test('a rig is the whole of what the stage is doing', () => {
  const [first, second] = rigsFor('Feedback bus')
  const board = applyRig(second!, applyRig(first!, mine()))
  expect(rigStands(second!, board)).toBe(true)
  expect(rigStands(first!, board)).toBe(false)
})

// A rig that reaches outside its stage clears what its row-mates reached for
// too, or a chain named for two stages arrives with a third one still wet.
test('a rig takes the last rig off the board with it', () => {
  const [chain] = rigsFor('Slot order')
  const comb = rigsFor('Slot order').find(r => r.name === 'fuzz into the comb')!
  const after = applyRig(chain!, applyRig(comb, mine()))
  expect(after.combMix).toBe(DEFAULT_CONTROLS.combMix)
  expect(after.distMix).toBe(DEFAULT_CONTROLS.distMix)
  expect(rigStands(chain!, after)).toBe(true)
})

test('a rig leaves the rest of the board where your hand put it', () => {
  const before = mine()
  const rig = rigsFor('Feedback bus').find(r => r.name === 'motorboat')!
  const after = applyRig(rig, before)
  const moved = (Object.keys(after) as ControlKey[]).filter(
    k => after[k] !== before[k],
  )
  const desk = new Set<ControlKey>(groupKeys(rig.group))
  for (const key of moved) expect(desk.has(key), key).toBe(true)
})

// Reaching outside the stage is allowed, and is how a return soldered to a
// machine that boots silent gets heard at all — but only to bring that machine
// up, never to move a control the stage has nothing to do with.
test('what a rig reaches for outside its stage is a level', () => {
  const desk = new Set<ControlKey>(groupKeys('Feedback bus'))
  for (const rig of rigsFor('Feedback bus')) {
    for (const key of Object.keys(rig.patch) as ControlKey[]) {
      if (desk.has(key)) continue
      expect(sliderFor(key).role, `${rig.name}/${key}`).toBe('level')
      expect(rig.patch[key], `${rig.name}/${key}`).toBeGreaterThan(
        DEFAULT_CONTROLS[key],
      )
    }
  }
})

// The whole reason the row is there: a hand that cannot find a setting on this
// stage by turning one knob gets a row of them it can hear. Not "louder than
// stock" — a chain that ends in a low-pass is quieter than the dry board and is
// still the loudest thing on the panel — but audible on its own, and audibly
// different from the board it landed on.
test('every rig makes a noise, and changes the one that was playing', () => {
  const dry = render({}, 2)
  for (const rig of RIGS) {
    const out = render(rig.patch, 2)
    expect(rms(out), rig.name).toBeGreaterThan(0.02)
    expect(rms(diff(out, dry)), rig.name).toBeGreaterThan(0.05)
  }
})

// The point of the ordering pairs, and the reason there are two of each: the
// same stages with the same settings, swapped over, are not the same sound. If
// this ever stops holding, the row is teaching something that isn't true.
test('an ordering pair is two different sounds', () => {
  const pairs = [
    ['crush, then filter', 'filter, then crush'],
    ['fuzz into the comb', 'comb into the fuzz'],
    ['chopped, then rung', 'rung, then chopped'],
  ]
  for (const [a, b] of pairs) {
    const first = RIGS.find(r => r.name === a)!
    const second = RIGS.find(r => r.name === b)!
    // Same stages, same settings: only the slots differ.
    const knobs = (rig: (typeof RIGS)[number]) =>
      Object.entries(rig.patch)
        .filter(([k]) => !k.startsWith('bendSlot'))
        .sort()
    expect(knobs(first)).toEqual(knobs(second))
    const one = render(first.patch, 2)
    const two = render(second.patch, 2)
    expect(rms(diff(one, two)), `${a} vs ${b}`).toBeGreaterThan(0.2 * rms(one))
  }
})
