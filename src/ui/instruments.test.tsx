// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { expect, test, vi } from 'vitest'

import { voiceBit } from '../drums'
import { MOOD } from '../dsp/stages/pet'
import { PHRASE } from '../dsp/stages/petRom'
import { engine } from '../engine/engine'
import { App } from './App'
import { DrumKit } from './DrumKit'
import { TalkingPet } from './TalkingPet'
import './testDom'

const pad = (name: string) =>
  screen.getByRole('button', { name: `${name} pad` })

test('the drum kit shares a row with the toy keyboard', () => {
  render(<App />)
  const keyboard = screen.getByRole('group', { name: 'toy keyboard' })
  const kit = screen.getByRole('group', { name: 'toy drums' })
  expect(kit.parentElement).toBe(keyboard.parentElement)
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
  const kit = within(screen.getByRole('group', { name: 'toy drums' }))
  fireEvent.click(kit.getByRole('button', { name: 'rec' }))
  expect(engine.drumRecord.get()).toBe(true)
  fireEvent.click(kit.getByRole('button', { name: 'rec' }))
  expect(engine.drumRecord.get()).toBe(false)
})

test('the talking pet appears once its level is above zero', () => {
  render(<App />)
  expect(screen.queryByRole('button', { name: /talking pet/ })).toBeNull()
  act(() => engine.set('petLevel', 0.5))
  expect(screen.getByRole('button', { name: /talking pet/ })).toBeTruthy()
})

test('the pet label and speech bubble follow the mood and phrase in the meter', () => {
  render(<TalkingPet />)
  act(() =>
    engine.meter.set({
      ...engine.meter.get(),
      petMood: MOOD.chatty,
      petPhrase: PHRASE['la la loo'],
    }),
  )
  expect(
    screen.getByRole('button', {
      name: 'talking pet, chatty, saying la la loo',
    }),
  ).toBeTruthy()
  expect(screen.getByText('la la loo')).toBeTruthy()
  act(() =>
    engine.meter.set({
      ...engine.meter.get(),
      petMood: MOOD.asleep,
      petPhrase: -1,
    }),
  )
  expect(
    screen.getByRole('button', { name: 'talking pet, asleep' }),
  ).toBeTruthy()
  expect(screen.getByText('z z z')).toBeTruthy()
})

test('clicking the pet pokes it', () => {
  const poke = vi.spyOn(engine, 'pokePet')
  render(<TalkingPet />)
  fireEvent.click(screen.getByRole('button', { name: /talking pet/ }))
  expect(poke).toHaveBeenCalledTimes(1)
  poke.mockRestore()
})
