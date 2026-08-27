// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { DEFAULT_CONTROLS, sameControls } from '../controls'
import { engine } from '../engine/engine'
import { Dice } from './Dice'
import './testDom'

// The eight rolls behind one button. What the row of eight was good at is that
// every one of them was one press, and the menu is only worth having if picking
// out of it is one press too — so the two things worth pinning are that a pick
// rolls there and then, and that it stays on the face afterwards.

const face = () => screen.getAllByRole('button')[0]!
const caret = () => screen.getByRole('button', { name: 'pick a kind of roll' })

const moved = () => !sameControls(engine.controls.get(), DEFAULT_CONTROLS)

test('the face rolls, and starts on the blind one', () => {
  render(<Dice seconds={0} onLanded={() => {}} />)
  expect(face().textContent).toBe('random')
  fireEvent.click(face())
  expect(moved()).toBe(true)
})

test('picking out of the menu rolls it there and then', () => {
  render(<Dice seconds={0} onLanded={() => {}} />)
  fireEvent.click(caret())
  fireEvent.click(screen.getByRole('menuitem', { name: 'random wreck' }))
  expect(moved()).toBe(true)
  // Every feedback past unity is what a wreck is for, and what says the pick
  // rolled the one it names rather than whatever the face was holding.
  expect(engine.controls.get().fbAmt).toBeGreaterThan(1)
})

test('what you picked stays on the face, so going again is one press', () => {
  render(<Dice seconds={0} onLanded={() => {}} />)
  fireEvent.click(caret())
  fireEvent.click(screen.getByRole('menuitem', { name: 'random slam' }))
  expect(face().textContent).toBe('random slam')
  expect(screen.queryByRole('menu')).toBeNull()

  engine.writeBoard({ ...DEFAULT_CONTROLS })
  fireEvent.click(face())
  expect(moved()).toBe(true)
})

// A hunt is the one that does not hand a board back — it goes and plays six of
// them first — so the face has to be able to hold something that is not a roll.
test('the hunt is in the menu and runs as a hunt', () => {
  render(<Dice seconds={0} onLanded={() => {}} />)
  fireEvent.click(caret())
  fireEvent.click(screen.getByRole('menuitem', { name: 'hunt an edge' }))
  expect(engine.hunting.get()).toBe(true)
  expect(face().textContent).toBe('hunt an edge')
  engine.stopHunt()
})

test('escape closes the menu without rolling', () => {
  render(<Dice seconds={0} onLanded={() => {}} />)
  fireEvent.click(caret())
  expect(screen.getByRole('menu')).toBeTruthy()
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(screen.queryByRole('menu')).toBeNull()
  expect(moved()).toBe(false)
})
