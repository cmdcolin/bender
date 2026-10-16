// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS } from '../controls'
import { engine } from '../engine/engine'
import { MicPatch } from './MicPatch'
import './testDom'

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
