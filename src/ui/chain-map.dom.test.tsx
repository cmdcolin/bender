// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { DEFAULT_CONTROLS } from '../controls'
import { engine } from '../engine/engine'
import { App } from './App'
import './testDom'

// The map is the panel's only index, so everything on it has to be reachable
// without a pointer: the boxes are links and always were, and the number over a
// box — the way back — is a verb with nowhere to link to.

const map = () => document.querySelector('svg')!
const resets = () => [...map().querySelectorAll('[data-reset]')]

test('every door on the map is a tab stop', () => {
  render(<App />)
  const doors = [...map().querySelectorAll('a[data-door]')]
  expect(doors.length).toBeGreaterThan(0)
  for (const door of doors) expect(door.getAttribute('href')).toBeTruthy()
})

test('a stage with nothing moved offers no way back', () => {
  render(<App />)
  expect(resets()).toHaveLength(0)
})

test('the number over a box is a button, named and reachable', () => {
  act(() => engine.set('revMix', 0.5))
  render(<App />)
  const back = resets()
  expect(back.length).toBeGreaterThan(0)
  for (const el of back) {
    expect(el.getAttribute('role')).toBe('button')
    expect(el.getAttribute('tabindex')).toBe('0')
    expect(el.getAttribute('aria-label')).toMatch(/back where it booted/)
  }
})

// A board arrives however the morph row says boards arrive, and the way back is
// a board like any other — so these press cut first, or the assertion reads a
// board still in flight.
const cut = () =>
  fireEvent.change(screen.getByDisplayValue(/^morph:/), {
    target: { value: '0' },
  })

// Enter over the number puts the stage back, the same as clicking it.
test('enter on the number puts the stage back', () => {
  render(<App />)
  act(() => {
    cut()
    engine.armStep()
    engine.set('revMix', 0.5)
  })
  act(() => fireEvent.keyDown(resets()[0]!, { key: 'Enter', bubbles: true }))
  expect(engine.controls.get().revMix).toBe(DEFAULT_CONTROLS.revMix)
})

// Space is the run/stop line over the whole window, so a space the map has
// taken must not also reach the machines.
test('space on the number resets it and stops there', () => {
  const run = vi.spyOn(engine, 'toggleRun').mockImplementation(() => {})
  render(<App />)
  act(() => {
    cut()
    engine.set('revMix', 0.5)
  })
  act(() =>
    fireEvent.keyDown(resets()[0]!, { key: ' ', code: 'Space', bubbles: true }),
  )
  expect(engine.controls.get().revMix).toBe(DEFAULT_CONTROLS.revMix)
  expect(run).not.toHaveBeenCalled()
  run.mockRestore()
})

// And a space anywhere else on the map still belongs to the transport.
test('space away from a number is still the run line', () => {
  const run = vi.spyOn(engine, 'toggleRun').mockImplementation(() => {})
  render(<App />)
  act(() =>
    fireEvent.keyDown(map(), { key: ' ', code: 'Space', bubbles: true }),
  )
  expect(run).toHaveBeenCalledTimes(1)
  run.mockRestore()
})
