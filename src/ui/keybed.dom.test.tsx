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
