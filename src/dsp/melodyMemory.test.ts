import { expect, test } from 'vitest'

import { SOURCE_TAPS } from '../engine/params.ts'
import { render, renderStems, rms } from './testRender.ts'

import type { Controls } from '../controls.ts'

// Every jumper cut and the toy silent, so the only note on the board is the
// memory's.
const ALONE: Partial<Controls> = {
  chipLevel: 0,
  drumLevel: 0,
  monoKeyGate: 1,
  fmKeyGate: 1,
  pcmKeyGate: 1,
  monoSeqOn: 1,
  monoSeqLen: 4,
  monoSeqRate: 4,
  monoSeqStep0: 0,
  monoSeqStep2: 7,
}

const SOURCES = { mono: 'monoLevel', fm: 'fmLevel', pcm: 'pcmLevel' } as const

const loud = (to: number, only: keyof typeof SOURCES) =>
  rms(
    render(
      {
        ...ALONE,
        monoSeqTo: to,
        monoLevel: 0,
        fmLevel: 0,
        pcmLevel: 0,
        [SOURCES[only]]: 1,
      },
      2,
    ),
  )

test.each([
  ['mono', 0],
  ['fm', 1],
  ['pcm', 2],
] as const)('the memory plays the %s alone when it is chosen', (name, to) => {
  expect(loud(to, name)).toBeGreaterThan(0.01)
})

test.each([
  ['mono', 1],
  ['mono', 2],
  ['fm', 0],
  ['fm', 2],
  ['pcm', 0],
  ['pcm', 1],
] as const)('%s hears nothing while the memory plays another', (name, to) => {
  expect(loud(to, name)).toBe(0)
})

test('the toy’s tune and the memory play different machines at once', () => {
  const { stems } = renderStems(
    {
      ...ALONE,
      chipLevel: 1,
      monoKeyGate: 0,
      monoLevel: 1,
      fmLevel: 1,
      monoSeqTo: 1,
    },
    3,
  )
  expect(rms(stems[SOURCE_TAPS.indexOf('monoSynth')]!)).toBeGreaterThan(0.01)
  expect(rms(stems[SOURCE_TAPS.indexOf('fmChip')]!)).toBeGreaterThan(0.01)
})
