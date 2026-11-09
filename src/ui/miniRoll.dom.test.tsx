// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'

import { YOURS } from '../dsp/stages/roms.ts'
import { GATE_CHOICES } from '../dsp/trigbus.ts'
import { engine } from '../engine/engine.ts'
import { SEQ_DESTS } from '../engine/messages.ts'
import { MONO_SEQ_STEP_KEYS, REST, TUNE_LANE_KEYS } from '../tune.ts'
import { bench } from './bench.ts'
import { GROUPS } from './controls/index.ts'
import { FmKeys } from './FmKeys.tsx'
import { Keys } from './Keys.tsx'
import { LeadKeys, MonoKeys } from './MonoKeys.tsx'
import { PcmKeys } from './PcmKeys.tsx'
import { OpenGroup } from './Section.tsx'
import './testDom.ts'

import type { ControlKey, Controls } from '../controls.ts'

const strip = () =>
  screen.queryByRole('button', { name: 'open the piano roll' })
const bars = () => strip()?.querySelectorAll('line[class*="note"]').length ?? 0

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

test.each([
  ['Growler', <MonoKeys key="Growler" onOpen={() => {}} />],
  ['Howler', <LeadKeys key="Howler" onOpen={() => {}} />],
])('pressing %s’s strip opens the roll box in its drawing', (name, keys) => {
  act(() => engine.patch({ monoSeqOn: 1, leadSeqOn: 1 }))
  const group = GROUPS.find(g => g.name === name)!
  render(
    <>
      {keys}
      <OpenGroup group={group} onClose={() => {}} seconds={0} />
    </>,
  )
  expect(screen.queryByRole('region', { name: 'piano roll' })).toBeNull()
  fireEvent.click(strip()!)
  expect(screen.getByRole('region', { name: 'piano roll' })).toBeTruthy()
})

test('Howler’s rec cap arms its own memory and rings its strip', () => {
  render(<LeadKeys onOpen={() => {}} />)
  expect(strip()).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'rec' }))
  expect(engine.leadRecord.get()).toBe(true)
  expect(engine.seqRecord.get()).toBe(false)
  expect(engine.controls.get().leadSeqOn).toBe(1)
  expect(strip()?.className).toMatch(/rec/)
})

const flash = () => strip()?.querySelector('rect[class*="taken"]')

test('a note recording takes flashes on the strip', () => {
  act(() => engine.patch({ chipTune: YOURS }))
  render(<Keys onOpen={() => {}} />)
  expect(flash()).toBeFalsy()
  act(() => engine.armTuneRecord(true))
  act(() => engine.noteOn(3))
  act(() => engine.noteOff(3))
  expect(flash()).toBeTruthy()
  act(() => engine.armTuneRecord(false))
})

test('the second melody’s notes do not flash the toy', () => {
  act(() => engine.patch({ chipTune: YOURS }))
  render(<Keys onOpen={() => {}} />)
  act(() => engine.noteTaken.set({ memory: 'seq', step: 2, at: 1 }))
  expect(flash()).toBeFalsy()
})

const written = (keys: readonly ControlKey[], note: (s: number) => number) => {
  const board: Partial<Controls> = {}
  keys.forEach((key, s) => {
    board[key] = note(s)
  })
  return board
}

// Lane 1 holds one note, lane 2 two and lane 3 three, so the count of bars
// says which lanes a strip draws.
const laneTune = TUNE_LANE_KEYS.reduce<Partial<Controls>>(
  (board, keys, lane) => ({
    ...board,
    ...written(keys, s => (s % 4 === 0 && s / 4 <= lane ? 10 + s : REST)),
  }),
  {},
)
const gate = (choice: string) => GATE_CHOICES.indexOf(choice)

test('Glint draws the lanes its key gate follows', () => {
  act(() => engine.patch({ ...laneTune, chipTune: YOURS }))
  render(<FmKeys onOpen={() => {}} />)
  expect(bars()).toBe(6)
  act(() => engine.patch({ fmKeyGate: gate('lane 2') }))
  expect(bars()).toBe(2)
  act(() => engine.patch({ fmKeyGate: gate('no, cut') }))
  expect(strip()).toBeNull()
})

test('Parlor follows its own jumper, and only while the chip plays your tune', () => {
  act(() =>
    engine.patch({ ...laneTune, chipTune: YOURS, pcmKeyGate: gate('lane 3') }),
  )
  render(<PcmKeys onOpen={() => {}} />)
  expect(bars()).toBe(3)
  act(() => engine.patch({ chipTune: 0 }))
  expect(strip()).toBeNull()
})

test('pressing a following strip opens the toy’s roll', () => {
  act(() => engine.patch({ chipTune: YOURS }))
  const onOpen = vi.fn()
  render(<PcmKeys onOpen={onOpen} />)
  fireEvent.click(strip()!)
  expect(onOpen).toHaveBeenCalledWith('Plinky')
})

test('Growler’s line soldered to Glint takes its strip over the toy’s lanes', () => {
  act(() =>
    engine.patch({
      ...laneTune,
      ...written(MONO_SEQ_STEP_KEYS, s => (s === 0 ? 10 : REST)),
      chipTune: YOURS,
      monoSeqOn: 1,
      monoSeqTo: SEQ_DESTS.indexOf('fm'),
    }),
  )
  render(<FmKeys onOpen={() => {}} />)
  expect(bars()).toBe(1)
})
