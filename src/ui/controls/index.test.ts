import { expect, test } from 'vitest'
import { CONTROL_KEYS, DEFAULT_CONTROLS } from '../../controls'
import { KEY_CHOICE, MIC_CHOICE } from '../../dsp/stages/sampler'
import { STEP_CHOICE } from '../../dsp/trigbus'
import { ALL_SLIDERS, BENDS, EDITOR_KEYS, GROUPS, sliderFor } from '.'

// A slot's choices are derived from the table, so the counts can't drift. What
// still can is a table entry naming a group or a dry/wet that isn't there.
test('every bend names a group and a mix that exist', () => {
  for (const bend of BENDS) {
    const group = GROUPS.find(g => g.name === bend.group)
    expect(group, bend.group).toBeDefined()
    expect(group!.sliders.find(s => s.role === 'mix')?.key).toBe(bend.mix)
  }
})

test('every control has exactly one widget, slider or editor', () => {
  const keys = [...ALL_SLIDERS.map(s => s.key), ...EDITOR_KEYS]
  expect(new Set(keys).size).toBe(keys.length)
  expect([...keys].sort()).toEqual([...CONTROL_KEYS].sort())
})

test('defaults sit inside slider ranges', () => {
  for (const k of CONTROL_KEYS) {
    if (EDITOR_KEYS.has(k)) continue
    const def = sliderFor(k)
    const v = DEFAULT_CONTROLS[k]
    expect(v, k).toBeGreaterThanOrEqual(def.min)
    expect(v, k).toBeLessThanOrEqual(def.max)
  }
})

test('choice sliders are integer enums covering their range', () => {
  for (const def of ALL_SLIDERS) {
    if (!def.choices) continue
    expect(def.step, def.key).toBe(1)
    expect(def.choices.length, def.key).toBe(def.max - def.min + 1)
  }
})

test('the clock lock lands the toy on a division of the kit', () => {
  const def = sliderFor('chipClockX')
  const lock = def.action
  expect(lock).toBeDefined()
  const at = (chipClockX: number) =>
    lock!.value({ ...DEFAULT_CONTROLS, chipClockX }, def)
  // 118 bpm is 7.87 steps a second on the kit and the boot ROM runs its own at
  // 3.2, so step for step the crystal wants 2.46×. From a knob sitting at 1 the
  // nearest lock is a third of that — the tune taking three kit steps to a step
  // of its own — and from 3 it is the step-for-step one.
  const kitHz = (DEFAULT_CONTROLS.drumBpm / 60) * 4
  expect(at(1)).toBeCloseTo(kitHz / 3.2 / 3, 6)
  expect(at(3)).toBeCloseTo(kitHz / 3.2, 6)
  // Whichever it picked, the kit's step rate is a whole number of the toy's.
  expect((kitHz / (3.2 * at(1))) % 1).toBeCloseTo(0, 6)
})

// The voices themselves come off VOICE_LABELS either side, so they cannot drift.
// What each list adds past them is written out by hand and read back by a
// hard-coded offset, and the two lists add different things — so an entry
// slipped into either tail silently moves what the decoder hears.
test('the trigger tails decode the choice they name', () => {
  const at = (key: 'trigToDrum' | 'sampleTrig', i: number) =>
    sliderFor(key).choices?.[i]
  expect(at('trigToDrum', STEP_CHOICE)).toBe('the step')
  expect(at('sampleTrig', KEY_CHOICE)).toBe('key')
  expect(at('sampleTrig', MIC_CHOICE)).toBe('mic')
})

test('log sliders have a positive floor or zero minimum', () => {
  for (const def of ALL_SLIDERS) {
    if (def.curve === 'log') expect(def.min, def.key).toBeGreaterThanOrEqual(0)
  }
})
