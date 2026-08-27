// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, expect, test } from 'vitest'
import { engine } from '../engine/engine'
import { Presets } from './PresetRow'
import { applyPreset, PRESETS } from './presets'
import './testDom'

// A preset chip is two gestures on one button: press it and the whole board
// arrives, drag it sideways and the board follows your hand part of the way
// there. Which of the two you meant is decided by four pixels, so all of it is
// written down in the component and none of it was written down here.

// Capturing the pointer is what lets a drag carry on past the edge of the chip.
// jsdom has the calls and no implementation, and a chip that threw on press
// would fail every test below for the wrong reason.
beforeAll(() => {
  Element.prototype.setPointerCapture ??= () => {}
  Element.prototype.releasePointerCapture ??= () => {}
})

const DRAG_FULL = 140 // the sideways travel of a whole trip, from Presets.tsx
const first = PRESETS[0]!

const chip = () => screen.getByRole('button', { name: new RegExp(first.name) })

const press = (x: number) =>
  fireEvent.pointerDown(chip(), { clientX: x, pointerId: 1 })
const move = (x: number) =>
  fireEvent.pointerMove(chip(), { clientX: x, pointerId: 1 })
const lift = () => fireEvent.pointerUp(chip(), { pointerId: 1 })

test('a press takes the whole preset', () => {
  render(<Presets morphSeconds={0} />)
  const target = applyPreset(first, engine.controls.get())
  act(() => {
    press(0)
    lift()
  })
  expect(engine.controls.get()).toEqual(target)
})

// The click that trails a mouse release must not apply it a second time, and a
// keyboard activation — a bare click, no pointer events at all — must still
// apply it once.
test('the click trailing a release does not apply it twice', () => {
  render(<Presets morphSeconds={0} />)
  const from = engine.controls.get()
  act(() => {
    press(0)
    lift()
    fireEvent.click(chip(), { detail: 1 })
  })
  expect(engine.history.get().past).toHaveLength(1)
  expect(engine.history.get().past[0]).toEqual(from)
})

test('a keyboard press applies it', () => {
  render(<Presets morphSeconds={0} />)
  const target = applyPreset(first, engine.controls.get())
  act(() => fireEvent.click(chip(), { detail: 0 }))
  expect(engine.controls.get()).toEqual(target)
})

// A hand wobbling on the way down is still a click. Without the slop the board
// would teleport part of the way to a preset with nothing to say why.
test('a wobble under the slop is still a press', () => {
  render(<Presets morphSeconds={0} />)
  const target = applyPreset(first, engine.controls.get())
  act(() => {
    press(0)
    move(3)
    lift()
  })
  expect(engine.controls.get()).toEqual(target)
})

// Past the slop it is a scrub: the board follows the hand, and stops wherever
// the hand stopped.
test('a drag stops the board part of the way there', () => {
  render(<Presets morphSeconds={0} />)
  const from = engine.controls.get()
  const target = applyPreset(first, from)
  const key = (Object.keys(first.patch) as (keyof typeof target)[]).find(
    k => target[k] !== from[k],
  )!

  act(() => {
    press(0)
    move(10) // spends the slop; the trip starts from here
    move(10 + DRAG_FULL / 2)
  })
  const half = engine.controls.get()[key]
  const ends = [from[key], target[key]].sort((a, b) => a - b)
  expect(half).toBeGreaterThan(ends[0]!)
  expect(half).toBeLessThan(ends[1]!)

  act(() => {
    move(10 + DRAG_FULL)
    lift()
  })
  expect(engine.controls.get()[key]).toBeCloseTo(target[key], 5)
})

// Run past the far end, turn around, and the board turns with the hand — the
// travel is integrated a step at a time and clamped, so an overshoot is not a
// debt to pay back before anything moves.
test('a drag past the end does not bank travel the board never made', () => {
  render(<Presets morphSeconds={0} />)
  const from = engine.controls.get()
  const target = applyPreset(first, from)
  const key = (Object.keys(first.patch) as (keyof typeof target)[]).find(
    k => target[k] !== from[k],
  )!

  act(() => {
    press(0)
    move(10)
    move(10 + DRAG_FULL * 3) // way past the end
    move(10 + DRAG_FULL * 3 - DRAG_FULL / 2) // and half a trip back
  })
  const back = engine.controls.get()[key]
  const ends = [from[key], target[key]].sort((a, b) => a - b)
  expect(back).toBeGreaterThan(ends[0]!)
  expect(back).toBeLessThan(ends[1]!)
})

// However far the hand went and however many times it turned around, the whole
// drag is one entry in the walk: the board as it stood before the hand landed.
test('a whole drag is one step in the walk', () => {
  render(<Presets morphSeconds={0} />)
  const from = engine.controls.get()
  act(() => {
    press(0)
    move(10)
    move(60)
    move(120)
    move(90)
    lift()
  })
  expect(engine.history.get().past).toHaveLength(1)

  act(() => engine.undo(0))
  expect(engine.controls.get()).toEqual(from)
})

// Re-grabbing a chip whose fill is still good carries on along the road it is
// already standing on, so dragging back down retraces rather than setting off
// somewhere new.
test('re-grabbing a chip carries on along the same road', () => {
  render(<Presets morphSeconds={0} />)
  const from = engine.controls.get()
  act(() => {
    press(0)
    move(10)
    move(10 + DRAG_FULL / 2)
    lift()
  })
  const half = engine.controls.get()

  act(() => {
    press(0)
    move(10)
    move(10 - DRAG_FULL / 2)
    lift()
  })
  expect(engine.controls.get()).not.toEqual(half)
  for (const key of Object.keys(first.patch) as (keyof typeof from)[])
    expect(engine.controls.get()[key]).toBeCloseTo(from[key], 5)
})

// The row is one of the two ways a board arrives and it went unlabelled, in the
// same chip the MIDI switches wear, under two rows of randomisers — so it read
// as more randomisers. And the drag above is the best thing it does, and lived
// only in a tooltip on a chip you had to already be pointing at.
test('the row says what it is and what it does', () => {
  render(<Presets morphSeconds={0} />)
  const head = screen.getByLabelText('presets')
  expect(head.textContent).toMatch(/^presets/)
  expect(head.textContent).toMatch(/drag one sideways/)
})

// Forty-five chips is a wall, so the row shows a dozen and the rest arrive when
// you ask for them.
const COLLAPSED = 11 // how many the row shows shut, from Presets.tsx
const toggle = () => screen.getByRole('button', { name: /show|hide/ })
const chips = () =>
  screen.getAllByRole('button').filter(b => b !== toggle()).length

test('the row starts folded and opens on ask', () => {
  render(<Presets morphSeconds={0} />)
  expect(chips()).toBe(COLLAPSED)
  expect(toggle().textContent).toBe(`show ${PRESETS.length - COLLAPSED} more`)

  act(() => fireEvent.click(toggle(), { detail: 1 }))
  expect(chips()).toBe(PRESETS.length)
  expect(toggle().textContent).toBe('hide')

  act(() => fireEvent.click(toggle(), { detail: 1 }))
  expect(chips()).toBe(COLLAPSED)
})

// The fill is the only thing saying which board you are on, so folding the row
// must not take the chip you are standing on away with it.
test('the chip you are standing on survives the fold', () => {
  const past = PRESETS[COLLAPSED + 5]!
  render(<Presets morphSeconds={0} />)
  act(() => fireEvent.click(toggle(), { detail: 1 }))
  act(() =>
    fireEvent.click(
      screen.getByRole('button', { name: new RegExp(past.name) }),
      {
        detail: 0,
      },
    ),
  )
  act(() => fireEvent.click(toggle(), { detail: 1 }))

  screen.getByRole('button', { name: new RegExp(past.name) })
  expect(chips()).toBe(COLLAPSED + 1)
  expect(toggle().textContent).toBe(
    `show ${PRESETS.length - COLLAPSED - 1} more`,
  )
})
