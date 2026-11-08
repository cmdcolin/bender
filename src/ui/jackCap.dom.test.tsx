// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'

import { DEFAULT_CONTROLS } from '../controls.ts'
import { MIC } from '../dsp/micJacks.ts'
import { engine } from '../engine/engine.ts'
import { TAP_MIC } from '../engine/params.ts'
import { lineFor, lineOf } from '../jacks.ts'
import { JackCap } from './JackCap.tsx'
import './testDom.ts'

const tipOf = (el: HTMLElement) => {
  vi.useFakeTimers()
  fireEvent.pointerEnter(el)
  act(() => {
    vi.runAllTimers()
  })
  vi.useRealTimers()
  return document.getElementById(el.getAttribute('aria-describedby')!)
    ?.textContent
}

test('the unit menu ticks the lines the unit is patched into', () => {
  engine.writeBoard({ ...DEFAULT_CONTROLS, combLines: lineFor('toyDrum') })
  render(<JackCap stage="Comb" />)
  fireEvent.click(screen.getByRole('button', { name: 'patch Comb into' }))
  const items = screen.getAllByRole('menuitemcheckbox', { hidden: true })
  expect(items.length).toBeGreaterThan(2)
  expect(items.filter(i => i.getAttribute('aria-checked') === 'true')).toEqual([
    screen.getByRole('menuitemcheckbox', { name: 'Clatter', hidden: true }),
  ])
  expect(
    screen
      .getByRole('menuitemradio', { name: /^master/, hidden: true })
      .getAttribute('aria-checked'),
  ).toBe('false')
})

test('ticking a second machine keeps the menu open and the cap names both', () => {
  engine.writeBoard({ ...DEFAULT_CONTROLS, combLines: lineFor('toyDrum') })
  render(<JackCap stage="Comb" />)
  const cap = screen.getByRole('button', { name: 'patch Comb into' })
  fireEvent.click(cap)
  fireEvent.click(
    screen.getByRole('menuitemcheckbox', { name: 'Plinky', hidden: true }),
  )
  expect(engine.controls.get().combLines).toBe(lineFor('toyDrum', 'toyChip'))
  expect(cap.textContent).toBe('Plinky + Clatter')
  fireEvent.click(
    screen.getByRole('menuitemradio', { name: /^master/, hidden: true }),
  )
  expect(engine.controls.get().combLines).toBe(0)
})

test('a machine’s jack toggles its own line on a unit and leaves the others', () => {
  engine.writeBoard({ ...DEFAULT_CONTROLS, combLines: lineFor('toyDrum') })
  render(<JackCap stage="Plinky" />)
  fireEvent.click(screen.getByRole('button', { name: 'patch into Plinky' }))
  const comb = screen.getByRole('menuitemcheckbox', {
    name: /^Comb/,
    hidden: true,
  })
  expect(comb.textContent).toBe('Combon Clatter')
  fireEvent.click(comb)
  expect(engine.controls.get().combLines).toBe(lineFor('toyDrum', 'toyChip'))
  fireEvent.click(comb)
  expect(engine.controls.get().combLines).toBe(lineFor('toyDrum'))
})

test('a unit on a mic wired off the mix is told it hears nothing', () => {
  engine.writeBoard({
    ...DEFAULT_CONTROLS,
    micPatch: MIC.toyRail,
    combLines: lineOf(TAP_MIC),
  })
  render(<JackCap stage="Comb" />)
  const cap = screen.getByRole('button', { name: 'patch Comb into' })
  expect(tipOf(cap)).toMatch(/hears nothing/)
  fireEvent.click(cap)
  expect(
    screen.getByRole('menuitemcheckbox', { name: /^Mic/, hidden: true })
      .textContent,
  ).toMatch(/hears nothing/)
})

test('the mic’s own jack says its units hear nothing off the mix', () => {
  engine.writeBoard({ ...DEFAULT_CONTROLS, micPatch: MIC.toyRail })
  render(<JackCap stage="Mic" />)
  const cap = screen.getByRole('button', { name: 'patch into Mic' })
  expect(tipOf(cap)).toMatch(/units patched here hear nothing/)
})

test('the mic on the mix hands its units a line', () => {
  engine.writeBoard({ ...DEFAULT_CONTROLS, combLines: lineOf(TAP_MIC) })
  render(<JackCap stage="Comb" />)
  const cap = screen.getByRole('button', { name: 'patch Comb into' })
  expect(tipOf(cap)).not.toMatch(/hears nothing/)
})

test('the cap reads insert until something is patched through it', () => {
  render(
    <>
      <JackCap stage="Growler" />
      <JackCap stage="Comb" />
    </>,
  )
  const machine = screen.getByRole('button', { name: 'patch into Growler' })
  const unit = screen.getByRole('button', { name: 'patch Comb into' })
  expect(machine.textContent).toBe('insert')
  expect(unit.textContent).toBe('insert')
  act(() => engine.set('combLines', lineFor('monoSynth')))
  expect(machine.textContent).toBe('Comb')
  expect(unit.textContent).toBe('Growler')
})

test('the panel’s compact cap is named only once something is patched', () => {
  render(<JackCap stage="Growler" compact />)
  const cap = screen.getByRole('button', { name: 'patch into Growler' })
  expect(cap.textContent).toBe('')
  act(() => engine.set('combLines', lineFor('monoSynth')))
  expect(cap.textContent).toBe('Comb')
})
