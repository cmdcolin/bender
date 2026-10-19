// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { expect, test, vi } from 'vitest'

import { voiceBit } from '../drums.ts'
import { engine } from '../engine/engine.ts'
import { App } from './App.tsx'
import { DrumKit } from './DrumKit.tsx'
import './testDom.ts'

const pad = (name: string) =>
  screen.getByRole('button', { name: `${name} pad` })

test('the drum kit sits beside the lane of keyboards', () => {
  render(<App />)
  const keyboard = screen.getByRole('group', { name: 'plinky' })
  const kit = screen.getByRole('group', { name: 'clatter' })
  expect(kit.parentElement).toBe(keyboard.parentElement?.parentElement)
})

test('pressing a pad sends a hit for its voice', () => {
  const hit = vi.spyOn(engine, 'drumHit')
  render(<DrumKit />)
  fireEvent.pointerDown(pad('snare'), { button: 0 })
  expect(hit).toHaveBeenCalledWith(voiceBit(1))
  fireEvent.pointerDown(pad('kick'), { button: 2 })
  expect(hit).toHaveBeenCalledTimes(1)
  hit.mockRestore()
})

test('a pad lights when the meter reports a hit on its voice', () => {
  render(<DrumKit />)
  expect(pad('hat').className).not.toMatch(/padOn/)
  act(() => engine.meter.set({ ...engine.meter.get(), hits: voiceBit(2) }))
  expect(pad('hat').className).toMatch(/padOn/)
  expect(pad('kick').className).not.toMatch(/padOn/)
})

test('the kit record switch arms drum recording', () => {
  render(<DrumKit />)
  const kit = within(screen.getByRole('group', { name: 'clatter' }))
  fireEvent.click(kit.getByRole('button', { name: 'rec' }))
  expect(engine.drumRecord.get()).toBe(true)
  fireEvent.click(kit.getByRole('button', { name: 'rec' }))
  expect(engine.drumRecord.get()).toBe(false)
})

test('the kit records a hit and flashes the step it went to', () => {
  engine.patch({ drumKick: 0 })
  render(<DrumKit onOpen={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: 'rec' }))
  expect(engine.drumsPlaying.get()).toBe(true)
  const pattern = screen.getByRole('button', { name: 'edit the drum pattern' })
  expect(pattern.querySelector('[class*="taken"]')).toBeNull()
  fireEvent.pointerDown(pad('kick'), { button: 0 })
  expect(engine.controls.get().drumKick).not.toBe(0)
  expect(pattern.querySelector('[class*="taken"]')).not.toBeNull()
  engine.setDrumsPlaying(false)
})

test('the pattern opens the drum grid', () => {
  const open = vi.fn()
  render(<DrumKit onOpen={open} />)
  fireEvent.click(screen.getByRole('button', { name: 'edit the drum pattern' }))
  expect(open).toHaveBeenCalledWith('Clatter')
})
