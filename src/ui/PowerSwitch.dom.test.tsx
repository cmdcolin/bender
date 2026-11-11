// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS } from '../controls.ts'
import { engine } from '../engine/engine.ts'
import { MuteCap } from './DeviceVerbs.tsx'
import './testDom.ts'

const sides = (stage: string) => {
  const group = screen.getByRole('group', { name: `${stage} power` })
  const [on, off] = within(group).getAllByRole('button')
  return { on: on!, off: off! }
}

test('a pedal panel names its power on and off, and either side switches it', () => {
  engine.writeBoard({ ...DEFAULT_CONTROLS, revMix: 0, revMute: 0 })
  render(<MuteCap stage="Boing" />)
  const { on, off } = sides('Boing')
  expect(off.getAttribute('aria-pressed')).toBe('true')
  fireEvent.click(on)
  expect(engine.controls.get().revMix).toBe(0.5)
  expect(on.getAttribute('aria-pressed')).toBe('true')
  fireEvent.click(on)
  expect(engine.controls.get().revMute).toBe(0)
  fireEvent.click(off)
  expect(engine.controls.get().revMute).toBe(1)
  expect(engine.controls.get().revMix).toBe(0.5)
  expect(off.getAttribute('aria-pressed')).toBe('true')
})

test('an instrument panel keeps its mute cap', () => {
  render(<MuteCap stage="Plinky" />)
  expect(screen.queryByRole('group', { name: 'Plinky power' })).toBeNull()
  expect(screen.getByRole('button', { name: 'mute Plinky' })).toBeTruthy()
})
