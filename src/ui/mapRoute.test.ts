import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS } from '../controls.ts'
import { buildMap } from './chain-map.ts'
import { routeOut } from './mapRoute.ts'

const map = buildMap({ ...DEFAULT_CONTROLS }, { wrap: true, loop: true })
const hops = (door: string) => routeOut(map, door).wires.map(w => w.to)

test('a pedal runs down the chain to the output', () => {
  expect(hops('Tape machine')).toEqual(['Output'])
  expect(hops('Ricochet').at(-1)).toBe('Output')
})

test('a keyboard leaves through the toy board into the mix', () => {
  expect(hops('Plinky')[0]).toBe('mix')
  expect(hops('Plinky').at(-1)).toBe('Output')
})

test('a stage with no wire out lights its box alone, and an unknown one nothing', () => {
  expect(routeOut(map, 'Output')).toMatchObject({ wires: [] })
  expect(routeOut(map, 'Output').node?.id).toBe('Output')
  expect(routeOut(map, 'no such stage').node).toBeUndefined()
})
