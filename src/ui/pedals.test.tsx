// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS } from '../controls'
import { engine } from '../engine/engine'
import { PEDALS, PEDAL_ORDERS, pedalOrderAt } from '../pedals'
import { PedalRack } from './PedalRack'
import './testDom'

// The pedal board: six boxes in the order the signal meets them, dragged or
// arrow-keyed like the bend rack upstream. What it writes is one control naming
// one of the orders, so there is no arrangement of it that is not an order.
// PedalRack needs no group to render — the merged panel-level suppression
// check (no dropdown under either rack) lives in slots.test.tsx.

const openBoard = () => render(<PedalRack />)

const rowNames = () =>
  screen
    .getAllByRole('listitem')
    .map(li => li.querySelectorAll('span')[1]?.textContent)

// Every order, once, and the same list on every build: a packed link says
// "order 9", so generating this a different way tomorrow moves every board
// already in the world.
test('the orders are the seven hundred and twenty permutations, in a pinned order', () => {
  expect(PEDAL_ORDERS).toHaveLength(720)
  const seen = new Set(PEDAL_ORDERS.map(o => o.join('')))
  expect(seen.size).toBe(720)
  for (const order of PEDAL_ORDERS) expect(order).toHaveLength(6)
})

// The rule the sixth pedal is filed under, and the reason it is not simply the
// seven hundred and twenty in lexicographic order. Every link ever shared
// numbers against the orders of fewer pedals, so those come first and in exactly
// the order they were in, each with the new box bolted on the end. Order 9 still
// means what it meant; the board it opens has one more box on it, downstream of
// everything the link named.
test('the first twenty-four are the old four-pedal orders with the ensemble and the amp last', () => {
  const wasFour = [
    [0, 1, 2, 3],
    [0, 1, 3, 2],
    [0, 2, 1, 3],
    [0, 2, 3, 1],
    [0, 3, 1, 2],
    [0, 3, 2, 1],
    [1, 0, 2, 3],
    [1, 0, 3, 2],
    [1, 2, 0, 3],
    [1, 2, 3, 0],
    [1, 3, 0, 2],
    [1, 3, 2, 0],
    [2, 0, 1, 3],
    [2, 0, 3, 1],
    [2, 1, 0, 3],
    [2, 1, 3, 0],
    [2, 3, 0, 1],
    [2, 3, 1, 0],
    [3, 0, 1, 2],
    [3, 0, 2, 1],
    [3, 1, 0, 2],
    [3, 1, 2, 0],
    [3, 2, 0, 1],
    [3, 2, 1, 0],
  ]
  expect(PEDAL_ORDERS.slice(0, 24).map(o => [...o])).toEqual(
    wasFour.map(o => [...o, 4, 5]),
  )
})

// The ninety-six five-pedal orders that put the ensemble anywhere else follow,
// lexicographic, still with the amp on the end.
test('orders 24 to 119 are the five-pedal orders that put the ensemble elsewhere, amp last', () => {
  const five = PEDAL_ORDERS.slice(24, 120)
  expect(five).toHaveLength(96)
  expect([...five[0]!]).toEqual([0, 1, 2, 4, 3, 5])
  expect([...five[1]!]).toEqual([0, 1, 3, 4, 2, 5])
  expect([...five.at(-1)!]).toEqual([4, 3, 2, 1, 0, 5])
  for (const order of five) {
    expect(order.at(-1)).toBe(5)
    expect(order.at(-2)).not.toBe(4)
  }
  const lex = five.map(o => o.join(''))
  expect(lex).toEqual([...lex].toSorted())
})

// And the six hundred that put the amp anywhere else, lexicographic, after
// them. What matters is that this half starts where the last stops and never
// comes round again.
test('the remaining six hundred put the amp anywhere else, lexicographic', () => {
  const rest = PEDAL_ORDERS.slice(120)
  expect(rest).toHaveLength(600)
  expect([...rest[0]!]).toEqual([0, 1, 2, 3, 5, 4])
  expect([...rest[1]!]).toEqual([0, 1, 2, 4, 5, 3])
  expect([...rest.at(-1)!]).toEqual([5, 4, 3, 2, 1, 0])
  for (const order of rest) expect(order.at(-1)).not.toBe(5)
  const lex = rest.map(o => o.join(''))
  expect(lex).toEqual([...lex].toSorted())
})

// A link from a build with more pedals in it, or a control knocked out of
// range: the board comes back rather than losing a pedal out of the path.
test('an order the build does not have falls back to the board’s own', () => {
  expect([...pedalOrderAt(999)]).toEqual([0, 1, 2, 3, 4, 5])
  expect([...pedalOrderAt(-1)]).toEqual([0, 1, 2, 3, 4, 5])
})

test('the rack draws the six pedals in the order they run', () => {
  engine.controls.set({ ...DEFAULT_CONTROLS, pedalOrder: 23 })
  openBoard()
  expect(rowNames()).toEqual([...PEDAL_ORDERS[23]!].map(i => PEDALS[i]!.group))
})

test('dragging a pedal moves it and closes the rest up', () => {
  engine.controls.set({ ...DEFAULT_CONTROLS, pedalOrder: 0 })
  openBoard()
  const rows = screen.getAllByRole('listitem')
  fireEvent.dragStart(rows[3]!)
  fireEvent.dragOver(rows[0]!)
  fireEvent.drop(rows[0]!)
  expect([...pedalOrderAt(engine.controls.get().pedalOrder)]).toEqual([
    3, 0, 1, 2, 4, 5,
  ])
})

test('the arrow keys carry a pedal up the board', () => {
  engine.controls.set({ ...DEFAULT_CONTROLS, pedalOrder: 0 })
  openBoard()
  fireEvent.keyDown(screen.getAllByRole('listitem')[1]!, { key: 'ArrowUp' })
  expect([...pedalOrderAt(engine.controls.get().pedalOrder)]).toEqual([
    1, 0, 2, 3, 4, 5,
  ])
})

// The top of the board has nowhere above it, and a key that does nothing has to
// do nothing rather than write an order that is not one.
test('a pedal at either end stays where it is', () => {
  engine.controls.set({ ...DEFAULT_CONTROLS, pedalOrder: 0 })
  openBoard()
  const rows = screen.getAllByRole('listitem')
  fireEvent.keyDown(rows[0]!, { key: 'ArrowUp' })
  fireEvent.keyDown(rows[5]!, { key: 'ArrowDown' })
  expect(engine.controls.get().pedalOrder).toBe(0)
})
