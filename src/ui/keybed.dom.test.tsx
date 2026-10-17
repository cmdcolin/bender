// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'

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

test('with hold on, a second press on an off-scale key lets it go', () => {
  engine.set('keyScale', SCALE_NAMES.indexOf('major'))
  bed()
  fireEvent.click(screen.getByRole('button', { name: 'hold' }))
  tap(key('C#3'))
  expect(engine.fmKeysDown.get().size).toBe(1)
  tap(key('C#3'))
  expect(engine.fmKeysDown.get().size).toBe(0)
})
