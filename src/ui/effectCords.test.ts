import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS } from '../controls.ts'
import { PEDAL_ORDERS, PEDALS, pedalOrderAt } from '../pedals.ts'
import {
  cordsFor,
  effectChain,
  inSays,
  landed,
  landingOf,
  outSays,
} from './effectCords.ts'

const board = {
  ...DEFAULT_CONTROLS,
  bendSlot0: 3,
  bendSlot1: 0,
  bendSlot2: 3,
  bendSlot3: 2,
  bendSlot4: 0,
  bendSlot5: 0,
  pedalOrder: 0,
}

test('the chain is the socketed effects once each in position order, then the six pedals', () => {
  expect(effectChain(board)).toEqual([
    'Clipper',
    'Crusher',
    'Gnash',
    'Wraith',
    'Ricochet',
    'Boing',
    'Chorale',
    'Ember',
  ])
})

test('a cord joins each face on the bench to the next, naming what it passes through', () => {
  const cords = cordsFor(effectChain(board), ['Clipper', 'Ricochet', 'Ember'])
  expect(cords).toEqual([
    { from: 'the mix bus', to: 'Clipper', through: [] },
    {
      from: 'Clipper',
      to: 'Ricochet',
      through: ['Crusher', 'Gnash', 'Wraith'],
    },
    { from: 'Ricochet', to: 'Ember', through: ['Boing', 'Chorale'] },
    { from: 'Ember', to: 'the output', through: [] },
  ])
  expect(inSays(cords[1]!)).toBe(
    'In from Clipper, through Crusher, Gnash, Wraith.',
  )
  expect(outSays(cords[3]!)).toBe('Out to the output.')
})

test('with no faces on the bench the one cord runs from the bus to the output', () => {
  expect(cordsFor(effectChain(board), [])).toHaveLength(1)
})

const slotsOf = (c: typeof board) =>
  [0, 1, 2, 3, 4, 5].map(i => c[`bendSlot${i}` as const])

const pedalsIn = (c: typeof board) =>
  pedalOrderAt(c.pedalOrder).map(i => PEDALS[i]!.group)

test('a pedal dropped on an IN jack runs just before that pedal, on an OUT jack just after', () => {
  const before = landed(board, 'Ember', { stage: 'Wraith', side: 'in' })!
  expect(pedalsIn(before)).toEqual([
    'Gnash',
    'Ember',
    'Wraith',
    'Ricochet',
    'Boing',
    'Chorale',
  ])
  const after = landed(board, 'Gnash', { stage: 'Boing', side: 'out' })!
  expect(pedalsIn(after)).toEqual([
    'Wraith',
    'Ricochet',
    'Boing',
    'Gnash',
    'Chorale',
    'Ember',
  ])
  expect(PEDAL_ORDERS[after.pedalOrder]).toBeDefined()
})

test('a socketed pedal dropped on another moves through the sockets, empty ones included', () => {
  const moved = landed(board, 'Crusher', { stage: 'Clipper', side: 'in' })!
  expect(slotsOf(moved)).toEqual([2, 3, 0, 3, 0, 0])
  const back = landed(board, 'Clipper', { stage: 'Crusher', side: 'out' })!
  expect(slotsOf(back)).toEqual([0, 3, 2, 3, 0, 0])
})

test('a drop that changes nothing, or crosses between the sockets and the pedals, writes nothing', () => {
  expect(landed(board, 'Gnash', { stage: 'Wraith', side: 'in' })).toBeNull()
  expect(landed(board, 'Clipper', { stage: 'Gnash', side: 'in' })).toBeNull()
  expect(landed(board, 'Gnash', { stage: 'Clipper', side: 'out' })).toBeNull()
  expect(landed(board, 'Gnash', { stage: 'Gnash', side: 'out' })).toBeNull()
})

test('a jack names its side and its stage, spaces and all', () => {
  expect(landingOf('in:Ring mod')).toEqual({ side: 'in', stage: 'Ring mod' })
  expect(landingOf('sideways:Gnash')).toBeNull()
  expect(landingOf(undefined)).toBeNull()
})
