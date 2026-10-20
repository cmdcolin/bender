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
const TOY = bit('Plinky')
const FM = bit('Glint')
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
  expect(heardThrough('Plinky', board({}), TOY | FM, STRUCK)).toEqual([])
})

test('a stage at zero whose own meter read while down is flagged as itself', () => {
  expect(
    heardThrough('Plinky', board({ chipLevel: 0 }), 0, {
      struck: false,
      loud: true,
    }),
  ).toEqual(['Plinky'])
})

test('the toy at zero is heard on the FM chip while the key line is soldered', () => {
  const c = board({ chipLevel: 0, fmLevel: 0.6 })
  expect(heardThrough('Plinky', c, FM, STRUCK)).toEqual(['Glint'])
  expect(heardThrough('Plinky', c, FM, QUIET)).toEqual([])
  expect(heardThrough('Plinky', { ...c, fmKeyGate: 1 }, FM, STRUCK)).toEqual([])
  expect(heardThrough('Plinky', { ...c, fmMute: 1 }, FM, STRUCK)).toEqual([])
})

test('a muted toy is flagged the same way', () => {
  const c = board({ chipMute: 1, fmLevel: 0.6 })
  expect(heardThrough('Plinky', c, FM, STRUCK)).toEqual(['Glint'])
})

test('the kit at zero is heard on the FM chip only through a bridged trigger', () => {
  const c = board({ drumLevel: 0, fmLevel: 0.6 })
  expect(heardThrough('Clatter', c, FM, STRUCK)).toEqual([])
  expect(heardThrough('Clatter', { ...c, fmStruck: 1 }, FM, STRUCK)).toEqual([
    'Glint',
  ])
})

test('the mute cap lights a dot while Glint still plays the toy', () => {
  engine.writeBoard(board({ chipLevel: 0, fmLevel: 0.6 }))
  render(<DeviceVerbs stage="Plinky" />)
  expect(screen.queryByLabelText('still heard')).toBeNull()
  act(() => {
    engine.sounding.set(FM)
    engine.chipNotes.set(new Set([60]))
  })
  expect(screen.getByLabelText('still heard')).toBeTruthy()
})

test('a toy pulled to zero mid-note stays unflagged while its needle falls', () => {
  engine.writeBoard(board({ chipLevel: 0 }))
  render(<DeviceVerbs stage="Plinky" />)
  act(() => engine.sounding.set(TOY))
  expect(screen.queryByLabelText('still heard')).toBeNull()
})

test('the mute cap lights a dot when the toy at zero still reads on its own meter', () => {
  engine.writeBoard(board({ chipLevel: 0 }))
  render(<DeviceVerbs stage="Plinky" />)
  const taps = new Float32Array(engine.meter.get().taps.length)
  taps[CHANNELS.find(c => c.name === 'Plinky')!.tap] = 0.2
  act(() => engine.meter.set({ ...engine.meter.get(), taps }))
  expect(screen.getByLabelText('still heard')).toBeTruthy()
})
