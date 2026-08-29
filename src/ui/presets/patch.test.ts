import { expect, test } from 'vitest'
import {
  DEFAULT_CONTROLS,
  type ControlKey,
  type Controls,
} from '../../controls'
import { mulberry32 } from '../../dsp/util/rng'
import { BENDS, GROUPS, choiceValue } from '../controls'
import { bayFaults, coherePatch, solderBay, solderCascade } from './patch'
import { randomLook, rollGroup } from './roll'
import { SCENARIOS } from './scenarios'
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

test('an unpatched bay is no fault at all', () => {
  expect(bayFaults(DEFAULT_CONTROLS)).toEqual([])
})
