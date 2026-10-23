import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS, type Controls } from '../controls.ts'
import { ROCK } from '../drums.ts'
import { packParams } from '../engine/params.ts'
import { buildBender } from './build.ts'
import { BLOCK } from './stage.ts'
import { SUPPLY, Supplies, SupplyTap } from './supplies.ts'
import { makeIo, SR } from './testRender.ts'
import { ToyRail } from './toyRail.ts'

// Plinky's own contribution to the bus, the shared rail and both rails' reboot
// counts over `seconds` of a board with the kit playing a beat.
function run(overrides: Partial<Controls>, seconds = 3) {
  const built = buildBender(SR)
  built.transport.tune = true
  built.transport.drums = true
  const p = packParams({ ...DEFAULT_CONTROLS, ...ROCK, ...overrides })
  const io = makeIo()
  const toy: number[] = []
  const shared: number[] = []
  const chip = built.toyChip
  const inner = chip.process.bind(chip)
  chip.process = (block, params, ctx) => {
    const before = Float32Array.from(block.l.subarray(0, block.n))
    inner(block, params, ctx)
    for (let i = 0; i < block.n; i++) toy.push(block.l[i]! - before[i]!)
  }
  for (let b = 0; b < Math.ceil((seconds * SR) / BLOCK); b++) {
    built.chain.process(io, p)
    shared.push(built.rail.v)
  }
  return {
    toy,
    shared,
    sharedReboots: built.supplies.shared.rebootCount,
    secondReboots: built.supplies.second.rebootCount,
  }
}

const KIT_ON_SECOND: Partial<Controls> = {
  drumLevel: 0.8,
  drumSupply: SUPPLY.second,
}

test('every machine on the shared cells is the board as it shipped', () => {
  const stock = run({ drumLevel: 0.8, chipStarve: 0.5 })
  const second = run({ drumLevel: 0.8, chipStarve: 0.5, cell2Starve: 1 })
  expect(second).toEqual(stock)
})

test('starving the second cells leaves a toy on the bench in tune', () => {
  const bench = { ...KIT_ON_SECOND, chipSupply: SUPPLY.bench }
  const clean = run(bench)
  const starved = run({ ...bench, cell2Starve: 1, cell2Clip: 12 })
  expect(starved.secondReboots).toBeGreaterThan(0)
  expect(starved.toy).toEqual(clean.toy)

  const onSecond = { ...KIT_ON_SECOND, chipSupply: SUPPLY.second }
  expect(run({ ...onSecond, cell2Starve: 1 }).toy).not.toEqual(
    run(onSecond).toy,
  )
})

test('a reboot on the second cells leaves the shared cells alone', () => {
  const clean = run(KIT_ON_SECOND)
  const starved = run({ ...KIT_ON_SECOND, cell2Starve: 1 })
  expect(starved.secondReboots).toBeGreaterThan(0)
  expect(starved.sharedReboots).toBe(0)
  expect(starved.toy).toEqual(clean.toy)
  expect(starved.shared).toEqual(clean.shared)
})

test('a reboot on the shared cells leaves a toy on the second cells alone', () => {
  const toyOnSecond = { drumLevel: 0.8, chipSupply: SUPPLY.second }
  const clean = run(toyOnSecond)
  const starved = run({ ...toyOnSecond, chipStarve: 1 })
  expect(starved.sharedReboots).toBeGreaterThan(0)
  expect(starved.secondReboots).toBe(0)
  expect(starved.toy).toEqual(clean.toy)
})

test('the bench ignores the shared cells, which still sag without the toy', () => {
  const bench = { drumLevel: 0.8, chipSupply: SUPPLY.bench }
  const clean = run(bench)
  const starved = run({ ...bench, chipStarve: 1, chipClipHz: 12 })
  expect(starved.sharedReboots).toBeGreaterThan(0)
  expect(Math.min(...starved.shared)).toBeLessThan(0.3)
  expect(starved.toy).toEqual(clean.toy)
})

test('moving a machine to another supply is not a reboot', () => {
  const supplies = new Supplies(SR, new ToyRail(SR), 1)
  const tap = new SupplyTap(supplies)
  supplies.second.rebootCount = 4
  tap.pick(SUPPLY.second)
  expect(tap.rebooted()).toBe(false)
  supplies.second.rebootCount++
  expect(tap.rebooted()).toBe(true)
  tap.pick(SUPPLY.bench)
  expect(tap.rebooted()).toBe(false)
})
