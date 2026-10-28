// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'

import { DEFAULT_CONTROLS } from '../controls.ts'
import { engine } from '../engine/engine.ts'
import { App } from './App.tsx'
import { GROUPS } from './controls/index.ts'
import { findSettings } from './settingSearch.ts'
import './testDom.ts'

test('every word has to match the label, lane, fold or stage', () => {
  const hits = findSettings(GROUPS, 'glint level')
  expect(hits.map(h => h.key)).toEqual(['fmLevel'])
  expect(findSettings(GROUPS, 'fm chip mute').map(h => h.key)).toEqual([
    'fmMute',
  ])
})

test('labels that start with the word come first', () => {
  const [first] = findSettings(GROUPS, 'cutoff')
  expect(first!.label.toLowerCase().startsWith('cutoff')).toBe(true)
})

test('a hit opens its stage on the box that holds the row', async () => {
  act(() => engine.patch({ ...DEFAULT_CONTROLS, fmLevel: 1 }))
  render(<App />)
  fireEvent.change(screen.getByRole('searchbox', { name: 'find a setting' }), {
    target: { value: 'glint level' },
  })
  fireEvent.click(screen.getByRole('button', { name: /^Level\s*Glint$/ }))
  await vi.waitFor(() =>
    expect(
      document.querySelector('aside [data-control="fmLevel"][data-aimed]'),
    ).not.toBeNull(),
  )
})

test('a row its stage hides gives no hit until the row shows', () => {
  const find = (c = DEFAULT_CONTROLS) =>
    findSettings(GROUPS, 'clip on clock', c).map(h => h.key)
  expect(find()).toEqual([])
  expect(find({ ...DEFAULT_CONTROLS, chipClipHz: 5 })).toEqual([
    'chipClipClock',
  ])
})
