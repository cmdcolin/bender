// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
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
  const g = GROUPS.find(g => g.name === 'Trigger patch')
  if (!g) throw new Error('no Trigger patch')
  return g
}

const openPatch = () =>
  render(<OpenGroup group={patch()} onClose={() => {}} seconds={0} />)

test('all four trigger wires are rows on the one panel, drawn once each', () => {
  openPatch()
  for (const name of [
    'Kit fires keys',
    'and plays',
    'Keys fire kit',
    'Struck by',
    'Toy gate',
  ])
    expect(screen.getAllByText(name), name).toHaveLength(1)
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
