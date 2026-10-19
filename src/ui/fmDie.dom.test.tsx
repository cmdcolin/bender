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
      group={GROUPS.find(g => g.name === 'Glint')!}
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

const die = () => screen.getByRole('group', { name: 'FM die and driver' })

const words = () => [...die().querySelectorAll('text')].map(t => t.textContent)

const alarms = () => die().querySelectorAll('path[class*="wireAlarm"]').length

const lit = (name: string) =>
  [...die().querySelectorAll('text')]
    .find(t => t.textContent === name)!
    .getAttribute('class')!
    .includes('On')

test('the stock die names its parts, lights none and shows no value', () => {
  open()
  expect(words()).toEqual(
    expect.arrayContaining([
      'allocator',
      'registers',
      'voices',
      'voice 1',
      'voice 4',
      'DAC',
      'adder',
    ]),
  )
  expect(words().filter(w => /%|stuck|garbage|bits/.test(w ?? ''))).toEqual([])
  for (const name of ['allocator', 'registers', 'voices', 'DAC'])
    expect(lit(name), name).toBe(false)
  expect(alarms()).toBe(0)
})

test('each fault lights the part it bends', () => {
  open()
  set({ fmAlloc: 2 })
  expect(lit('allocator')).toBe(true)
  set({ fmColdBoot: 1 })
  expect(lit('registers')).toBe(true)
  set({ fmAdder: 3 })
  expect(lit('voices')).toBe(true)
  set({ fmDacSlot: 3 })
  expect(lit('DAC')).toBe(true)
  expect(words().filter(w => /\d%|stuck|garbage|bits/.test(w ?? ''))).toEqual(
    [],
  )
})

test('slip lights the converter without a number', () => {
  open()
  set({ fmDacSlip: 0.4 })
  expect(lit('DAC')).toBe(true)
  expect(words().join()).not.toContain('%')
})

const alarmRow = () => {
  const d = die().querySelector('path[class*="wireAlarm"]')?.getAttribute('d')
  return Number(/V(\d+(?:\.\d+)?)/.exec(d ?? '')?.[1])
}

const dashes = () => die().querySelectorAll('path[class*="wireDash"]').length

test('a stuck allocator draws its channel in red and the other three dashed', () => {
  open()
  const rows = [1, 2, 3, 4].map(n => {
    set({ fmAlloc: n })
    expect(alarms()).toBe(1)
    expect(dashes()).toBe(3)
    return alarmRow()
  })
  expect(rows).toEqual(rows.toSorted((a, b) => a - b))
  expect(new Set(rows).size).toBe(4)
  set({ fmAlloc: 0 })
  expect(alarms()).toBe(0)
  expect(dashes()).toBe(0)
})

test('a stuck slot draws its channel in red beside the allocator’s', () => {
  open()
  set({ fmAlloc: 2, fmDacSlot: 3 })
  expect(alarms()).toBe(2)
  expect(dashes()).toBe(6)
  set({ fmAlloc: 0, fmDacSlot: 0 })
  expect(alarms()).toBe(0)
})

test('each part opens its own knobs, and only those', () => {
  open()
  expect(screen.queryByText('Allocator')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'allocator controls' }))
  expect(screen.getByText('Allocator')).not.toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'DAC controls' }))
  expect(screen.queryByText('Allocator')).toBeNull()
  expect(screen.getByText('DAC slot')).not.toBeNull()
})
