import { expect, test } from 'vitest'
import {
  CONTROL_KEYS,
  DEFAULT_CONTROLS,
  type ControlKey,
  type Controls,
} from '../controls'
import { ALL_SLIDERS, EDITOR_KEYS, SLIDER_BY_KEY, sliderFor } from './controls'
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

const live = (key: string) => key.replace(/^gone:/, '')

test('the wire order names every control the app has', () => {
  const here = URL_KEY_ORDER.filter(k => !k.startsWith('gone:'))
  expect([...here].sort()).toEqual([...CONTROL_KEYS].sort())
  expect(new Set(URL_KEY_ORDER.map(live)).size).toBe(URL_KEY_ORDER.length)
})

// What the wire order said, each time it grew. Every link ever made is written
// against those positions, so the shape of this list is the point: a line is
// written once and never edited again. Appending controls adds a line and
// leaves every earlier one passing, which is what an append means. Inserting,
// reordering or deleting a name breaks the lines that already cover that stretch
// — and the only way to make them green again is to delete them, which is a
// visible thing to do to a file that says not to.
//
// Retiring a control is the exception the digest is blind to on purpose:
// `noiseColor` becoming `gone:noiseColor` holds the slot rather than closing it,
// which is the whole reason for writing it that way instead of dropping the
// line.
const PINNED_ORDER = [
  // v0.10.1, when a packed link stopped counting from the bottom of a travel
  { keys: 261, digest: '3af9e04e' },
  // the stacked memory chips and the switch that reads them
  { keys: 326, digest: '2e0026f0' },
]

const digest = (keys: readonly string[]) => {
  let h = 0x811c9dc5
  for (const ch of keys.join(','))
    h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193)
  return (h >>> 0).toString(16).padStart(8, '0')
}

test('the wire order is the one every link ever made was written against', () => {
  const now = URL_KEY_ORDER.map(live)
  expect(
    PINNED_ORDER.map(p => ({
      keys: p.keys,
      digest: digest(now.slice(0, p.keys)),
    })),
  ).toEqual(PINNED_ORDER)
  expect(now.length).toBeGreaterThanOrEqual(PINNED_ORDER.at(-1)!.keys)
})

// A packed link carries a number of steps and nothing else, so the grid it is
// counted on has to be the same grid a year from now. Counting from zero is
// what makes a widened travel mean more reach rather than a shifted board — and
// it is exact only while a travel starts a whole number of steps from zero.
test('every travel starts a whole number of its own steps from zero', () => {
  const off = ALL_SLIDERS.filter(
    s => Math.abs(s.min / s.step - Math.round(s.min / s.step)) > 1e-9,
  )
  expect(
    off.map(s => `${s.key}: min ${s.min} is not a whole ${s.step}`),
  ).toEqual([])
})

// A board fixed in physical units against the bytes it packs to, both ways, so
// that any change to the wire — the order, the zero, the alphabet, the varints
// — has to come past a link that already exists. Regenerating these to make a
// failure go away is regenerating every link anyone has ever shared.
const GOLDEN_BOARD: Partial<Controls> = {
  chipStarve: 0.8,
  drumTune: 0.75,
  drumKick: 0b1000_0000_1000_1000,
  drumHatLen: 12,
  tuneStep0: 24,
  tuneStep1: -12,
  tuneStep2: -127,
  tuneLen: 9,
  filtHz: 180,
  mod0Depth: -0.6,
}
const GOLDEN_LINK = 'BaABGDAAFwD9AQ0SBKwCDpCCBAgYP-gCMnc'

test('a link made the day the format was pinned still opens its own board', () => {
  const board: Controls = { ...stock(), ...GOLDEN_BOARD }
  expect(packControls(board, nothing)).toBe(GOLDEN_LINK)
  expect(unpackControls(GOLDEN_LINK, nothing)).toEqual(GOLDEN_BOARD)
})

// The failure this format is built against: someone widens a travel, and every
// link ever made for that control slides by however far the floor moved. The
// wire number is the value over the step, so the floor is not in it.
test('widening a travel leaves the links already made where they were', () => {
  const board: Controls = { ...stock(), ...GOLDEN_BOARD }
  const packed = packControls(board, nothing)
  const widened = [
    { def: sliderFor('filtHz'), min: 10 },
    { def: sliderFor('drumTune'), min: 0.05 },
    { def: sliderFor('mod0Depth'), min: -2 },
  ]
  const was = widened.map(w => w.def.min)
  try {
    for (const w of widened) w.def.min = w.min
    expect(packControls(board, nothing)).toBe(packed)
    expect(unpackControls(packed, nothing)).toEqual(GOLDEN_BOARD)
  } finally {
    widened.forEach((w, i) => (w.def.min = was[i]!))
  }
})

test('a retired control holds its slot rather than renumbering the rest', () => {
  // The app drops drumTune, so its name is rewritten in place. Every control
  // below it keeps the wire number it had, an old link still opens as the rest
  // of the board it named, and the value it carries for the retired one is read
  // past rather than ending the read.
  const order = URL_KEY_ORDER as (ControlKey | `gone:${string}`)[]
  const at = order.indexOf('drumTune')
  const packed = packControls({ ...stock(), ...GOLDEN_BOARD }, nothing)
  try {
    order[at] = 'gone:drumTune'
    expect(unpackControls(packed, nothing)).toEqual(
      Object.fromEntries(
        Object.entries(GOLDEN_BOARD).filter(([k]) => k !== 'drumTune'),
      ),
    )
  } finally {
    order[at] = 'drumTune'
  }
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
    const n = Math.round(board[key] / def!.step)
    bytes.push(at(key) - prev - 1, n < 0 ? -2 * n - 1 : 2 * n)
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
