// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { engine } from '../engine/engine'
import { YOURS } from '../dsp/stages/roms'
import { HOLD, REST } from '../tune'
import { GROUPS } from './controls'
import { OpenGroup } from './Section'
import './testDom'

// The melody memory, as the panel draws it. An empty memory opens on the
// keyboard's own bottom C, so these name their cells from there.
const openKeyboard = () => {
  const group = GROUPS.find(g => g.name === 'Toy keyboard')
  if (!group) throw new Error('no Toy keyboard group')
  return render(<OpenGroup group={group} onClose={() => {}} seconds={0} />)
}

const cell = (name: string) => screen.getByRole('button', { name })
const lit = (name: string) => cell(name).getAttribute('aria-pressed') === 'true'

test('a cell on the roll writes the step it names', () => {
  openKeyboard()
  fireEvent.pointerDown(cell('C4 step 3'), { button: 0 })
  expect(engine.controls.get().tuneStep2).toBe(3)
  expect(lit('C4 step 3')).toBe(true)

  // The same cell again takes the note off, the way a step on the kit's grid
  // does — a note you can see and cannot clear is a note stuck on the roll.
  fireEvent.pointerDown(cell('C4 step 3'), { button: 0 })
  expect(engine.controls.get().tuneStep2).toBe(REST)
  expect(lit('C4 step 3')).toBe(false)
})

// A held note is one bar across the steps it covers, not a note and then three
// dark cells: the roll resolves the holds so what you see is what sounds.
test('a note held over steps draws as one bar', () => {
  openKeyboard()
  act(() => engine.patch({ tuneStep0: 3, tuneStep1: HOLD, tuneStep2: HOLD }))
  expect(lit('C4 step 1')).toBe(true)
  expect(lit('C4 step 2')).toBe(true)
  expect(lit('C4 step 3')).toBe(true)
  expect(lit('C4 step 4')).toBe(false)
  // And nothing else on the board is lit by it.
  expect(lit('C#4 step 2')).toBe(false)
})

// Recording into a memory the chip is not playing is the one state where every
// light says it is working and nothing you play comes back.
test('arming record from the roll puts the chip on the memory', () => {
  openKeyboard()
  fireEvent.click(screen.getByRole('button', { name: 'record' }))
  expect(engine.tuneRecord.get()).toBe(true)
  expect(engine.controls.get().chipTune).toBe(YOURS)
})

test('clear wipes every step, and one undo puts them back', () => {
  openKeyboard()
  act(() => engine.patch({ tuneStep0: 3, tuneStep5: 7 }))
  fireEvent.click(screen.getByRole('button', { name: 'clear' }))
  expect(engine.controls.get().tuneStep0).toBe(REST)
  expect(engine.controls.get().tuneStep5).toBe(REST)

  act(() => engine.undo(0))
  expect(engine.controls.get().tuneStep0).toBe(3)
  expect(engine.controls.get().tuneStep5).toBe(7)
})

// The roll reaches further than the two octaves it draws, and the octave
// buttons are the only way to the rest of it.
test('the window moves an octave at a time', () => {
  openKeyboard()
  // Two octaves from the keyboard's own bottom C, which is where an empty
  // memory opens.
  expect(screen.queryByRole('button', { name: 'C3 step 1' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'C5 step 1' })).toBeNull()

  fireEvent.click(screen.getByRole('button', { name: 'window up an octave' }))
  expect(screen.queryByRole('button', { name: 'C5 step 1' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'C3 step 1' })).toBeNull()
})
