// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'

import { engine } from '../engine/engine'
import { App } from './App'
import './testDom'

// The map is the panel's only index, so every door on it has to be reachable
// without a pointer: the boxes are links and always were. The touched dot
// beside a box is signage, not a control — it takes no click and traps no key.

const map = () => document.querySelector('svg')!
const touched = () => [...map().querySelectorAll('[data-touched]')]

test('every door on the map is a tab stop', () => {
  render(<App />)
  const doors = [...map().querySelectorAll('a[data-door]')]
  expect(doors.length).toBeGreaterThan(0)
  for (const door of doors) expect(door.getAttribute('href')).toBeTruthy()
})

test('a stage with nothing moved draws no touched mark', () => {
  render(<App />)
  expect(touched()).toHaveLength(0)
})

test('a touched stage draws a mark that is not a button', () => {
  act(() => engine.set('revMix', 0.5))
  render(<App />)
  const marks = touched()
  expect(marks.length).toBeGreaterThan(0)
  for (const mark of marks) {
    expect(mark.getAttribute('role')).toBeNull()
    expect(mark.hasAttribute('data-reset')).toBe(false)
  }
})

// A board arrives however the morph row says boards arrive, so this cuts it
// first, or the assertion below reads a board still in flight.
const cut = () =>
  fireEvent.change(screen.getByDisplayValue(/^morph:/), {
    target: { value: '0' },
  })

// The mark used to double as a reset button; this is the regression, aimed at
// proving it no longer does.
test('clicking the touched mark does not put the stage back', () => {
  render(<App />)
  act(() => {
    cut()
    engine.set('revMix', 0.5)
  })
  act(() => {
    fireEvent.click(touched()[0]!)
  })
  expect(engine.controls.get().revMix).toBe(0.5)
})

// Space used to be trapped over the number to keep it off the run line; now
// there is nothing to trap it, over a touched stage or anywhere else.
test('space over a touched mark still reaches the run line', () => {
  const run = vi.spyOn(engine, 'toggleRun').mockImplementation(() => {})
  render(<App />)
  act(() => {
    cut()
    engine.set('revMix', 0.5)
  })
  act(() => {
    fireEvent.keyDown(touched()[0]!, {
      key: ' ',
      code: 'Space',
      bubbles: true,
    })
  })
  expect(run).toHaveBeenCalledTimes(1)
  run.mockRestore()
})
