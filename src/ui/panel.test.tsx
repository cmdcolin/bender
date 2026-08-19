// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { expect, test } from 'vitest'
import { DEFAULT_CONTROLS } from '../controls'
import { engine } from '../engine/engine'
import { App } from './App'
import { GROUPS } from './controls'
import { OpenGroup } from './Section'
import './testDom'

// What the panel does with a board. The suite reached everything under the
// panel and nothing in it, which is how a heading that miscounted, a ROM you
// could not take back and a drop that navigated the page away all survived at
// once — each of them is a sentence about what happens when you press
// something, and none of them is a sentence about a signal path.

const group = (name: string) => {
  const g = GROUPS.find(g => g.name === name)
  if (!g) throw new Error(`no group ${name}`)
  return g
}

// The controls a fold is holding open: a knob is a slider, and a pick with more
// than six choices is a list.
const countRows = (head: HTMLElement) => {
  const fold = within(head.parentElement!)
  return (
    fold.queryAllByRole('slider').length +
    fold.queryAllByRole('combobox').length
  )
}

// A fold is a <details>, so its heading is the summary rather than a button.
const knife = () => {
  const head = [...document.querySelectorAll('summary')].find(s =>
    /knife on the bus/.test(s.textContent ?? ''),
  )
  if (!head) throw new Error('no knife fold')
  return head as HTMLElement
}
const said = (head: HTMLElement) => Number(head.textContent!.replace(/\D/g, ''))

const openFmChip = () =>
  render(<OpenGroup group={group('FM chip')} onClose={() => {}} seconds={0} />)

// The number on a fold is what it opens to. A fault picks what happened to a
// wire nobody has cut, so the row waits for a wire — and a heading that counted
// the ones still waiting promised controls that were not down there.
test('a fold heading counts the rows it opens to', () => {
  openFmChip()
  const before = said(knife())
  fireEvent.click(knife())
  expect(before).toBeGreaterThan(0)
  expect(before).toBe(countRows(knife()))
})

// Cut a line and the fault asking what happened to it arrives under the same
// heading. The heading is holding something you moved by then, so it says that
// instead of a count — a fold that hid what you set would be lying about the
// board.
test('a row arrives once it has something to act on', () => {
  openFmChip()
  fireEvent.click(knife())
  const before = countRows(knife())

  act(() => engine.set('fmDataLine', 1))
  expect(countRows(knife())).toBe(before + 1)
  expect(knife().textContent).toContain('1 moved')
})

// Every knob says what it is and where it stands, in its own units.
test('a slider carries its name and its own units', () => {
  render(
    <OpenGroup group={group('Tape delay')} onClose={() => {}} seconds={0} />,
  )
  const time = screen.getByRole('slider', { name: 'Time' })
  act(() => engine.set('delayMs', 1200))
  // The track underneath runs 0 to 1000 whatever the control is, and on a log
  // slider it is not even proportional to the value — so the position is the one
  // number nobody should have read out to them.
  expect(time.getAttribute('max')).toBe('1000')
  expect((time as HTMLInputElement).value).not.toBe('1200')
  expect(time.getAttribute('aria-valuetext')).toBe('1200 ms')
})

// The kit's ROM buttons write over whatever you had drawn, so they land in the
// walk like every other verb on the panel.
test('a drum ROM lands in the walk, and ctrl+z takes it back', () => {
  render(
    <OpenGroup group={group('Toy drums')} onClose={() => {}} seconds={0} />,
  )
  act(() => {
    engine.armStep()
    engine.set('drumKick', 0b1010101010101010)
  })
  const mine = engine.controls.get().drumKick

  fireEvent.click(screen.getByRole('button', { name: 'breaks' }))
  expect(engine.controls.get().drumKick).not.toBe(mine)

  act(() => engine.undo(0))
  expect(engine.controls.get().drumKick).toBe(mine)
})

// The hint says anywhere, and a dragover nobody cancels is a drop the browser
// takes itself — which over the panel, half the width of the app, meant
// navigating away from the board.
test('a drag over the panel is a drag the app has taken', () => {
  render(<App />)
  // One button deep in the panel and one on the machines beside it, because
  // anywhere has to mean both columns.
  for (const label of [/^panic$/, /play drums/]) {
    const over = new Event('dragover', { bubbles: true, cancelable: true })
    screen.getByRole('button', { name: label }).dispatchEvent(over)
    expect(over.defaultPrevented).toBe(true)
  }
})

test('the board and the panel are landmarks of their own', () => {
  const { container } = render(<App />)
  expect(container.querySelector('main')).toBeTruthy()
  expect(container.querySelector('aside')).toBeTruthy()
})

const frame = () =>
  act(async () => {
    await new Promise(r => requestAnimationFrame(() => r(null)))
  })

// The picker is the only place the next roll's duration is set, and a drift
// runs until you stop it — so a leg of one must not stand in for a morph.
test('a drift leaves the morph picker where it is', async () => {
  render(<App />)
  act(() => engine.startDrift(() => ({ ...DEFAULT_CONTROLS, dlyFb: 0.9 })))
  await frame()

  // Mid-leg, which is exactly when the flight bar used to take the row.
  expect(engine.morphProgress.get()).not.toBeNull()
  expect(screen.queryByText('stop here')).toBeNull()
  expect(screen.getByDisplayValue(/^morph:/)).toBeTruthy()

  // And stopping keeps the board where it has got to, rather than letting the
  // leg carry it somewhere else for another twelve seconds.
  act(() => fireEvent.click(screen.getByText('drifting…')))
  expect(engine.drifting.get()).toBe(false)
  expect(engine.morphProgress.get()).toBeNull()
})

// A morph is still what the bar is for, and it still takes the picker's place
// while one travels.
test('a morph in flight puts the bar up instead', async () => {
  render(<App />)
  act(() => engine.morphTo({ ...DEFAULT_CONTROLS, dlyFb: 0.9 }, 8))
  await frame()
  expect(screen.getByText('stop here')).toBeTruthy()
  expect(screen.queryByDisplayValue(/^morph:/)).toBeNull()
})
