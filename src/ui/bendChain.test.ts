// @vitest-environment jsdom
import { beforeEach, expect, test } from 'vitest'

import { DEFAULT_CONTROLS } from '../controls.ts'
import { engine } from '../engine/engine.ts'
import { jackFor } from '../jacks.ts'
import { sounds, switchOn } from './bendChain.ts'
import { BEND_SLOT_KEYS } from './controls/index.ts'

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

// A bend patched onto a machine runs there with no socket holding it, so
// pressing it on takes no socket from a bend on the master run.
test('a patched bend sounds without a socket and switches on without one', () => {
  const board = {
    ...DEFAULT_CONTROLS,
    octInto: jackFor('toyDrum'),
    octMix: 1,
    octMute: 1,
  }
  engine.writeBoard(board)
  switchOn('Octave')
  const after = engine.controls.get()
  expect(sounds(after, 'Octave')).toBe(true)
  for (const k of BEND_SLOT_KEYS) expect(after[k]).toBe(board[k])
})
