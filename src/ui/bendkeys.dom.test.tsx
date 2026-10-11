// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import { engine } from '../engine/engine'
import { BendKeys } from './BendKeys'
import {
  bendDeal,
  bendName,
  bendStepName,
  bendSwell,
  redealEvery,
  toggleBendStep,
} from './bendKeys'
import { letterKeys } from './letters'
import './testDom'

const stroke = (type: 'keydown' | 'keyup', key: string, shiftKey = false) =>
  act(() => {
    fireEvent(window, new KeyboardEvent(type, { key, shiftKey, bubbles: true }))
  })

const heldNames = () => [...engine.held.get().keys()]

const tick = (n: number) =>
  act(() => {
    engine.meter.set({ ...engine.meter.get(), tick: n })
  })

afterEach(() => {
  window.history.replaceState(null, '', '/')
  vi.useRealTimers()
})

const open = () => {
  render(<BendKeys morphSeconds={0} />)
  act(() => {
    letterKeys.set('bends')
  })
}

test('the row deals itself a hand on first draw', () => {
  render(<BendKeys morphSeconds={0} />)
  expect(bendDeal.get()).toHaveLength(16)
  expect(screen.getByRole('button', { name: 'bend' })).toBeTruthy()
})

test('the switch sends the letters here and back to the toy', () => {
  render(<BendKeys morphSeconds={0} />)
  fireEvent.click(screen.getByRole('button', { name: 'bend' }))
  expect(letterKeys.get()).toBe('bends')
  fireEvent.click(screen.getByRole('button', { name: 'letters bend' }))
  expect(letterKeys.get()).toBe('toy')
})

test('a letter holds its throw while down and lets go on the way up', () => {
  open()
  stroke('keydown', 'a')
  expect(heldNames()).toEqual([bendName('a')])
  stroke('keyup', 'a')
  expect(heldNames()).toEqual([])
})

test('the letters do nothing while a keybed has them', () => {
  render(<BendKeys morphSeconds={0} />)
  stroke('keydown', 'a')
  expect(heldNames()).toEqual([])
})

test('shift pins a key down until it is pressed again, and z lets go', () => {
  open()
  stroke('keydown', 'A', true)
  stroke('keyup', 'A', true)
  expect(heldNames()).toEqual([bendName('a')])
  stroke('keydown', 's')
  stroke('keyup', 's')
  expect(heldNames()).toEqual([bendName('a')])
  stroke('keydown', 'a')
  stroke('keyup', 'a')
  expect(heldNames()).toEqual([])

  stroke('keydown', 'D', true)
  stroke('keyup', 'D', true)
  stroke('keydown', 'z')
  expect(heldNames()).toEqual([])
})

test('x deals a new hand and lets go of the old one', () => {
  open()
  const before = bendDeal.get()
  stroke('keydown', 'A', true)
  stroke('keyup', 'A', true)
  stroke('keydown', 'x')
  expect(heldNames()).toEqual([])
  expect(bendDeal.get()).not.toBe(before)
  expect(bendDeal.get()).toHaveLength(16)
})

test('a pad takes a pointer the same way', () => {
  open()
  const pad = screen.getByText('a').closest('button')!
  act(() => {
    fireEvent.pointerDown(pad, { pointerId: 1 })
  })
  expect(heldNames()).toEqual([bendName('a')])
  act(() => {
    fireEvent.pointerUp(pad, { pointerId: 1 })
  })
  expect(heldNames()).toEqual([])
})

test('a lit step of the bend row holds that step’s key for the step', () => {
  open()
  act(() => {
    toggleBendStep(0)
    toggleBendStep(2)
    engine.setDrumsPlaying(true)
  })
  tick(1)
  expect(heldNames()).toEqual([])
  tick(16)
  expect(heldNames()).toEqual([bendStepName('a')])
  tick(17)
  expect(heldNames()).toEqual([])
  tick(18)
  expect(heldNames()).toEqual([bendStepName('s')])
  act(() => engine.setDrumsPlaying(false))
  expect(heldNames()).toEqual([])
  tick(34)
  expect(heldNames()).toEqual([])
})

test('redeal every bar deals a new hand as the bar comes round', () => {
  open()
  act(() => {
    redealEvery.set(1)
    engine.setDrumsPlaying(true)
  })
  const first = bendDeal.get()
  tick(3)
  expect(bendDeal.get()).toBe(first)
  tick(16)
  expect(bendDeal.get()).not.toBe(first)
})

test('a swelling key walks in over the morph time and falls back', () => {
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'performance'] })
  act(() => {
    letterKeys.set('bends')
    bendSwell.set(true)
  })
  render(<BendKeys morphSeconds={1} />)
  const k = bendDeal.get()[0]!
  const target = k.push(engine.controls.get())
  const key = k.keys[0]!
  stroke('keydown', 'a')
  const start = engine.held.get().get(bendName('a'))![key]
  expect(start).toBe(engine.controls.get()[key])
  act(() => {
    vi.advanceTimersByTime(1100)
  })
  expect(engine.held.get().get(bendName('a'))![key]).toBe(target[key])
  stroke('keyup', 'a')
  expect(engine.held.get().has(bendName('a'))).toBe(true)
  act(() => {
    vi.advanceTimersByTime(1100)
  })
  expect(engine.held.get().has(bendName('a'))).toBe(false)
})

test('a link with ?bend on it opens with the letters on the bend keys', () => {
  window.history.replaceState(null, '', '/?bend')
  render(<BendKeys morphSeconds={0} />)
  expect(letterKeys.get()).toBe('bends')
})
