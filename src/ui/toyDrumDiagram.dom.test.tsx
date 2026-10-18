// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS } from '../controls.ts'
import { engine } from '../engine/engine.ts'
import { GROUPS } from './controls/index.ts'
import { VOICE_BOXES } from './toyBoxKeys.ts'
import { ToyDrumDiagram } from './ToyDrumDiagram.tsx'
import './testDom.ts'

const box = (name: string) =>
  screen.getByRole('button', { name: `${name} controls` })

test('each box opens its own rows and a second press puts them away', () => {
  engine.writeBoard(DEFAULT_CONTROLS)
  render(<ToyDrumDiagram />)
  expect(screen.queryByText('Ring')).toBeNull()
  fireEvent.click(box('tanks'))
  expect(screen.getByText('Ring')).not.toBeNull()
  expect(screen.queryByText('Snappy')).toBeNull()
  fireEvent.click(box('noise'))
  expect(screen.getByText('Snappy')).not.toBeNull()
  expect(screen.queryByText('Ring')).toBeNull()
  fireEvent.click(box('noise'))
  expect(screen.queryByText('Snappy')).toBeNull()
})

test('the amps and the converter are drawn and open nothing', () => {
  engine.writeBoard(DEFAULT_CONTROLS)
  render(<ToyDrumDiagram />)
  expect(screen.queryByRole('button', { name: 'amps controls' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'DAC controls' })).toBeNull()
})

test('a box goes accent when a knob inside it is off stock', () => {
  engine.writeBoard({ ...DEFAULT_CONTROLS, drumBankFm: 0.5 })
  render(<ToyDrumDiagram />)
  expect(
    box('metal bank').querySelector('rect')!.getAttribute('class'),
  ).toMatch(/boxOn/)
  expect(box('tanks').querySelector('rect')!.getAttribute('class')).not.toMatch(
    /boxOn/,
  )
})

test('every knob in the voices fold sits in one of the boxes', () => {
  const drums = GROUPS.find(g => g.name === 'Toy drums')!
  const fold = drums.sliders
    .filter(d => d.part === 'inside the voices')
    .map(d => d.key)
  expect(Object.values(VOICE_BOXES).flat().toSorted()).toEqual(fold.toSorted())
})
