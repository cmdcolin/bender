// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'

import { engine } from '../engine/engine.ts'
import { KitWiringDiagram } from './KitWiringDiagram.tsx'
import './testDom.ts'

import type { Controls } from '../controls.ts'

const open = () => render(<KitWiringDiagram />)

const set = (board: Partial<Controls>) =>
  act(() => {
    for (const [key, value] of Object.entries(board))
      engine.set(key as keyof Controls, value)
  })

const svg = () => screen.getByRole('img', { name: 'drum kit wiring' })
const words = () => [...svg().querySelectorAll('text')].map(t => t.textContent)
const red = () => svg().querySelectorAll('[class*="jumper"]').length

test('the stock kit draws every voice, the hat pedal and nothing red', () => {
  open()
  expect(words()).toEqual(
    expect.arrayContaining([
      'trigger lines',
      'kick',
      'open hat',
      'cymbal',
      'amps',
    ]),
  )
  expect(red()).toBe(0)
})

test('the choke, ring trigger and cross-patch each name the wire they moved', () => {
  open()
  set({ drumChoke: 2, drumRingTrig: 1, drumCross: 1 })
  expect(words()).toEqual(
    expect.arrayContaining(['kick cuts tom', 'kick fires hat', 'kick/snare']),
  )
  expect(red()).toBeGreaterThan(0)
})

test('the sampled kit draws the cross-patch dashed rather than red', () => {
  open()
  set({ drumCross: 1, drumRom: 1 })
  expect(red()).toBe(0)
  set({ drumRom: 0 })
  expect(red()).toBeGreaterThan(0)
})

const press = (name: string) =>
  fireEvent.click(screen.getByRole('button', { name: `${name} controls` }))

test('each patch, and the trigger lines and amps, open their own knobs', () => {
  open()
  expect(screen.queryByText('Choke')).toBeNull()
  press('choke')
  expect(screen.getByText('Choke')).not.toBeNull()
  set({ drumCross: 1 })
  press('cross-patch')
  expect(screen.queryByText('Choke')).toBeNull()
  expect(screen.getByText('Cross-patch')).not.toBeNull()
  expect(screen.getByText('Cross bleed')).not.toBeNull()
  press('amps')
  expect(screen.getByText('Accent')).not.toBeNull()
  press('trigger lines')
  expect(screen.getByText('Retrigger')).not.toBeNull()
})
