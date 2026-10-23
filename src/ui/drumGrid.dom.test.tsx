// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'

import { GRID_ROWS } from '../drums.ts'
import { engine } from '../engine/engine.ts'
import styles from './DrumGrid.module.css'
import { DrumGrid } from './DrumGrid.tsx'
import { useDrumKeys } from './drumKeys.ts'
import './testDom.ts'

const under = (label: string) =>
  screen
    .getAllByRole('button', { name: new RegExp(`^${label} step \\d+$`) })
    .flatMap((cell, i) =>
      cell.className.split(' ').includes(styles.under!) ? [i + 1] : [],
    )

test('each row walks its own playhead off the kit’s step count', () => {
  engine.set(GRID_ROWS[0].len, 5)
  render(<DrumGrid />)
  expect(under('kick')).toEqual([])
  act(() => engine.setDrumsPlaying(true))
  act(() => engine.meter.set({ ...engine.meter.get(), tick: 7 }))
  expect(under('kick')).toEqual([3])
  expect(under('snare')).toEqual([8])
  act(() => engine.meter.set({ ...engine.meter.get(), tick: 0 }))
})

function Keys() {
  useDrumKeys()
  return null
}

test('the m switch and shift with a pad number mute a row', () => {
  render(
    <>
      <Keys />
      <DrumGrid />
    </>,
  )
  const mute = screen.getByRole('button', { name: 'mute kick' })
  fireEvent.click(mute)
  expect(engine.controls.get().drumRowMute).toBe(1)
  expect(mute.getAttribute('aria-pressed')).toBe('true')
  fireEvent.keyDown(window, { code: 'Digit2', shiftKey: true })
  expect(engine.controls.get().drumRowMute).toBe(3)
  fireEvent.click(mute)
  expect(engine.controls.get().drumRowMute).toBe(2)
})

test('a ratchet cell clicks up through the counts and shift-click goes back', () => {
  act(() => engine.patch({ drumRatchet2: 0, drumNudge5: 0 }))
  render(<DrumGrid />)
  const cell = (name: string) => screen.getByRole('button', { name })
  fireEvent.click(cell('ratchet step 3'))
  expect(engine.controls.get().drumRatchet2).toBe(1)
  expect(cell('ratchet step 3').textContent).toBe('×2')
  fireEvent.click(cell('ratchet step 3'), { shiftKey: true })
  fireEvent.click(cell('ratchet step 3'), { shiftKey: true })
  expect(engine.controls.get().drumRatchet2).toBe(5)
  fireEvent.click(cell('nudge step 6'))
  expect(engine.controls.get().drumNudge5).toBe(2)
})

test('an event cell clicks round the faults', () => {
  render(<DrumGrid />)
  const cell = () => screen.getByRole('button', { name: 'event step 13' })
  fireEvent.click(cell())
  fireEvent.click(cell())
  expect(engine.controls.get().drumEvent12).toBe(2)
  expect(cell().textContent).toBe('d')
  fireEvent.click(cell(), { shiftKey: true })
  fireEvent.click(cell(), { shiftKey: true })
  fireEvent.click(cell(), { shiftKey: true })
  expect(engine.controls.get().drumEvent12).toBe(5)
  const every = screen.getByRole('button', { name: 'bars between faults' })
  expect(every.textContent).toBe('1:1')
  fireEvent.click(every)
  fireEvent.click(every)
  expect(every.textContent).toBe('4:4')
  expect(engine.controls.get().drumEventEvery).toBe(2)
})

test('the last column trades row lengths for the bars each row plays', () => {
  render(<DrumGrid />)
  const toggle = screen.getByRole('button', { name: 'len' })
  expect(screen.queryByRole('combobox', { name: 'snare row bars' })).toBeNull()
  fireEvent.click(toggle)
  const bars = screen.getByRole('combobox', { name: 'snare row bars' })
  expect(
    screen.queryByRole('combobox', { name: 'snare row length' }),
  ).toBeNull()
  fireEvent.change(bars, { target: { value: '9' } })
  expect(engine.controls.get().drumSnareCond).toBe(9)
  expect((bars as HTMLSelectElement).selectedOptions[0]!.text).toBe('!4:4')
  fireEvent.click(screen.getByRole('button', { name: 'bars' }))
  expect(screen.getByRole('button', { name: 'len' }).className).toMatch(
    /tailOn/,
  )
  expect(
    screen.getByRole('combobox', { name: 'snare row length' }),
  ).toBeTruthy()
})
