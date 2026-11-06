// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'

import { DEFAULT_CONTROLS } from '../controls.ts'
import { MIC } from '../dsp/micJacks.ts'
import { engine } from '../engine/engine.ts'
import { TAP_MIC } from '../engine/params.ts'
import { jackFor, jackOf } from '../jacks.ts'
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

test('the unit menu checks the one line the unit is patched into', () => {
  engine.writeBoard({ ...DEFAULT_CONTROLS, combInto: jackFor('toyDrum') })
  render(<JackCap stage="Comb" />)
  fireEvent.click(screen.getByRole('button', { name: 'patch Comb into' }))
  const items = screen.getAllByRole('menuitemradio', { hidden: true })
  expect(items.length).toBeGreaterThan(2)
  expect(items.filter(i => i.getAttribute('aria-checked') === 'true')).toEqual([
    screen.getByRole('menuitemradio', { name: 'Clatter', hidden: true }),
  ])
})

test('a unit on a mic wired off the mix is told it hears nothing', () => {
  engine.writeBoard({
    ...DEFAULT_CONTROLS,
    micPatch: MIC.toyRail,
    combInto: jackOf(TAP_MIC),
  })
  render(<JackCap stage="Comb" />)
  const cap = screen.getByRole('button', { name: 'patch Comb into' })
  expect(tipOf(cap)).toMatch(/hears nothing/)
  fireEvent.click(cap)
  expect(
    screen.getByRole('menuitemradio', { name: /^Mic/, hidden: true })
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
  engine.writeBoard({ ...DEFAULT_CONTROLS, combInto: jackOf(TAP_MIC) })
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
  act(() => engine.set('combInto', jackFor('monoSynth')))
  expect(machine.textContent).toBe('Comb')
  expect(unit.textContent).toBe('Growler')
})

test('the panel’s compact cap is named only once something is patched', () => {
  render(<JackCap stage="Growler" compact />)
  const cap = screen.getByRole('button', { name: 'patch into Growler' })
  expect(cap.textContent).toBe('')
  act(() => engine.set('combInto', jackFor('monoSynth')))
  expect(cap.textContent).toBe('Comb')
})
