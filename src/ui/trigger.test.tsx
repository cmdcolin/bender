// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS } from '../controls.ts'
import { ANY_CHOICE } from '../dsp/trigbus.ts'
import { engine } from '../engine/engine.ts'
import { GROUPS, groupKeys, touchedCount } from './controls/index.ts'
import { OpenGroup } from './Section.tsx'
import './testDom.ts'

// Which box plays which. Five machines on the board and nine wires between
// them: the kit and the toy keyboard each way, and the kit's hits and the
// keyboard's notes onto each of the three machines with no sequencer of its own.

const patch = () => {
  const g = GROUPS.find(each => each.name === 'Trigger patch')
  if (!g) throw new Error('no Trigger patch')
  return g
}

const openPatch = () =>
  render(<OpenGroup group={patch()} onClose={() => {}} seconds={0} />)

test('each trigger wire opens its own rows, drawn once', () => {
  openPatch()
  const wires: [string, string[]][] = [
    [
      'kit → keys',
      ['Kit voice that plays the toy keyboard', 'The note it plays'],
    ],
    ['keys → kit', ['Kit voice the toy keyboard plays']],
    ['kit → FM chip', ['Kit voice that plays this chip']],
    ['keys → FM chip', ['Plays the toy keyboard’s notes']],
    ['kit → Home keyboard', ['Kit voice that plays this keyboard']],
    ['keys → Mono synth', ['Plays the toy keyboard’s notes']],
  ]
  expect(screen.queryByText('Kit voice that plays this chip')).toBeNull()
  for (const [wire, rows] of wires) {
    fireEvent.click(screen.getByRole('button', { name: `${wire} controls` }))
    for (const name of rows)
      expect(screen.getAllByText(name), name).toHaveLength(1)
  }
  expect(screen.queryByText('Kit voice that plays this chip')).toBeNull()
})

test('pressing a machine opens both of its rows', () => {
  openPatch()
  fireEvent.click(screen.getByRole('button', { name: 'Mono synth controls' }))
  expect(screen.getAllByText('Kit voice that plays this synth')).toHaveLength(1)
  expect(screen.getAllByText('Plays the toy keyboard’s notes')).toHaveLength(1)
})

test('a machine’s name goes grey once nothing plays it', () => {
  const { container } = render(
    <OpenGroup group={patch()} onClose={() => {}} seconds={0} />,
  )
  const ink = (name: string) =>
    [...container.querySelectorAll('svg text')]
      .find(t => t.textContent === name)!
      .getAttribute('fill')
  expect(ink('Mono synth')).toBe('var(--fg)')
  act(() => {
    engine.set('fmKeyGate', 1)
    engine.set('fmStruck', 1)
  })
  expect(ink('FM chip')).toBe('var(--fg)')
  act(() => {
    engine.set('monoKeyGate', 1)
    engine.set('pcmKeyGate', 1)
  })
  expect(ink('Mono synth')).toBe('var(--fg4)')
  expect(ink('Home keyboard')).toBe('var(--fg4)')
  expect(screen.queryByText('kick hits')).toBeNull()
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
