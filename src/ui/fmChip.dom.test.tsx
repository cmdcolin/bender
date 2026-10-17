// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS } from '../controls.ts'
import { engine } from '../engine/engine.ts'
import { FmChipDiagram } from './FmChipDiagram.tsx'
import './testDom.ts'

const box = (name: string) =>
  screen.getByRole('button', { name: `${name} controls` })

test('the chip opens on the modulator, and each box swaps in its own rows', () => {
  engine.writeBoard(DEFAULT_CONTROLS)
  render(<FmChipDiagram verbs={() => null} />)
  expect(screen.getByText('Brightness')).not.toBeNull()
  fireEvent.click(box('carrier'))
  expect(screen.queryByText('Brightness')).toBeNull()
  expect(screen.getByText('Car ratio')).not.toBeNull()
  fireEvent.click(box('bus'))
  expect(screen.getByText('Data line')).not.toBeNull()
  expect(screen.queryByText('Data fault')).toBeNull()
  fireEvent.click(box('die'))
  expect(screen.getByText('Allocator')).not.toBeNull()
})

test('a box says how many of its knobs have moved', () => {
  engine.writeBoard({ ...DEFAULT_CONTROLS, fmDataFault: 1 })
  render(<FmChipDiagram verbs={() => null} />)
  expect(box('bus').textContent).toMatch(/1 moved/)
  expect(box('die').textContent).toMatch(/stock/)
})
