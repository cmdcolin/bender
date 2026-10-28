// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { expect, test, vi } from 'vitest'

import { voiceBit } from '../drums.ts'
import { engine } from '../engine/engine.ts'
import { App } from './App.tsx'
import { bench, setBench } from './bench.ts'
import { DrumKit } from './DrumKit.tsx'
import './testDom.ts'

const pad = (name: string) =>
  screen.getByRole('button', { name: `${name} pad` })

test('the drum kit sits beside the lane of keyboards', () => {
  render(<App />)
  const keyboard = screen.getByRole('group', { name: 'plinky' })
  const kit = screen.getByRole('group', { name: 'clatter' })
  expect(kit.parentElement?.parentElement).toBe(
    keyboard.parentElement?.parentElement,
  )
})

test('a pedal on the bench shares the rack with the drum kit', () => {
  setBench({ ...bench.get(), pedals: ['Boing'] })
  render(<App />)
  const kit = screen.getByRole('group', { name: 'clatter' })
  const pedal = screen.getByRole('group', { name: 'boing' })
  expect(pedal.parentElement).toBe(kit.parentElement)
  setBench({ ...bench.get(), pedals: [] })
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

test('the pattern stages the kit with the whole grid, and small folds it', () => {
  setBench({ ...bench.get(), grid: false })
  render(<DrumKit />)
  const small = screen.getByRole('button', { name: 'small' })
  const large = screen.getByRole('button', { name: 'large' })
  expect(small.getAttribute('aria-pressed')).toBe('true')
  expect(screen.queryByRole('button', { name: 'kick step 1' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'edit the drum pattern' }))
  expect(bench.get().grid).toBe(true)
  expect(large.getAttribute('aria-pressed')).toBe('true')
  expect(screen.getByRole('button', { name: 'kick step 1' })).not.toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'small' }))
  expect(bench.get().grid).toBe(false)
  expect(screen.queryByRole('button', { name: 'kick step 1' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'large' }))
  expect(bench.get().grid).toBe(true)
  setBench({ ...bench.get(), grid: false })
})

test('the staged kit takes a shelf of its own above the keyboards', () => {
  setBench({ ...bench.get(), grid: true })
  render(<App />)
  const keyboard = screen.getByRole('group', { name: 'plinky' })
  const kit = screen.getByRole('group', { name: 'clatter' })
  expect(kit.parentElement?.contains(keyboard)).toBe(false)
  expect(
    kit.compareDocumentPosition(keyboard) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy()
  setBench({ ...bench.get(), grid: false })
})

test('running the kit keeps it at the size the player left it', () => {
  setBench({ ...bench.get(), grid: false })
  render(<App />)
  act(() => engine.setDrumsPlaying(true))
  expect(bench.get().grid).toBe(false)
  act(() => engine.setDrumsPlaying(false))
})

test('running the kit leaves a closed kit closed', () => {
  setBench({ ...bench.get(), grid: false, closed: ['Clatter'] })
  render(<App />)
  act(() => engine.setDrumsPlaying(true))
  expect(screen.queryByRole('group', { name: 'clatter' })).toBeNull()
  act(() => engine.setDrumsPlaying(false))
  setBench({ ...bench.get(), grid: false, closed: [] })
})
