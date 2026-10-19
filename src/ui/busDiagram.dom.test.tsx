// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'

import { engine } from '../engine/engine.ts'
import { GROUPS } from './controls/index.ts'
import { OpenGroup } from './Section.tsx'
import './testDom.ts'

import type { Controls } from '../controls.ts'

const open = (name: string) => {
  const group = GROUPS.find(g => g.name === name)
  if (!group) throw new Error(`no ${name}`)
  return render(<OpenGroup group={group} onClose={() => {}} seconds={0} />)
}

const press = (name: string) =>
  fireEvent.click(screen.getByRole('button', { name: `${name} controls` }))

const set = (board: Partial<Controls>) =>
  act(() => {
    for (const [key, value] of Object.entries(board))
      engine.set(key as keyof Controls, value)
  })

const drawing = (label: string) => screen.getByRole('img', { name: label })

const texts = (svg: Element) =>
  [...svg.querySelectorAll('text')].map(t => t.textContent)

test.each([
  ['Toy keyboard', 'bus', 'toy keyboard bus wiring'],
  ['Toy drums', 'pattern', 'drum machine bus wiring'],
])('%s draws %s once its %s box is pressed', (group, box, label) => {
  open(group)
  expect(screen.queryByRole('img', { name: label })).toBeNull()
  press(box)
  expect(drawing(label)).not.toBeNull()
})

test('the sample ROM box of the toy drums draws its buses', () => {
  open('Toy drums')
  expect(
    screen.queryByRole('img', { name: 'drum sample ROM bus wiring' }),
  ).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'sample ROM controls' }))
  expect(drawing('drum sample ROM bus wiring')).not.toBeNull()
})

test('the FM chip draws its buses under the bus box', () => {
  open('FM chip')
  expect(screen.queryByRole('img', { name: 'FM chip bus wiring' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'bus controls' }))
  expect(texts(drawing('FM chip bus wiring'))).toContain('D0–D7')
})

test('the home keyboard draws its buses under either bus box', () => {
  open('Home keyboard')
  expect(
    screen.queryByRole('img', { name: 'home keyboard bus wiring' }),
  ).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'addr bus controls' }))
  expect(texts(drawing('home keyboard bus wiring'))).toContain('A0–A13')
  fireEvent.click(screen.getByRole('button', { name: 'data bus controls' }))
  expect(texts(drawing('home keyboard bus wiring'))).toContain('D0–D7')
})

test('the knifed trace carries its line name and fault in the drawing', () => {
  set({ chipAddrLine: 4, chipAddrFault: 1 })
  open('Toy keyboard')
  const svg = drawing('toy keyboard bus wiring')
  expect(texts(svg)).toContain('A3')
  const titles = [...svg.querySelectorAll('title')].map(t => t.textContent)
  expect(titles).toContain('address line: A3 to ground')
  const hit = svg.querySelectorAll('path[class*="traceCut"]')
  expect(hit).toHaveLength(1)
})

test('a bridge lights the knifed trace and its neighbour', () => {
  set({ pcmDataLine: 8, pcmDataFault: 3 })
  open('Home keyboard')
  fireEvent.click(screen.getByRole('button', { name: 'data bus controls' }))
  const svg = drawing('home keyboard bus wiring')
  expect(svg.querySelectorAll('path[class*="traceCut"]')).toHaveLength(2)
})

const titles = (svg: Element) =>
  [...svg.querySelectorAll('title')].map(t => t.textContent)

test('the loop wire is labelled the same whatever it joins, a reset pin included', () => {
  set({ chipLoopFrom: 2, chipLoopTo: 1 })
  open('Toy keyboard')
  const svg = drawing('toy keyboard bus wiring')
  expect(texts(svg)).toContain('loop wire')
  expect(texts(svg).some(t => t?.includes('→'))).toBe(false)
  expect(titles(svg)).toContain('loop wire D1 → A1')
  set({ chipLoopTo: 5 })
  expect(texts(svg)).toContain('reset')
  expect(titles(svg)).toContain('loop wire D1 → reset')
})

test('the drum reset wire and the clock keep their labels as the knobs move', () => {
  open('Toy drums')
  press('pattern')
  const svg = drawing('drum machine bus wiring')
  expect(texts(svg)).toContain('clock')
  expect(texts(svg)).not.toContain('reset')
  set({ drumReset: 2, drumSlip: 0.3 })
  expect(texts(svg)).toContain('reset')
  expect(texts(svg)).toContain('clock')
  expect(texts(svg).some(t => t?.includes('snare'))).toBe(false)
  expect(titles(svg)).toContain('reset on the snare')
  expect(titles(svg)).toContain('clock slips')
})

test('the toy on the FM bus is labelled without its width', () => {
  set({ fmToyBus: 3 })
  open('FM chip')
  fireEvent.click(screen.getByRole('button', { name: 'bus controls' }))
  const svg = drawing('FM chip bus wiring')
  expect(texts(svg)).toContain('toy out')
  expect(titles(svg)).toContain('toy out on D0–D2')
  expect(svg.querySelectorAll('circle[class*="solder"]')).toHaveLength(3)
})

test('pressing a trace knifes it, and pressing it again walks the faults', () => {
  set({ chipAddrLine: 0, chipAddrFault: 0 })
  open('Toy keyboard')
  press('bus')
  const svg = drawing('toy keyboard bus wiring')
  const line = (name: string) =>
    [...svg.querySelectorAll('title')].find(t =>
      t.textContent?.startsWith(`${name}:`),
    )!.parentElement!
  fireEvent.click(line('A2'))
  expect(engine.controls.get().chipAddrLine).toBe(3)
  fireEvent.click(line('A2'))
  expect(engine.controls.get().chipAddrFault).toBe(1)
  fireEvent.click(line('A2'))
  fireEvent.click(line('A2'))
  fireEvent.click(line('A2'))
  expect(engine.controls.get().chipAddrLine).toBe(0)
  expect(engine.controls.get().chipAddrFault).toBe(0)
})

test('the arrow keys move the knife along a focused ribbon', () => {
  set({ pcmDataLine: 2 })
  open('Home keyboard')
  fireEvent.click(screen.getByRole('button', { name: 'data bus controls' }))
  const ribbon = screen.getByRole('button', { name: 'data line knife' })
  fireEvent.keyDown(ribbon, { key: 'ArrowDown' })
  expect(engine.controls.get().pcmDataLine).toBe(3)
  fireEvent.keyDown(ribbon, { key: 'ArrowUp' })
  fireEvent.keyDown(ribbon, { key: 'ArrowUp' })
  fireEvent.keyDown(ribbon, { key: 'ArrowUp' })
  expect(engine.controls.get().pcmDataLine).toBe(1)
})
