// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS } from '../controls.ts'
import { engine } from '../engine/engine.ts'
import { GROUPS } from './controls/index.ts'
import { setMorph } from './morph.ts'
import { OpenGroup } from './Section.tsx'
import { NODE_KEYS } from './toyBoxKeys.ts'
import './testDom.ts'

import type { Controls } from '../controls.ts'

const open = () =>
  render(
    <OpenGroup
      group={GROUPS.find(g => g.name === 'Plinky')!}
      onClose={() => {}}
      seconds={0}
    />,
  )

const set = (board: Partial<Controls>) =>
  act(() => {
    for (const [key, value] of Object.entries(board))
      engine.set(key as keyof Controls, value)
  })

const words = () =>
  [
    ...screen
      .getByRole('group', { name: 'toy chip die' })
      .querySelectorAll('text'),
  ].map(t => t.textContent)

const lit = (part: string) =>
  screen
    .getByRole('button', { name: `${part} controls` })
    .querySelector('rect')!
    .getAttribute('class')!
    .includes('boxOn')

test('the stock die names its parts and lights none', () => {
  open()
  expect(words()).toEqual(
    expect.arrayContaining(['clock', 'voices', 'envelope', 'output pin']),
  )
  expect(words()).not.toContain('clk')
  for (const part of ['clock', 'key matrix', 'envelope', 'output pin'])
    expect(lit(part), part).toBe(false)
})

test('each pin bend lights the part it bends', () => {
  open()
  set({
    chipGhost: 2,
    chipEnvCap: 2,
    chipDrift: 0.3,
    chipPwm: 0.5,
    chipScan: 0.3,
    chipBendSpot: 4,
    chipBendPot: 0.5,
  })
  for (const part of ['key matrix', 'envelope', 'clock'])
    expect(lit(part), part).toBe(true)
})

test('a short lights the voices, the box that opens it', () => {
  open()
  set({ chipShort: 0.5 })
  expect(lit('voices')).toBe(true)
  expect(lit('output pin')).toBe(false)
  set({ chipShort: 0 })
})

test('the tune ROM lights when the output drives it', () => {
  open()
  expect(lit('tune ROM')).toBe(false)
  set({ chipOutAddr: 3, chipOutData: 4 })
  expect(lit('tune ROM')).toBe(true)
  set({ chipOutAddr: 0, chipOutData: 0 })
})

test('a bend draws no wire, tag or pot on the die', () => {
  open()
  set({
    chipStepTap: 1,
    chipPwmTap: 0.5,
    chipEnvDiv: 0.5,
    chipEnvRelax: 0.5,
    chipCrosstalk: 0.5,
    chipHardSync: 1,
    chipXor: 1,
    chipPwm: 0.5,
    chipScan: 0.3,
    chipBendSpot: 4,
    chipBendPot: 0.5,
  })
  for (const word of [
    'step tap',
    'dive',
    'relax',
    'crosstalk',
    'sync',
    'xor',
    'PWM',
    'scan',
    'pot',
  ])
    expect(words()).not.toContain(word)
  set({
    chipStepTap: 0,
    chipPwmTap: 0,
    chipEnvDiv: 0,
    chipEnvRelax: 0,
    chipCrosstalk: 0,
    chipHardSync: 0,
    chipXor: 0,
    chipPwm: 0,
    chipScan: 0,
    chipBendSpot: 0,
    chipBendPot: 0,
  })
})

test('no chip text carries a number or a percentage', () => {
  open()
  set({ chipGhost: 2, chipEnvCap: 2, chipOutAddr: 3, chipOutData: 4 })
  expect(words().filter(w => /[\d%]/.test(w ?? ''))).toEqual([])
})

test('pressing a part opens its rows, and a second press puts them away', () => {
  open()
  const envelope = () =>
    screen.getByRole('button', { name: 'envelope controls' })
  expect(screen.queryByText('Envelope cap')).toBeNull()
  fireEvent.click(envelope())
  expect(screen.getByText('Envelope cap')).not.toBeNull()
  expect(screen.queryByText('Ghost keys')).toBeNull()
  fireEvent.click(envelope())
  expect(screen.queryByText('Envelope cap')).toBeNull()
})

test('every knob in the die fold sits in one of the parts', () => {
  const fold = GROUPS.find(g => g.name === 'Plinky')!
    .sliders.filter(d => d.part === 'inside the die')
    .map(d => d.key)
  expect(new Set(Object.values(NODE_KEYS).flat())).toEqual(new Set(fold))
})

test('the keyboard box starts open on the playing rows, and the bus box swaps in its own', () => {
  open()
  for (const row of ['Level', 'Tone', 'Arpeggio'])
    expect(screen.getByText(row)).not.toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'bus controls' }))
  expect(screen.queryByText('Arpeggio')).toBeNull()
  expect(screen.getByText('Data line')).not.toBeNull()
})

test('a board that arrives knifed still opens on the keyboard', () => {
  set({ chipDataLine: 2, chipDataFault: 1 })
  open()
  expect(screen.getByRole('region', { name: 'keyboard' })).not.toBeNull()
  expect(screen.queryByRole('group', { name: 'plinky bus wiring' })).toBeNull()
  set({ chipDataLine: 0, chipDataFault: 0 })
})

test('the stage draws no folds and no rows outside the drawing', () => {
  open()
  expect(document.querySelectorAll('summary')).toHaveLength(0)
  fireEvent.click(screen.getByRole('button', { name: 'keyboard controls' }))
  expect(screen.queryByText('Tune')).toBeNull()
  expect(screen.queryByText('Level')).toBeNull()
})

test('the piano roll box holds the tune picker and the piano roll', () => {
  open()
  expect(screen.queryByRole('button', { name: 'show piano roll' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'keyboard controls' }))
  expect(screen.queryByText('Tune')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'piano roll controls' }))
  expect(screen.getByText('Tune')).not.toBeNull()
  expect(screen.getByRole('button', { name: 'C4 step 1' })).not.toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'piano roll controls' }))
})

test('the bend spot row opens from the boxes it solders to', () => {
  open()
  expect(screen.queryByText('Bend spot')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'clock controls' }))
  expect(screen.getByText('Bend spot')).not.toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'keyboard controls' }))
  expect(screen.queryByText('Bend spot')).toBeNull()
})

test('a box lights for any knob it opens', () => {
  open()
  expect(lit('voices')).toBe(false)
  expect(lit('clock')).toBe(false)
  set({ chipXor: 1, chipHardSync: 0.5 })
  expect(lit('voices')).toBe(true)
  expect(lit('clock')).toBe(true)
  expect(lit('envelope')).toBe(false)
  set({ chipXor: 0, chipHardSync: 0 })
})

test('the clock shows its clk tags while open', () => {
  open()
  expect(
    screen.queryAllByRole('button', { name: 'clock clk controls' }),
  ).toHaveLength(0)
  fireEvent.click(screen.getByRole('button', { name: 'clock controls' }))
  expect(
    screen.getAllByRole('button', { name: 'clock clk controls' }),
  ).toHaveLength(4)
  expect(screen.getByText('Hard sync')).not.toBeNull()
})

test('the header verbs act on the whole stage with a box open', () => {
  act(() => {
    setMorph(0)
    engine.patch({ ...DEFAULT_CONTROLS })
  })
  open()
  fireEvent.click(screen.getByRole('button', { name: 'envelope controls' }))
  expect(
    screen.queryByRole('group', { name: 'what roll, undo and reset act on' }),
  ).toBeNull()
  const before = engine.controls.get()
  fireEvent.click(screen.getByRole('button', { name: 'roll' }))
  const after = engine.controls.get()
  const outside = (Object.keys(after) as (keyof Controls)[]).filter(
    k => after[k] !== before[k] && !NODE_KEYS.envelope?.includes(k),
  )
  expect(outside.length).toBeGreaterThan(0)
  act(() => engine.patch({ ...DEFAULT_CONTROLS }))
})

test('an open box rolls its own rows from inside its card', () => {
  act(() => {
    setMorph(0)
    engine.patch({ ...DEFAULT_CONTROLS })
  })
  open()
  fireEvent.click(screen.getByRole('button', { name: 'envelope controls' }))
  const card = screen.getByRole('region', { name: 'envelope' })
  const before = engine.controls.get()
  fireEvent.click(within(card).getByRole('button', { name: 'roll envelope' }))
  const after = engine.controls.get()
  const changed = (Object.keys(after) as (keyof Controls)[]).filter(
    k => after[k] !== before[k],
  )
  expect(changed.length).toBeGreaterThan(0)
  for (const key of changed) expect(NODE_KEYS.envelope).toContain(key)
  fireEvent.click(
    within(card).getByRole('button', { name: 'undo roll of envelope' }),
  )
  expect(engine.controls.get()).toEqual(before)
  act(() => engine.patch({ ...DEFAULT_CONTROLS }))
})

test('an open box resets its own rows from inside its card', () => {
  act(() => {
    setMorph(0)
    engine.patch({ ...DEFAULT_CONTROLS })
  })
  open()
  fireEvent.click(screen.getByRole('button', { name: 'envelope controls' }))
  const card = screen.getByRole('region', { name: 'envelope' })
  const reset = () =>
    within(card).queryByRole('button', { name: 'reset envelope' })
  expect(reset()).toBeNull()
  fireEvent.click(within(card).getByRole('button', { name: 'roll envelope' }))
  fireEvent.click(reset()!)
  for (const key of NODE_KEYS.envelope!)
    expect(engine.controls.get()[key]).toBe(DEFAULT_CONTROLS[key])
})

test('all settings lists the stage’s rows in place of the die', () => {
  act(() => engine.patch({ ...DEFAULT_CONTROLS }))
  open()
  expect(screen.queryByRole('group', { name: 'toy chip die' })).not.toBeNull()
  const rowsBefore = screen.queryAllByRole('slider').length
  const listAll = () => {
    fireEvent.click(screen.getByRole('button', { name: 'more for Plinky' }))
    fireEvent.click(
      screen.getByRole('menuitemcheckbox', { name: 'all settings' }),
    )
  }
  listAll()
  expect(screen.queryByRole('group', { name: 'toy chip die' })).toBeNull()
  expect(screen.queryAllByRole('slider').length).toBeGreaterThan(rowsBefore)
  listAll()
  expect(screen.queryByRole('group', { name: 'toy chip die' })).not.toBeNull()
})

test('a key under the die names each bend that is on, and opens its part', () => {
  act(() => engine.patch({ ...DEFAULT_CONTROLS }))
  open()
  expect(screen.queryByRole('button', { name: 'Hard sync' })).toBeNull()
  set({ chipHardSync: 1 })
  const chip = screen.getByRole('button', { name: 'Hard sync' })
  fireEvent.click(chip)
  expect(chip.ariaPressed).toBe('true')
  expect(
    screen.getByRole('button', { name: 'clock controls' }).ariaPressed,
  ).toBe('true')
  set({ chipHardSync: 0 })
})
