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

const set = (board: Partial<Controls>) =>
  act(() => {
    for (const [key, value] of Object.entries(board))
      engine.set(key as keyof Controls, value)
  })

const drawing = (label: string) => screen.getByRole('img', { name: label })

const texts = (svg: Element) =>
  [...svg.querySelectorAll('text')].map(t => t.textContent)

test.each([
  ['Toy keyboard', 'toy keyboard bus wiring'],
  ['Toy drums', 'drum machine bus wiring'],
  ['Toy drums', 'drum sample ROM bus wiring'],
  ['Home keyboard', 'home keyboard bus wiring'],
])('%s draws %s', (group, label) => {
  open(group)
  expect(drawing(label)).not.toBeNull()
})

test('the FM chip draws its buses under the bus box', () => {
  open('FM chip')
  expect(screen.queryByRole('img', { name: 'FM chip bus wiring' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'bus controls' }))
  expect(texts(drawing('FM chip bus wiring'))).toContain('D0–D7')
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
  const svg = drawing('home keyboard bus wiring')
  expect(svg.querySelectorAll('path[class*="traceCut"]')).toHaveLength(2)
})

test('the loop wire names the pins it joins, a reset pin included', () => {
  set({ chipLoopFrom: 2, chipLoopTo: 1 })
  open('Toy keyboard')
  expect(texts(drawing('toy keyboard bus wiring'))).toContain(
    'loop wire D1 → A1',
  )
  set({ chipLoopTo: 5 })
  const svg = drawing('toy keyboard bus wiring')
  expect(texts(svg)).toContain('loop wire D1 → reset')
  expect(texts(svg)).toContain('reset')
})

test('the drum reset wire and the clock follow their knobs', () => {
  open('Toy drums')
  const svg = drawing('drum machine bus wiring')
  expect(texts(svg)).toContain('clock')
  expect(texts(svg).some(t => t?.startsWith('reset'))).toBe(false)
  set({ drumReset: 2, drumSlip: 0.3 })
  expect(texts(svg)).toContain('reset on the snare')
  expect(texts(svg)).toContain('clock slips')
})

test('the toy on the FM bus names the data lines it is soldered across', () => {
  set({ fmToyBus: 3 })
  open('FM chip')
  fireEvent.click(screen.getByRole('button', { name: 'bus controls' }))
  const svg = drawing('FM chip bus wiring')
  expect(texts(svg)).toContain('toy out on D0–D2')
  expect(svg.querySelectorAll('circle[class*="solder"]')).toHaveLength(3)
})
