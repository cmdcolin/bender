// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS } from '../controls.ts'
import { engine } from '../engine/engine.ts'
import { FmChipDiagram } from './FmChipDiagram.tsx'
import './testDom.ts'

import type { Controls } from '../controls.ts'

const open = () => {
  engine.writeBoard(DEFAULT_CONTROLS)
  render(<FmChipDiagram verbs={() => null} />)
}

const press = (box: string) =>
  fireEvent.click(screen.getByRole('button', { name: `${box} controls` }))

const set = (board: Partial<Controls>) =>
  act(() => {
    for (const [key, value] of Object.entries(board))
      engine.set(key as keyof Controls, value)
  })

const drawing = () => screen.queryByRole('img', { name: 'FM operators' })

const words = () =>
  [...drawing()!.querySelectorAll('text')].map(t => t.textContent)

const alarms = () =>
  drawing()!.querySelectorAll('path[class*="wireAlarm"]').length

test('the operator drawing shows under the modulator and the carrier only', () => {
  open()
  expect(drawing()).not.toBeNull()
  press('carrier')
  expect(drawing()).not.toBeNull()
  press('bus')
  expect(drawing()).toBeNull()
})

test('the stock voice reads as patched and draws no bend', () => {
  open()
  expect(words()).toEqual(
    expect.arrayContaining([
      'modulator',
      'carrier',
      'feedback 0',
      'index 0.50',
      'ratio as patched',
      'decay as patched',
      'LFO off',
    ]),
  )
  expect(alarms()).toBe(0)
})

test('each knob reads on the operator it sets', () => {
  open()
  set({ fmFeedback: 3, fmModRatio: 3, fmCarRatio: 2, fmLfo: 1 })
  expect(words()).toEqual(
    expect.arrayContaining(['feedback 3', 'LFO vibrato', 'decay as patched']),
  )
  expect(words()).not.toContain('ratio as patched')
})

test('the boosters past the register range draw red wires while no effect runs', () => {
  open()
  set({ fmFeedback: 9, fmBright: 2 })
  expect(words()).toEqual(
    expect.arrayContaining(['feedback 9 ×4', 'booster ×4']),
  )
  expect(alarms()).toBe(2)
  set({ fmEffect: 1 })
  expect(words()).not.toContain('booster ×4')
  expect(alarms()).toBe(0)
})
