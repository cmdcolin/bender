// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'

import { engine } from '../engine/engine.ts'
import { GROUPS } from './controls/index.ts'
import { OpenGroup } from './Section.tsx'
import { NODE_KEYS } from './toyBoxKeys.ts'
import './testDom.ts'

import type { Controls } from '../controls.ts'

const open = () =>
  render(
    <OpenGroup
      group={GROUPS.find(g => g.name === 'Toy keyboard')!}
      onClose={() => {}}
      seconds={0}
    />,
  )

const set = (board: Partial<Controls>) =>
  act(() => {
    for (const [key, value] of Object.entries(board))
      engine.set(key as keyof Controls, value)
  })

const words = () =>
  [
    ...screen
      .getByRole('img', { name: 'toy chip die' })
      .querySelectorAll('text'),
  ].map(t => t.textContent)

const lit = (part: string) =>
  screen
    .getByRole('button', { name: `${part} controls` })
    .querySelector('rect')!
    .getAttribute('class')!
    .includes('chipOn')

test('the stock die names its parts, lights none and shows no bend', () => {
  open()
  expect(words()).toEqual(
    expect.arrayContaining(['clock', 'voices', 'envelope', 'output pin']),
  )
  expect(words().filter(w => w === 'clk')).toHaveLength(5)
  for (const bend of ['pot', 'PWM', 'scan', 'crosstalk'])
    expect(words()).not.toContain(bend)
  for (const part of ['clock', 'key matrix', 'envelope', 'output pin'])
    expect(lit(part), part).toBe(false)
})

test('each pin bend shows up on the part it bends', () => {
  open()
  set({
    chipGhost: 2,
    chipEnvCap: 2,
    chipDrift: 0.3,
    chipPwm: 0.5,
    chipScan: 0.3,
    chipBendSpot: 4,
    chipBendPot: 0.5,
  })
  expect(words()).toEqual(expect.arrayContaining(['PWM', 'scan', 'pot']))
  for (const part of ['key matrix', 'envelope', 'clock'])
    expect(lit(part), part).toBe(true)
})

test('the output pin lights for a short only while the scan is off', () => {
  open()
  set({ chipShort: 0.5 })
  expect(lit('output pin')).toBe(true)
  set({ chipScan: 0.3 })
  expect(lit('output pin')).toBe(false)
})

test('each feedback bend draws its wire, and the tune ROM lights when the output drives it', () => {
  open()
  for (const bend of ['step tap', 'dive', 'relax'])
    expect(words()).not.toContain(bend)
  expect(lit('tune ROM')).toBe(false)
  set({
    chipStepTap: 0.4,
    chipEnvDiv: 0.5,
    chipEnvRelax: 0.4,
    chipOutAddr: 3,
    chipOutData: 4,
  })
  expect(words()).toEqual(expect.arrayContaining(['step tap', 'dive', 'relax']))
  expect(lit('tune ROM')).toBe(true)
})

test('no chip text carries a number or a percentage', () => {
  open()
  set({ chipGhost: 2, chipEnvCap: 2, chipOutAddr: 3, chipOutData: 4 })
  expect(words().filter(w => /[\d%]/.test(w ?? ''))).toEqual([])
})

test('the PWM tap takes the PWM carrier off the clock', () => {
  open()
  set({ chipPwm: 0.5 })
  expect(words().filter(w => w === 'PWM')).toHaveLength(1)
  set({ chipPwmTap: 0.5 })
  expect(words().filter(w => w === 'PWM')).toHaveLength(1)
})

test('pressing a part opens its rows, and a second press puts them away', () => {
  open()
  const envelope = () =>
    screen.getByRole('button', { name: 'envelope controls' })
  expect(screen.queryByText('Envelope cap')).toBeNull()
  fireEvent.click(envelope())
  expect(screen.getByText('Envelope cap')).not.toBeNull()
  expect(screen.queryByText('Ghost keys')).toBeNull()
  fireEvent.click(envelope())
  expect(screen.queryByText('Envelope cap')).toBeNull()
})

test('every knob in the die fold sits in one of the parts', () => {
  const fold = GROUPS.find(g => g.name === 'Toy keyboard')!
    .sliders.filter(d => d.part === 'inside the die')
    .map(d => d.key)
  expect(new Set(Object.values(NODE_KEYS).flat())).toEqual(new Set(fold))
})

test('the keyboard box starts open on the playing rows, and the bus box swaps in its own', () => {
  open()
  for (const row of ['Tune', 'Level', 'Tone', 'Arpeggio'])
    expect(screen.getByText(row)).not.toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'bus controls' }))
  expect(screen.queryByText('Arpeggio')).toBeNull()
  expect(screen.getByText('Data line')).not.toBeNull()
})

test('a board that arrives knifed opens the bus box', () => {
  set({ chipDataLine: 2, chipDataFault: 1 })
  open()
  expect(screen.getByText('Data fault')).not.toBeNull()
  set({ chipDataLine: 0, chipDataFault: 0 })
})

test('the stage draws no folds and no rows outside the drawing', () => {
  open()
  expect(document.querySelectorAll('summary')).toHaveLength(0)
  fireEvent.click(screen.getByRole('button', { name: 'keyboard controls' }))
  expect(screen.queryByText('Tune')).toBeNull()
  expect(screen.queryByText('Level')).toBeNull()
})

test('showing the piano roll opens the keyboard box', () => {
  open()
  fireEvent.click(screen.getByRole('button', { name: 'envelope controls' }))
  expect(screen.queryByText('Tune')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'show piano roll' }))
  expect(screen.getByText('Tune')).not.toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'show piano roll' }))
})

test('the bend spot opens from the boxes it solders to, and the pot opens its box', () => {
  open()
  expect(screen.queryByText('Bend spot')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'clock controls' }))
  expect(screen.getByText('Bend spot')).not.toBeNull()
  set({ chipBendSpot: 4, chipBendPot: 0.5 })
  fireEvent.click(screen.getByRole('button', { name: 'keyboard controls' }))
  expect(screen.queryByText('Bend spot')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'bend pot controls' }))
  expect(screen.getByText('Envelope cap')).not.toBeNull()
  set({ chipBendSpot: 0, chipBendPot: 0 })
})
