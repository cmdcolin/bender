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

// Drawing into a memory the chip is not playing is the same silence arming
// record would be: the roll is what you are hearing, or it is a drawing.
test('drawing on the roll puts the chip on the memory', () => {
  act(() => engine.set('chipTune', 0))
  openKeyboard()
  fireEvent.pointerDown(cell('C4 step 1'), { button: 0 })
  expect(engine.controls.get().chipTune).toBe(YOURS)
  expect(engine.controls.get().tuneStep0).toBe(3)

  // Both go back together: the note and the tune it took the chip off.
  act(() => engine.undo(0))
  expect(engine.controls.get().chipTune).toBe(0)
  expect(engine.controls.get().tuneStep0).toBe(REST)
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

// A hand plays chords and the toy sounds four of them; what used to be mono is
// the memory. A second note on a step lands on the chip stacked under the
// first, and the note already there stays where it is.
test('a step holds a chord, a note a lane', () => {
  openKeyboard()
  fireEvent.pointerDown(cell('C4 step 1'), { button: 0 })
  fireEvent.pointerDown(cell('E4 step 1'), { button: 0 })
  fireEvent.pointerDown(cell('G4 step 1'), { button: 0 })
  const c = engine.controls.get()
  expect([c.tuneStep0, c.tuneStackA0, c.tuneStackB0]).toEqual([3, 7, 10])
  expect(lit('C4 step 1')).toBe(true)
  expect(lit('E4 step 1')).toBe(true)
  expect(lit('G4 step 1')).toBe(true)

  // And a note comes off its own lane rather than off the top of the chord.
  fireEvent.pointerDown(cell('E4 step 1'), { button: 0 })
  const after = engine.controls.get()
  expect([after.tuneStep0, after.tuneStackA0, after.tuneStackB0]).toEqual([
    3,
    REST,
    10,
  ])
})

// Mono is the memory the toy shipped with: one word a step, so the second note
// is the note on the step.
test('with the memory in mono a step keeps the last note written', () => {
  openKeyboard()
  act(() => engine.set('tunePoly', 0))
  fireEvent.pointerDown(cell('C4 step 1'), { button: 0 })
  fireEvent.pointerDown(cell('E4 step 1'), { button: 0 })
  const c = engine.controls.get()
  expect(c.tuneStep0).toBe(7)
  expect(c.tuneStackA0).toBe(REST)
  expect(lit('C4 step 1')).toBe(false)
})

// The switch sits with the tune picker above the roll, and like the rate under
// it, it is only there when the chip is on your own memory.
test('the poly switch says which memory the chip is reading', () => {
  act(() => engine.set('chipTune', YOURS))
  openKeyboard()
  fireEvent.click(screen.getByRole('button', { name: 'mono' }))
  expect(engine.controls.get().tunePoly).toBe(0)
  fireEvent.click(screen.getByRole('button', { name: 'poly' }))
  expect(engine.controls.get().tunePoly).toBe(1)
})
