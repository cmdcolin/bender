// @vitest-environment jsdom
import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS } from '../controls'
import { YOURS } from '../dsp/stages/roms'
import { engine } from '../engine/engine'
import { HOLD, REST, TUNE_LANE_KEYS } from '../tune'
import { createBenderApi } from './agentApi'
import { boardFromUrl } from './share'
import './testDom'

const bender = createBenderApi()

test('set applies valid values and reports adjusted, unknown and failed ones', () => {
  const report = bender.set({
    chipStarve: 0.8,
    dlyFb: 9,
    chipTone: 'reed',
    chipStarv: 1,
    chipArp: 'sideways',
  })
  expect(report.applied).toMatchObject({
    chipStarve: '0.80',
    dlyFb: '1.50',
    chipTone: 'reed 1/4',
  })
  expect(report.adjusted).toEqual(['dlyFb: asked 9, set 1.50'])
  expect(report.unknown[0]).toMatch(
    /^chipStarv: no control has this key; closest keys: chipStarve/,
  )
  expect(report.failed[0]).toMatch(/^chipArp: no choice matches 'sideways'/)

  expect(engine.controls.get()).toMatchObject({
    chipStarve: 0.8,
    dlyFb: 1.5,
    chipTone: 1,
    chipArp: DEFAULT_CONTROLS.chipArp,
  })
})

test('each set call adds one undo step', () => {
  bender.set({ chipStarve: 0.5, dlyFb: 0.9 })
  bender.set({ chipStarve: 0.7 })
  expect(bender.summary().undo).toBe(2)
  bender.undo()
  expect(engine.controls.get()).toMatchObject({ chipStarve: 0.5, dlyFb: 0.9 })
  bender.undo()
  expect(engine.controls.get().chipStarve).toBe(DEFAULT_CONTROLS.chipStarve)
  expect(bender.summary().redo).toBe(2)
})

test('a set that changes no control adds no undo step', () => {
  bender.set({ chipStarve: DEFAULT_CONTROLS.chipStarve })
  bender.set({ nothing: 1 })
  expect(bender.summary().undo).toBe(0)
})

test('board lists changed controls by key, and its link loads the same board', () => {
  bender.set({ chipStarve: 0.8, chipTone: 'clav' })
  const board = bender.board()
  expect(board.preset).toBe('modified')
  expect(board.controls).toContain(
    'chipStarve = 0.80  (Toy keyboard: Starve, default 0.00)',
  )
  expect(
    board.controls.some(row => row.startsWith('chipTone = clav 1/8')),
  ).toBe(true)
  const hash = board.link.slice(board.link.indexOf('#'))
  expect(boardFromUrl('', hash)).toEqual({ chipStarve: 0.8, chipTone: 2 })
})

test('find ranks an exact key or label match first', () => {
  expect(bender.find('starve')[0]).toMatch(/^chipStarve = /)
  expect(bender.find('delay feedback').some(r => r.startsWith('dlyFb'))).toBe(
    true,
  )
  expect(bender.find()[0]).toMatch(/^\S.* \(\d+ controls\)$/)
})

test('describe lists a control’s choices and suggests keys for a typo', () => {
  expect(bender.describe('chipTone')).toMatchObject({
    key: 'chipTone',
    choices: 'organ 1/2 | reed 1/4 | clav 1/8 | buzz 1/16',
  })
  expect(() => bender.describe('drumLevl')).toThrow(
    'drumLevl: no control has this key; closest keys: drumLevel',
  )
  expect(() => bender.describe('volume')).toThrow(/bender.find\(words\)/)
})

test('tune writes the melody memory and switches the chip to play it', () => {
  const out = bender.tune(['C4 E4 | G4 ~ . C5', 'C3 ~ ~ ~'])
  const c = engine.controls.get()
  expect(c.chipTune).toBe(YOURS)
  expect(c.tuneLen).toBe(6)
  expect(TUNE_LANE_KEYS[0].slice(0, 7).map(k => c[k])).toEqual([
    3,
    7,
    10,
    HOLD,
    REST,
    15,
    REST,
  ])
  expect(out.tune).toEqual(['C4 E4 G4 ~ . C5', 'C3 ~ ~ ~ . .'])
  expect(bender.summary().undo).toBe(1)
})

test('an invalid tune throws and leaves the board unchanged', () => {
  expect(() => bender.tune('C4 H4')).toThrow("lane 1: 'H4' is not a note name")
  expect(() => bender.tune('C9')).toThrow('C9 is outside the range C2 to C#7')
  expect(engine.controls.get().chipTune).toBe(DEFAULT_CONTROLS.chipTune)
})

test('drums writes the named rows and leaves the others unchanged', () => {
  const kick = engine.controls.get().drumKick
  const out = bender.drums({ snare: '....x.......x...', 'open hat': 'x.?.' })
  const c = engine.controls.get()
  expect(c.drumKick).toBe(kick)
  expect(c.drumSnare).toBe(0b0000_1000_0000_1000)
  expect(c.drumOpenLen).toBe(4)
  expect(out.drums['open hat']).toBe('x.?.')
  expect(() => bender.drums({ accent: 'x?' })).toThrow(
    "the accent row accepts only 'x' and '.'",
  )
  expect(() => bender.drums({ cowbell: 'x' })).toThrow(/rows: kick, snare/)
})

test('load finds a preset by name prefix and throws on an unknown name', () => {
  expect(bender.load('dying').loaded).toBe('dying toy')
  expect(bender.board().preset).toBe('dying toy')
  expect(() => bender.load('nope')).toThrow(/bender.presets\(\) lists all/)
})

test('listen before audio starts returns how to start it', async () => {
  expect(await bender.listen(100)).toEqual({
    audio:
      'suspended: click anywhere on the page, then call bender.start() again',
  })
})
