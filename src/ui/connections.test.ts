import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS } from '../controls.ts'
import { ANY_CHOICE, STEP_CHOICE } from '../dsp/trigbus.ts'
import {
  cableName,
  CONNECTIONS,
  connectionInto,
  KEY_LINE,
  KIT_TO_PLINKY,
  PLINKY_TO_KIT,
} from './connections.ts'

test('each machine takes at most one cable of each signal', () => {
  const ends = CONNECTIONS.map(x => `${x.to} ${x.signal}`)
  expect(new Set(ends).size).toBe(ends.length)
})

test('the key line is plugged at stock and the patched cables are not', () => {
  for (const x of CONNECTIONS)
    expect(x.plugged(DEFAULT_CONTROLS), x.key).toBe(KEY_LINE.includes(x))
})

test('a cable is named by the kit voice at the kit end', () => {
  const c = {
    ...DEFAULT_CONTROLS,
    trigToKeys: 2,
    trigToDrum: STEP_CHOICE,
    fmStruck: ANY_CHOICE,
  }
  expect(cableName(c, KIT_TO_PLINKY)).toBe('snare → Plinky')
  expect(cableName(c, PLINKY_TO_KIT)).toBe('Plinky → the step')
  expect(cableName(c, connectionInto('Glint', 'hits')!)).toBe('any hit → Glint')
  expect(cableName(c, connectionInto('Growler', 'notes')!)).toBe(
    'Plinky → Growler',
  )
})
