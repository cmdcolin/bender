// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'

import { engine } from '../engine/engine.ts'
import { EffectPads } from './EffectPads.tsx'
import './testDom.ts'

const pads = (hold: boolean) => (
  <EffectPads dest="toy" names={['laser', 'siren']} tips={[]} hold={hold} />
)
const laser = () => screen.getByRole('button', { name: 'laser' })

test('a pad lets go with the finger when hold is off', () => {
  const sfx = vi.spyOn(engine, 'sfx')
  render(pads(false))
  fireEvent.pointerDown(laser())
  fireEvent.pointerUp(laser())
  expect(sfx.mock.calls).toEqual([
    ['toy', 0, true],
    ['toy', 0, false],
  ])
  sfx.mockRestore()
})

test('with hold on, a pad stays down until pressed again or hold goes off', () => {
  const sfx = vi.spyOn(engine, 'sfx')
  const { rerender } = render(pads(true))
  fireEvent.pointerDown(laser())
  fireEvent.pointerUp(laser())
  expect(sfx.mock.calls).toEqual([['toy', 0, true]])
  expect(laser().getAttribute('aria-pressed')).toBe('true')

  fireEvent.pointerDown(laser())
  fireEvent.pointerUp(laser())
  expect(sfx.mock.calls.at(-1)).toEqual(['toy', 0, false])

  fireEvent.pointerDown(laser())
  rerender(pads(false))
  expect(sfx.mock.calls.at(-1)).toEqual(['toy', 0, false])
  expect(laser().getAttribute('aria-pressed')).toBe('false')
  sfx.mockRestore()
})
