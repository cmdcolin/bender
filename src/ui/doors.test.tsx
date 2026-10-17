// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS } from '../controls.ts'
import { engine } from '../engine/engine.ts'
import { App } from './App.tsx'
import { DOORS } from './doors.ts'
import { PRESETS } from './presets/table.ts'
import './testDom.ts'

const doors = () => screen.queryByRole('dialog', { name: 'pick a way in' })

test('a bare tab opens on the doors, and a link or a reload does not', () => {
  const { unmount } = render(<App openedBare />)
  expect(doors()).not.toBe(null)
  unmount()
  render(<App openedFromLink />)
  expect(doors()).toBe(null)
})

test('the drone door lands its preset and starts both machines', async () => {
  render(<App openedBare />)
  fireEvent.click(screen.getByRole('button', { name: /^▶ a drone/ }))
  await waitFor(() => expect(doors()).toBe(null))
  const drone = PRESETS.find(p => p.name === 'under the floor')!.patch
  const board = engine.controls.get()
  for (const [key, v] of Object.entries(drone))
    expect(board[key as keyof typeof board]).toBe(v)
  expect(engine.songPlaying.get()).toBe(true)
  expect(engine.drumsPlaying.get()).toBe(true)
})

test('looking around shuts the doors on a stock board, silent', () => {
  render(<App openedBare />)
  fireEvent.click(screen.getByRole('button', { name: /look around/ }))
  expect(doors()).toBe(null)
  expect(engine.controls.get()).toEqual(DEFAULT_CONTROLS)
  expect(engine.songPlaying.get()).toBe(false)
})

test('every door hands back controls the board knows', () => {
  for (const door of DOORS)
    for (const key of Object.keys(door.board()))
      expect(DEFAULT_CONTROLS, `${door.name}: ${key}`).toHaveProperty(key)
})
