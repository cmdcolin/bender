// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { DEFAULT_CONTROLS } from '../controls'
import { engine } from '../engine/engine'
import { GROUPS } from './controls'
import { OpenGroup } from './Section'
import './testDom'

// The beat, and the two other speeds a hand keeps rather than reads: pressed in
// time rather than dialled, and the whole run is one step in the walk.
const openDrums = () => {
  const group = GROUPS.find(g => g.name === 'Toy drums')
  if (!group) throw new Error('no kit')
  render(<OpenGroup group={group} onClose={() => {}} seconds={0} />)
}

const tapAt = (button: HTMLElement, ...ms: number[]) => {
  const clock = vi.spyOn(performance, 'now')
  for (const t of ms) {
    clock.mockReturnValue(t)
    fireEvent.click(button)
  }
  clock.mockRestore()
}

test('a run of presses sets the tempo, and undoes as one', () => {
  openDrums()
  const tap = screen.getByRole('button', { name: 'tap Tempo' })
  tapAt(tap, 1000, 1500, 2000, 2500)
  expect(engine.controls.get().drumBpm).toBe(120)
  expect(tap.textContent).toBe('tap4')

  act(() => engine.undo(0))
  expect(engine.controls.get().drumBpm).toBe(DEFAULT_CONTROLS.drumBpm)
})

// A press that comes back to the row minutes later is not the next beat of
// whatever was being tapped then.
test('a press after a long pause starts again rather than averaging', () => {
  openDrums()
  const tap = screen.getByRole('button', { name: 'tap Tempo' })
  tapAt(tap, 0, 500)
  expect(engine.controls.get().drumBpm).toBe(120)
  tapAt(tap, 60000, 60300)
  expect(engine.controls.get().drumBpm).toBe(200)
})
