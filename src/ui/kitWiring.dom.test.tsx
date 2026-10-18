// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'

import { engine } from '../engine/engine.ts'
import { GROUPS } from './controls/index.ts'
import { OpenGroup } from './Section.tsx'
import './testDom.ts'

import type { Controls } from '../controls.ts'

const open = () =>
  render(
    <OpenGroup
      group={GROUPS.find(g => g.name === 'Toy drums')!}
      onClose={() => {}}
      seconds={0}
    />,
  )

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
    expect.arrayContaining(['pattern', 'kick', 'open hat', 'cymbal', 'amps']),
  )
  expect(red()).toBe(0)
})

test('the choke, ring trigger and cross-patch each name the wire they moved', () => {
  open()
  set({ drumChoke: 2, drumRingTrig: 1, drumCross: 1 })
  expect(words()).toEqual(
    expect.arrayContaining([
      'kick cuts tom',
      'kick fires hat',
      'cross-patch kick/snare',
    ]),
  )
  expect(red()).toBeGreaterThan(0)
})

test('the sampled kit greys out the cross-patch', () => {
  open()
  set({ drumCross: 1, drumRom: 1 })
  const say = [...svg().querySelectorAll('text')].find(
    t => t.textContent === 'cross-patch kick/snare',
  )!
  expect(say.getAttribute('class')).not.toMatch(/knifed/)
})
