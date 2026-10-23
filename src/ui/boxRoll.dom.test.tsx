// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS } from '../controls.ts'
import { engine } from '../engine/engine.ts'
import { BoxRoll } from './BoxRoll.tsx'
import { setMorph } from './morph.ts'
import './testDom.ts'

test('undo survives a roll that shows more of the box’s rows', () => {
  act(() => {
    setMorph(0)
    engine.patch({ ...DEFAULT_CONTROLS })
  })
  const { rerender } = render(
    <BoxRoll title="envelope" keys={['chipEnvCap', 'chipPwm']} />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'randomize envelope' }))
  rerender(
    <BoxRoll
      title="envelope"
      keys={['chipEnvCap', 'chipPwm', 'chipBendSpot', 'chipBendPot']}
    />,
  )
  const undo = screen.getByRole('button', {
    name: 'undo randomize of envelope',
  })
  expect(undo.hasAttribute('disabled')).toBe(false)
  fireEvent.click(undo)
  expect(engine.controls.get().chipEnvCap).toBe(DEFAULT_CONTROLS.chipEnvCap)
  expect(engine.controls.get().chipPwm).toBe(DEFAULT_CONTROLS.chipPwm)
})
