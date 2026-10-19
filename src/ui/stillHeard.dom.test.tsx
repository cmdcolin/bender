// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'

import { DEFAULT_CONTROLS, type Controls } from '../controls.ts'
import { engine } from '../engine/engine.ts'
import { CHANNELS } from './controls/index.ts'
import { DeviceVerbs } from './DeviceVerbs.tsx'
import { heardThrough } from './stillHeard.ts'
import './testDom.ts'

const bit = (name: string) => 1 << CHANNELS.find(c => c.name === name)!.tap
const TOY = bit('Toy keyboard')
const FM = bit('FM chip')
const board = (c: Partial<Controls>) => ({ ...DEFAULT_CONTROLS, ...c })
const STRUCK = { struck: true, loud: false }
const QUIET = { struck: false, loud: false }

afterEach(() => {
  act(() => {
    engine.sounding.set(0)
    engine.chipNotes.set(new Set())
  })
})

test('a stage with its Level up is never flagged', () => {
  expect(heardThrough('Toy keyboard', board({}), TOY | FM, STRUCK)).toEqual([])
})

test('a stage at zero whose own meter read while down is flagged as itself', () => {
  expect(
    heardThrough('Toy keyboard', board({ chipLevel: 0 }), 0, {
      struck: false,
      loud: true,
    }),
  ).toEqual(['Toy keyboard'])
})

test('the toy at zero is heard on the FM chip while the key line is soldered', () => {
  const c = board({ chipLevel: 0, fmLevel: 0.6 })
  expect(heardThrough('Toy keyboard', c, FM, STRUCK)).toEqual(['FM chip'])
  expect(heardThrough('Toy keyboard', c, FM, QUIET)).toEqual([])
  expect(
    heardThrough('Toy keyboard', { ...c, fmKeyGate: 1 }, FM, STRUCK),
  ).toEqual([])
  expect(heardThrough('Toy keyboard', { ...c, fmMute: 1 }, FM, STRUCK)).toEqual(
    [],
  )
})

test('a muted toy is flagged the same way', () => {
  const c = board({ chipMute: 1, fmLevel: 0.6 })
  expect(heardThrough('Toy keyboard', c, FM, STRUCK)).toEqual(['FM chip'])
})

test('the kit at zero is heard on the FM chip only through a bridged trigger', () => {
  const c = board({ drumLevel: 0, fmLevel: 0.6 })
  expect(heardThrough('Toy drums', c, FM, STRUCK)).toEqual([])
  expect(heardThrough('Toy drums', { ...c, fmStruck: 1 }, FM, STRUCK)).toEqual([
    'FM chip',
  ])
})

test('the header names the machine that still plays the toy', () => {
  engine.writeBoard(board({ chipLevel: 0, fmLevel: 0.6 }))
  render(<DeviceVerbs stage="Toy keyboard" />)
  expect(screen.queryByRole('status')).toBeNull()
  act(() => {
    engine.sounding.set(FM)
    engine.chipNotes.set(new Set([60]))
  })
  expect(screen.getByRole('status').textContent).toBe('still heard!')
})

test('a toy pulled to zero mid-note stays unflagged while its needle falls', () => {
  engine.writeBoard(board({ chipLevel: 0 }))
  render(<DeviceVerbs stage="Toy keyboard" />)
  act(() => engine.sounding.set(TOY))
  expect(screen.queryByRole('status')).toBeNull()
})

test('the header says so when the toy at zero still reads on its own meter', () => {
  engine.writeBoard(board({ chipLevel: 0 }))
  render(<DeviceVerbs stage="Toy keyboard" />)
  const taps = new Float32Array(engine.meter.get().taps.length)
  taps[CHANNELS.find(c => c.name === 'Toy keyboard')!.tap] = 0.2
  act(() => engine.meter.set({ ...engine.meter.get(), taps }))
  expect(screen.getByRole('status').textContent).toBe('still heard!')
})
