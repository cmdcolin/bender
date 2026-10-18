// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS } from '../controls.ts'
import { engine } from '../engine/engine.ts'
import { CHANNELS } from './controls/index.ts'
import { FmChipDiagram } from './FmChipDiagram.tsx'
import './testDom.ts'

const FM_TAP = CHANNELS.find(c => c.name === 'FM chip')!.tap

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

const lit = (wire: Element) => wire.getAttribute('class')!.includes('wireOn')
const wires = (container: HTMLElement) => [
  ...container.querySelectorAll('path[marker-end]'),
]

test('the path lights only while the chip is sounding', () => {
  engine.writeBoard(DEFAULT_CONTROLS)
  act(() => engine.sounding.set(0))
  const { container } = render(<FmChipDiagram verbs={() => null} />)
  expect(wires(container).filter(lit)).toHaveLength(0)
  act(() => engine.sounding.set(1 << FM_TAP))
  expect(wires(container).filter(lit)).toHaveLength(4)
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

test('a box lights the reading that moved, or its name when no reading shows the knob', () => {
  const classes = () =>
    [...box('modulator').querySelectorAll('text')].map(t =>
      /On/.test(t.getAttribute('class') ?? ''),
    )
  engine.writeBoard({ ...DEFAULT_CONTROLS, fmBright: 0.9 })
  const { unmount } = render(<FmChipDiagram verbs={() => null} />)
  expect(classes()).toEqual([false, true, false])
  unmount()
  engine.writeBoard({ ...DEFAULT_CONTROLS, fmModDecay: 2 })
  render(<FmChipDiagram verbs={() => null} />)
  expect(classes()).toEqual([true, false, false])
})
