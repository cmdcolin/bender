import { expect, test } from 'vitest'
import { DEFAULT_CONTROLS, type ControlKey } from '../../controls'
import { render, rms } from '../../dsp/testRender'
import { groupKeys, sliderFor, snapToStep } from '../controls'
import { applyRig, RIGS, rigStands, rigsFor } from './rigs'
import { mine } from './testBoard'

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
// stage by turning one knob gets eight it can hear.
test('every rig makes a noise off a silent board', () => {
  const quiet = rms(render({}, 2))
  for (const rig of RIGS) {
    expect(rms(render(rig.patch, 2)), rig.name).toBeGreaterThan(quiet + 0.01)
  }
})
