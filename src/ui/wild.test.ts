import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS } from '../controls.ts'
import { onBoard } from './chain-map.ts'
import { OWNER_BY_KEY, sliderFor } from './controls/index.ts'
import { CLOCK_KEYS, YOURS } from './presets/yours.ts'
import { wildBoard, wildControls } from './wild.ts'

import type { Controls } from '../controls.ts'

const calm: Controls = {
  ...DEFAULT_CONTROLS,
  drumLevel: 0.8,
  dlyMix: 0.3,
  filtMix: 0.5,
  bendSlot0: 6,
}
const shown = onBoard(calm)

const moved = (c: Controls, seed: number) => {
  const wild = wildControls(c, wildBoard(c, seed, shown))
  return Object.keys(wild).filter(
    k => wild[k as keyof Controls] !== c[k as keyof Controls],
  ) as (keyof Controls)[]
}

test('one seed rolls one wild board, and another seed another', () => {
  expect(wildBoard(calm, 7, shown)).toEqual(wildBoard(calm, 7, shown))
  expect(moved(calm, 7)).not.toEqual(moved(calm, 8))
})

test('the wild board moves knobs on the stages you can hear and leaves the rest', () => {
  const keys = moved(calm, 3)
  expect(keys.length).toBeGreaterThan(8)
  for (const key of keys) {
    const owner = OWNER_BY_KEY.get(key)!
    expect([
      owner,
      shown.has(owner) || ['Power supply', 'Wear', 'Brownout'].includes(owner),
    ]).toEqual([owner, true])
    expect(YOURS.has(key)).toBe(false)
    expect(CLOCK_KEYS.has(key)).toBe(false)
    expect(sliderFor(key).role).not.toBe('level')
  }
  expect(keys).toContain('drumWander')
})

test('turning one knob leaves every other knob’s wild end where it was', () => {
  const before = wildControls(calm, wildBoard(calm, 3, shown))
  const nudged = { ...calm, dlyFb: calm.dlyFb + 0.05 }
  const after = wildControls(nudged, wildBoard(nudged, 3, shown))
  for (const key of Object.keys(before) as (keyof Controls)[])
    if (key !== 'dlyFb') expect([key, after[key]]).toEqual([key, before[key]])
})

test('every wild value sits on its control’s travel and step', () => {
  for (let seed = 0; seed < 20; seed++) {
    const wild = wildControls(calm, wildBoard(calm, seed, shown))
    for (const key of moved(calm, seed)) {
      const def = sliderFor(key)
      expect(wild[key]).toBeGreaterThanOrEqual(def.min)
      expect(wild[key]).toBeLessThanOrEqual(def.max)
    }
  }
})
