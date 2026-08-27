// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { DEFAULT_CONTROLS } from '../controls'
import { engine } from '../engine/engine'
import { BENDS, GROUPS, groupKeys, touchedCount } from './controls'
import { applyRig, rigsFor } from './presets'
import { OpenGroup } from './Section'
import './testDom'

// The rack: six selects saying what order the bends run in, and — because the
// order is only half of what the chain is — each of those bends' dry/wet under
// them, borrowed from the panels that own them.

const rack = () => {
  const g = GROUPS.find(g => g.name === 'Slot order')
  if (!g) throw new Error('no Slot order')
  return g
}

const openRack = () =>
  render(<OpenGroup group={rack()} onClose={() => {}} seconds={0} />)

test('the rack draws a mix for every bend in a slot, by the bend’s own name', () => {
  engine.controls.set({ ...DEFAULT_CONTROLS })
  openRack()
  for (const bend of BENDS) {
    const inChain = groupKeys(rack()).includes(bend.mix)
    expect(inChain, bend.group).toBe(true)
  }
  // Six slots, seven bends: the one sitting out has no fader to show.
  expect(
    screen.queryAllByRole('slider', { name: 'Freq shifter' }),
  ).toHaveLength(0)
  expect(screen.getByRole('slider', { name: 'Ring mod' })).toBeTruthy()
  expect(screen.queryAllByRole('slider', { name: 'Mix' })).toHaveLength(0)
})

test('a mix moved on the rack is the bend’s own control', () => {
  engine.controls.set({ ...DEFAULT_CONTROLS })
  openRack()
  fireEvent.change(screen.getByRole('slider', { name: 'Comb' }), {
    target: { value: '800' },
  })
  expect(engine.controls.get().combMix).toBeGreaterThan(0.5)
})

test('the rack counts and resets the mixes it borrows', () => {
  expect(groupKeys(rack())).toContain('combMix')
  expect(touchedCount(rack(), { ...DEFAULT_CONTROLS, combMix: 0.5 })).toBe(1)
})

// What a chain setting is for: press it and the rack is that chain and nothing
// else — two stages in the order it names, the other four slots empty.
test('a chain setting empties the slots it does not name', () => {
  const chain = rigsFor('Slot order').find(
    r => r.name === 'filter, then crush',
  )!
  const after = applyRig(chain, { ...DEFAULT_CONTROLS })
  expect(after.bendSlot2).toBe(0)
  expect(after.bendSlot5).toBe(0)
  expect(BENDS.filter(b => after[b.mix] > 0)).toHaveLength(2)
})
