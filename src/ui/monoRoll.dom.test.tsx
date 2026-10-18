// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, test } from 'vitest'

import { engine } from '../engine/engine.ts'
import { HOLD, REST } from '../tune.ts'
import { bench } from './bench.ts'
import { GROUPS } from './controls/index.ts'
import { OpenGroup } from './Section.tsx'
import './testDom.ts'

beforeEach(() => {
  bench.set({ ...bench.get(), roll: true })
  act(() => engine.patch({ monoSeqOn: 0, monoSeqLen: 16 }))
})

const openMono = () => {
  const group = GROUPS.find(g => g.name === 'Mono synth')
  if (!group) throw new Error('no Mono synth group')
  return render(<OpenGroup group={group} onClose={() => {}} seconds={0} />)
}

const cell = (name: string) => screen.getByRole('button', { name })
const lit = (name: string) => cell(name).getAttribute('aria-pressed') === 'true'

test('a cell on the mono roll writes its own memory, not the toy’s', () => {
  openMono()
  fireEvent.pointerDown(cell('C4 step 3'), { button: 0 })
  const c = engine.controls.get()
  expect(c.monoSeqStep2).toBe(3)
  expect(c.tuneStep2).toBe(REST)
})

test('drawing a note turns the memory on, and one undo takes both back', () => {
  openMono()
  fireEvent.pointerDown(cell('C4 step 1'), { button: 0 })
  expect(engine.controls.get().monoSeqOn).toBe(1)
  act(() => engine.undo(0))
  expect(engine.controls.get().monoSeqOn).toBe(0)
  expect(engine.controls.get().monoSeqStep0).toBe(REST)
})

test('the same cell again takes the note off', () => {
  openMono()
  fireEvent.pointerDown(cell('C4 step 1'), { button: 0 })
  fireEvent.pointerDown(cell('C4 step 1'), { button: 0 })
  expect(engine.controls.get().monoSeqStep0).toBe(REST)
})

test('a held note draws as one bar', () => {
  openMono()
  act(() =>
    engine.patch({ monoSeqStep0: 3, monoSeqStep1: HOLD, monoSeqStep2: HOLD }),
  )
  expect(lit('C4 step 1')).toBe(true)
  expect(lit('C4 step 3')).toBe(true)
  expect(lit('C4 step 4')).toBe(false)
})

test('clear wipes the memory in one step of the walk', () => {
  openMono()
  act(() => engine.patch({ monoSeqStep0: 3, monoSeqStep5: 7 }))
  fireEvent.click(screen.getByRole('button', { name: 'clear' }))
  expect(engine.controls.get().monoSeqStep0).toBe(REST)
  expect(engine.controls.get().monoSeqStep5).toBe(REST)
  act(() => engine.undo(0))
  expect(engine.controls.get().monoSeqStep5).toBe(7)
})

test('the loop select sets the memory’s own length', () => {
  openMono()
  fireEvent.change(screen.getByLabelText('loop length in steps'), {
    target: { value: '8' },
  })
  expect(engine.controls.get().monoSeqLen).toBe(8)
  expect(engine.controls.get().tuneLen).toBe(32)
})
