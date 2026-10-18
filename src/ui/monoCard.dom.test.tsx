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
      group={GROUPS.find(g => g.name === 'Mono synth')!}
      onClose={() => {}}
      seconds={0}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'voice card controls' }))
}

const set = (board: Partial<Controls>) =>
  act(() => {
    for (const [key, value] of Object.entries(board))
      engine.set(key as keyof Controls, value)
  })

const card = () =>
  screen.getByRole('img', { name: 'mono synth voice card faults' })

const words = () => [...card().querySelectorAll('text')].map(t => t.textContent)

const group = (title: string) =>
  [...card().querySelectorAll('g')].find(g =>
    g.querySelector('title')?.textContent?.startsWith(`${title} —`),
  )!

test('the stock card names its parts and reads no fault', () => {
  open()
  expect(words()).toEqual(
    expect.arrayContaining([
      'key DAC',
      'hold',
      'exp conv',
      'oscs',
      'ladder',
      'VCA',
      'regulator',
      'contours',
    ]),
  )
  expect(words().filter(w => /%|\/s|×|\+/.test(w ?? ''))).toEqual([])
})

test('each fault reads on the part it bends', () => {
  open()
  set({
    monoHeat: 0.5,
    monoLeak: 0.25,
    monoCap: 12,
    monoMismatch: 0.75,
    monoDroop: 1.5,
    monoDacBit: 4,
    monoSag: 0.4,
  })
  const reads: [string, string][] = [
    ['key DAC', 'b3 +8'],
    ['hold', '1.5/s'],
    ['exp conv', '50%'],
    ['ladder', '75%'],
    ['VCA', '25%'],
    ['regulator', '40%'],
    ['contours', '×12'],
  ]
  for (const [part, reading] of reads)
    expect(group(part).textContent, part).toContain(reading)
})

test('the pitch hold and converter keep their place when a reading appears', () => {
  open()
  const xs = () =>
    [...card().querySelectorAll('rect')].map(r => r.getAttribute('x'))
  const before = xs()
  set({ monoHeat: 1, monoDroop: 2, monoDacBit: 7 })
  expect(xs()).toEqual(before)
})
