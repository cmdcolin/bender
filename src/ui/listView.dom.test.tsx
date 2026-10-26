// @vitest-environment jsdom
import { act, render, screen, within } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'

import { DEFAULT_CONTROLS } from '../controls.ts'
import { engine } from '../engine/engine.ts'
import { App } from './App.tsx'
import { GROUPS } from './controls/index.ts'
import { setListView, setStageDrawings } from './listView.ts'
import { OpenGroup } from './Section.tsx'
import { StageList } from './StageList.tsx'
import './testDom.ts'

afterEach(() =>
  act(() => {
    setListView(false)
    setStageDrawings(true)
  }),
)

test('the list view stacks every stage on the board in place of the map', () => {
  render(<App />)
  expect(screen.queryByRole('group', { name: 'signal path' })).not.toBeNull()
  act(() => setListView(true))
  expect(screen.queryByRole('group', { name: 'signal path' })).toBeNull()
  const list = screen.getByRole('group', { name: 'stages' })
  expect(within(list).queryAllByRole('slider').length).toBeGreaterThan(10)
})

test('the toggle goes back to the map', () => {
  render(<App />)
  const view = () => within(screen.getByRole('group', { name: 'stage view' }))
  act(() => view().getByRole('button', { name: 'every stage' }).click())
  act(() => view().getByRole('button', { name: 'map' }).click())
  expect(screen.queryByRole('group', { name: 'signal path' })).not.toBeNull()
})

test('the list rolls, undoes and resets every stage in it at once', () => {
  act(() => engine.patch({ ...DEFAULT_CONTROLS }))
  render(<StageList seconds={0} />)
  const before = engine.controls.get()
  act(() => screen.getAllByRole('button', { name: 'randomize' })[0]!.click())
  expect(engine.controls.get()).not.toEqual(before)
  act(() =>
    screen.getAllByRole('button', { name: 'undo randomize' })[0]!.click(),
  )
  expect(engine.controls.get()).toEqual(before)
  act(() => screen.getAllByRole('button', { name: 'randomize' })[0]!.click())
  act(() => screen.getAllByRole('button', { name: /^reset \d+$/ })[0]!.click())
  expect(engine.controls.get()).toEqual(before)
})

test('a stage opens on its settings until the menu turns the diagrams on', () => {
  act(() => setStageDrawings(false))
  const plinky = GROUPS.find(g => g.name === 'Plinky')!
  render(<OpenGroup group={plinky} onClose={() => {}} seconds={0} />)
  const view = () => within(screen.getByRole('group', { name: 'Plinky view' }))
  const pressed = () =>
    view()
      .getAllByRole('button')
      .find(b => b.getAttribute('aria-pressed') === 'true')?.textContent
  expect(pressed()).toBe('all settings')
  act(() => setStageDrawings(true))
  expect(pressed()).toBe('diagram')
})
