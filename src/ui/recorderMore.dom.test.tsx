// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'

import { engine } from '../engine/engine.ts'
import { RecorderMore } from './RecorderMore.tsx'
import './testDom.ts'

const press = (name: string) =>
  fireEvent.click(screen.getByRole('button', { name }))

test('the options stay shut until the key is pressed and shut on Escape', () => {
  render(<RecorderMore recording={false} recStems={false} />)
  expect(screen.queryByRole('group', { name: 'recorder options' })).toBeNull()
  press('options')
  expect(screen.getByRole('group', { name: 'recorder options' })).toBeTruthy()
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(screen.queryByRole('group', { name: 'recorder options' })).toBeNull()
})

test('the stems switch flips the setting and leaves the options open', () => {
  engine.recStems.set(false)
  render(<RecorderMore recording={false} recStems={false} />)
  press('options')
  press('one wav per machine')
  expect(engine.recStems.get()).toBe(true)
  expect(screen.getByRole('group', { name: 'recorder options' })).toBeTruthy()
})

test('the stems switch is locked while a take runs', () => {
  render(<RecorderMore recording recStems={false} />)
  press('options')
  expect(
    screen.getByRole<HTMLButtonElement>('button', {
      name: 'one wav per machine',
    }).disabled,
  ).toBe(true)
})
