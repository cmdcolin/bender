// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import { MidiPanel } from './MidiPanel'
import { midi } from './midi'
import './testDom'

// The wire lives behind a button in the nameplate row now rather than in a
// section of its own. What that has to get right is the half it leaves outside:
// a bound knob goes inert when the board moves out from under it, and the panel
// saying nothing about that is a board whose knobs have quietly stopped working.

const tab = () => screen.getByRole('button', { name: /^midi/ })

afterEach(() => {
  midi.status.set('idle')
  midi.bindings.set({})
  midi.pickups.set({})
})

test('the wire costs the panel nothing until it is asked for', () => {
  render(<MidiPanel />)
  expect(screen.queryByRole('dialog')).toBeNull()
  fireEvent.click(tab())
  expect(screen.getByRole('dialog')).toBeTruthy()
})

// Not modal: binding a control is done on the control, with the ⚟ on its slider
// row in whatever stage is open behind this. A dialog that took the panel away
// would be one you have to close to use the thing it is about.
test('the dialog leaves the panel behind it reachable', () => {
  render(<MidiPanel />)
  fireEvent.click(tab())
  const dialog = screen.getByRole('dialog') as HTMLDialogElement
  expect(dialog.open).toBe(true)
  // show() and not showModal(): a modal makes the rest of the page inert, and
  // the rest of the page is where the mark that binds a control lives.
  expect(dialog.matches(':modal')).toBe(false)
})

test('escape and the close button both shut it', () => {
  render(<MidiPanel />)
  fireEvent.click(tab())
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(screen.queryByRole('dialog')).toBeNull()

  fireEvent.click(tab())
  fireEvent.click(screen.getByRole('button', { name: 'close midi' }))
  expect(screen.queryByRole('dialog')).toBeNull()
})

// The one thing that must survive being folded away. A stranded knob is one the
// board has moved out from under — it does nothing until you sweep it back
// through its value — and the count is the only thing on screen that says so.
test('the button carries what is bound, and what has gone inert', () => {
  const { rerender } = render(<MidiPanel />)
  expect(tab().textContent).toBe('midi')

  midi.status.set('ready')
  midi.bindings.set({ combMix: { controller: 1, channel: 0 } })
  rerender(<MidiPanel />)
  expect(tab().textContent).toContain('1 bound')

  midi.pickups.set({ combMix: 0.5 })
  rerender(<MidiPanel />)
  expect(tab().textContent).toContain('1 waiting')
})

test('a browser with no web midi says so rather than offering the wire', () => {
  midi.status.set('unsupported')
  render(<MidiPanel />)
  expect(tab().textContent).toContain('n/a')
  fireEvent.click(tab())
  expect(screen.getByRole('dialog').textContent).toMatch(/no Web MIDI/)
})
