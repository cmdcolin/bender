// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS } from '../controls.ts'
import { engine } from '../engine/engine.ts'
import { FeedbackLoops } from './FeedbackLoops.tsx'
import './testDom.ts'

const box = (name: string) =>
  screen.getByRole('button', { name: `${name} controls` })

test('the bus opens on strip 1, and pressing a box swaps in its rows', () => {
  engine.writeBoard(DEFAULT_CONTROLS)
  render(<FeedbackLoops />)
  expect(screen.getByText('Amount')).not.toBeNull()
  fireEvent.click(box('strip 2'))
  expect(screen.queryByText('Amount')).toBeNull()
  expect(screen.getByText('Strip 2 time')).not.toBeNull()
  fireEvent.click(box('return amps'))
  expect(screen.getByText('Slew')).not.toBeNull()
  fireEvent.click(box('into mix'))
  expect(screen.getByText('Patched into')).not.toBeNull()
})

test('the return box names where the bus is patched', () => {
  engine.writeBoard({ ...DEFAULT_CONTROLS, fbDest: 2 })
  render(<FeedbackLoops />)
  expect(box('into chip rail')).not.toBeNull()
})

test('cross is a button only once a second strip is up', () => {
  engine.writeBoard(DEFAULT_CONTROLS)
  const { rerender } = render(<FeedbackLoops />)
  expect(screen.queryByRole('button', { name: 'cross controls' })).toBeNull()
  engine.writeBoard({ ...DEFAULT_CONTROLS, fb2Amt: 0.5 })
  rerender(<FeedbackLoops />)
  fireEvent.click(box('cross'))
  expect(screen.getByText('Cross')).not.toBeNull()
})

test('the bus lights only while a strip sends into it', () => {
  engine.writeBoard(DEFAULT_CONTROLS)
  const { container } = render(<FeedbackLoops />)
  const lit = () =>
    [...container.querySelectorAll('path')].filter(p =>
      p.getAttribute('class')?.includes('wireOn'),
    )
  expect(lit()).toHaveLength(0)
  act(() => engine.writeBoard({ ...DEFAULT_CONTROLS, fb3Amt: 0.4 }))
  expect(lit()).toHaveLength(3)
})
