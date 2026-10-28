// @vitest-environment jsdom
import { beforeEach, expect, test } from 'vitest'

import { DEFAULT_CONTROLS } from '../controls.ts'
import { engine } from '../engine/engine.ts'
import { sounds, switchOn } from './bendChain.ts'

beforeEach(() => engine.writeBoard({ ...DEFAULT_CONTROLS }))

test('a full chain trades out a silent bend before a sounding one', () => {
  const added = ['Octave', 'Codec', 'Freq shifter']
  for (const stage of added) switchOn(stage)
  const board = engine.controls.get()
  for (const stage of added) expect(sounds(board, stage)).toBe(true)
})

test('a full chain of sounding bends trades out the last', () => {
  engine.writeBoard({
    ...DEFAULT_CONTROLS,
    ringMix: 1,
    crushMix: 1,
    distMix: 1,
    combMix: 1,
    glitchMix: 1,
    filtMix: 1,
  })
  switchOn('Octave')
  const board = engine.controls.get()
  expect(sounds(board, 'Octave')).toBe(true)
  expect(sounds(board, 'Glitch buffer')).toBe(false)
  expect(sounds(board, 'Screech filter')).toBe(true)
})
