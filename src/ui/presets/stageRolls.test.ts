import { expect, test } from 'vitest'

import { CONTROL_KEYS, type ControlKey } from '../../controls.ts'
import { mulberry32 } from '../../dsp/util/rng.ts'
import { GROUPS, type Group } from '../controls/index.ts'
import { STAGE_ROLLS, stageRollsFor } from './stageRolls.ts'
import { mine } from './testBoard.ts'

const MACHINES = ['Plinky', 'Clatter', 'Glint', 'Parlor', 'Growler']

const machine = (name: string): Group => GROUPS.find(g => g.name === name)!
const kind = (name: string) => STAGE_ROLLS.find(r => r.name === name)!

const FAULT = [
  'knife on the bus',
  'voice card faults',
  'die and driver',
  'the supply underneath',
]
const PLAY = [
  'arp and key lock',
  'clocks and wires',
  'clock and wires',
  'keys',
  'triggers and cross-patch',
]

const keysIn = (group: Group, parts: string[]) =>
  group.sliders.filter(s => s.part && parts.includes(s.part)).map(s => s.key)

const changed = (a: Record<string, number>, b: Record<string, number>) =>
  CONTROL_KEYS.filter(k => a[k] !== b[k])

const SEEDS = Array.from({ length: 30 }, (_, i) => i + 1)

test('the plain roll leaves faults, the supply, key lock and wiring where they stood', () => {
  for (const name of MACHINES) {
    const group = machine(name)
    const held = new Set<ControlKey>([
      ...keysIn(group, FAULT),
      ...keysIn(group, PLAY),
    ])
    for (const seed of SEEDS) {
      const before = mine()
      const after = kind('sound').roll(group, before, mulberry32(seed))
      for (const k of changed(before, after)) expect(held.has(k)).toBe(false)
    }
  }
})

test('the plain roll moves something on every machine', () => {
  for (const name of MACHINES) {
    const moved = SEEDS.some(seed => {
      const before = mine()
      const after = kind('sound').roll(machine(name), before, mulberry32(seed))
      return changed(before, after).length > 0
    })
    expect(moved).toBe(true)
  }
})

test('the fault roll moves faults and nothing else', () => {
  for (const name of MACHINES) {
    const group = machine(name)
    const faults = new Set<ControlKey>(keysIn(group, FAULT))
    let landed = 0
    for (const seed of SEEDS) {
      const before = mine()
      const after = kind('faults').roll(group, before, mulberry32(seed))
      const moved = changed(before, after)
      for (const k of moved) expect(faults.has(k)).toBe(true)
      landed += moved.length
    }
    expect(landed).toBeGreaterThan(0)
  }
})

test('the play roll moves only how the machine is played', () => {
  for (const name of MACHINES) {
    const group = machine(name)
    const play = new Set<ControlKey>(keysIn(group, PLAY))
    for (const seed of SEEDS) {
      const before = mine()
      const after = kind('play').roll(group, before, mulberry32(seed))
      for (const k of changed(before, after)) expect(play.has(k)).toBe(true)
    }
  }
})

test('a nudge touches fewer controls than a roll, and only sound controls', () => {
  for (const name of MACHINES) {
    const group = machine(name)
    const held = new Set<ControlKey>([
      ...keysIn(group, FAULT),
      ...keysIn(group, PLAY),
    ])
    let nudged = 0
    let rolled = 0
    for (const seed of SEEDS) {
      const before = mine()
      const near = kind('nudge').roll(group, before, mulberry32(seed))
      for (const k of changed(before, near)) expect(held.has(k)).toBe(false)
      nudged += changed(before, near).length
      rolled += changed(
        before,
        kind('sound').roll(group, before, mulberry32(seed)),
      ).length
    }
    expect(nudged).toBeLessThan(rolled)
  }
})

test('the pattern roll writes the kit grid and leaves every slider alone', () => {
  const group = machine('Clatter')
  const sliders = new Set<ControlKey>(group.sliders.map(s => s.key))
  let grid = 0
  for (const seed of SEEDS) {
    const before = mine()
    const after = kind('pattern').roll(group, before, mulberry32(seed))
    for (const k of changed(before, after)) {
      expect(sliders.has(k)).toBe(false)
      grid++
    }
  }
  expect(grid).toBeGreaterThan(0)
})

test('only the kit offers a pattern roll', () => {
  const offers = (name: string) =>
    stageRollsFor(machine(name)).some(r => r.name === 'pattern')
  expect(offers('Clatter')).toBe(true)
  for (const name of MACHINES.filter(n => n !== 'Clatter'))
    expect(offers(name)).toBe(false)
})

test('every machine offers the plain roll first and everything last', () => {
  for (const name of MACHINES) {
    const names = stageRollsFor(machine(name)).map(r => r.name)
    expect(names[0]).toBe('sound')
    expect(names.at(-1)).toBe('everything')
  }
})
