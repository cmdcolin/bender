// @vitest-environment jsdom
import { act, render, screen, within } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'

import { App } from './App.tsx'
import { setListView } from './listView.ts'
import './testDom.ts'

afterEach(() => act(() => setListView(false)))

test('the list view stacks every stage on the board in place of the map', () => {
  render(<App />)
  expect(screen.queryByRole('group', { name: 'signal path' })).not.toBeNull()
  act(() => setListView(true))
  expect(screen.queryByRole('group', { name: 'signal path' })).toBeNull()
  const list = screen.getByRole('group', { name: 'stages' })
  expect(within(list).queryAllByRole('slider').length).toBeGreaterThan(10)
})

test('the toggle goes back to the diagram', () => {
  render(<App />)
  act(() => screen.getByText('☰ show as a list').click())
  act(() => screen.getByText('◧ show the diagram').click())
  expect(screen.queryByRole('group', { name: 'signal path' })).not.toBeNull()
})
