import { afterEach, expect, test } from 'vitest'

import { DEFAULT_CONTROLS, type Controls } from '../controls.ts'
import { bench, sanitizeBench } from './bench.ts'
import { buildMap, onBoard } from './chain-map.ts'
import { GROUPS, OWNER_BY_KEY } from './controls/index.ts'
import {
  added,
  clearAdded,
  confine,
  confineToOne,
  parseAdded,
  shownOn,
  takeOff,
} from './fitted.ts'
import { mutate, randomLook } from './presets/index.ts'

const stock = (): Controls => ({ ...DEFAULT_CONTROLS })
const group = (name: string) => GROUPS.find(g => g.name === name)!

const seeded = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647
  return seed / 2147483647
}

afterEach(clearAdded)

test('a stock board uses the two toys, the mix bus and the output', () => {
  expect([...onBoard(stock())].toSorted()).toEqual([
    'Clatter',
    'Mix bus',
    'Output',
    'Plinky',
  ])
})

test('a stage joins the board when its mix comes up', () => {
  expect(onBoard({ ...stock(), ringMix: 0.5 }).has('Ring mod')).toBe(true)
  expect(onBoard({ ...stock(), ringHz: 900 }).has('Ring mod')).toBe(false)
})

test('a group with no gate joins the board once it moves', () => {
  expect(onBoard(stock()).has('Wear')).toBe(false)
  expect(onBoard({ ...stock(), heatAmt: 0.4 }).has('Wear')).toBe(true)
})

test('a patched wire puts the bay and both its ends on the board', () => {
  const board = { ...stock(), mod0Src: 1, mod0Dest: 0, mod0Depth: 0.5 }
  const on = onBoard(board)
  expect(on.has('Patch bay')).toBe(true)
  expect(on.has('Screech filter')).toBe(true)
})

test('the map draws only the stages it is given', () => {
  const shown = onBoard(stock())
  const map = buildMap(stock(), { wrap: true, loop: true, shown })
  const doors = new Set(map.nodes.flatMap(n => (n.door ? [n.door] : [])))
  expect([...doors].toSorted()).toEqual([...shown, 'Power supply'].toSorted())
})

test('the power supply box and its loop show on a stock board', () => {
  const map = buildMap(stock(), { shown: onBoard(stock()) })
  expect(map.nodes.some(n => n.label === 'Power supply')).toBe(true)
  const rail = map.wires.find(w => w.id === 'rail')!
  expect(rail.door).toBe('Power supply')
  expect(rail.d.match(/Q/g)).toHaveLength(4)
})

test('every stage on its own draws without a gap in its wires', () => {
  for (const g of GROUPS) {
    const shown = new Set([...onBoard(stock()), g.name])
    const map = buildMap(stock(), { wrap: true, loop: true, shown })
    const ids = new Set(map.nodes.map(n => n.id))
    for (const w of map.wires) {
      expect(ids.has(w.from) || w.from === 'toy_board', w.id).toBe(true)
      expect(ids.has(w.to) || w.to === 'toy_board', w.id).toBe(true)
    }
    expect(Number.isFinite(map.height), g.name).toBe(true)
  }
})

test('a roll leaves every control a stage off the board owns where it was', () => {
  for (let seed = 1; seed < 40; seed++) {
    const rand = seeded(seed)
    const current = stock()
    const shown = shownOn(current)
    const next = confine(randomLook(current, rand), current, rand)
    for (const [key, owner] of OWNER_BY_KEY)
      if (!shown.has(owner)) expect(next[key], key).toBe(current[key])
  }
})

test('a nudge reaches a stage you added', () => {
  const rand = seeded(7)
  added.set(new Set(['Ring mod']))
  const current = { ...stock(), ringMix: 0.6 }
  const moved = Array.from({ length: 20 }, () =>
    confine(mutate(current, 0.3, rand), current, rand),
  ).some(b => b.ringHz !== current.ringHz)
  expect(moved).toBe(true)
})

test('a drift leg moves one stage and leaves the rest where they were', () => {
  added.set(new Set(['Ring mod']))
  const current = { ...stock(), ringMix: 0.6 }
  for (let seed = 1; seed < 20; seed++) {
    const rand = seeded(seed)
    const next = confineToOne(mutate(current, 0.3, rand), current, rand)
    const moved = new Set(
      [...OWNER_BY_KEY]
        .filter(([k]) => next[k] !== current[k])
        .map(([, o]) => o),
    )
    expect(moved.size).toBeLessThanOrEqual(1)
  }
})

test('a stage a roll took back to stock stays on the map', () => {
  const current = { ...stock(), ringMix: 0.6 }
  confine(stock(), current, seeded(3))
  expect(added.get().has('Ring mod')).toBe(true)
})

test('taking a gated stage off turns it down and keeps its other knobs', () => {
  added.set(new Set(['Ring mod']))
  const board = { ...stock(), ringMix: 0.6, ringHz: 900 }
  const off = takeOff(group('Ring mod'), board)
  expect(off.ringMix).toBe(0)
  expect(off.ringHz).toBe(900)
  expect(added.get().has('Ring mod')).toBe(false)
  expect(onBoard(off).has('Ring mod')).toBe(false)
})

test('taking the toy keyboard off pulls its fader down', () => {
  const off = takeOff(group('Plinky'), stock())
  expect(onBoard(off).has('Plinky')).toBe(false)
})

test('taking an ungated group off puts it back where it booted', () => {
  const off = takeOff(group('Wear'), { ...stock(), heatAmt: 0.4 })
  expect(off.heatAmt).toBe(DEFAULT_CONTROLS.heatAmt)
})

test('a stored list keeps the stage names the board still has', () => {
  expect([...parseAdded('["Ring mod","Gone pedal",3]')]).toEqual(['Ring mod'])
  expect(parseAdded('{').size).toBe(0)
  expect(parseAdded(null).size).toBe(0)
})

test('a stored bench renames old stages and keeps any other name as it is', () => {
  expect(
    sanitizeBench({ instruments: ['Toy keyboard', 'constructor', 'toString'] })
      .instruments,
  ).toEqual(['Plinky', 'constructor', 'toString'])
})

test('every instrument laid out on the bench has its box on the map', () => {
  const all = {
    instruments: ['Glint', 'Parlor'],
    closed: [],
    pedals: ['Gnash'],
    bends: [],
    roll: false,
    grid: false,
  }
  const on = shownOn(stock(), all)
  for (const stage of ['Glint', 'Parlor', 'Gnash'])
    expect(on.has(stage), stage).toBe(true)
  expect(on.has('Growler')).toBe(false)
})

test('taking an instrument off puts its face away', () => {
  bench.set({
    instruments: ['Glint'],
    closed: [],
    pedals: ['Gnash'],
    bends: [],
    roll: false,
    grid: false,
  })
  takeOff(group('Glint'), stock())
  takeOff(group('Gnash'), stock())
  expect(bench.get().instruments).toEqual([])
  expect(bench.get().pedals).toEqual([])
  bench.set({
    instruments: [],
    closed: [],
    pedals: [],
    bends: [],
    roll: false,
    grid: false,
  })
})
