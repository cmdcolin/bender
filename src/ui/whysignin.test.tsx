// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'

import { App } from './App'
import { PITCH, SHOT, SHOT_ALT } from './whySignIn'
import './testDom'

// Signed out, a save is the moment somebody wants an account — so it is the
// moment the app owes them the reason for one. Nothing here signs in: what is
// under test is the question, and that a press that cannot land yet still says
// something.

const saveBtn = () => screen.getByRole('button', { name: 'save' })
const dialog = () => screen.queryByRole('dialog', { name: 'why sign in' })

test('save with nobody signed in asks the question, and names the board', () => {
  render(<App />)
  expect(dialog()).toBe(null)

  fireEvent.click(saveBtn())
  const card = screen.getByRole('dialog', { name: 'why sign in' })
  // The board is the stock one, so the name it offers is the preset it stands
  // on — and the dialog says which board is waiting on the answer.
  expect(card.textContent).toMatch(/Signing in saves the board on screen as/)
  expect(
    screen.getByRole('button', { name: 'sign in with Google' }),
  ).toBeTruthy()

  fireEvent.click(screen.getByRole('button', { name: 'close' }))
  expect(dialog()).toBe(null)
})

test('ctrl+S asks it too, which is the press that reaches nothing otherwise', () => {
  render(<App />)
  fireEvent.keyDown(window, { key: 's', ctrlKey: true })
  expect(dialog()).not.toBe(null)
})

test('the menu carries the question for anyone who wants it unasked', () => {
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'menu' }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'why sign in?' }))
  const card = screen.getByRole('dialog', { name: 'why sign in' })
  // Opened cold rather than by a save, so there is no board waiting.
  expect(card.textContent).not.toMatch(/Signing in saves/)
  expect(card.textContent).toContain(PITCH)
})

test('the card shows the home page it is asking for an account to fill', () => {
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'menu' }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'why sign in?' }))
  const shot = screen.getByAltText(SHOT_ALT)
  expect(shot.getAttribute('src')?.endsWith(SHOT)).toBe(true)
})

test('the library popover answers it, and gets out of the way', () => {
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'saved' }))
  fireEvent.click(screen.getByRole('button', { name: 'why sign in?' }))
  expect(dialog()).not.toBe(null)
  expect(screen.queryByRole('group', { name: 'saved voices' })).toBe(null)
})

// The library button and the account are two controls, and each says only what
// it is: `saved` opens the list, `sign in` asks Google. One button that read
// `sign in` until you answered it and `saved` after was the whole confusion.
test('the library button never offers itself as the sign-in', () => {
  render(<App />)
  expect(screen.getByRole('button', { name: 'saved' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'sign in' })).toBeTruthy()
})
