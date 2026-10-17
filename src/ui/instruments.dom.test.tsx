// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, test } from 'vitest'

import { DEFAULT_CONTROLS, sameControls } from '../controls.ts'
import { engine } from '../engine/engine.ts'
import { bench, parseBench } from './bench.ts'
import { Instruments } from './Instruments.tsx'
import './testDom.ts'

beforeEach(() => {
  localStorage.clear()
  bench.set({ all: false, closed: [] })
})

const group = (name: string) => screen.queryByRole('group', { name })
const allMode = () => screen.getByRole('button', { name: 'all instruments' })

test('the toy and the kit show alone while the other three have no level', () => {
  render(<Instruments seconds={0} />)
  expect(group('toy keyboard')).not.toBeNull()
  expect(group('toy drums')).not.toBeNull()
  expect(group('fm keyboard')).toBeNull()
  expect(group('home keyboard')).toBeNull()
  expect(group('mono synth')).toBeNull()
  expect(screen.queryByRole('button', { name: /^close / })).toBeNull()
})

test('all-instruments lays out every machine, each with a close cap', () => {
  render(<Instruments seconds={0} />)
  fireEvent.click(allMode())
  for (const name of [
    'toy keyboard',
    'toy drums',
    'fm keyboard',
    'home keyboard',
    'mono synth',
  ])
    expect(group(name)).not.toBeNull()
  expect(screen.getAllByRole('button', { name: /^close / })).toHaveLength(5)
})

test('closing a machine hides it and a chip brings it back', () => {
  render(<Instruments seconds={0} />)
  fireEvent.click(allMode())
  fireEvent.click(screen.getByRole('button', { name: 'close FM chip' }))
  expect(group('fm keyboard')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '+ fm chip' }))
  expect(group('fm keyboard')).not.toBeNull()
})

test('leaving the mode puts the faders back in charge', () => {
  render(<Instruments seconds={0} />)
  fireEvent.click(allMode())
  fireEvent.click(allMode())
  expect(group('fm keyboard')).toBeNull()
})

test('randomize rolls that machine and leaves the others where they were', () => {
  render(<Instruments seconds={0} />)
  fireEvent.click(allMode())
  const roll = screen.getAllByRole('button', { name: 'randomize' })
  expect(roll).toHaveLength(5)
  fireEvent.click(roll[0]!)
  const now = engine.controls.get()
  expect(sameControls(now, DEFAULT_CONTROLS)).toBe(false)
  expect(now.drumLevel).toBe(DEFAULT_CONTROLS.drumLevel)
  expect(now.fmLevel).toBe(DEFAULT_CONTROLS.fmLevel)
})

test('mute silences one machine and keeps its level, and a roll leaves it muted', () => {
  render(<Instruments seconds={0} />)
  fireEvent.click(allMode())
  const mute = screen.getByRole('button', { name: 'mute Toy drums' })
  expect(mute.getAttribute('aria-pressed')).toBe('false')
  fireEvent.click(mute)
  expect(engine.controls.get().drumMute).toBe(1)
  expect(engine.controls.get().drumLevel).toBe(DEFAULT_CONTROLS.drumLevel)
  expect(mute.getAttribute('aria-pressed')).toBe('true')
  fireEvent.click(screen.getAllByRole('button', { name: 'randomize' })[1]!)
  expect(engine.controls.get().drumMute).toBe(1)
  fireEvent.click(mute)
  expect(engine.controls.get().drumMute).toBe(0)
})

test('the mode and what was closed are stored for the next load', () => {
  render(<Instruments seconds={0} />)
  fireEvent.click(allMode())
  fireEvent.click(screen.getByRole('button', { name: 'close FM chip' }))
  expect(parseBench(localStorage.getItem('bender.bench'))).toEqual({
    all: true,
    closed: ['FM chip'],
  })
})

test('a stored bench that is not one reads as the default', () => {
  expect(parseBench('{')).toEqual({ all: false, closed: [] })
  expect(parseBench('7')).toEqual({ all: false, closed: [] })
  expect(parseBench('{"all":true,"closed":["FM chip",3]}')).toEqual({
    all: true,
    closed: ['FM chip'],
  })
})
