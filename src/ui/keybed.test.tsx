// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { expect, test } from 'vitest'
import { engine } from '../engine/engine'
import { App } from './App'
import { FmKeys } from './FmKeys'
import { Keys } from './Keys'
import './testDom'

// Two keybeds on one panel, and one computer keyboard in front of them. What
// makes that work at all is that a note says which bed it came off: the FM
// chip's key input used to be soldered to the toy's gate and nothing else, so
// every note on the board was the toy's note by construction.

const bed = (name: string) => within(screen.getByRole('group', { name }))
const middleC = (name: string) =>
  bed(name).getByRole('button', { name: 'key C4' })

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

  fireEvent.click(
    bed('fm keyboard').getByRole('button', { name: 'computer keyboard' }),
  )
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
  fireEvent.click(
    bed('fm keyboard').getByRole('button', { name: 'computer keyboard' }),
  )
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
