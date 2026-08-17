import { expect, test } from 'vitest'
import { CONTROL_KEYS, DEFAULT_CONTROLS } from '../controls'
import { IDX, N_PARAMS, PARAM_DEFS, packParams } from './params'

test('every control has exactly one param entry', () => {
  const names = PARAM_DEFS.map(([n]) => n)
  expect(new Set(names).size).toBe(names.length)
  expect([...names].sort()).toEqual([...CONTROL_KEYS].sort())
})

test('pack layout follows table order', () => {
  const pack = packParams(DEFAULT_CONTROLS)
  expect(pack.length).toBe(N_PARAMS)
  for (const [name] of PARAM_DEFS) {
    expect(pack[IDX[name]]).toBeCloseTo(DEFAULT_CONTROLS[name], 5)
  }
})

test('defaults are finite', () => {
  for (const k of CONTROL_KEYS) {
    expect(Number.isFinite(DEFAULT_CONTROLS[k])).toBe(true)
  }
})
