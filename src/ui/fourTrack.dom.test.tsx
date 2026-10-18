// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'

import { engine } from '../engine/engine.ts'
import { choiceValue, GROUPS } from './controls/index.ts'
import { OpenGroup } from './Section.tsx'
import './testDom.ts'

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

test('the deck switches share one row and write the same controls', () => {
  openFourTrack()
  fireEvent.click(screen.getByRole('button', { name: '3¾ ips' }))
  expect(engine.controls.get().fourSpeed).toBe(1)
  fireEvent.click(screen.getByRole('button', { name: 'B' }))
  expect(engine.controls.get().fourSide).toBe(1)
  fireEvent.click(screen.getByRole('button', { name: 'dbx' }))
  expect(engine.controls.get().fourDbx).toBe(1)
})

test('the strip and the transport start folded, with no strip row drawn until its box is pressed', () => {
  openFourTrack()
  expect(fold('channel strip')?.open).toBe(false)
  expect(fold('the transport')?.open).toBe(false)
  expect(screen.queryByRole('slider', { name: 'Trim' })).toBeNull()
})

test('a strip with a moved knob opens on that track, and its boxes open their knobs', () => {
  act(() => engine.set('four2Trim', 12))
  openFourTrack()
  expect(fold('channel strip')?.open).toBe(true)
  expect(screen.getByRole('img', { name: 'track 2 signal path' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'trim controls' }))
  expect(screen.getByRole('slider', { name: 'Trim' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'trim controls' }))
  expect(screen.queryByRole('slider', { name: 'Trim' })).toBeNull()
})

test('pressing a lane number brings that track’s strip up', () => {
  openFourTrack()
  fireEvent.click(screen.getByRole('button', { name: 'track 3 strip' }))
  expect(fold('channel strip')?.open).toBe(true)
  expect(screen.getByRole('img', { name: 'track 3 signal path' })).toBeTruthy()
})

test('the record box says what record and erase do to the tape', () => {
  openFourTrack()
  fireEvent.click(screen.getByRole('button', { name: 'track 1 strip' }))
  fireEvent.click(screen.getByRole('button', { name: 'rec controls' }))
  expect(screen.getByText(/write onto the loops themselves/)).toBeTruthy()
  expect(screen.getByRole('slider', { name: 'Record' })).toBeTruthy()
})

test('arming an empty loop that hears only itself points the channel at the board', () => {
  openFourTrack()
  fireEvent.click(screen.getByRole('button', { name: 'record track 1' }))
  expect(engine.controls.get().four1In).toBe(choiceValue('four1In', 'board'))
  expect(engine.controls.get().four1Rec).toBe(1)
})

test('arming leaves a channel that already hears something else alone', () => {
  act(() => engine.set('four1In', choiceValue('four1In', 'mic')))
  openFourTrack()
  fireEvent.click(screen.getByRole('button', { name: 'record track 1' }))
  expect(engine.controls.get().four1In).toBe(choiceValue('four1In', 'mic'))
})

test('a strip knob moving from elsewhere opens the strip on its channel, but the record arm does not', () => {
  openFourTrack()
  fireEvent.click(screen.getByRole('button', { name: 'record track 1' }))
  expect(fold('channel strip')?.open).toBe(false)
  act(() => engine.set('four3Mid', 9))
  expect(fold('channel strip')?.open).toBe(true)
  expect(screen.getByRole('img', { name: 'track 3 signal path' })).toBeTruthy()
})
