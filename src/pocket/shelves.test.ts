import { expect, test } from 'vitest'

import { PRESETS } from '../ui/presets/index.ts'
import { SHELVES, leadOf } from './shelves.ts'

test('every preset sits on exactly one shelf', () => {
  const shelved = SHELVES.flatMap(s => s.presets.map(p => p.name))
  expect(shelved.toSorted()).toEqual(PRESETS.map(p => p.name).toSorted())
})

test('a preset goes on the shelf of the machine it turns up loudest', () => {
  const lead = (name: string) => leadOf(PRESETS.find(p => p.name === name)!)
  expect(lead('boom bap')).toBe('drums')
  expect(lead('mono bass')).toBe('synth')
  expect(lead('mall strings')).toBe('keys')
  expect(lead('dying toy')).toBe('toy')
})

test('no shelf is empty', () => {
  for (const s of SHELVES) expect(s.presets.length).toBeGreaterThan(0)
})
