// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'

import { engine } from '../engine/engine.ts'
import { bendDeal, bendName } from '../ui/bendKeys.ts'
import '../ui/testDom.ts'
import { PocketPage } from './PocketPage.tsx'

const tab = (name: string) => screen.getByRole('tab', { name })

test('a tap puts a preset up, and a second tap opens how far toward it', () => {
  render(<PocketPage />)
  fireEvent.click(tab('drums'))
  const chip = screen.getByRole('button', { name: 'boom bap' })
  fireEvent.click(chip)
  expect(chip.getAttribute('aria-pressed')).toBe('true')
  expect(screen.queryByRole('dialog')).toBeNull()
  fireEvent.click(chip)
  expect(screen.getByRole('dialog', { name: 'boom bap' })).toBeTruthy()
})

test('a bend pad stays on after the tap, and a second tap lets it go', () => {
  render(<PocketPage />)
  fireEvent.click(tab('bends'))
  const k = bendDeal.get()[0]!
  const pad = screen.getByRole('button', {
    name: `${k.letter}: ${k.stages.join(', ')}`,
  })
  fireEvent.click(pad)
  expect(engine.held.get().has(bendName(k.letter))).toBe(true)
  fireEvent.click(pad)
  expect(engine.held.get().has(bendName(k.letter))).toBe(false)
})

test('run starts both machines and a second press stops them', () => {
  render(<PocketPage />)
  fireEvent.click(screen.getByRole('button', { name: 'play' }))
  expect(engine.songPlaying.get()).toBe(true)
  expect(engine.drumsPlaying.get()).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'stop' }))
  expect(engine.songPlaying.get()).toBe(false)
  expect(engine.drumsPlaying.get()).toBe(false)
})

test('a finished take lands on a chip beside rec instead of downloading', () => {
  render(<PocketPage />)
  expect(engine.takeTo).not.toBeNull()
  engine.recSeconds.set(12)
  act(() => engine.takeTo!(new File(['x'], 'bender-take.wav')))
  expect(
    screen.getByRole('button', { name: 'save or share the 0:12 take' }),
  ).toBeTruthy()
})

test('the pocket page shows how much room a take has left and why one failed', () => {
  render(<PocketPage />)
  act(() => engine.recNote.set('about 3 min of browser storage left'))
  expect(screen.getByRole('status').textContent).toBe(
    'about 3 min of browser storage left',
  )
  act(() => engine.recError.set('disk full'))
  expect(screen.getByRole('alert').textContent).toBe(
    'the take was not saved: disk full',
  )
  act(() => {
    engine.recNote.set('')
    engine.recError.set('')
  })
  expect(screen.queryByRole('status')).toBeNull()
  expect(screen.queryByRole('alert')).toBeNull()
})

test('the app keeps its downloads once the page goes', () => {
  const { unmount } = render(<PocketPage />)
  unmount()
  expect(engine.takeTo).toBeNull()
})

test('the bend switch steps through the modes and remembers the one it is on', () => {
  render(<PocketPage />)
  fireEvent.click(screen.getByRole('button', { name: /dub/ }))
  expect(screen.getByRole('button', { name: /starve/ })).toBeTruthy()
  expect(localStorage.getItem('bender.pocket.touch')).toBe('starve')
  localStorage.removeItem('bender.pocket.touch')
})

test('the mic chip turns a live mic off', () => {
  render(<PocketPage />)
  fireEvent.click(screen.getByRole('button', { name: '☷mix' }))
  act(() => engine.micOn.set(true))
  fireEvent.click(screen.getByRole('button', { name: '● mic live' }))
  expect(engine.micOn.get()).toBe(false)
  expect(screen.getByRole('button', { name: 'mic' })).toBeTruthy()
})
