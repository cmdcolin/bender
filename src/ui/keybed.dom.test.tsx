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
