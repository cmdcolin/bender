import { expect, test } from 'vitest'

import { PRESETS } from './presets/index.ts'
import { presetMatches, presetStages } from './presetSearch.ts'

const named = (name: string) => PRESETS.find(p => p.name === name)!

test('a preset is found by its name, its blurb and the stages it moves', () => {
  const p = named('flat batteries')
  expect(presetMatches(p, 'flat')).toBe(true)
  expect(presetMatches(p, 'FLAT batt')).toBe(true)
  expect(presetMatches(p, 'nothing like this')).toBe(false)
  expect(presetMatches(p, '')).toBe(true)
  const stage = [...presetStages(p)][0]!
  expect(presetMatches(p, stage)).toBe(true)
})

test('every preset moves at least one stage off stock', () => {
  for (const p of PRESETS)
    expect(presetStages(p).size, p.name).toBeGreaterThan(0)
})
