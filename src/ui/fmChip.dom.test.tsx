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

test('every wire points with a head drawn in its own look', () => {
  engine.writeBoard(DEFAULT_CONTROLS)
  const { container } = render(<FmChipDiagram verbs={() => null} />)
  const wires = [...container.querySelectorAll('path[marker-end]')]
  expect(
    wires.filter(w => w.getAttribute('class')!.includes('wireOn')).length,
  ).toBeGreaterThan(0)
  for (const wire of wires) {
    const id = wire.getAttribute('marker-end')!.slice('url(#'.length, -1)
    const head = container.querySelector(`marker[id="${id}"] path`)
    expect(head).not.toBeNull()
    const lit = wire.getAttribute('class')!.includes('wireOn')
    expect(head!.getAttribute('class')!.includes('headOn')).toBe(lit)
  }
})
