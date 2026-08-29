import { expect, test } from 'vitest'
import {
  DEFAULT_CONTROLS,
  type ControlKey,
  type Controls,
} from '../../controls'
import { mulberry32 } from '../../dsp/util/rng'
import { BENDS, GROUPS, choiceValue } from '../controls'
import { DRUM_VOICES, N_DRUM_VOICES } from '../../drums'
import { applyPreset } from './apply'
import {
  bayFaults,
  coherePatch,
  cohereTriggers,
  solderBay,
  solderCascade,
} from './patch'
import { mutate, randomLook, rollGroup } from './roll'
import { SCENARIOS } from './scenarios'
import { PRESETS } from './table'
import { mine } from './testBoard'

const patchBay = GROUPS.find(g => g.editor?.kind === 'patch')!
const scenarioNamed = (name: string) =>
  SCENARIOS.find(s => s.name === name)!.roll

const DEPTH_OF = [0, 1, 2, 3].map(i =>
  choiceValue('mod0Dest', `wire ${i + 1} depth`),
)
const WIRE = [0, 1, 2, 3].map(i => ({
  src: `mod${i}Src` as ControlKey,
  dest: `mod${i}Dest` as ControlKey,
  depth: `mod${i}Depth` as ControlKey,
}))

// A bay where nothing is plugged into anything that works: every wire off a mic
// nobody has turned on, onto stages this board is not running, and one of them
// soldered to its own depth.
const deadBay = (): Controls => ({
  ...mine(),
  micLevel: 0,
  mod0Src: choiceValue('mod0Src', 'mic'),
  mod0Dest: choiceValue('mod0Dest', 'verb decay'),
  mod0Depth: 0.8,
  mod1Src: choiceValue('mod0Src', 'LFO'),
  mod1Dest: DEPTH_OF[1]!,
  mod1Depth: 0.6,
  mod2Src: choiceValue('mod0Src', 'LFO'),
  mod2Dest: choiceValue('mod0Dest', 'comb pitch'),
  mod2Depth: 0,
  mod3Src: choiceValue('mod0Src', 'heat'),
  mod3Dest: DEPTH_OF[0]!,
  mod3Depth: 0.5,
})

test('a dead bay comes back a patch, wire for wire', () => {
  const before = deadBay()
  expect(bayFaults(before).length).toBeGreaterThan(3)
  for (let seed = 1; seed <= 40; seed++) {
    const after = coherePatch(before, mulberry32(seed))
    expect(bayFaults(after), `seed ${seed}`).toEqual([])
    // Repairing a bay is not rewiring one: what was plugged in stays plugged
    // in, and what was unplugged stays that way.
    for (const w of WIRE) {
      expect(after[w.src] === 0).toBe(before[w.src] === 0)
    }
  }
})

// The patch this bay is for and the panel cannot say out loud: wire 1 pushing
// wire 2's depth, with wire 2 unplugged so there is nothing there to push.
const danglingDepth = (): Controls => ({
  ...mine(),
  mod0Src: choiceValue('mod0Src', 'LFO'),
  mod0Dest: DEPTH_OF[1]!,
  mod0Depth: 0.7,
  mod1Src: 0,
})

test('a wire on another wire’s depth leaves that wire something to push', () => {
  const before = danglingDepth()
  for (let seed = 1; seed <= 40; seed++) {
    const after = coherePatch(before, mulberry32(seed))
    expect(bayFaults(after), `seed ${seed}`).toEqual([])
    expect(after.mod0Dest, `seed ${seed}`).toBe(DEPTH_OF[1])
    expect(after.mod1Src, `seed ${seed}`).not.toBe(0)
    expect(DEPTH_OF).not.toContain(Math.round(after.mod1Dest))
    // The wire being driven sits at or near its own zero, so what you hear is
    // the wire above it opening and closing it.
    expect(Math.abs(after.mod1Depth), `seed ${seed}`).toBeLessThanOrEqual(0.3)
    expect(Math.abs(after.mod0Depth), `seed ${seed}`).toBeGreaterThanOrEqual(
      0.45,
    )
  }
})

test('a wire soldered to its own depth is a wire soldered to nothing', () => {
  const before: Controls = {
    ...mine(),
    mod1Src: choiceValue('mod0Src', 'LFO'),
    mod1Dest: DEPTH_OF[1]!,
    mod1Depth: 0.6,
  }
  for (let seed = 1; seed <= 40; seed++) {
    const after = coherePatch(before, mulberry32(seed))
    expect(after.mod1Dest, `seed ${seed}`).not.toBe(DEPTH_OF[1])
    expect(bayFaults(after), `seed ${seed}`).toEqual([])
  }
})

test('the bay roll hands back a bay you can hear', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const after = solderBay(mine(), mulberry32(seed))
    expect(bayFaults(after), `seed ${seed}`).toEqual([])
    expect(
      WIRE.filter(w => after[w.src] !== 0).length,
      `seed ${seed}`,
    ).toBeGreaterThanOrEqual(2)
  }
})

test('the cascade roll always solders a wire onto a wire', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const after = solderCascade(mine(), mulberry32(seed))
    expect(bayFaults(after), `seed ${seed}`).toEqual([])
    const onDepth = WIRE.filter(
      w => after[w.src] !== 0 && DEPTH_OF.includes(Math.round(after[w.dest])),
    )
    expect(onDepth.length, `seed ${seed}`).toBeGreaterThanOrEqual(1)
    // Slow enough that the opening is a shape rather than a carrier.
    expect(after.modLfoHz).toBeLessThanOrEqual(3)
  }
})

test('rolling the patch bay panel lands every wire on something running', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const after = rollGroup(patchBay, mine(), mulberry32(seed))
    expect(bayFaults(after), `seed ${seed}`).toEqual([])
  }
})

test('the blind dice never leave a wire on a stage they took off the board', () => {
  for (let seed = 1; seed <= 80; seed++) {
    const after = randomLook(mine(), mulberry32(seed))
    expect(bayFaults(after), `seed ${seed}`).toEqual([])
  }
})

// The whole-board roll thins the bends down to three on purpose. Waking one
// back up to hear a wire would undo exactly that, so this half of the repair
// moves the wire instead of the stage.
test('the blind dice repair the bay without turning a stage back on', () => {
  const before = deadBay()
  const mixes = [...BENDS.map(b => b.mix), 'revMix', 'dlyMix', 'echoLevel']
  for (let seed = 1; seed <= 40; seed++) {
    const after = coherePatch(before, mulberry32(seed), { wake: false })
    expect(bayFaults(after), `seed ${seed}`).toEqual([])
    for (const key of mixes) {
      expect(after[key as keyof Controls], `${key} seed ${seed}`).toBe(
        before[key as keyof Controls],
      )
    }
  }
})

test('rewire re-solders the bay onto stages the board is already running', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const after = scenarioNamed('rewire')(deadBay(), mulberry32(seed))
    expect(bayFaults(after), `seed ${seed}`).toEqual([])
  }
})

// A bay somebody soldered, on a board that can hear it: wire 1 opening wire 2,
// and wire 3 on a stage of its own.
const handPatched = (): Controls => ({
  ...mine(),
  combMix: 0.6,
  mod0Src: choiceValue('mod0Src', 'LFO'),
  mod0Dest: DEPTH_OF[1]!,
  mod0Depth: 0.9,
  mod1Src: choiceValue('mod0Src', 'envelope'),
  mod1Dest: choiceValue('mod0Dest', 'comb pitch'),
  mod1Depth: 0.15,
  mod2Src: choiceValue('mod0Src', 'drum hit'),
  mod2Dest: choiceValue('mod0Dest', 'chip clock'),
  mod2Depth: -0.4,
})

// The repair runs on every shake, and a shake happens on a timer forever. One
// that re-rolled a depth it had no complaint about would walk a patch you built
// away from you a tick at a time.
test('repairing a bay that is already one changes nothing', () => {
  const before = handPatched()
  expect(bayFaults(before)).toEqual([])
  for (let seed = 1; seed <= 40; seed++) {
    expect(coherePatch(before, mulberry32(seed)), `seed ${seed}`).toEqual(
      before,
    )
    expect(
      coherePatch(before, mulberry32(seed), { wake: false }),
      `seed ${seed}`,
    ).toEqual(before)
  }
})

// A nudge re-rolls either end of a wire as freely as it moves a knob, and it
// nudges the dry/wets a wire lands on too. Both leave a wire pointing at
// nothing, and nothing downstream of a shake was putting it back.
test('a shake never leaves a wire pointing at nothing', () => {
  const before = handPatched()
  for (const amount of [0.04, 0.12, 0.3]) {
    for (let seed = 1; seed <= 60; seed++) {
      const after = mutate(before, amount, mulberry32(seed))
      expect(bayFaults(after), `${amount} seed ${seed}`).toEqual([])
    }
  }
})

// Drift is that shake on a timer: what matters is not one tick but where a
// board left running for a few minutes has got to.
test('a board left drifting still has a bay at the end of it', () => {
  let board = handPatched()
  const rand = mulberry32(11)
  for (let tick = 0; tick < 200; tick++) {
    board = mutate(board, 0.05, rand)
    expect(bayFaults(board), `tick ${tick}`).toEqual([])
  }
})

// A preset is a board somebody wrote down, so a wire in one that reaches
// nothing is a typo rather than a roll of the dice. Checked off a stock board,
// which is the strictest reading: whatever the preset does not name is off.
test('every shipped preset names a bay you can hear', () => {
  for (const preset of PRESETS) {
    expect(
      bayFaults(applyPreset(preset, DEFAULT_CONTROLS)),
      preset.name,
    ).toEqual([])
  }
})

// The kit's trigger lines are wires too, and the pattern under them is yours:
// a bridge onto a row you never wrote a step on waits for ever, and no roll can
// write one to fix it.
const struck = (c: Controls, choice: number) =>
  choice > N_DRUM_VOICES
    ? DRUM_VOICES.some(v => c[v.key] !== 0)
    : c[DRUM_VOICES[choice - 1]!.key] !== 0

test('a bridge lands on a line the kit actually strikes', () => {
  // mine() writes the kick and the clap and leaves the other four empty.
  const before = { ...mine(), trigToKeys: 2, trigToDrum: 3 }
  for (let seed = 1; seed <= 40; seed++) {
    const after = cohereTriggers(before, mulberry32(seed))
    expect(after.trigToKeys, `seed ${seed}`).toBeGreaterThan(0)
    expect(struck(after, Math.round(after.trigToKeys)), `seed ${seed}`).toBe(
      true,
    )
  }
})

test('a bridge off a kit with no pattern at all comes out', () => {
  const empty = { ...mine(), trigToKeys: 2 }
  for (const row of DRUM_VOICES) empty[row.key] = 0
  expect(cohereTriggers(empty, mulberry32(1)).trigToKeys).toBe(0)
})

// Which way the repair goes is whose press it was. The panel's own dice may
// turn the machine at the far end up; the blind rewire takes the bridge out
// instead, the same as it moves a wire rather than waking a stage.
test('a bridge onto a machine turned down is woken or unsoldered', () => {
  const quiet = {
    ...mine(),
    chipLevel: 0,
    drumLevel: 0,
    trigToKeys: 1,
    trigToDrum: 1,
  }
  const named = cohereTriggers(quiet, mulberry32(3))
  expect(named.trigToKeys).toBeGreaterThan(0)
  expect(named.chipLevel).toBeGreaterThan(0)
  expect(named.drumLevel).toBeGreaterThan(0)
  const blind = cohereTriggers(quiet, mulberry32(3), { wake: false })
  expect(blind.trigToKeys).toBe(0)
  expect(blind.trigToDrum).toBe(0)
  expect(blind.chipLevel).toBe(0)
})

test('rewire solders no wire the board has nothing at the end of', () => {
  const noMic = { ...mine(), micLevel: 0, micPatch: 0 }
  for (let seed = 1; seed <= 60; seed++) {
    const after = scenarioNamed('rewire')(noMic, mulberry32(seed))
    expect(after.micPatch, `seed ${seed}`).toBe(noMic.micPatch)
    if (after.trigToKeys > 0)
      expect(struck(after, Math.round(after.trigToKeys)), `seed ${seed}`).toBe(
        true,
      )
  }
})

test('an unpatched bay is no fault at all', () => {
  expect(bayFaults(DEFAULT_CONTROLS)).toEqual([])
})
