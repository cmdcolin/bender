import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS } from '../controls.ts'
import { applyPreset } from '../ui/presets/apply.ts'
import { PRESETS } from '../ui/presets/table.ts'
import { boardHash } from '../ui/share.ts'
import { presetOf } from './boardLabel.ts'

const dawn = PRESETS.find(p => p.name === 'dawn chorus')
if (dawn === undefined) throw new Error('no preset dawn chorus')
const board = applyPreset(dawn, DEFAULT_CONTROLS)

test('a board that is a preset is called by its name', () => {
  expect(presetOf(boardHash('', board))).toBe('dawn chorus')
})

test('a bent board is not a preset', () => {
  expect(presetOf(boardHash('', { ...board, dlyFb: 0.77 }))).toBeUndefined()
})
