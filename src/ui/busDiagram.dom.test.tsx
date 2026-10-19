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
  ['Plinky', 'bus', 'plinky bus wiring'],
  ['Clatter', 'pattern', 'drum machine bus wiring'],
])('%s draws %s once its %s box is pressed', (group, box, label) => {
  open(group)
  expect(screen.queryByRole('img', { name: label })).toBeNull()
  press(box)
  expect(drawing(label)).not.toBeNull()
})

test.each([
  ['Plinky', 'bus', 'toy chip die', 'plinky bus wiring'],
  ['Glint', 'die', 'glint signal path', 'FM die and driver'],
  ['Growler', 'voice card', 'growler voice card', 'growler voice card faults'],
])(
  '%s names the %s close-up and draws it straight under itself',
  (group, box, parent, close) => {
    open(group)
    press(box)
    expect(texts(drawing(parent))).toContain(`zoom: ${box}`)
    const below = drawing(parent).compareDocumentPosition(drawing(close))
    expect(below & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const row = screen.getAllByRole('slider').at(-1)!
    expect(
      drawing(close).compareDocumentPosition(row) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  },
)

test('the sample ROM box of the toy drums draws its buses', () => {
  open('Clatter')
  expect(
    screen.queryByRole('img', { name: 'drum sample ROM bus wiring' }),
  ).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'sample ROM controls' }))
  expect(drawing('drum sample ROM bus wiring')).not.toBeNull()
})

test('the FM chip draws its buses under the bus box', () => {
  open('Glint')
  expect(screen.queryByRole('img', { name: 'glint bus wiring' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'bus controls' }))
  expect(texts(drawing('glint bus wiring'))).toContain('D0–D7')
})

test('the home keyboard draws its buses under either bus box', () => {
  open('Parlor')
  expect(screen.queryByRole('img', { name: 'parlor bus wiring' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'addr bus controls' }))
  expect(texts(drawing('parlor bus wiring'))).toContain('A0–A13')
  fireEvent.click(screen.getByRole('button', { name: 'data bus controls' }))
  expect(texts(drawing('parlor bus wiring'))).toContain('D0–D7')
})

test('the knifed trace carries its line name and fault in the drawing', () => {
  set({ chipAddrLine: 4, chipAddrFault: 1 })
  open('Plinky')
  const svg = drawing('plinky bus wiring')
  expect(texts(svg)).toContain('A3')
  const titles = [...svg.querySelectorAll('title')].map(t => t.textContent)
  expect(titles).toContain('address line: A3 to ground')
  const hit = svg.querySelectorAll('path[class*="traceCut"]')
  expect(hit).toHaveLength(1)
})

test('a bridge lights the knifed trace and its neighbour', () => {
  set({ pcmDataLine: 8, pcmDataFault: 3 })
  open('Parlor')
  fireEvent.click(screen.getByRole('button', { name: 'data bus controls' }))
  const svg = drawing('parlor bus wiring')
  expect(svg.querySelectorAll('path[class*="traceCut"]')).toHaveLength(2)
})

const titles = (svg: Element) =>
  [...svg.querySelectorAll('title')].map(t => t.textContent)

test('the loop wire is labelled the same whatever it joins, a reset pin included', () => {
  set({ chipLoopFrom: 2, chipLoopTo: 1 })
  open('Plinky')
  const svg = drawing('plinky bus wiring')
  expect(texts(svg)).toContain('loop wire')
  expect(texts(svg).some(t => t?.includes('→'))).toBe(false)
  expect(titles(svg)).toContain('loop wire D1 → A1')
  set({ chipLoopTo: 5 })
  expect(texts(svg)).toContain('reset')
  expect(titles(svg)).toContain('loop wire D1 → reset')
})

test('the drum reset wire and the clock keep their labels as the knobs move', () => {
  open('Clatter')
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
  open('Glint')
  fireEvent.click(screen.getByRole('button', { name: 'bus controls' }))
  const svg = drawing('glint bus wiring')
  expect(texts(svg)).toContain('toy out')
  expect(titles(svg)).toContain('toy out on D0–D2')
  expect(svg.querySelectorAll('circle[class*="solder"]')).toHaveLength(3)
})

test('pressing a trace knifes it, and pressing it again walks the faults', () => {
  set({ chipAddrLine: 0, chipAddrFault: 0 })
  open('Plinky')
  press('bus')
  const svg = drawing('plinky bus wiring')
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
  open('Parlor')
  fireEvent.click(screen.getByRole('button', { name: 'data bus controls' }))
  const ribbon = screen.getByRole('button', { name: 'data line knife' })
  fireEvent.keyDown(ribbon, { key: 'ArrowDown' })
  expect(engine.controls.get().pcmDataLine).toBe(3)
  fireEvent.keyDown(ribbon, { key: 'ArrowUp' })
  fireEvent.keyDown(ribbon, { key: 'ArrowUp' })
  fireEvent.keyDown(ribbon, { key: 'ArrowUp' })
  expect(engine.controls.get().pcmDataLine).toBe(1)
})
