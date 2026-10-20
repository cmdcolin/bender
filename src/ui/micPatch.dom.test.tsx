// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS } from '../controls.ts'
import { engine } from '../engine/engine.ts'
import { MicPatch } from './MicPatch.tsx'
import './testDom.ts'

const jack = (name: string) =>
  screen.getByRole('button', { name: `solder the mic to ${name}` })

test('pressing a jack solders the mic there, and only that jack reads as pressed', () => {
  engine.writeBoard(DEFAULT_CONTROLS)
  render(<MicPatch />)
  expect(jack('mix').getAttribute('aria-pressed')).toBe('true')
  fireEvent.click(jack('osc FM'))
  expect(engine.controls.get().micPatch).toBe(2)
  expect(jack('osc FM').getAttribute('aria-pressed')).toBe('true')
  expect(jack('mix').getAttribute('aria-pressed')).toBe('false')
})

test('the wire lights only once the mic is turned up', () => {
  engine.writeBoard(DEFAULT_CONTROLS)
  const { container } = render(<MicPatch />)
  const lit = () =>
    container.querySelector('path[class*="wire"]')!.getAttribute('class')!
  expect(lit()).not.toContain('wireOn')
  act(() => engine.set('micLevel', 0.5))
  expect(lit()).toContain('wireOn')
})

test('pressing the mic opens no card, since its level is a row already', () => {
  engine.writeBoard(DEFAULT_CONTROLS)
  render(<MicPatch />)
  const mic = screen.getByRole('button', { name: 'mic controls' })
  fireEvent.click(mic)
  expect(screen.queryByRole('region')).toBeNull()
})
