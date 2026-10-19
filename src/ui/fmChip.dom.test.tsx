// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS } from '../controls.ts'
import { engine } from '../engine/engine.ts'
import { CHANNELS } from './controls/index.ts'
import { FmChipDiagram } from './FmChipDiagram.tsx'
import './testDom.ts'

const FM_TAP = CHANNELS.find(c => c.name === 'Glint')!.tap

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
  expect(screen.queryByText('Allocator')).toBeNull()
  expect(screen.queryByText('Data line')).toBeNull()
})

test('a box lists its sliders before its buttons and dropdowns', () => {
  engine.writeBoard(DEFAULT_CONTROLS)
  render(<FmChipDiagram verbs={() => null} />)
  fireEvent.click(box('key'))
  const before = (a: string, b: string) =>
    screen.getByText(a).compareDocumentPosition(screen.getByText(b)) &
    Node.DOCUMENT_POSITION_FOLLOWING
  expect(before('Note length', 'Kit voice that plays this chip')).toBeTruthy()
})

const accent = (name: string) =>
  [box(name).querySelector('rect')!, box(name).querySelector('text')!].map(e =>
    /On/.test(e.getAttribute('class') ?? ''),
  )

test('a box goes accent, frame and name, when a knob inside it is off stock', () => {
  engine.writeBoard({ ...DEFAULT_CONTROLS, fmDataFault: 1 })
  render(<FmChipDiagram verbs={() => null} />)
  expect(accent('bus')).toEqual([true, true])
  expect(accent('die')).toEqual([false, false])
})

const lit = (wire: Element) => wire.getAttribute('class')!.includes('wireOn')
const wires = (container: HTMLElement) => [
  ...container.querySelectorAll('path[marker-end]'),
]
const pathWires = (container: HTMLElement) =>
  wires(container).filter(
    w => w.closest('svg')!.getAttribute('aria-label') === 'glint signal path',
  )

test('the path lights only while the chip is sounding', () => {
  engine.writeBoard(DEFAULT_CONTROLS)
  act(() => engine.sounding.set(0))
  const { container } = render(<FmChipDiagram verbs={() => null} />)
  expect(pathWires(container).filter(lit)).toHaveLength(0)
  act(() => engine.sounding.set(1 << FM_TAP))
  expect(pathWires(container).filter(lit)).toHaveLength(4)
  act(() => engine.sounding.set(0))
})

test('every wire points with a head drawn in its own look', () => {
  engine.writeBoard(DEFAULT_CONTROLS)
  act(() => engine.sounding.set(1 << FM_TAP))
  const { container } = render(<FmChipDiagram verbs={() => null} />)
  for (const wire of wires(container)) {
    const id = wire.getAttribute('marker-end')!.slice('url(#'.length, -1)
    const head = container.querySelector(`marker[id="${id}"] path`)
    expect(head).not.toBeNull()
    expect(head!.getAttribute('class')!.includes('headOn')).toBe(lit(wire))
  }
  act(() => engine.sounding.set(0))
})
