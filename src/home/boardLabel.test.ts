import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS } from '../controls.ts'
import { applyPreset } from '../ui/presets/apply.ts'
import { PRESETS } from '../ui/presets/table.ts'
import { boardHash } from '../ui/share.ts'
import { boardLabel } from './boardLabel.ts'

const preset = (name: string) => {
  const found = PRESETS.find(p => p.name === name)
  if (found === undefined) throw new Error(`no preset ${name}`)
  return applyPreset(found, DEFAULT_CONTROLS)
}

test('a board that is a preset is called by its name', () => {
  expect(boardLabel(boardHash('', preset('dawn chorus'))).text).toBe(
    'dawn chorus',
  )
})

test('a bent preset is called after the one it came from', () => {
  const bent = { ...preset('dawn chorus'), dlyFb: 0.77 }
  expect(boardLabel(boardHash('', bent))).toEqual({
    preset: 'dawn chorus',
    text: 'bent from dawn chorus',
  })
})

test('a board near stock says so', () => {
  expect(boardLabel('').text).toBe('stock')
  expect(
    boardLabel(boardHash('', { ...DEFAULT_CONTROLS, dlyFb: 0.77 })).text,
  ).toBe('bent from stock')
})
