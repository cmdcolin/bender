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
      .getByRole('img', { name: 'toy chip die' })
      .querySelectorAll('text'),
  ].map(t => t.textContent)

const lit = (part: string) =>
  screen
    .getByRole('button', { name: `${part} controls` })
    .querySelector('rect')!
    .getAttribute('class')!
    .includes('chipOn')

test('the stock die names its parts, lights none and shows no bend', () => {
  open()
  expect(words()).toEqual(
    expect.arrayContaining(['clock', 'voices', 'envelope', 'output pin']),
  )
  expect(words()).not.toContain('clk')
  for (const bend of ['pot', 'PWM', 'scan', 'crosstalk', 'sync', 'xor'])
    expect(words()).not.toContain(bend)
  for (const part of ['clock', 'key matrix', 'envelope', 'output pin'])
    expect(lit(part), part).toBe(false)
})

test('each pin bend shows up on the part it bends', () => {
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
  expect(words()).toEqual(expect.arrayContaining(['PWM', 'scan', 'pot']))
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

test('each feedback bend draws its wire, and the tune ROM lights when the output drives it', () => {
  open()
  for (const bend of ['step tap', 'dive', 'relax'])
    expect(words()).not.toContain(bend)
  expect(lit('tune ROM')).toBe(false)
  set({
    chipStepTap: 0.4,
    chipEnvDiv: 0.5,
    chipEnvRelax: 0.4,
    chipOutAddr: 3,
    chipOutData: 4,
  })
  expect(words()).toEqual(expect.arrayContaining(['step tap', 'dive', 'relax']))
  expect(lit('tune ROM')).toBe(true)
})

test('no chip text carries a number or a percentage', () => {
  open()
  set({ chipGhost: 2, chipEnvCap: 2, chipOutAddr: 3, chipOutData: 4 })
  expect(words().filter(w => /[\d%]/.test(w ?? ''))).toEqual([])
})

test('the PWM tap takes the PWM carrier off the clock', () => {
  open()
  set({ chipPwm: 0.5 })
  expect(words().filter(w => w === 'PWM')).toHaveLength(1)
  set({ chipPwmTap: 0.5 })
  expect(words().filter(w => w === 'PWM')).toHaveLength(1)
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
  for (const row of ['Tune', 'Level', 'Tone', 'Arpeggio'])
    expect(screen.getByText(row)).not.toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'bus controls' }))
  expect(screen.queryByText('Arpeggio')).toBeNull()
  expect(screen.getByText('Data line')).not.toBeNull()
})

test('a board that arrives knifed still opens on the keyboard', () => {
  set({ chipDataLine: 2, chipDataFault: 1 })
  open()
  expect(screen.getByRole('region', { name: 'keyboard' })).not.toBeNull()
  expect(screen.queryByRole('img', { name: 'plinky bus wiring' })).toBeNull()
  set({ chipDataLine: 0, chipDataFault: 0 })
})

test('the stage draws no folds and no rows outside the drawing', () => {
  open()
  expect(document.querySelectorAll('summary')).toHaveLength(0)
  fireEvent.click(screen.getByRole('button', { name: 'keyboard controls' }))
  expect(screen.queryByText('Tune')).toBeNull()
  expect(screen.queryByText('Level')).toBeNull()
})

test('showing the piano roll opens the keyboard box', () => {
  open()
  fireEvent.click(screen.getByRole('button', { name: 'envelope controls' }))
  expect(screen.queryByText('Tune')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'show piano roll' }))
  expect(screen.getByText('Tune')).not.toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'show piano roll' }))
})

test('the bend spot opens from the boxes it solders to, and the pot opens its box', () => {
  open()
  expect(screen.queryByText('Bend spot')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'clock controls' }))
  expect(screen.getByText('Bend spot')).not.toBeNull()
  set({ chipBendSpot: 4, chipBendPot: 0.5 })
  fireEvent.click(screen.getByRole('button', { name: 'keyboard controls' }))
  expect(screen.queryByText('Bend spot')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'bend pot controls' }))
  expect(screen.getByText('Envelope cap')).not.toBeNull()
  set({ chipBendSpot: 0, chipBendPot: 0 })
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

test('the clock shows its clk tags while open, and a bent tag opens the part it names', () => {
  open()
  expect(
    screen.queryAllByRole('button', { name: 'clock clk controls' }),
  ).toHaveLength(0)
  fireEvent.click(screen.getByRole('button', { name: 'clock controls' }))
  expect(
    screen.getAllByRole('button', { name: 'clock clk controls' }),
  ).toHaveLength(4)
  expect(screen.getByText('Hard sync')).not.toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'clock controls' }))
  set({ chipScan: 0.3 })
  fireEvent.click(
    screen.getByRole('button', { name: 'output pin scan controls' }),
  )
  expect(screen.getByText('Output hold')).not.toBeNull()
  set({ chipScan: 0 })
})

test('every soldered bend names itself on its part and opens its row', () => {
  open()
  const bends = [
    ['clock', 'sync', 'chipHardSync', 'Hard sync'],
    ['clock', 'fm', 'chipFmClock', 'FM on clock'],
    ['tune ROM', 'addr', 'chipOutAddr', 'Output on address'],
    ['tune ROM', 'data', 'chipOutData', 'Output on data'],
    ['key matrix', 'ghost', 'chipGhost', 'Ghost keys'],
    ['voices', 'short', 'chipShort', 'Voice short'],
    ['voices', 'xor', 'chipXor', 'Voice XOR'],
    ['voices', 'duty', 'chipDutyEnv', 'Duty on envelope'],
    ['envelope', 'bits', 'chipEnvBits', 'Envelope bits'],
    ['output pin', 'hold', 'chipHold', 'Output hold'],
  ] as const
  set(Object.fromEntries(bends.map(([, , key]) => [key, 1])))
  for (const [part, bend, , row] of bends) {
    expect(words()).toContain(bend)
    const tag = () =>
      screen.getByRole('button', { name: `${part} ${bend} controls` })
    fireEvent.click(tag())
    expect(screen.getByText(row, { selector: 'span' })).not.toBeNull()
    fireEvent.click(tag())
  }
  set(Object.fromEntries(bends.map(([, , key]) => [key, 0])))
})

test('each bend wire and its name open the part it bends', () => {
  open()
  set({
    chipStepTap: 1,
    chipPwmTap: 0.5,
    chipEnvDiv: 0.5,
    chipEnvRelax: 0.5,
    chipCrosstalk: 0.5,
  })
  for (const [bend, row] of [
    ['step tap', 'Step tap'],
    ['pwm tap', 'PWM tap'],
    ['dive', 'Envelope on divider'],
    ['relax', 'Envelope relax'],
    ['crosstalk', 'Crosstalk'],
  ] as const) {
    const tag = () => screen.getByRole('button', { name: `${bend} controls` })
    fireEvent.click(tag())
    expect(screen.getByText(row, { selector: 'span' })).not.toBeNull()
    fireEvent.click(tag())
  }
  fireEvent.click(
    screen.getByRole('button', { name: 'output pin out controls' }),
  )
  expect(screen.getByText('Output hold')).not.toBeNull()
  set({
    chipStepTap: 0,
    chipPwmTap: 0,
    chipEnvDiv: 0,
    chipEnvRelax: 0,
    chipCrosstalk: 0,
  })
})

test('the header verbs act on the open box, or on the whole stage', () => {
  act(() => engine.patch({ ...DEFAULT_CONTROLS }))
  open()
  fireEvent.click(screen.getByRole('button', { name: 'envelope controls' }))
  const aim = screen.getByRole('group', {
    name: 'what roll, undo and reset act on',
  })
  expect(aim.textContent).toContain('envelope')
  const before = engine.controls.get()
  fireEvent.click(screen.getByRole('button', { name: 'roll' }))
  const after = engine.controls.get()
  const changed = (Object.keys(after) as (keyof Controls)[]).filter(
    k => after[k] !== before[k],
  )
  expect(changed.length).toBeGreaterThan(0)
  for (const key of changed) expect(NODE_KEYS.envelope).toContain(key)
  fireEvent.click(screen.getByRole('button', { name: 'whole stage' }))
  expect(screen.getByRole('button', { name: 'whole stage' }).ariaPressed).toBe(
    'true',
  )
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

test('all settings lists the stage’s rows in place of the die', () => {
  act(() => engine.patch({ ...DEFAULT_CONTROLS }))
  open()
  expect(screen.queryByRole('img', { name: 'toy chip die' })).not.toBeNull()
  const rowsBefore = screen.queryAllByRole('slider').length
  fireEvent.click(screen.getByRole('button', { name: 'all settings' }))
  expect(screen.queryByRole('img', { name: 'toy chip die' })).toBeNull()
  expect(screen.queryAllByRole('slider').length).toBeGreaterThan(rowsBefore)
  fireEvent.click(screen.getByRole('button', { name: 'all settings' }))
  expect(screen.queryByRole('img', { name: 'toy chip die' })).not.toBeNull()
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
