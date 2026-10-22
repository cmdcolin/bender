// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'

import { YOURS } from '../dsp/stages/roms.ts'
import { engine } from '../engine/engine.ts'
import { SEQ_DESTS } from '../engine/messages.ts'
import { bench } from './bench.ts'
import { FmKeys } from './FmKeys.tsx'
import { Keys } from './Keys.tsx'
import './testDom.ts'

const strip = () =>
  screen.queryByRole('button', { name: 'open the piano roll' })
const bars = () => strip()?.querySelectorAll('line').length ?? 0

test('the toy shows its memory only while it plays your tune', () => {
  act(() => engine.patch({ chipTune: 0 }))
  render(<Keys onOpen={() => {}} />)
  expect(strip()).toBeNull()
  act(() => engine.patch({ chipTune: YOURS, tuneStep0: 3, tuneStep4: 7 }))
  expect(bars()).toBe(2)
})

test('a press of rec puts the strip on the deck and rings it', () => {
  act(() => engine.patch({ chipTune: 0 }))
  render(<Keys onOpen={() => {}} />)
  act(() => engine.armTuneRecord(true))
  expect(strip()?.className).toMatch(/rec/)
  act(() => engine.armTuneRecord(false))
})

test('the second melody shows on the bed it is aimed at', () => {
  act(() =>
    engine.patch({ monoSeqOn: 1, monoSeqTo: SEQ_DESTS.indexOf('mono') }),
  )
  render(<FmKeys onOpen={() => {}} />)
  expect(strip()).toBeNull()
  act(() => engine.patch({ monoSeqTo: SEQ_DESTS.indexOf('fm') }))
  expect(strip()).not.toBeNull()
})

test('pressing the strip opens the roll in the drawing', () => {
  act(() => engine.patch({ chipTune: YOURS }))
  const onOpen = vi.fn()
  render(<Keys onOpen={onOpen} />)
  fireEvent.click(strip()!)
  expect(onOpen).toHaveBeenCalledWith('Plinky')
  expect(bench.get().roll).toBe(true)
})
