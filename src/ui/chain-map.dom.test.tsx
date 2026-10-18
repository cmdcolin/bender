// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'

import { engine } from '../engine/engine.ts'
import { App } from './App.tsx'
import './testDom.ts'

// The map is the panel's only index, so every door on it has to be reachable
// without a pointer: the boxes are links and always were. The touched dot
// beside a box is signage, not a control — it takes no click and traps no key.

const map = () =>
  [...document.querySelectorAll('svg')].find(s =>
    s.querySelector('a[data-door]'),
  )!
const touched = () => [...map().querySelectorAll('[data-touched]')]

test('every door on the map is a tab stop', () => {
  render(<App />)
  const doors = [...map().querySelectorAll('a[data-door]')]
  expect(doors.length).toBeGreaterThan(0)
  for (const door of doors) expect(door.getAttribute('href')).toBeTruthy()
})

test('the map is a named group holding its doors', () => {
  render(<App />)
  const group = screen.getByRole('group', { name: 'signal path' })
  expect(group.querySelector('a[data-door]')).not.toBeNull()
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

test('the supply bar reads the rail: amber holds 1.5 s past a sag, red on a reboot', () => {
  vi.useFakeTimers()
  render(<App />)
  const rail = () => map().parentElement!.dataset.rail
  const post = (m: Partial<ReturnType<typeof engine.meter.get>>) =>
    act(() => engine.meter.set({ ...engine.meter.get(), ...m }))
  expect(map().querySelector('[data-wire="rail"]')).not.toBeNull()
  post({ rail: 1 })
  expect(rail()).toBeUndefined()
  post({ rail: 0.5 })
  expect(rail()).toBe('low')
  post({ reboots: engine.meter.get().reboots + 1 })
  expect(rail()).toBe('reboot')
  act(() => {
    vi.advanceTimersByTime(400)
  })
  expect(rail()).toBe('low')
  post({ rail: 1 })
  expect(rail()).toBe('low')
  act(() => {
    vi.advanceTimersByTime(1500)
  })
  post({ rail: 1 })
  expect(rail()).toBeUndefined()
  vi.useRealTimers()
})

const doorsOnMap = () =>
  new Set(
    [...map().querySelectorAll('[data-door]')].map(d =>
      d.getAttribute('data-door'),
    ),
  )

test('a stock board draws the two toys and the path out, and lists the rest to add', () => {
  render(<App />)
  expect(doorsOnMap().has('Ring mod')).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: '+ add a stage' }))
  expect(screen.getByRole('menuitem', { name: 'Ring mod' })).toBeTruthy()
  expect(screen.queryByRole('menuitem', { name: 'Toy keyboard' })).toBeNull()
})

test('adding a stage opens it and puts it on the map', () => {
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: '+ add a stage' }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'Ring mod' }))
  expect(doorsOnMap().has('Ring mod')).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'close Ring mod' }))
  expect(doorsOnMap().has('Ring mod')).toBe(true)
})

test('the add menu stays open for a second stage and shuts on a press elsewhere', () => {
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: '+ add a stage' }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'Ring mod' }))
  expect(screen.queryByRole('menuitem', { name: 'Ring mod' })).toBeNull()
  const next = screen.getAllByRole('menuitem')[0]!
  const name = next.textContent
  fireEvent.click(next)
  expect(doorsOnMap().has('Ring mod')).toBe(true)
  expect(doorsOnMap().has(name)).toBe(true)
  fireEvent.pointerDown(document.body)
  expect(screen.queryByRole('menu', { name: 'add a stage' })).toBeNull()
})

test('the take-off menu lists the stages on the board and takes one off', async () => {
  render(<App />)
  act(() => {
    cut()
    engine.set('ringMix', 0.6)
  })
  await act(() => new Promise(r => setTimeout(r, 150)))
  expect(doorsOnMap().has('Ring mod')).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: '− take off a stage' }))
  expect(screen.queryByRole('menuitem', { name: 'Mix bus' })).toBeNull()
  expect(screen.queryByRole('menuitem', { name: 'Output' })).toBeNull()
  fireEvent.click(screen.getByRole('menuitem', { name: 'Ring mod' }))
  await act(() => new Promise(r => setTimeout(r, 150)))
  expect(engine.controls.get().ringMix).toBe(0)
  expect(doorsOnMap().has('Ring mod')).toBe(false)
})

test('take off turns the stage down and takes it off the map', async () => {
  render(<App />)
  act(() => {
    cut()
    engine.set('ringMix', 0.6)
  })
  act(() => {
    fireEvent.click(map().querySelector('a[data-door="Ring mod"]')!)
  })
  act(() => {
    fireEvent.click(screen.getByRole('button', { name: 'take off' }))
  })
  // The map redraws on the trailing edge of a board that is still moving.
  await act(() => new Promise(r => setTimeout(r, 150)))
  expect(engine.controls.get().ringMix).toBe(0)
  expect(doorsOnMap().has('Ring mod')).toBe(false)
})
