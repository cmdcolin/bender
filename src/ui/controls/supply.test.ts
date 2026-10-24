import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS } from '../../controls.ts'
import { EVENT } from '../../drums.ts'
import { SUPPLY } from '../../dsp/supplies.ts'
import { sagsSharedCells, sharedLoads } from './supply.ts'

test('a stock board puts nothing else on the shared cells', () => {
  expect(sharedLoads(DEFAULT_CONTROLS)).toEqual([])
})

test('loads outside the supply panel are named', () => {
  const c = {
    ...DEFAULT_CONTROLS,
    drumLevel: 0.8,
    drumTrigLoad: 0.5,
    couple: 0.3,
    drumEvent3: EVENT.drop,
  }
  expect(sharedLoads(c)).toEqual([
    'Clatter’s trigger load',
    'the kit’s drop and reboot steps',
    'Wear’s coupling',
  ])
})

test('a kit on the bench supply loads nothing', () => {
  const c = {
    ...DEFAULT_CONTROLS,
    drumLevel: 0.8,
    drumTrigLoad: 0.5,
    drumSupply: SUPPLY.bench,
  }
  expect(sharedLoads(c)).toEqual([])
})

test('a control is tagged only while it loads the shared cells', () => {
  const c = { ...DEFAULT_CONTROLS, drumLevel: 0.8, drumTrigLoad: 0.5 }
  expect(sagsSharedCells(c, 'drumTrigLoad')).toBe(true)
  expect(sagsSharedCells(c, 'couple')).toBe(false)
  expect(
    sagsSharedCells({ ...c, drumSupply: SUPPLY.bench }, 'drumTrigLoad'),
  ).toBe(false)
})
