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

const svg = () => screen.getByRole('group', { name: 'drum kit wiring' })
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

const lit = (part: string) =>
  screen
    .getByRole('button', { name: `${part} controls` })
    .querySelector('rect')!
    .getAttribute('class')!
    .includes('boxOn')

test('the choke, ring trigger and cross-patch each light once moved and name no setting', () => {
  open()
  for (const part of ['choke', 'ring trigger', 'cross-patch'])
    expect(lit(part), part).toBe(false)
  set({ drumChoke: 2, drumRingTrig: 1, drumCross: 1 })
  for (const part of ['choke', 'ring trigger', 'cross-patch'])
    expect(lit(part), part).toBe(true)
  expect(words().join()).not.toContain('kick cuts tom')
  expect(red()).toBeGreaterThan(0)
})

test('the trigger lines and amps light once one of their settings moves', () => {
  open()
  for (const part of ['trigger lines', 'amps'])
    expect(lit(part), part).toBe(false)
  set({ drumScan: 0.5, drumAccentSag: 0.5 })
  for (const part of ['trigger lines', 'amps'])
    expect(lit(part), part).toBe(true)
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

test('a soldered wire opens the patch it belongs to', () => {
  open()
  set({ drumChoke: 2, drumCross: 1, drumCrossAmt: 0.5 })
  fireEvent.click(
    screen.getAllByRole('button', { name: 'choke wire controls' })[0]!,
  )
  expect(screen.getByText('Choke')).not.toBeNull()
  fireEvent.click(
    screen.getAllByRole('button', { name: 'cross-patch wire controls' })[0]!,
  )
  expect(screen.getByText('Cross bleed')).not.toBeNull()
})
