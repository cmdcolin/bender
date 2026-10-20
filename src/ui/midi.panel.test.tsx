// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, expect, test, vi } from 'vitest'

import { midi } from './midi.ts'
import { MidiMenuItem, MidiPanel } from './MidiPanel.tsx'
import './testDom.ts'

// The wire lives behind a button in the nameplate row now rather than in a
// section of its own. What that has to get right is the half it leaves outside:
// a bound knob goes inert when the board moves out from under it, and the panel
// saying nothing about that is a board whose knobs have quietly stopped working.

const tab = () => screen.getByRole('button', { name: /^midi/ })

function Panel() {
  const [open, setOpen] = useState(false)
  return (
    <MidiPanel
      open={open}
      onToggle={() => setOpen(o => !o)}
      onClose={() => setOpen(false)}
    />
  )
}

afterEach(() => {
  midi.status.set('idle')
  midi.bindings.set({})
  midi.pickups.set({})
})

test('a second connect while the browser is asking asks nothing more', () => {
  const requestMIDIAccess = vi.fn(() => new Promise<MIDIAccess>(() => {}))
  vi.stubGlobal('navigator', { requestMIDIAccess })
  try {
    midi.enable()
    midi.enable()
    expect(requestMIDIAccess).toHaveBeenCalledTimes(1)
    expect(midi.status.get()).toBe('requesting')
  } finally {
    vi.unstubAllGlobals()
  }
})

test('the wire costs the panel nothing until it is asked for', () => {
  render(<Panel />)
  expect(screen.queryByRole('dialog')).toBeNull()
  fireEvent.click(tab())
  expect(screen.getByRole('dialog')).toBeTruthy()
})

// Not modal: binding a control is done on the control, with the ⚟ on its slider
// row in whatever stage is open behind this. A dialog that took the panel away
// would be one you have to close to use the thing it is about.
test('the dialog leaves the panel behind it reachable', () => {
  render(<Panel />)
  fireEvent.click(tab())
  const dialog = screen.getByRole('dialog') as HTMLDialogElement
  expect(dialog.open).toBe(true)
  // show() and not showModal(): a modal makes the rest of the page inert, and
  // the rest of the page is where the mark that binds a control lives.
  expect(dialog.matches(':modal')).toBe(false)
})

test('escape and the close button both shut it', () => {
  render(<Panel />)
  fireEvent.click(tab())
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(screen.queryByRole('dialog')).toBeNull()

  fireEvent.click(tab())
  fireEvent.click(screen.getByRole('button', { name: 'close midi' }))
  expect(screen.queryByRole('dialog')).toBeNull()
})

test('escape with a knob waiting on the wire lets go of it and leaves the dialog up', async () => {
  midi.status.set('ready')
  render(<Panel />)
  fireEvent.click(tab())
  await act(() => import('./MidiWired.tsx'))
  act(() => midi.arm('combMix'))
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(midi.armed.get()).toBeNull()
  expect(screen.queryByRole('dialog')).not.toBeNull()
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(screen.queryByRole('dialog')).toBeNull()
})

// The one thing that must survive being folded away. A stranded knob is one the
// board has moved out from under — it does nothing until you sweep it back
// through its value — and the count is the only thing on screen that says so.
test('the button carries only what has gone inert', () => {
  const { rerender } = render(<Panel />)
  expect(tab().textContent).toBe('midi')

  midi.status.set('ready')
  midi.bindings.set({ combMix: { controller: 1, channel: 0 } })
  rerender(<Panel />)
  expect(tab().textContent).toBe('midi')

  midi.pickups.set({ combMix: 0.5 })
  rerender(<Panel />)
  expect(tab().textContent).toContain('1 waiting')
})

test('a browser with no web midi says so rather than offering the wire', () => {
  midi.status.set('unsupported')
  render(<Panel />)
  expect(tab().textContent).toContain('n/a')
  fireEvent.click(tab())
  expect(screen.getByRole('dialog').textContent).toMatch(/no Web MIDI/)
})

// The menu's way in stands for the button a touch screen leaves out, which is
// only left out while the wire is off.
test('the menu offers the wire only while it is off and could be on', () => {
  const { rerender } = render(
    <MidiMenuItem className="item" onPick={() => {}} />,
  )
  expect(screen.getByRole('menuitem', { name: 'midi' })).toBeTruthy()

  midi.status.set('ready')
  rerender(<MidiMenuItem className="item" onPick={() => {}} />)
  expect(screen.queryByRole('menuitem')).toBeNull()

  midi.status.set('unsupported')
  rerender(<MidiMenuItem className="item" onPick={() => {}} />)
  expect(screen.queryByRole('menuitem')).toBeNull()
})
