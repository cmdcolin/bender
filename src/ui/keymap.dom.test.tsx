// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import { engine } from '../engine/engine.ts'
import { bendDeal, bendName } from './bendKeys.ts'
import { BendKeys } from './BendKeys.tsx'
import {
  DEFAULT_KEYMAP,
  keymap,
  moveKey,
  noteKeys,
  resetKeymap,
  roleOf,
  throwForKey,
} from './keymap.ts'
import { Keys } from './Keys.tsx'
import { KeysDialog } from './KeysDialog.tsx'
import { letterKeys } from './letters.ts'
import './testDom.ts'

const stroke = (
  type: 'keydown' | 'keyup',
  key: string,
  target: Window | Element = window,
) =>
  act(() => {
    fireEvent(target, new KeyboardEvent(type, { key, bubbles: true }))
  })

afterEach(() => {
  resetKeymap()
  localStorage.clear()
})

test('moving a key onto a free letter leaves the old one unused', () => {
  moveKey('a', 'q')
  expect(keymap.get()[0]).toBe('q')
  expect(keymap.get()).not.toContain('a')
  expect(new Set(keymap.get()).size).toBe(DEFAULT_KEYMAP.length)
})

test('moving a key onto a taken letter swaps the two', () => {
  moveKey('a', 'w')
  expect(noteKeys(keymap.get()).slice(0, 2)).toEqual(['w', 'a'])
  moveKey('c', 'x')
  expect(roleOf(keymap.get(), 'c')).toEqual({ kind: 'octave', step: 1 })
  expect(roleOf(keymap.get(), 'x')).toEqual({ kind: 'throw', name: 'spin' })
})

test('a letter with nothing on it or outside the grid moves nothing', () => {
  moveKey('q', 'a')
  moveKey('a', '1')
  moveKey('a', ' ')
  expect(keymap.get()).toEqual(DEFAULT_KEYMAP)
})

test('the throws follow their letters', () => {
  moveKey('c', 'q')
  expect(throwForKey('q')?.name).toBe('spin')
  expect(throwForKey('c')).toBeUndefined()
})

test('a layout survives a reload and a damaged one is dropped', async () => {
  moveKey('a', 'q')
  vi.resetModules()
  const reloaded = await import('./keymap.ts')
  expect(reloaded.keymap.get()[0]).toBe('q')

  localStorage.setItem('bender.keymap', JSON.stringify(['a', 'a']))
  vi.resetModules()
  const damaged = await import('./keymap.ts')
  expect(damaged.keymap.get()).toEqual(damaged.DEFAULT_KEYMAP)
})

test('a keybed plays the letter it was moved to', () => {
  render(<Keys />)
  act(() => moveKey('a', 'q'))
  stroke('keydown', 'a')
  expect(engine.keysDown.get().size).toBe(0)
  stroke('keydown', 'q')
  expect(engine.keysDown.get().size).toBe(1)
  stroke('keyup', 'q')
  expect(engine.keysDown.get().size).toBe(0)
})

test('the bend key keeps its name when its letter moves', () => {
  render(<BendKeys morphSeconds={0} />)
  act(() => {
    letterKeys.set('bends')
  })
  const slot = bendDeal.get()[0]!
  act(() => moveKey('a', 'q'))
  stroke('keydown', 'q')
  expect([...engine.held.get().keys()]).toEqual([bendName(slot.letter)])
  stroke('keyup', 'q')
})

test('the dialog moves a key by click then keypress and resets', () => {
  render(<KeysDialog onClose={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: /^a: / }))
  const dialog = screen.getByRole('dialog', { name: 'computer keys' })
  fireEvent.keyDown(dialog, { key: 'q' })
  expect(keymap.get()[0]).toBe('q')
  fireEvent.click(screen.getByRole('button', { name: 'q: C3' }))
  fireEvent.click(screen.getByRole('button', { name: /^w: / }))
  expect(noteKeys(keymap.get()).slice(0, 2)).toEqual(['w', 'q'])
  fireEvent.click(screen.getByRole('button', { name: 'reset' }))
  expect(keymap.get()).toEqual(DEFAULT_KEYMAP)
})

test('keys pressed in the dialog do not reach the board', () => {
  render(
    <>
      <Keys />
      <KeysDialog onClose={() => {}} />
    </>,
  )
  const dialog = screen.getByRole('dialog', { name: 'computer keys' })
  stroke('keydown', 'a', dialog)
  expect(engine.keysDown.get().size).toBe(0)
})
