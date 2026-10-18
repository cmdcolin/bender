// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS } from '../controls.ts'
import { engine } from '../engine/engine.ts'
import { CHANNELS } from './controls/index.ts'
import { PcmKeysDiagram } from './PcmKeysDiagram.tsx'
import './testDom.ts'

const PCM_TAP = CHANNELS.find(c => c.name === 'Home keyboard')!.tap

const box = (name: string) =>
  screen.getByRole('button', { name: `${name} controls` })

test('the keyboard opens on the ROM, and each box swaps in its own rows', () => {
  engine.writeBoard(DEFAULT_CONTROLS)
  render(<PcmKeysDiagram verbs={() => null} />)
  expect(screen.getByText('Voice')).not.toBeNull()
  fireEvent.click(box('envelope'))
  expect(screen.queryByText('Voice')).toBeNull()
  expect(screen.getByText('Release')).not.toBeNull()
  fireEvent.click(box('keys'))
  expect(screen.getByText('Chord memory')).not.toBeNull()
  fireEvent.click(box('data bus'))
  expect(screen.getByText('Data line')).not.toBeNull()
  expect(screen.queryByText('Address line')).toBeNull()
  fireEvent.click(box('addr bus'))
  expect(screen.getByText('Address line')).not.toBeNull()
})

test('the mix box ends the path and opens nothing', () => {
  engine.writeBoard(DEFAULT_CONTROLS)
  render(<PcmKeysDiagram verbs={() => null} />)
  expect(screen.queryByRole('button', { name: 'mix controls' })).toBeNull()
})

const accent = (name: string) =>
  [box(name).querySelector('rect')!, box(name).querySelector('text')!].map(e =>
    /On/.test(e.getAttribute('class') ?? ''),
  )

test('a box goes accent, frame and name, when a knob inside is off stock', () => {
  engine.writeBoard({ ...DEFAULT_CONTROLS, pcmDataLine: 3 })
  render(<PcmKeysDiagram verbs={() => null} />)
  expect(accent('data bus')).toEqual([true, true])
  expect(accent('addr bus')).toEqual([false, false])
})

const lit = (wire: Element) => wire.getAttribute('class')!.includes('wireOn')
const wires = (container: HTMLElement) => [
  ...container.querySelectorAll('path[marker-end]'),
]

test('the path lights from the ROM on, and only while the keyboard sounds', () => {
  engine.writeBoard(DEFAULT_CONTROLS)
  act(() => engine.sounding.set(0))
  const { container } = render(<PcmKeysDiagram verbs={() => null} />)
  expect(wires(container).filter(lit)).toHaveLength(0)
  act(() => engine.sounding.set(1 << PCM_TAP))
  expect(wires(container).filter(lit)).toHaveLength(3)
  act(() => engine.sounding.set(0))
})
