// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'

import { engine } from '../engine/engine.ts'
import { GROUPS } from './controls/index.ts'
import { OpenGroup } from './Section.tsx'
import { BEND_KEYS, NODE_KEYS } from './toyBoxKeys.ts'
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

test('the stock die names its parts and shows no bend', () => {
  open()
  expect(words()).toEqual(
    expect.arrayContaining(['clock', 'voices', 'envelope', 'output pin']),
  )
  for (const bend of ['pot', 'drifting', 'PWM', 'scan', 'shorted'])
    expect(words()).not.toContain(bend)
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
  expect(words()).toEqual(
    expect.arrayContaining([
      '6 wide',
      'leaky',
      'drifting',
      'PWM',
      'scan',
      'pot',
    ]),
  )
})

test('the output pin reads shorted only while the scan is off', () => {
  open()
  set({ chipShort: 0.5 })
  expect(words()).toContain('shorted')
  set({ chipScan: 0.3 })
  expect(words()).not.toContain('shorted')
})

test('each feedback bend draws its wire, and the tune ROM names the wires the output drives', () => {
  open()
  for (const bend of ['step tap', 'dive', 'relax', 'A2 D3 ← out'])
    expect(words()).not.toContain(bend)
  set({
    chipStepTap: 0.4,
    chipEnvDiv: 0.5,
    chipEnvRelax: 0.4,
    chipOutAddr: 3,
    chipOutData: 4,
  })
  expect(words()).toEqual(
    expect.arrayContaining(['step tap', 'dive', 'relax', 'A2 D3 ← out']),
  )
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

test('every knob in the die fold sits in one of the parts or under the bend spot', () => {
  const fold = GROUPS.find(g => g.name === 'Toy keyboard')!
    .sliders.filter(d => d.part === 'inside the die')
    .map(d => d.key)
  expect([...Object.values(NODE_KEYS).flat(), ...BEND_KEYS].toSorted()).toEqual(
    fold.toSorted(),
  )
})

test('the bend spot rows stay under the drawing with no part open', () => {
  open()
  expect(screen.getByText('Bend spot')).not.toBeNull()
})
