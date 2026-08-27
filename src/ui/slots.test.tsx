// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { DEFAULT_CONTROLS } from '../controls'
import { engine } from '../engine/engine'
import { BENDS, bendAt, GROUPS, groupKeys } from './controls'
import { applyRig, rigsFor } from './presets'
import { OpenGroup } from './Section'
import './testDom'

// The rack, which is the whole of the Signal chain panel: a row per position,
// dragged or arrow-keyed to reorder, with whatever is in no position on a shelf
// under it. A bend can be in a position and still inaudible, and the row says
// which way rather than a fader underneath.

const rack = () => {
  const g = GROUPS.find(g => g.name === 'Signal chain')
  if (!g) throw new Error('no Signal chain')
  return g
}

const openRack = () =>
  render(<OpenGroup group={rack()} onClose={() => {}} seconds={0} />)

// The one thing the row of dry/wet faders under the rack was carrying: a stage
// can sit in the path and be inaudible, and which of the two ways it is doing
// that is the answer to why the position you just filled changed nothing.
test('a position in the chain but inaudible says which way', () => {
  engine.controls.set({ ...DEFAULT_CONTROLS, bendSlot1: 1 })
  openRack()
  const rows = screen.getAllByRole('listitem')
  expect(rows[0]!.textContent).toContain('silent')
  expect(rows[1]!.textContent).toContain('already above')
})

// What a chain setting is for: press it and the rack is that chain and nothing
// else — two stages in the order it names, the other four slots empty.
test('a chain setting empties the slots it does not name', () => {
  const chain = rigsFor('Signal chain').find(
    r => r.name === 'filter, then crush',
  )!
  const after = applyRig(chain, { ...DEFAULT_CONTROLS })
  expect(after.bendSlot2).toBe(0)
  expect(after.bendSlot5).toBe(0)
  expect(BENDS.filter(b => after[b.mix] > 0)).toHaveLength(2)
})

// The name span, not the whole row: a row also carries its position and, when
// the bend on it cannot be heard, why not.
const rowNames = () =>
  screen
    .getAllByRole('listitem')
    .map(li => li.querySelectorAll('span')[1]?.textContent)

const dragTo = (from: number, to: number) => {
  const rows = screen.getAllByRole('listitem')
  fireEvent.dragStart(rows[from]!)
  fireEvent.dragOver(rows[to]!)
  fireEvent.drop(rows[to]!, { dataTransfer: { getData: () => '' } })
}

// The gesture the rack is for: the box you dragged lands where you dropped it
// and the rest close up, which is what moving a pedal down a chain does.
test('dragging a box moves that bend and shuffles the rest', () => {
  engine.controls.set({ ...DEFAULT_CONTROLS })
  openRack()
  expect(rowNames()[0]).toBe('Ring mod')
  dragTo(2, 0)
  const after = engine.controls.get()
  expect(bendAt(after.bendSlot0)?.group).toBe('Clipper')
  expect(bendAt(after.bendSlot1)?.group).toBe('Ring mod')
  expect(bendAt(after.bendSlot2)?.group).toBe('Crusher')
  // Every bend that was in the chain is still in it — a move is not a swap out.
  expect(rowNames()).toHaveLength(6)
})

// Seven bends, six positions: bringing the odd one in trades the other out.
test('a bend off the board can be dragged into a position', () => {
  engine.controls.set({ ...DEFAULT_CONTROLS })
  openRack()
  const shifter = screen.getByTitle(/Freq shifter is in no position/)
  fireEvent.dragStart(shifter, { dataTransfer: { setData: () => {} } })
  fireEvent.drop(screen.getAllByRole('listitem')[0]!, {
    dataTransfer: { getData: () => '7' },
  })
  expect(bendAt(engine.controls.get().bendSlot0)?.group).toBe('Freq shifter')
  expect(screen.getByTitle(/Ring mod is in no position/)).toBeTruthy()
})

// A drag that ends nowhere leaves the chain exactly where it stood.
test('a drag that never lands changes nothing', () => {
  engine.controls.set({ ...DEFAULT_CONTROLS })
  openRack()
  const before = rowNames()
  const rows = screen.getAllByRole('listitem')
  fireEvent.dragStart(rows[1]!)
  fireEvent.dragEnd(rows[1]!)
  expect(rowNames()).toEqual(before)
})

// The same move without a mouse. The rack replaced six dropdowns, and a rack
// only a pointer can work would have taken the chain's order away from the
// keyboard along with them.
test('the arrow keys carry a bend up the chain', () => {
  engine.controls.set({ ...DEFAULT_CONTROLS })
  openRack()
  fireEvent.keyDown(screen.getAllByRole('listitem')[2]!, { key: 'ArrowUp' })
  const after = engine.controls.get()
  expect(bendAt(after.bendSlot1)?.group).toBe('Clipper')
  expect(bendAt(after.bendSlot2)?.group).toBe('Crusher')
})

test('delete takes a bend off the board', () => {
  engine.controls.set({ ...DEFAULT_CONTROLS })
  openRack()
  fireEvent.keyDown(screen.getAllByRole('listitem')[0]!, { key: 'Delete' })
  expect(engine.controls.get().bendSlot0).toBe(0)
  expect(screen.getByTitle(/Ring mod is in no position/)).toBeTruthy()
})

// Pressing a loose bend rather than dragging it: it takes the first position
// nothing is in, which after the delete above is the one just emptied.
test('a loose bend can be pressed into the first empty position', () => {
  engine.controls.set({ ...DEFAULT_CONTROLS, bendSlot0: 0 })
  openRack()
  fireEvent.click(screen.getByTitle(/Ring mod is in no position/))
  expect(bendAt(engine.controls.get().bendSlot0)?.group).toBe('Ring mod')
})

// The six dropdowns the rack was drawn over. They are still the controls a
// roll, a rig and the URL all go through — the panel just stopped drawing a
// second way to turn them.
test('the panel draws no position dropdowns', () => {
  engine.controls.set({ ...DEFAULT_CONTROLS })
  openRack()
  expect(screen.queryAllByRole('slider', { name: /^Position/ })).toHaveLength(0)
  expect(groupKeys(rack())).toContain('bendSlot0')
})
