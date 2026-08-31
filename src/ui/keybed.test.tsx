// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { expect, test } from 'vitest'
import { engine } from '../engine/engine'
import { App } from './App'
import { FmKeys } from './FmKeys'
import { Keys } from './Keys'
import { measure, touch } from './testDom'

// Two keybeds on one panel, and one computer keyboard in front of them. What
// makes that work at all is that a note says which bed it came off: the FM
// chip's key input used to be soldered to the toy's gate and nothing else, so
// every note on the board was the toy's note by construction.

const bed = (name: string) => within(screen.getByRole('group', { name }))
const middleC = (name: string) =>
  bed(name).getByRole('button', { name: 'key C4' })

// A press, the way the browser sends one: the menu dismisses itself on the
// pointer going down anywhere that is not itself, and the button that opens it
// is exactly where that has to not count.
const press = (el: HTMLElement) => {
  fireEvent.pointerDown(el)
  fireEvent.click(el)
}

const bars = (name: string) =>
  bed(name).getByRole('button', { name: 'keyboard settings' })

// The letters wire lives in the drawer on each bed's deck rather than on a cap
// of its own, so moving it is two presses: open, pick.
const wireLetters = (name: string) => {
  press(bars(name))
  fireEvent.click(bed(name).getByRole('checkbox'))
}

const both = () => {
  render(<Keys />)
  render(<FmKeys />)
}

test('a key on the FM bed plays the FM chip and not the toy', () => {
  both()
  fireEvent.pointerDown(middleC('fm keyboard'))
  expect(engine.fmKeysDown.get().size).toBe(1)
  expect(engine.keysDown.get().size).toBe(0)
  fireEvent.pointerUp(middleC('fm keyboard'))
  expect(engine.fmKeysDown.get().size).toBe(0)
})

test('a key on the toy bed still plays the toy', () => {
  both()
  fireEvent.pointerDown(middleC('toy keyboard'))
  expect(engine.keysDown.get().size).toBe(1)
  expect(engine.fmKeysDown.get().size).toBe(0)
})

// One keyboard, two beds: the letters are a wire that goes to one of them, and
// the switch is what moves it. Left as it was, the letters play the toy, which
// is where every board made before there was a second bed expects them.
test('the letter keys play whichever bed they are wired to', () => {
  both()
  fireEvent.keyDown(window, { key: 'a' })
  expect(engine.keysDown.get().size).toBe(1)
  expect(engine.fmKeysDown.get().size).toBe(0)
  fireEvent.keyUp(window, { key: 'a' })

  wireLetters('fm keyboard')
  fireEvent.keyDown(window, { key: 'a' })
  expect(engine.fmKeysDown.get().size).toBe(1)
  expect(engine.keysDown.get().size).toBe(0)
})

// A letter key struck a note and then the wire moved. Nothing is going to send
// the key-up to the bed that is still holding it, so moving the wire is what
// has to let it go.
test('moving the letters lets go of what they were holding', () => {
  both()
  fireEvent.keyDown(window, { key: 'a' })
  expect(engine.keysDown.get().size).toBe(1)
  wireLetters('fm keyboard')
  expect(engine.keysDown.get().size).toBe(0)
})

test('the gate switch cuts the jumper, and the walk takes it back', () => {
  render(<FmKeys />)
  fireEvent.click(screen.getByRole('button', { name: 'toy gate' }))
  expect(engine.controls.get().fmKeyGate).toBe(1)
  expect(screen.getByRole('button', { name: 'gate cut' })).toBeTruthy()
  act(() => engine.undo(0))
  expect(engine.controls.get().fmKeyGate).toBe(0)
})

// The bed arrives with the chip it plays. A board with the FM chip down is the
// board everyone had before there was a second keyboard, and it looks like it.
test('the FM bed is drawn once the chip is in the mix', () => {
  render(<App />)
  expect(screen.queryByRole('group', { name: 'fm keyboard' })).toBeNull()
  act(() => engine.set('fmLevel', 0.8))
  expect(screen.getByRole('group', { name: 'fm keyboard' })).toBeTruthy()
})

// One keyboard and two beds, so the box cannot just be empty: switching the
// letters off here is switching them on next door. The drawer stays open
// through it, which is what makes it a drawer of settings rather than a menu of
// commands.
test('turning the letters off one bed hands them to the other', () => {
  both()
  wireLetters('fm keyboard')
  fireEvent.click(bed('fm keyboard').getByRole('checkbox'))
  fireEvent.keyDown(window, { key: 'a' })
  expect(engine.keysDown.get().size).toBe(1)
  expect(engine.fmKeysDown.get().size).toBe(0)
})

test('a second press on the bars shuts the drawer again', () => {
  both()
  press(bars('toy keyboard'))
  expect(bed('toy keyboard').queryByRole('checkbox')).not.toBeNull()
  press(bars('toy keyboard'))
  expect(bed('toy keyboard').queryByRole('checkbox')).toBeNull()
})

// Three octaves is twenty-two white keys, and a case narrow enough — a phone
// held upright, a window pulled in until the panel has taken most of it — draws
// them thin enough that a finger lands between two of them. The bed measures
// itself and draws one octave instead, and the switch that was always how you
// reached past the drawn keys is how you reach the ones it stopped drawing.
test('a case with no room for three octaves draws one', () => {
  render(<Keys />)
  const toy = () => bed('toy keyboard')
  expect(toy().queryByRole('button', { name: 'key C6' })).not.toBeNull()

  act(() => measure(300))
  expect(toy().queryByRole('button', { name: 'key C6' })).toBeNull()
  expect(toy().queryByRole('button', { name: 'key C4' })).not.toBeNull()

  // The five caps are one stepper, and it still reaches what the long board
  // reached: two octaves up from a board that opens on C3 is one that closes on
  // C6.
  expect(toy().queryByRole('button', { name: '+2' })).toBeNull()
  fireEvent.click(toy().getByRole('button', { name: 'octave up' }))
  fireEvent.click(toy().getByRole('button', { name: 'octave up' }))
  expect(toy().queryByRole('button', { name: 'key C6' })).not.toBeNull()
  expect(toy().getByRole('button', { name: 'octave up' })).toHaveProperty(
    'disabled',
    true,
  )
})

// The board narrows under a note that is still sounding. Whatever was pinned
// down keeps playing off the end of the short bed — the arrow says so — and the
// hold switch still lets go of it, because what a bed holds is notes rather
// than the keys they were struck on.
test('a note held past the end of a shortened board can still be let go', () => {
  render(<Keys />)
  const toy = () => bed('toy keyboard')
  fireEvent.click(toy().getByRole('button', { name: 'hold' }))
  const top = toy().getByRole('button', { name: 'key C5' })
  fireEvent.pointerDown(top)
  fireEvent.pointerUp(top)
  expect(engine.keysDown.get().size).toBe(1)

  act(() => measure(300))
  expect(toy().queryByRole('button', { name: 'key C5' })).toBeNull()
  fireEvent.click(toy().getByRole('button', { name: 'hold' }))
  expect(engine.keysDown.get().size).toBe(0)
})

// The same case, and the other thing that decides how much board goes in it. A
// key a pointer hits every time is one a thumb lands beside, so the width that
// holds three octaves for a mouse holds two for a finger — nothing about the
// window says which is on it.
test('a finger is given fewer keys than a pointer in the same case', () => {
  render(<Keys />)
  const toy = () => bed('toy keyboard')
  act(() => measure(600))
  expect(toy().queryByRole('button', { name: 'key C6' })).not.toBeNull()

  act(() => touch(true))
  expect(toy().queryByRole('button', { name: 'key C6' })).toBeNull()
  expect(toy().queryByRole('button', { name: 'key C5' })).not.toBeNull()
})
