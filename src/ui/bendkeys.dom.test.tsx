// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'

import { engine } from '../engine/engine'
import { BendKeys } from './BendKeys'
import { bendDeal, bendName } from './bendKeys'
import { letterKeys } from './letters'
import './testDom'

const stroke = (type: 'keydown' | 'keyup', key: string, shiftKey = false) =>
  act(() => {
    fireEvent(window, new KeyboardEvent(type, { key, shiftKey, bubbles: true }))
  })

const heldNames = () => [...engine.held.get().keys()]

const open = () => {
  render(<BendKeys />)
  act(() => {
    letterKeys.set('bends')
  })
}

test('the row deals itself a hand on first draw', () => {
  render(<BendKeys />)
  expect(bendDeal.get()).toHaveLength(16)
  expect(screen.getByRole('button', { name: 'bend' })).toBeTruthy()
})

test('the switch sends the letters here and back to the toy', () => {
  render(<BendKeys />)
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
  render(<BendKeys />)
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
