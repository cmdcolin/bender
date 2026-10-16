// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS } from '../controls'
import { ANY_CHOICE } from '../dsp/trigbus'
import { GROUPS, groupKeys, touchedCount } from './controls'
import { OpenGroup } from './Section'
import './testDom'

// Which box fires which. There are three boxes on the board and four wires
// between them, and two of the four were on the FM chip's panel with nothing
// anywhere saying they were the same kind of thing as the other two.

const patch = () => {
  const g = GROUPS.find(each => each.name === 'Trigger patch')
  if (!g) throw new Error('no Trigger patch')
  return g
}

const openPatch = () =>
  render(<OpenGroup group={patch()} onClose={() => {}} seconds={0} />)

test('each of the four trigger wires opens its own rows, drawn once', () => {
  openPatch()
  const wires: [string, string[]][] = [
    ['kit → keys', ['Kit fires keys', 'and plays']],
    ['keys → kit', ['Keys fire kit']],
    ['kit → FM', ['Struck by']],
    ['gate', ['Toy gate']],
  ]
  expect(screen.queryByText('Struck by')).toBeNull()
  for (const [wire, rows] of wires) {
    fireEvent.click(screen.getByRole('button', { name: `${wire} controls` }))
    for (const name of rows)
      expect(screen.getAllByText(name), name).toHaveLength(1)
  }
  expect(screen.queryByText('Struck by')).toBeNull()
})

test('the picture names the third box and both wires onto it', () => {
  openPatch()
  expect(screen.getByText('FM chip')).toBeTruthy()
  expect(screen.getByText('kit → FM off')).toBeTruthy()
  expect(screen.getByText('gate')).toBeTruthy()
})

test('the patch counts and rolls the chip’s two as its own', () => {
  const keys = groupKeys(patch())
  expect(keys).toContain('fmStruck')
  expect(keys).toContain('fmKeyGate')
  expect(
    touchedCount(patch(), {
      ...DEFAULT_CONTROLS,
      fmStruck: ANY_CHOICE,
      trigToKeys: 1,
    }),
  ).toBe(2)
})
