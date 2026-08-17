import { beforeEach, expect, test } from 'vitest'
import { DEFAULT_CONTROLS, type Controls } from '../controls'
import { Engine } from './engine'

// The engine drives morphs off the frame clock and posts params on one. Stubbed
// out to nothing, so a morph asked for in seconds stays in flight for the whole
// test and one asked for at `cut` lands synchronously — which is all the walk
// cares about.
beforeEach(() => {
  globalThis.requestAnimationFrame = () => 1
  globalThis.cancelAnimationFrame = () => {}
})

const board = (patch: Partial<Controls>): Controls => ({
  ...DEFAULT_CONTROLS,
  ...patch,
})

test('a whole-board verb banks the board it replaced', () => {
  const engine = new Engine()
  engine.morphTo(board({ dlyFb: 0.5 }), 0)
  expect(engine.history.get().past).toHaveLength(1)

  engine.undo(0)
  expect(engine.controls.get().dlyFb).toBe(DEFAULT_CONTROLS.dlyFb)
  expect(engine.history.get().past).toHaveLength(0)

  engine.redo(0)
  expect(engine.controls.get().dlyFb).toBe(0.5)
})

test('a sweep banks one step, not one per pointer move', () => {
  const engine = new Engine()
  engine.armStep()
  for (const v of [0.1, 0.2, 0.3, 0.4]) engine.set('dlyFb', v)
  expect(engine.history.get().past).toHaveLength(1)

  engine.undo(0)
  expect(engine.controls.get().dlyFb).toBe(DEFAULT_CONTROLS.dlyFb)
})

test('arming and then moving nothing leaves no dead step to press undo through', () => {
  const engine = new Engine()
  engine.armStep()
  engine.set('dlyFb', DEFAULT_CONTROLS.dlyFb)
  expect(engine.history.get().past).toHaveLength(0)
})

test('a write nobody armed banks nothing — the walk is over gestures', () => {
  const engine = new Engine()
  engine.set('dlyFb', 0.5)
  expect(engine.history.get().past).toHaveLength(0)
})

// A tween is a frame, not a board: banking one would make the board you were
// stepping out of unreachable, since redo would land somewhere along the path.
test('mid-morph the walk banks where the board was heading, not the frame', () => {
  const engine = new Engine()
  engine.morphTo(board({ dlyFb: 1 }), 8)
  expect(engine.controls.get().dlyFb).toBe(DEFAULT_CONTROLS.dlyFb)

  engine.morphTo(board({ dlyFb: 0.25 }), 0)
  expect(engine.history.get().past.at(-1)?.dlyFb).toBe(1)
})

test('a fresh roll after undo ends the walk forward', () => {
  const engine = new Engine()
  engine.morphTo(board({ dlyFb: 0.5 }), 0)
  engine.undo(0)
  expect(engine.history.get().future).toHaveLength(1)

  engine.morphTo(board({ dlyFb: 0.75 }), 0)
  expect(engine.history.get().future).toHaveLength(0)
})

test('undo at the end of the walk does nothing rather than throwing', () => {
  const engine = new Engine()
  engine.undo(0)
  engine.redo(0)
  expect(engine.controls.get()).toEqual(DEFAULT_CONTROLS)
})

// Panic kills a runaway howl. Undoing back into one would make the walk the
// thing you have to panic out of.
test('panic is not a step in the walk', () => {
  const engine = new Engine()
  engine.patch({ fbAmt: 1.5 })
  engine.panic()
  expect(engine.history.get().past).toHaveLength(0)
})
