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

test('with nothing on the tape every verb is dead', () => {
  engine.writeBoard(DEFAULT_CONTROLS)
  render(<TapeTransport loaded={false} />)
  for (const name of ['▶ play', '◀ reverse', '½×', '1×', '2×'])
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name }).disabled,
    ).toBe(true)
})

test('reverse turns the speed round and the speed picks keep the direction', () => {
  engine.writeBoard({ ...DEFAULT_CONTROLS, sampleSpeed: 1 })
  render(<TapeTransport loaded />)
  press('2×')
  expect(speed()).toBe(2)
  press('◀ reverse')
  expect(speed()).toBe(-2)
  expect(screen.getByRole('button', { name: '◀ reverse' }).ariaPressed).toBe(
    'true',
  )
  press('½×')
  expect(speed()).toBe(-0.5)
  press('◀ reverse')
  expect(speed()).toBe(0.5)
})

test('reverse on a frozen tape runs it backwards at normal speed', () => {
  engine.writeBoard({ ...DEFAULT_CONTROLS, sampleSpeed: 0 })
  render(<TapeTransport loaded />)
  press('◀ reverse')
  expect(speed()).toBe(-1)
})

test('a speed between the picks leaves all three unpressed', () => {
  engine.writeBoard({ ...DEFAULT_CONTROLS, sampleSpeed: 1.37 })
  render(<TapeTransport loaded />)
  for (const name of ['½×', '1×', '2×'])
    expect(screen.getByRole('button', { name }).ariaPressed).toBe('false')
})

test('play starts the tape and stop takes the level back to nothing', () => {
  engine.writeBoard({ ...DEFAULT_CONTROLS, sampleLevel: 0 })
  render(<TapeTransport loaded />)
  press('▶ play')
  expect(engine.controls.get().sampleLevel).toBeGreaterThan(0)
  press('■ stop')
  expect(engine.controls.get().sampleLevel).toBe(0)
})
