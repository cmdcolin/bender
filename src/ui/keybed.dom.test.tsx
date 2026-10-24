// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'

import { engine } from '../engine/engine.ts'
import { SCALE_NAMES } from '../scale.ts'
import { Keybed } from './Keybed.tsx'
import './testDom.ts'

const bed = () => render(<Keybed dest="fm" label="test bed" />)
const key = (name: string) =>
  screen.getByRole('button', { name: `key ${name}` })
const tap = (el: HTMLElement) => {
  fireEvent.pointerDown(el)
  fireEvent.pointerUp(el)
}

test('the bed listens to the window once, not once per chip note', () => {
  const add = vi.spyOn(window, 'addEventListener')
  try {
    bed()
    for (const n of [3, 5, 7]) act(() => engine.fmNotes.set(new Set([n])))
    expect(add.mock.calls.filter(([type]) => type === 'keydown')).toHaveLength(
      1,
    )
  } finally {
    add.mockRestore()
    engine.fmNotes.set(new Set())
  }
})

test('with hold on, a second press on an off-scale key lets it go', () => {
  engine.set('keyScale', SCALE_NAMES.indexOf('major'))
  bed()
  fireEvent.click(screen.getByRole('button', { name: 'hold' }))
  tap(key('C#3'))
  expect(engine.fmKeysDown.get().size).toBe(1)
  tap(key('C#3'))
  expect(engine.fmKeysDown.get().size).toBe(0)
})

test('a bed taken off the bench lets go of what it held and pinned', () => {
  const { unmount } = bed()
  fireEvent.pointerDown(key('C3'), { altKey: true })
  fireEvent.click(screen.getByRole('button', { name: 'hold' }))
  tap(key('E3'))
  expect(engine.fmKeysDown.get().size).toBe(2)
  unmount()
  expect(engine.fmKeysDown.get().size).toBe(0)
})

test('a touch that enters a key before it lands strikes it once', () => {
  const noteOn = vi.spyOn(engine, 'noteOn')
  try {
    bed()
    fireEvent.pointerEnter(key('D3'), { buttons: 1 })
    fireEvent.pointerDown(key('D3'), { buttons: 1 })
    expect(noteOn).toHaveBeenCalledTimes(1)
    fireEvent.pointerUp(key('D3'))
    expect(engine.fmKeysDown.get().size).toBe(0)
  } finally {
    noteOn.mockRestore()
  }
})

test('Enter and Space on a focused key hold it until they come up', () => {
  bed()
  for (const k of ['Enter', ' ']) {
    fireEvent.keyDown(key('D3'), { key: k })
    expect(engine.fmKeysDown.get().size).toBe(1)
    fireEvent.keyUp(key('D3'), { key: k })
    expect(engine.fmKeysDown.get().size).toBe(0)
  }
})

test('a key off the scale lights under the finger as well as the key it closes', () => {
  engine.set('keyScale', SCALE_NAMES.indexOf('major'))
  bed()
  fireEvent.pointerDown(key('C#3'))
  expect(key('C#3').getAttribute('aria-pressed')).toBe('true')
  expect(key('C3').getAttribute('aria-pressed')).toBe('true')
  fireEvent.pointerUp(key('C#3'))
  expect(key('C#3').getAttribute('aria-pressed')).toBe('false')
  expect(key('C3').getAttribute('aria-pressed')).toBe('false')
})

test('the keys a scale lock closes on a neighbour are marked, and none are with it off', () => {
  engine.set('keyScale', SCALE_NAMES.indexOf('major'))
  engine.set('keyRoot', 3)
  bed()
  expect(key('C#3').className).toContain('outside')
  expect(key('C3').className).not.toContain('outside')
  act(() => engine.set('keyScale', 0))
  expect(key('C#3').className).not.toContain('outside')
})

test('the deck names the scale lock while it is on and says nothing with it off', () => {
  engine.set('keyScale', SCALE_NAMES.indexOf('minor'))
  engine.set('keyRoot', 9)
  bed()
  expect(screen.getByText('A minor')).toBeTruthy()
  act(() => engine.set('keyScale', 0))
  expect(screen.queryByText('A minor')).toBeNull()
})

test('the bed is one tab stop, and arrows walk its keys', () => {
  bed()
  const stops = screen
    .getAllByRole('button', { name: /^key / })
    .filter(k => k.tabIndex === 0)
  expect(stops.map(k => k.getAttribute('aria-label'))).toEqual(['key C3'])
  act(() => key('C3').focus())
  fireEvent.keyDown(key('C3'), { key: 'ArrowRight' })
  expect(document.activeElement).toBe(key('C#3'))
  expect(key('C#3').tabIndex).toBe(0)
  expect(key('C3').tabIndex).toBe(-1)
  fireEvent.keyDown(key('C#3'), { key: 'ArrowLeft' })
  fireEvent.keyDown(key('C3'), { key: 'ArrowLeft' })
  expect(document.activeElement).toBe(key('C3'))
})
