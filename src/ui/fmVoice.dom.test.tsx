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

const ROWS = ['Brightness', 'Feedback', 'Car ratio', 'Vibrato']

const rows = () => ROWS.filter(label => screen.queryByText(label))

const lit = (word: string) =>
  [...drawing()!.querySelectorAll('text')]
    .find(t => t.textContent === word)!
    .getAttribute('class')!
    .includes('On')

test('the operator drawing shows under the modulator and the carrier only', () => {
  open()
  expect(drawing()).not.toBeNull()
  press('carrier')
  expect(drawing()).not.toBeNull()
  press('bus')
  expect(drawing()).toBeNull()
})

test('the drawing names its parts and carries no value', () => {
  open()
  expect(words()).toEqual(
    expect.arrayContaining([
      'modulator',
      'carrier',
      'feedback',
      'brightness',
      'LFO',
    ]),
  )
  expect(words().filter(t => /\d/.test(t))).toEqual([])
  expect(alarms()).toBe(0)
})

test('a knob off stock lights its word and a stock one leaves it grey', () => {
  open()
  expect(lit('feedback')).toBe(false)
  expect(lit('brightness')).toBe(false)
  set({ fmFeedback: 3, fmBright: 1 })
  expect(lit('feedback')).toBe(true)
  expect(lit('brightness')).toBe(true)
})

test('a voice with its own LFO lights it with the button off', () => {
  open()
  expect(lit('LFO')).toBe(false)
  set({ fmVoice: 6 })
  expect(lit('LFO')).toBe(true)
})

test('the boosters past the register range draw red wires while no effect runs', () => {
  open()
  set({ fmFeedback: 9, fmBright: 2 })
  expect(words()).toContain('booster')
  expect(alarms()).toBe(2)
})

test('a brightness just past 1 draws no booster', () => {
  open()
  set({ fmBright: 1.01 })
  expect(words().join()).not.toContain('booster')
  expect(alarms()).toBe(0)
})

test('an effect owns the patch: the boosters go and the drawing dims', () => {
  open()
  set({ fmFeedback: 9, fmBright: 2, fmEffect: 1 })
  expect(words().join()).not.toContain('booster')
  expect(alarms()).toBe(0)
  expect(drawing()!.querySelector('g[opacity="0.45"]')).not.toBeNull()
})

test('the operators close-up sits in a card under its own name', () => {
  open()
  const card = () => screen.queryByRole('region', { name: 'operators' })
  expect(card()).not.toBeNull()
  press('bus')
  expect(card()).toBeNull()
  expect(screen.getByRole('region', { name: 'bus' })).not.toBeNull()
})

test('each part of the close-up opens its own knobs', () => {
  open()
  press('zoomed carrier')
  expect(rows()).toEqual(['Car ratio', 'Vibrato'])
  press('feedback')
  expect(rows()).toEqual(['Feedback'])
  press('brightness')
  expect(rows()).toEqual(['Brightness'])
  press('LFO')
  expect(rows()).toEqual(['Vibrato'])
  expect(drawing()).not.toBeNull()
  press('LFO')
  expect(rows()).toEqual([])
})
