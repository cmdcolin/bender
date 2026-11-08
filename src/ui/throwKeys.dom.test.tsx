// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/react'
import { expect, test } from 'vitest'

import { engine } from '../engine/engine.ts'
import './testDom.ts'
import { useThrowKeys } from './throwKeys.ts'

function Throws() {
  useThrowKeys()
  return null
}

test('a throw held on comma lets go when Shift turns its key-up into <', () => {
  render(<Throws />)
  fireEvent.keyDown(window, { key: ',', code: 'Comma' })
  expect(engine.held.get().has('crush')).toBe(true)
  fireEvent.keyDown(window, { key: 'Shift', code: 'ShiftLeft', shiftKey: true })
  fireEvent.keyUp(window, { key: '<', code: 'Comma', shiftKey: true })
  expect(engine.held.get().has('crush')).toBe(false)
})

test('a key-up from another key leaves the throw held', () => {
  render(<Throws />)
  fireEvent.keyDown(window, { key: ',', code: 'Comma' })
  fireEvent.keyUp(window, { key: ',', code: 'KeyM' })
  expect(engine.held.get().has('crush')).toBe(true)
  fireEvent.blur(window)
  expect(engine.held.get().has('crush')).toBe(false)
})
