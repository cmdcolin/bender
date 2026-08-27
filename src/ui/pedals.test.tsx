// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { DEFAULT_CONTROLS } from '../controls'
import { engine } from '../engine/engine'
import { PEDALS, PEDAL_ORDERS, pedalOrderAt } from '../pedals'
import { GROUPS } from './controls'
import { OpenGroup } from './Section'
import './testDom'

// The pedal board: four boxes in the order the signal meets them, dragged or
// arrow-keyed like the bend rack upstream. What it writes is one control naming
// one of the orders, so there is no arrangement of it that is not an order.

const board = () => {
  const g = GROUPS.find(g => g.name === 'Pedal board')
  if (!g) throw new Error('no Pedal board')
  return g
}

const openBoard = () =>
  render(<OpenGroup group={board()} onClose={() => {}} seconds={0} />)

const rowNames = () =>
  screen
    .getAllByRole('listitem')
    .map(li => li.querySelectorAll('span')[1]?.textContent)

// Every order, once, and the same list on every build: a packed link says
// "order 9", so generating this a different way tomorrow moves every board
// already in the world.
test('the orders are the twenty-four permutations, in a pinned order', () => {
  expect(PEDAL_ORDERS).toHaveLength(24)
  expect([...PEDAL_ORDERS[0]!]).toEqual([0, 1, 2, 3])
  expect([...PEDAL_ORDERS[1]!]).toEqual([0, 1, 3, 2])
  expect([...PEDAL_ORDERS[23]!]).toEqual([3, 2, 1, 0])
  const seen = new Set(PEDAL_ORDERS.map(o => o.join('')))
  expect(seen.size).toBe(24)
})

// A link from a build with more pedals in it, or a control knocked out of
// range: the board comes back rather than losing a pedal out of the path.
test('an order the build does not have falls back to the board’s own', () => {
  expect([...pedalOrderAt(999)]).toEqual([0, 1, 2, 3])
  expect([...pedalOrderAt(-1)]).toEqual([0, 1, 2, 3])
})

test('the rack draws the four pedals in the order they run', () => {
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
    3, 0, 1, 2,
  ])
})

test('the arrow keys carry a pedal up the board', () => {
  engine.controls.set({ ...DEFAULT_CONTROLS, pedalOrder: 0 })
  openBoard()
  fireEvent.keyDown(screen.getAllByRole('listitem')[1]!, { key: 'ArrowUp' })
  expect([...pedalOrderAt(engine.controls.get().pedalOrder)]).toEqual([
    1, 0, 2, 3,
  ])
})

// The top of the board has nowhere above it, and a key that does nothing has to
// do nothing rather than write an order that is not one.
test('a pedal at either end stays where it is', () => {
  engine.controls.set({ ...DEFAULT_CONTROLS, pedalOrder: 0 })
  openBoard()
  const rows = screen.getAllByRole('listitem')
  fireEvent.keyDown(rows[0]!, { key: 'ArrowUp' })
  fireEvent.keyDown(rows[3]!, { key: 'ArrowDown' })
  expect(engine.controls.get().pedalOrder).toBe(0)
})

// One control, drawn by the rack — the panel does not put a twenty-four-way
// dropdown under it as well.
test('the panel draws no order dropdown', () => {
  engine.controls.set({ ...DEFAULT_CONTROLS })
  openBoard()
  expect(screen.queryAllByRole('slider', { name: 'Order' })).toHaveLength(0)
})
