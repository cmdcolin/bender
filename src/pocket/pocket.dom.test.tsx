// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'

import { engine } from '../engine/engine'
import { bendDeal, bendName } from '../ui/bendKeys'
import '../ui/testDom'
import { PocketPage } from './PocketPage'

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
  const pad = screen.getByRole('button', { name: k.name })
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
