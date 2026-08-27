import { expect, test } from 'vitest'
import {
  CONTROL_KEYS,
  DEFAULT_CONTROLS,
  type ControlKey,
  type Controls,
} from '../controls'
import { EDITOR_KEYS, SLIDER_BY_KEY } from './controls'
import { LEN_KEYS } from '../drums'
import { TUNE_STEP_KEYS } from '../tune'
import { applyPreset } from './presets/apply'
import { randomLook } from './presets/roll'
import { PRESETS } from './presets/table'
import { encodeControls } from './share'
import { packControls, unpackControls, URL_KEY_ORDER } from './packed'

const nothing = () => false
const stock = (): Controls => ({ ...DEFAULT_CONTROLS })
const round = (c: Controls) => ({
  ...DEFAULT_CONTROLS,
  ...unpackControls(packControls(c, nothing), nothing),
})

test('the wire order names every control and no other', () => {
  // Append here when a control is added — never insert and never reorder, or
  // every link ever made decodes to a different board. This is the check that
  // makes the rule the build's rather than someone's memory.
  expect([...URL_KEY_ORDER].sort()).toEqual([...CONTROL_KEYS].sort())
  expect(new Set(URL_KEY_ORDER).size).toBe(URL_KEY_ORDER.length)
})

test('every control has a shape the wire knows how to carry', () => {
  const tune = new Set<ControlKey>(TUNE_STEP_KEYS)
  const unknown = CONTROL_KEYS.filter(
    k =>
      !SLIDER_BY_KEY.has(k) &&
      !EDITOR_KEYS.has(k) &&
      !LEN_KEYS.has(k) &&
      !tune.has(k) &&
      k !== 'tuneLen',
  )
  expect(unknown).toEqual([])
})

test('a board survives the round trip', () => {
  const board: Controls = {
    ...stock(),
    chipStarve: 0.85,
    filtRes: 1.15,
    bendSlot0: 7,
    shiftHz: 380,
    mod0Src: 8,
    mod0Dest: 9,
    mod0Depth: -0.6,
  }
  expect(round(board)).toEqual(board)
})

test('every preset survives the round trip exactly', () => {
  for (const preset of PRESETS) {
    const board = applyPreset(preset, stock())
    expect({ preset: preset.name, board: round(board) }).toEqual({
      preset: preset.name,
      board,
    })
  }
})

test('a rolled board survives the round trip exactly', () => {
  let seed = 12345
  const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32
  for (let i = 0; i < 20; i++) {
    const board = randomLook(stock(), rand)
    expect({ roll: i, board: round(board) }).toEqual({ roll: i, board })
  }
})

test('the melody and the kit travel with the board', () => {
  const board: Controls = {
    ...stock(),
    drumClap: 0b0000_1000_0000_1000,
    drumBell: 0b1001_0010_0010_1000,
    drumHatLen: 12,
    tuneStep0: 0,
    tuneStep1: -127,
    tuneStep2: 24,
    tuneStep15: -128,
    tuneLen: 9,
  }
  expect(round(board)).toEqual(board)
})

test('only what is off stock travels', () => {
  expect(packControls(stock(), nothing)).toBe('')
  expect(unpackControls('', nothing)).toEqual({})
})

test('what the caller skips never reaches the wire', () => {
  const held: Controls = { ...stock(), bodyX: 0.7, dlyFb: 1.4 }
  const skip = (k: ControlKey) => k === 'bodyX'
  expect(unpackControls(packControls(held, skip), skip)).toEqual({ dlyFb: 1.4 })
})

test('a control this build has never heard of is read past', () => {
  // What a link from a newer app looks like here. The order only ever grows at
  // the end, so a control this build has never heard of is the last one on the
  // wire — and because every field is a varint the reader steps over it and
  // keeps the rest, rather than the link opening as the empty board.
  const board: Controls = { ...stock(), dlyFb: 1.4, filtRes: 1.15 }
  const at = (key: ControlKey) => URL_KEY_ORDER.indexOf(key)
  const bytes: number[] = []
  let prev = -1
  for (const key of (['dlyFb', 'filtRes'] as ControlKey[]).sort(
    (a, b) => at(a) - at(b),
  )) {
    const def = SLIDER_BY_KEY.get(key)
    bytes.push(
      at(key) - prev - 1,
      Math.round((board[key] - def!.min) / def!.step),
    )
    prev = at(key)
  }
  // the forged wire is the encoder's, or the rest of this proves nothing
  expect(bytesToText(bytes)).toBe(packControls(board, nothing))
  bytes.push(URL_KEY_ORDER.length - prev + 3, 9)
  expect(unpackControls(bytesToText(bytes), nothing)).toEqual({
    dlyFb: 1.4,
    filtRes: 1.15,
  })
})

test('junk decodes to nothing rather than to a board', () => {
  expect(unpackControls('!!!!', nothing)).toEqual({})
  expect(unpackControls('....', nothing)).toEqual({})
  // a varint whose last byte never arrives stops the read where it is
  expect(unpackControls('gA', nothing)).toEqual({})
})

test('a link that lost its tail is still most of a board', () => {
  const board: Controls = {
    ...stock(),
    chipStarve: 0.85,
    filtRes: 1.15,
    shiftHz: 380,
    dlyFb: 1.4,
  }
  const full = packControls(board, nothing)
  const cut = unpackControls(full.slice(0, 4), nothing)
  expect(Object.keys(cut).length).toBeGreaterThan(0)
  for (const [key, v] of Object.entries(cut))
    expect(v).toBe(board[key as ControlKey])
})

test('padding a link the way an encoder would does not change it', () => {
  const board: Controls = { ...stock(), dlyFb: 1.4, filtRes: 1.15 }
  const packed = packControls(board, nothing)
  const plain = packed.replace(/-/g, '+').replace(/_/g, '/')
  expect(unpackControls(`${packed}==`, nothing)).toEqual(
    unpackControls(packed, nothing),
  )
  expect(unpackControls(plain, nothing)).toEqual(
    unpackControls(packed, nothing),
  )
})

test('a link only carries characters a fragment carries as themselves', () => {
  let seed = 999
  const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32
  for (let i = 0; i < 20; i++) {
    const packed = packControls(randomLook(stock(), rand), nothing)
    expect(packed).toMatch(/^[A-Za-z0-9\-_]*$/)
    expect(encodeURIComponent(packed)).toBe(packed)
  }
})

test('the short form is several times shorter than the long one', () => {
  let seed = 4242
  const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32
  for (let i = 0; i < 20; i++) {
    const board = randomLook(stock(), rand)
    expect(packControls(board, nothing).length * 3).toBeLessThan(
      encodeControls(board).length,
    )
  }
})

// The alphabet the codec writes, so a test can forge a link byte by byte.
function bytesToText(bytes: number[]): string {
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
  const varint: number[] = []
  for (let n of bytes) {
    while (n > 0x7f) {
      varint.push((n & 0x7f) | 0x80)
      n >>>= 7
    }
    varint.push(n)
  }
  let out = ''
  for (let i = 0; i < varint.length; i += 3) {
    const n =
      ((varint[i] ?? 0) << 16) |
      ((varint[i + 1] ?? 0) << 8) |
      (varint[i + 2] ?? 0)
    const left = varint.length - i
    out += (B64[(n >> 18) & 63] ?? '') + (B64[(n >> 12) & 63] ?? '')
    if (left > 1) out += B64[(n >> 6) & 63] ?? ''
    if (left > 2) out += B64[n & 63] ?? ''
  }
  return out
}
