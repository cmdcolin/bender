// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS } from '../controls.ts'
import { engine } from '../engine/engine.ts'
import { GROUPS } from './controls/index.ts'
import { OpenGroup } from './Section.tsx'
import './testDom.ts'

import type { Controls } from '../controls.ts'

const open = () => {
  engine.writeBoard(DEFAULT_CONTROLS)
  render(
    <OpenGroup
      group={GROUPS.find(g => g.name === 'FM chip')!}
      onClose={() => {}}
      seconds={0}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'die controls' }))
}

const set = (board: Partial<Controls>) =>
  act(() => {
    for (const [key, value] of Object.entries(board))
      engine.set(key as keyof Controls, value)
  })

const die = () => screen.getByRole('img', { name: 'FM die and driver' })

const words = () => [...die().querySelectorAll('text')].map(t => t.textContent)

const alarms = () => die().querySelectorAll('path[class*="wireAlarm"]').length

test('the stock die names its parts and reads no fault', () => {
  open()
  expect(words()).toEqual(
    expect.arrayContaining([
      'allocator',
      'registers',
      'voices',
      'voice 1',
      'voice 4',
      'DAC',
      'adder linear',
    ]),
  )
  for (const fault of ['stuck on 2', 'garbage', 'slip 40%'])
    expect(words()).not.toContain(fault)
  expect(alarms()).toBe(0)
})

test('each fault reads on the part it bends', () => {
  open()
  set({
    fmAlloc: 2,
    fmDacSlot: 3,
    fmDacSlip: 0.4,
    fmColdBoot: 1,
    fmAdder: 3,
  })
  expect(words()).toEqual(
    expect.arrayContaining([
      'stuck on 2',
      'stuck on 3',
      'slip 40%',
      'garbage',
      'adder 9 bits',
    ]),
  )
})

test('a stuck allocator and a stuck slot each draw one channel in red', () => {
  open()
  set({ fmAlloc: 2 })
  expect(alarms()).toBe(1)
  set({ fmDacSlot: 3 })
  expect(alarms()).toBe(2)
  set({ fmAlloc: 0, fmDacSlot: 0 })
  expect(alarms()).toBe(0)
})
