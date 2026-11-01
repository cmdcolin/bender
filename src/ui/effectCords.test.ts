import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS } from '../controls.ts'
import { cordsFor, effectChain, inSays, outSays } from './effectCords.ts'

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
