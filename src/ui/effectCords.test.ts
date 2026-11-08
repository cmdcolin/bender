import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS } from '../controls.ts'
import { jackFor } from '../jacks.ts'
import { PEDAL_ORDERS, PEDALS, pedalOrderAt } from '../pedals.ts'
import { BEND_SLOT_KEYS } from './controls/index.ts'
import {
  cordsFor,
  effectRuns,
  inSays,
  landed,
  landingOf,
  outSays,
  runsFrom,
  runText,
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

const master = (c: typeof board) => effectRuns(c)[0]!

test('the master run is the socketed effects once each in position order, then the six pedals', () => {
  expect(master(board).chain).toEqual([
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
  const cords = cordsFor(master(board), ['Clipper', 'Ricochet', 'Ember'])
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
  expect(cordsFor(master(board), [])).toHaveLength(1)
})

test('a unit patched onto a machine leaves the master run for a run of its own from that machine to the mix bus', () => {
  const c = {
    ...board,
    revInto: jackFor('sheet'),
    octInto: jackFor('sheet'),
    crushInto: jackFor('toyDrum'),
  }
  const runs = effectRuns(c)
  expect(runs[0]!.chain).toEqual([
    'Clipper',
    'Gnash',
    'Wraith',
    'Ricochet',
    'Chorale',
    'Ember',
  ])
  expect(runs.slice(1)).toEqual([
    { from: 'Clatter', to: 'the mix bus', chain: ['Crusher'] },
    { from: 'Sheet', to: 'the mix bus', chain: ['Octave', 'Boing'] },
  ])
  const sheet = cordsFor(runs[2]!, ['Boing'])
  expect(inSays(sheet[0]!)).toBe('In from Sheet, through Octave.')
  expect(outSays(sheet[1]!)).toBe('Out to the mix bus.')
  expect(runsFrom(runText(runs))).toEqual(runs)
})

const slotsOf = (c: typeof board) => BEND_SLOT_KEYS.map(k => c[k])

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
