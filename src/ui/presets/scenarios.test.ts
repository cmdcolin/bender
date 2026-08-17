import { expect, test } from 'vitest'
import { mulberry32 } from '../../dsp/util/rng'
import { BENDS, BEND_SLOT_KEYS } from '../controls'
import { SCENARIOS } from './scenarios'
import { mine, yours } from './testBoard'

const scenarioNamed = (name: string) =>
  SCENARIOS.find(s => s.name === name)!.roll

test('the cross-cutting rolls keep the song, the pattern and your levels', () => {
  const before = mine()
  for (const scenario of SCENARIOS) {
    for (let seed = 1; seed <= 20; seed++) {
      const after = scenario.roll(before, mulberry32(seed))
      expect(yours(after), scenario.name).toEqual(yours(before))
      expect(after.drumBpm, scenario.name).toBe(before.drumBpm)
    }
  }
})

test('rewire shuffles the slots without retuning a single bend', () => {
  const before = {
    ...mine(),
    bendSlot0: 1,
    bendSlot1: 4,
    bendSlot2: 0,
    ringHz: 412,
    combHz: 91,
    filtRes: 1.1,
  }
  const wiring = new Set<string>()
  for (let seed = 1; seed <= 20; seed++) {
    const after = scenarioNamed('rewire')(before, mulberry32(seed))
    expect(BEND_SLOT_KEYS.map(k => after[k]).sort()).toEqual(
      BEND_SLOT_KEYS.map(k => before[k]).sort(),
    )
    expect(after.ringHz).toBe(before.ringHz)
    expect(after.combHz).toBe(before.combHz)
    expect(after.filtRes).toBe(before.filtRes)
    wiring.add(JSON.stringify(BEND_SLOT_KEYS.map(k => after[k])))
  }
  expect(wiring.size).toBeGreaterThan(1)
})

test('one bend puts exactly one bend on the board, turned up', () => {
  const roll = scenarioNamed('one bend')
  for (let seed = 1; seed <= 30; seed++) {
    const after = roll(mine(), mulberry32(seed))
    const patched = BEND_SLOT_KEYS.map(k => after[k]).filter(v => v !== 0)
    expect(patched.length).toBe(1)
    const bend = BENDS[patched[0]! - 1]!
    expect(after[bend.mix]).toBeGreaterThan(0.5)
  }
})

test('wreck it winds up everything that can run away', () => {
  const roll = scenarioNamed('wreck it')
  for (let seed = 1; seed <= 20; seed++) {
    const after = roll(mine(), mulberry32(seed))
    expect(after.fbAmt).toBeGreaterThan(0.9)
    expect(after.dlyFb).toBeGreaterThan(1)
    expect(after.bits).toBeLessThan(8)
  }
})
