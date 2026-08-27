import { expect, test } from 'vitest'
import { DEFAULT_CONTROLS, type Controls } from '../controls'
import { sliderFor } from './controls'
import {
  boardFrom,
  boardFromUrl,
  boardHash,
  decodeControls,
  encodeControls,
} from './share'

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
  expect({
    ...DEFAULT_CONTROLS,
    ...decodeControls(encodeControls(board)),
  }).toEqual(board)
})

test('only what is off stock travels', () => {
  expect(encodeControls({ ...DEFAULT_CONTROLS })).toBe('')
  expect(encodeControls({ ...DEFAULT_CONTROLS, dlyFb: 1.4 })).toBe('dlyFb:1.4')
})

test('the pad your finger is on is not part of the board', () => {
  expect(encodeControls({ ...DEFAULT_CONTROLS, bodyX: 0.7, bodyY: 0.3 })).toBe(
    '',
  )
  expect(decodeControls('bodyX:0.7')).toEqual({})
})

test('a link from another version drops what it no longer names', () => {
  expect(decodeControls('filtRes:1.2,retiredKnob:3,filtHz:900')).toEqual({
    filtRes: 1.2,
    filtHz: 900,
  })
})

test('a name Object lends every object is not a control', () => {
  // `in` says yes to all of these, and each one used to reach a slider lookup
  // that throws — which on a load is the whole app rather than one bad name.
  expect(decodeControls('toString:1,constructor:2,__proto__:3')).toEqual({})
  expect(boardFromUrl('', '#set=toString:1')).toBeNull()
  expect(boardFromUrl('', '#set=toString:1,dlyFb:1.4')).toEqual({ dlyFb: 1.4 })
})

test('a link is a whole board, so what it leaves out is back at stock', () => {
  const on: Controls = { ...DEFAULT_CONTROLS, dlyFb: 1.4, filtRes: 1.2 }
  const arriving = boardFromUrl('', '#set=combFb:0.9') ?? {}
  expect(boardFrom(arriving, on)).toEqual({
    ...DEFAULT_CONTROLS,
    combFb: 0.9,
  })
})

test('the pad your finger is on survives a link arriving', () => {
  const held: Controls = { ...DEFAULT_CONTROLS, bodyX: 0.7, bodyY: 0.3 }
  expect(boardFrom({ combFb: 0.9 }, held)).toEqual({
    ...DEFAULT_CONTROLS,
    combFb: 0.9,
    bodyX: 0.7,
    bodyY: 0.3,
  })
})

test('values outside the panel are pulled back onto it', () => {
  const wild = decodeControls('dlyFb:99,filtRes:-5,chipTune:1e9')
  expect(wild.dlyFb).toBe(sliderFor('dlyFb').max)
  expect(wild.filtRes).toBe(sliderFor('filtRes').min)
  expect(wild.chipTune).toBe(sliderFor('chipTune').max)
})

test('the drum pattern travels with the board', () => {
  const board: Controls = {
    ...DEFAULT_CONTROLS,
    drumClap: 0b0000_1000_0000_1000,
    drumBell: 0b1001_0010_0010_1000,
  }
  const back = decodeControls(encodeControls(board))
  expect(back.drumClap).toBe(board.drumClap)
  expect(back.drumBell).toBe(board.drumBell)
  // sixteen bits is all a step mask can be, whatever the link says
  expect(decodeControls('drumKick:1e9,drumTom:-4')).toEqual({
    drumKick: 65535,
    drumTom: 0,
  })
})

test('junk decodes to nothing rather than to NaN', () => {
  expect(decodeControls('')).toEqual({})
  expect(decodeControls('nonsense')).toEqual({})
  expect(decodeControls('dlyFb:abc,:5,filtRes:')).toEqual({})
})

test('the hash carries the board and leaves the rest of the hash alone', () => {
  const h = boardHash('#debug=1&set=', { ...DEFAULT_CONTROLS, dlyFb: 1.4 })
  expect(new URLSearchParams(h).get('set')).toBe('dlyFb:1.4')
  expect(new URLSearchParams(h).get('debug')).toBe('1')
})

test('a stock board drops the param rather than writing an empty one', () => {
  expect(boardHash('', { ...DEFAULT_CONTROLS })).toBe('')
  expect(
    boardHash(`#${boardHash('', { ...DEFAULT_CONTROLS, dlyFb: 1.4 })}`, {
      ...DEFAULT_CONTROLS,
    }),
  ).toBe('')
})

test('the separators stay one character each in the bar', () => {
  const h = boardHash('#set=', {
    ...DEFAULT_CONTROLS,
    dlyFb: 1.4,
    filtRes: 1.2,
  })
  expect(h).toBe('set=filtRes:1.2,dlyFb:1.4')
  expect(boardFromUrl('', `#${h}`)).toEqual({ filtRes: 1.2, dlyFb: 1.4 })
  // and an escaped link from before still reads
  expect(boardFromUrl('', '#set=filtRes%3A1.2%2CdlyFb%3A1.4')).toEqual({
    filtRes: 1.2,
    dlyFb: 1.4,
  })
})

test('writing a board clears the name it rode under before', () => {
  const h = boardHash('#b=filtRes:1.2', { ...DEFAULT_CONTROLS, dlyFb: 1.4 })
  expect(new URLSearchParams(h).get('b')).toBeNull()
  expect(new URLSearchParams(h).get('set')).toBe('dlyFb:1.4')
})

test('a link opens the board it names, from the hash or an older url', () => {
  expect(boardFromUrl('', '#set=filtRes:1.2')).toEqual({ filtRes: 1.2 })
  expect(boardFromUrl('', '#b=filtRes:1.2')).toEqual({ filtRes: 1.2 })
  expect(boardFromUrl('?set=filtRes:1.2', '')).toEqual({ filtRes: 1.2 })
  expect(boardFromUrl('?set=dlyFb:1.4', '#set=filtRes:1.2')).toEqual({
    filtRes: 1.2,
  })
  expect(boardFromUrl('', '#set=filtRes:1.2&b=dlyFb:1.4')).toEqual({
    filtRes: 1.2,
  })
})

test('a url naming no board is nothing to patch', () => {
  expect(boardFromUrl('', '')).toBeNull()
  expect(boardFromUrl('', '#set=')).toBeNull()
  expect(boardFromUrl('', '#p=')).toBeNull()
  expect(boardFromUrl('', '#set=retiredKnob:3')).toBeNull()
  expect(boardFromUrl('', '#somethingelse')).toBeNull()
  expect(boardFromUrl('?set=', '')).toBeNull()
})

const BOARD: Controls = {
  ...DEFAULT_CONTROLS,
  chipStarve: 0.85,
  filtRes: 1.15,
  bendSlot0: 7,
  shiftHz: 380,
  mod0Depth: -0.6,
  drumClap: 0b0000_1000_0000_1000,
  tuneStep3: 12,
  tuneLen: 9,
  drumHatLen: 12,
}

test('a bar with nothing on it writes the short form', () => {
  const h = boardHash('', BOARD)
  expect(h.startsWith('p=')).toBe(true)
  expect(boardFrom(boardFromUrl('', `#${h}`) ?? {}, BOARD)).toEqual(BOARD)
})

test('the short form is worth the trouble', () => {
  // The point of the whole exercise, pinned so it cannot quietly stop being
  // true: this board is 92 characters by name and 26 as bytes.
  expect(boardHash('', BOARD).length * 3).toBeLessThan(
    boardHash('#set=', BOARD).length,
  )
})

test('a bar already in the long form keeps writing it', () => {
  // Which is what makes the address bar programmable: type a board by hand and
  // it stays typed by hand, rather than turning to bytes under the cursor on
  // the next control you move.
  const typed = '#set=chipStarve:0.8'
  const h = boardHash(typed, boardFrom(boardFromUrl('', typed) ?? {}, BOARD))
  expect(h).toBe('set=chipStarve:0.8')
  expect(boardHash(`#${h}`, BOARD).startsWith('set=')).toBe(true)
  // an empty `set=` is the marker on its own, so typing it into a bare bar is
  // enough to switch a stock board over
  expect(boardHash('#set=', { ...DEFAULT_CONTROLS })).toBe('set=')
})

test('the two forms carry the same board', () => {
  const long = boardFromUrl('', `#${boardHash('#set=', BOARD)}`)
  const short = boardFromUrl('', `#${boardHash('', BOARD)}`)
  expect(short).toEqual(long)
})

test('the form a board is written in replaces the other one', () => {
  expect(boardHash('#p=jAF4', BOARD)).not.toContain('set=')
  expect(boardHash('#set=dlyFb:1.4&p=jAF4', BOARD)).not.toContain('p=')
})

test('a hash carrying both forms reads as the one it will keep writing', () => {
  const both = '#set=filtRes:1.2&p=jAF4'
  expect(boardFromUrl('', both)).toEqual({ filtRes: 1.2 })
  expect(boardHash(both, BOARD).startsWith('set=')).toBe(true)
})

test('a short link beats a board left in an older query', () => {
  const h = boardHash('', { ...DEFAULT_CONTROLS, filtRes: 1.2 })
  expect(boardFromUrl('?set=dlyFb:1.4', `#${h}`)).toEqual({ filtRes: 1.2 })
})
