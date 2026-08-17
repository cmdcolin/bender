import { expect, test } from 'vitest'
import { DEFAULT_CONTROLS, type Controls } from '../controls'
import { sliderFor } from './controls'
import { decodeControls, encodeControls } from './share'

test('a board survives the round trip', () => {
  const board: Controls = {
    ...DEFAULT_CONTROLS,
    chipStarve: 0.85,
    filtRes: 1.15,
    bendSlot0: 7,
    shiftHz: 380,
    mod0Src: 8,
    mod0Dest: 9,
    mod0Depth: -0.6,
  }
  expect({ ...DEFAULT_CONTROLS, ...decodeControls(encodeControls(board)) }).toEqual(board)
})

test('only what is off stock travels', () => {
  expect(encodeControls({ ...DEFAULT_CONTROLS })).toBe('')
  expect(encodeControls({ ...DEFAULT_CONTROLS, dlyFb: 1.4 })).toBe('dlyFb:1.4')
})

test('the pad your finger is on is not part of the board', () => {
  expect(encodeControls({ ...DEFAULT_CONTROLS, bodyX: 0.7, bodyY: 0.3 })).toBe('')
  expect(decodeControls('bodyX:0.7')).toEqual({})
})

test('a link from another version drops what it no longer names', () => {
  expect(decodeControls('filtRes:1.2,retiredKnob:3,filtHz:900')).toEqual({
    filtRes: 1.2,
    filtHz: 900,
  })
})

test('values outside the panel are pulled back onto it', () => {
  const wild = decodeControls('dlyFb:99,filtRes:-5,chipTune:1e9')
  expect(wild.dlyFb).toBe(sliderFor('dlyFb').max)
  expect(wild.filtRes).toBe(sliderFor('filtRes').min)
  expect(wild.chipTune).toBe(sliderFor('chipTune').max)
})

test('junk decodes to nothing rather than to NaN', () => {
  expect(decodeControls('')).toEqual({})
  expect(decodeControls('nonsense')).toEqual({})
  expect(decodeControls('dlyFb:abc,:5,filtRes:')).toEqual({})
})
