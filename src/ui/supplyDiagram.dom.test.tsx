// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS } from '../controls.ts'
import { engine } from '../engine/engine.ts'
import { GROUPS } from './controls/index.ts'
import { OpenGroup } from './Section.tsx'
import './testDom.ts'

const GROUP = GROUPS.find(g => g.name === 'Power supply')!

const open = () =>
  render(<OpenGroup group={GROUP} onClose={() => {}} seconds={0} />)

const box = (name: string) =>
  screen.getByRole('button', { name: `${name} controls` })

test('the cells box starts open, and the stage draws no folds', () => {
  engine.writeBoard(DEFAULT_CONTROLS)
  open()
  expect(screen.getByText('Batteries')).not.toBeNull()
  expect(screen.queryByText('Watchdog')).toBeNull()
  expect(document.querySelectorAll('summary')).toHaveLength(0)
})

test('the reset chip and the clip open their own rows', () => {
  engine.writeBoard(DEFAULT_CONTROLS)
  open()
  fireEvent.click(box('reset chip'))
  expect(screen.getByText('Watchdog')).not.toBeNull()
  expect(screen.queryByText('Batteries')).toBeNull()
  fireEvent.click(box('clip'))
  expect(screen.getByText('Clip bite')).not.toBeNull()
  expect(screen.queryByText('Watchdog')).toBeNull()
})

test('a box lights when a knob it opens moves', () => {
  engine.writeBoard({ ...DEFAULT_CONTROLS, chipLatch: 0.5 })
  open()
  const lit = (name: string) =>
    box(name).querySelector('rect')!.getAttribute('class')!.includes('boxOn')
  expect(lit('reset chip')).toBe(true)
  expect(lit('clip')).toBe(false)
  expect(lit('cells')).toBe(false)
  engine.writeBoard(DEFAULT_CONTROLS)
})
