// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'

import { engine } from '../engine/engine.ts'
import { App } from './App.tsx'
import { openStage } from './openStage.ts'
import './testDom.ts'

test('the arc button turns Crazy up, opens Output and reads the arc', () => {
  const setWild = vi.spyOn(engine, 'setWild')
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'arc' }))
  expect(engine.controls.get().arcDepth).toBe(0.7)
  expect(openStage.get()).toBe('Output')
  expect(setWild).toHaveBeenLastCalledWith(
    expect.objectContaining({ idx: expect.any(Int16Array) }),
  )
  act(() => engine.meter.set({ ...engine.meter.get(), arc: 0.42 }))
  expect(screen.getByRole('button', { name: 'arc 42%' })).toBeTruthy()
  act(() => engine.set('arcDepth', 0))
  expect(setWild).toHaveBeenLastCalledWith(null)
  act(() => engine.meter.set({ ...engine.meter.get(), arc: 0 }))
  setWild.mockRestore()
})
