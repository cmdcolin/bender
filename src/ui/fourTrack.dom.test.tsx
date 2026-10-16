// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'

import { engine } from '../engine/engine'
import { choiceValue, GROUPS } from './controls'
import { OpenGroup } from './Section'
import './testDom'

const openFourTrack = () => {
  const group = GROUPS.find(g => g.name === 'Four-track')
  if (!group) throw new Error('no four-track')
  return render(<OpenGroup group={group} onClose={() => {}} seconds={0} />)
}

const fold = (name: string) =>
  [...document.querySelectorAll('details')].find(d =>
    d.querySelector('summary')?.textContent?.startsWith(name),
  )

test('each track gets a lane with its input, record arm and fader, drawn once', () => {
  openFourTrack()
  for (const n of [1, 2, 3, 4]) {
    expect(
      screen.getAllByRole('combobox', { name: `track ${n} input` }),
    ).toHaveLength(1)
    expect(
      screen.getAllByRole('button', { name: `record track ${n}` }),
    ).toHaveLength(1)
  }
  expect(screen.getAllByRole('slider', { name: 'Fader' })).toHaveLength(4)
  expect(screen.queryByText('Input')).toBeNull()
})

test('the record arm lays a channel onto its loop and lifts it off again', () => {
  openFourTrack()
  const arm = screen.getByRole('button', { name: 'record track 2' })
  expect(arm.getAttribute('aria-pressed')).toBe('false')
  fireEvent.click(arm)
  expect(engine.controls.get().four2Rec).toBe(1)
  expect(arm.getAttribute('aria-pressed')).toBe('true')
  fireEvent.click(arm)
  expect(engine.controls.get().four2Rec).toBe(0)
})

test('the lane picks what the channel hears', () => {
  openFourTrack()
  fireEvent.change(screen.getByRole('combobox', { name: 'track 3 input' }), {
    target: { value: String(choiceValue('four3In', 'mic')) },
  })
  expect(engine.controls.get().four3In).toBe(choiceValue('four3In', 'mic'))
})

test('the channel strips and the transport start folded', () => {
  openFourTrack()
  for (const name of ['the transport', 'aux bus', 'track 1', 'track 4'])
    expect(fold(name)?.open, name).toBe(false)
})

test('a fold holding a moved knob opens, and its diagram reads the board', () => {
  act(() => engine.set('four2Trim', 12))
  openFourTrack()
  expect(fold('track 2')?.open).toBe(true)
  const diagram = screen.getByRole('img', { name: 'track 2 signal path' })
  expect(diagram.textContent).toContain('+12 dB')
  act(() => engine.set('four2Trim', 0))
  expect(diagram.textContent).toContain('0 dB')
  expect(diagram.textContent).not.toContain('+12 dB')
})
