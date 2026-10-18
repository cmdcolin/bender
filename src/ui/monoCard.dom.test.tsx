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

const lit = (title: string) =>
  group(title).querySelector('text')!.getAttribute('class')!.includes('On')

test('the stock card names its parts, lights none and shows no value', () => {
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
  expect(words().filter(w => /\d|%|\/s|×|\+/.test(w ?? ''))).toEqual([])
  for (const part of words())
    if (part !== 'out') expect(lit(part), part).toBe(false)
})

test('each fault lights the part it bends and writes no number', () => {
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
  for (const part of [
    'key DAC',
    'hold',
    'exp conv',
    'ladder',
    'VCA',
    'regulator',
    'contours',
  ])
    expect(lit(part), part).toBe(true)
  expect(lit('oscs')).toBe(false)
  expect(words().filter(w => /\d|%|\/s|×|\+/.test(w ?? ''))).toEqual([])
})

const centre = (title: string) => {
  const rect = group(title).querySelector('rect')!
  return +rect.getAttribute('x')! + +rect.getAttribute('width')! / 2
}

const drops = () =>
  [...card().querySelectorAll('path[class*="wireDash"]')].map(p => {
    const [, x, y0, y1] = /M([\d.]+) ([\d.]+) V([\d.]+)/
      .exec(p.getAttribute('d')!)!
      .map(Number) as [number, number, number, number]
    return { x, down: y0 < y1 }
  })

test('the regulator feeds the converter and ladder, the contours feed the ladder and VCA', () => {
  open()
  const xs = (down: boolean) =>
    drops()
      .filter(d => d.down === down)
      .map(d => d.x)
      .toSorted((a, b) => a - b)
  expect(xs(true)).toEqual([centre('exp conv'), centre('ladder')])
  expect(xs(false)).toEqual([centre('ladder'), centre('VCA')])
})

test('each part of the card opens its own knob', () => {
  open()
  expect(screen.queryByText('Sag')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'regulator controls' }))
  expect(screen.getByText('Sag')).not.toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'VCA controls' }))
  expect(screen.queryByText('Sag')).toBeNull()
  expect(screen.getByText('Leaky VCA')).not.toBeNull()
})
