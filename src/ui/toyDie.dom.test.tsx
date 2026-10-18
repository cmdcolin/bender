// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'

import { engine } from '../engine/engine.ts'
import { GROUPS } from './controls/index.ts'
import { OpenGroup } from './Section.tsx'
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
