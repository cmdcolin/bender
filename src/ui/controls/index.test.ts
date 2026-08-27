import { expect, test } from 'vitest'
import {
  CONTROL_KEYS,
  DEFAULT_CONTROLS,
  type ControlKey,
  type Controls,
} from '../../controls'
import { DEAD_V, PARTS } from '../../dsp/toyRail'
import { mutate } from '../presets/roll'
import { PART_KEYS } from '../presets/yours'
import { KEY_CHOICE, MIC_CHOICE } from '../../dsp/stages/sampler'
import { STEP_CHOICE } from '../../dsp/trigbus'
import { ECHO_MODE, ECHO_MODE_NAMES } from '../../dsp/stages/echo'
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

// The legend comes off the box, so the labels cannot drift from the modes. What
// a list of keys cannot promise is that the box numbered them in the order it
// wrote them down — and the switch hands the stage a position, not a name.
test('the mode switch numbers its positions the way the box reads them', () => {
  expect(sliderFor('echoMode').choices).toEqual(ECHO_MODE_NAMES)
  for (const [name, at] of Object.entries(ECHO_MODE)) {
    expect(ECHO_MODE_NAMES[at], name).toBe(name)
  }
})

test('log sliders have a positive floor or zero minimum', () => {
  for (const def of ALL_SLIDERS) {
    if (def.curve === 'log') expect(def.min, def.key).toBeGreaterThanOrEqual(0)
  }
})

test('symlog sliders mirror around a split', () => {
  for (const def of ALL_SLIDERS) {
    if (def.curve === 'symlog') expect(def.split, def.key).toBeDefined()
  }
})

// The Parts rack is the model's own numbers on knobs. Every one of them has to
// rest where the number was, or every saved link and every preset is a board
// that used to sound like something else.
test('the parts rack rests on the values the model was built with', () => {
  const rail: Record<string, number> = {
    chipLeadR: 0,
    chipDecouple: PARTS.decouple * 1000,
    chipWatchdog: PARTS.watchdog,
    chipLatchHold: PARTS.latchHold,
    chipClipBite: PARTS.clipStarve,
    chipClipHold: PARTS.clipHold * 1000,
    chipClipCharge: PARTS.dragPull,
    chipClipRelease: PARTS.dragDrop,
  }
  for (const [key, want] of Object.entries(rail)) {
    expect(DEFAULT_CONTROLS[key as ControlKey], key).toBeCloseTo(want, 9)
  }
  // And the floor on the watchdog is the point the chip gives up, not lower.
  expect(sliderFor('chipWatchdog').min).toBe(DEAD_V)
})

// A roll asks for a different board, not a different model of how a board
// works. The skip has to happen before the roll draws anything, or the same
// seed stops meaning the same board.
test('the blind dice leave the parts rack where the hand put it', () => {
  const wound: Controls = {
    ...DEFAULT_CONTROLS,
    chipWatchdog: 0.4,
    chipMixDrive: 1.5,
    chipDragOct: 7,
  }
  const seed = () => {
    let s = 12345
    return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
  }
  const rolled = mutate(wound, 0.6, seed())
  for (const key of PART_KEYS) expect(rolled[key], key).toBe(wound[key])

  // And the draw is unchanged by their being on the board at all: a roll from
  // stock moves the same controls it moved before the rack existed.
  const fromStock = mutate(DEFAULT_CONTROLS, 0.6, seed())
  const movedElsewhere = CONTROL_KEYS.filter(
    k => !PART_KEYS.has(k) && fromStock[k] !== DEFAULT_CONTROLS[k],
  )
  expect(movedElsewhere.length).toBeGreaterThan(10)
})
