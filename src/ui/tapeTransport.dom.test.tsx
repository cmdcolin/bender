// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS } from '../controls.ts'
import { engine } from '../engine/engine.ts'
import { TapeTransport } from './TapeTransport.tsx'
import './testDom.ts'

const press = (name: string) =>
  fireEvent.click(screen.getByRole('button', { name }))
const speed = () => engine.controls.get().sampleSpeed
const speedKey = () => screen.getByRole('button', { name: /^tape speed/ })

test('with nothing on the tape every verb is dead', () => {
  engine.writeBoard(DEFAULT_CONTROLS)
  render(<TapeTransport loaded={false} />)
  expect(screen.queryByRole('slider', { name: 'Level' })).toBeNull()
  for (const name of ['play', 'reverse', 'tape speed 1×', 'speed knob'])
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name }).disabled,
    ).toBe(true)
})

test('the speed key steps half, normal, double and keeps the direction', () => {
  engine.writeBoard({ ...DEFAULT_CONTROLS, sampleSpeed: 1 })
  render(<TapeTransport loaded />)
  fireEvent.click(speedKey())
  expect(speed()).toBe(2)
  press('reverse')
  expect(speed()).toBe(-2)
  expect(screen.getByRole('button', { name: 'reverse' }).ariaPressed).toBe(
    'true',
  )
  fireEvent.click(speedKey())
  expect(speed()).toBe(-0.5)
  expect(speedKey().textContent).toBe('½×')
  press('reverse')
  expect(speed()).toBe(0.5)
})

test('rec works with nothing loaded and latches while the record head is armed', () => {
  engine.writeBoard({ ...DEFAULT_CONTROLS, loopRec: 0 })
  render(<TapeTransport loaded={false} />)
  const rec = () => screen.getByRole('button', { name: 'record onto the tape' })
  expect((rec() as HTMLButtonElement).disabled).toBe(false)
  fireEvent.click(rec())
  expect(engine.controls.get().loopRec).toBe(1)
  expect(rec().ariaPressed).toBe('true')
  fireEvent.click(rec())
  expect(engine.controls.get().loopRec).toBe(0)
})

test('rec starts the tape playing, since playback is how old takes survive the erase head', () => {
  engine.writeBoard({ ...DEFAULT_CONTROLS, sampleLevel: 0, loopRec: 0 })
  render(<TapeTransport loaded />)
  fireEvent.click(screen.getByRole('button', { name: 'record onto the tape' }))
  expect(engine.controls.get().sampleLevel).toBeGreaterThan(0)
  expect(engine.controls.get().loopRec).toBeGreaterThan(0)
})

test('rec leaves a tape that is already playing at its level', () => {
  engine.writeBoard({ ...DEFAULT_CONTROLS, sampleLevel: 1.5, loopRec: 0 })
  render(<TapeTransport loaded />)
  fireEvent.click(screen.getByRole('button', { name: 'record onto the tape' }))
  expect(engine.controls.get().sampleLevel).toBe(1.5)
})

test('rec comes back on the level it was last set to', () => {
  engine.writeBoard({ ...DEFAULT_CONTROLS, loopRec: 0.4 })
  render(<TapeTransport loaded />)
  const rec = () => screen.getByRole('button', { name: 'record onto the tape' })
  fireEvent.click(rec())
  fireEvent.click(rec())
  expect(engine.controls.get().loopRec).toBe(0.4)
})

test('the arrow beside rec opens Record, Erase and Reel length', () => {
  engine.writeBoard({ ...DEFAULT_CONTROLS })
  render(<TapeTransport loaded={false} />)
  press('record knobs')
  for (const name of ['Record', 'Erase', 'Reel length'])
    expect(screen.getByRole('slider', { name })).toBeTruthy()
})

test('the arrow beside the speed opens the Speed slider and Escape shuts it', () => {
  engine.writeBoard({ ...DEFAULT_CONTROLS, sampleSpeed: 1 })
  render(<TapeTransport loaded />)
  expect(screen.queryByRole('slider', { name: 'Speed' })).toBeNull()
  press('speed knob')
  fireEvent.change(screen.getByRole('slider', { name: 'Speed' }), {
    target: { value: '600' },
  })
  expect(speed()).not.toBe(1)
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(screen.queryByRole('slider', { name: 'Speed' })).toBeNull()
})

test('reverse on a frozen tape runs it backwards at normal speed', () => {
  engine.writeBoard({ ...DEFAULT_CONTROLS, sampleSpeed: 0 })
  render(<TapeTransport loaded />)
  press('reverse')
  expect(speed()).toBe(-1)
})

test('a speed between the steps reads off the key and steps back to normal', () => {
  engine.writeBoard({ ...DEFAULT_CONTROLS, sampleSpeed: 1.37 })
  render(<TapeTransport loaded />)
  expect(speedKey().textContent).toBe('1.37×')
  fireEvent.click(speedKey())
  expect(speed()).toBe(1)
})

test('play starts the tape and stop takes the level back to nothing', () => {
  engine.writeBoard({ ...DEFAULT_CONTROLS, sampleLevel: 0 })
  render(<TapeTransport loaded />)
  press('play')
  expect(engine.controls.get().sampleLevel).toBeGreaterThan(0)
  press('stop')
  expect(engine.controls.get().sampleLevel).toBe(0)
})

test('play stays down until stop pops it, and stop is dead while stopped', () => {
  engine.writeBoard({ ...DEFAULT_CONTROLS, sampleLevel: 0 })
  render(<TapeTransport loaded />)
  const stop = () =>
    screen.getByRole<HTMLButtonElement>('button', { name: 'stop' })
  expect(stop().disabled).toBe(true)
  press('play')
  const level = engine.controls.get().sampleLevel
  press('play')
  expect(engine.controls.get().sampleLevel).toBe(level)
  expect(screen.getByRole('button', { name: 'play' }).ariaPressed).toBe('true')
  expect(stop().disabled).toBe(false)
})

test('the Level slider sets the tape level and play after stop goes back to it', () => {
  engine.writeBoard({ ...DEFAULT_CONTROLS, sampleLevel: 0 })
  render(<TapeTransport loaded />)
  press('play')
  fireEvent.change(screen.getByRole('slider', { name: 'Level' }), {
    target: { value: '900' },
  })
  const set = engine.controls.get().sampleLevel
  expect(set).toBeGreaterThan(1)
  press('stop')
  expect(engine.controls.get().sampleLevel).toBe(0)
  press('play')
  expect(engine.controls.get().sampleLevel).toBe(set)
})
