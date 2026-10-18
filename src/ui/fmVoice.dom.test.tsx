// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS } from '../controls.ts'
import { engine } from '../engine/engine.ts'
import { sliderFor } from './controls/index.ts'
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

const ratios = sliderFor('fmModRatio').choices!

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
      'brightness 0.50',
      'ratio as patched',
      'decay as patched',
      'LFO off',
    ]),
  )
  expect(alarms()).toBe(0)
})

test('each knob reads on the operator it sets', () => {
  open()
  set({ fmFeedback: 3, fmModRatio: 3, fmCarRatio: 5, fmLfo: 2 })
  const text = words()
  expect(text.slice(text.indexOf('modulator'))).toEqual(
    expect.arrayContaining([
      `ratio ${ratios[3]}`,
      `ratio ${ratios[5]}`,
      'decay as patched',
    ]),
  )
  expect(text).toEqual(expect.arrayContaining(['feedback 3', 'LFO tremolo']))
  expect(text).not.toContain('ratio as patched')
})

test('a voice with its own LFO reads it with the button off', () => {
  open()
  expect(words()).toContain('LFO off')
  set({ fmVoice: 6 })
  expect(words()).toContain('LFO vibrato')
  set({ fmLfo: 2 })
  expect(words()).toContain('LFO both')
})

test('the boosters past the register range draw red wires while no effect runs', () => {
  open()
  set({ fmFeedback: 9, fmBright: 2 })
  expect(words()).toEqual(
    expect.arrayContaining(['feedback 9 ×4', 'booster ×4']),
  )
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
  expect(words()).toContain('feedback 7')
  expect(words().join()).not.toContain('booster')
  expect(alarms()).toBe(0)
  expect(drawing()!.querySelector('g[opacity="0.45"]')).not.toBeNull()
})
