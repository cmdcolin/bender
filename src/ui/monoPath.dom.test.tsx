// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { expect, test } from 'vitest'

import { engine } from '../engine/engine.ts'
import { GROUPS } from './controls/index.ts'
import { OpenGroup } from './Section.tsx'
import './testDom.ts'

const open = () =>
  render(
    <OpenGroup
      group={GROUPS.find(g => g.name === 'Growler')!}
      onClose={() => {}}
      seconds={0}
    />,
  )

const press = (name: string) =>
  fireEvent.click(screen.getByRole('button', { name: `${name} controls` }))

test('each box opens its fold’s rows, drawn once', () => {
  open()
  expect(screen.queryByText('voice card faults')).toBeNull()
  expect(screen.queryByText('Osc 1 wave')).toBeNull()
  const boxes: [string, string][] = [
    ['oscillators', 'Osc 1 wave'],
    ['mixer', 'Feedback'],
    ['filter', 'Key tracking'],
    ['modulation', 'To pitch'],
  ]
  for (const [box, row] of boxes) {
    press(box)
    expect(screen.getAllByText(row), row).toHaveLength(1)
  }
  press('voice card')
  press('VCA')
  expect(screen.getAllByText('Leaky VCA')).toHaveLength(1)
  expect(screen.queryByText('Cutoff')).toBeNull()
})

test('the filter, keys and out wire hold the rows no fold names', () => {
  open()
  expect(screen.queryByText('Level')).toBeNull()
  press('filter')
  expect(screen.getAllByText('Cutoff')).toHaveLength(1)
  press('keys')
  expect(screen.getAllByText('Glide')).toHaveLength(1)
  press('out')
  expect(screen.getAllByText('Level')).toHaveLength(1)
  expect(screen.queryByText('Mute')).toBeNull()
})

test('the piano roll box opens the melody rows and the piano roll', () => {
  open()
  expect(screen.queryByText('melody')).toBeNull()
  expect(screen.queryByRole('button', { name: 'show piano roll' })).toBeNull()
  press('piano roll')
  expect(screen.getAllByText('Plays on')).toHaveLength(1)
  expect(screen.getByRole('button', { name: 'C4 step 1' })).not.toBeNull()
  press('piano roll')
})

test('the sync wire lights once Sync is on', () => {
  const { container } = open()
  const sync = () =>
    [...container.querySelectorAll('text')].find(t => t.textContent === 'sync')!
  expect(sync().getAttribute('class')).not.toMatch(/noteOn/)
  act(() => engine.set('monoSync', 1))
  expect(sync().getAttribute('class')).toMatch(/noteOn/)
})

test('the sync and FM words open their own knob over the oscillators', () => {
  open()
  for (const [word, own] of [
    ['sync', 'Sync'],
    ['FM', 'Lin FM'],
  ] as const) {
    press(word)
    const wired = screen.getByText('wired to oscillators').parentElement!
    expect(within(wired).queryByText(own), word).toBeNull()
    expect(within(wired).getByText('Osc 1 wave'), word).not.toBeNull()
    expect(screen.getByText(own), word).not.toBeNull()
  }
})

test('the noise and feedback words open the mixer', () => {
  open()
  press('noise')
  expect(screen.getByText('Feedback')).not.toBeNull()
  press('feedback')
  expect(screen.queryByText('Feedback')).toBeNull()
})

test('the modulation wires open the modulation rows', () => {
  open()
  for (const wire of ['pitch modulation', 'filter modulation']) {
    press(wire)
    expect(screen.getByText('To pitch'), wire).not.toBeNull()
    press(wire)
    expect(screen.queryByText('To pitch'), wire).toBeNull()
  }
})
