// The drawn board against the chip's tuning. The two used to disagree by three
// semitones — the pattern was laid out from a C while the chip counts from A3 —
// which nothing could see until a controller played a note and lit a key a minor
// third away from the one under the player's finger.

import { expect, test } from 'vitest'
import { isSharp, semitoneName, toSemitone } from '../notes'
import {
  blackAbove,
  MIN_KEY,
  OCTAVES,
  OCTAVES_DRAWN,
  octavesFor,
  pitch,
  topKey,
  whiteKeys,
} from './keyboard'

const TOP = topKey(OCTAVES_DRAWN)
const WHITE_KEYS = whiteKeys(OCTAVES_DRAWN)

test('every white key is a natural and every black key a sharp', () => {
  for (const key of WHITE_KEYS) {
    expect(isSharp(pitch(key, 0))).toBe(false)
    const black = blackAbove(key, TOP)
    if (black !== undefined) expect(isSharp(pitch(black, 0))).toBe(true)
  }
})

test('the board opens on a C and closes on the C three octaves up', () => {
  expect(semitoneName(pitch(0, 0))).toBe('C3')
  expect(semitoneName(pitch(TOP, 0))).toBe('C6')
})

test("a controller's middle C lights the middle C on the screen", () => {
  const struck = toSemitone(60)
  const key = WHITE_KEYS.find(k => pitch(k, 0) === struck)
  expect(key).toBeDefined()
  expect(semitoneName(pitch(key!, 0))).toBe('C4')
  expect(blackAbove(key!, TOP)).toBeDefined() // C has a C# over it
})

test('the octave switch moves the board by whole octaves', () => {
  for (const octave of OCTAVES)
    expect(semitoneName(pitch(0, octave * 12))).toBe(`C${3 + octave}`)
})

// A short board is the same board with fewer octaves on it: it still opens on a
// C, still closes on one, and the key under a finger still plays what the key in
// the same place on the long board played.
test('a shortened board is still whole octaves of the same keyboard', () => {
  for (const octaves of [1, 2, OCTAVES_DRAWN]) {
    const keys = whiteKeys(octaves)
    expect(keys.length).toBe(octaves * 7 + 1)
    expect(semitoneName(pitch(keys[0]!, 0))).toBe('C3')
    expect(semitoneName(pitch(topKey(octaves), 0))).toBe(`C${3 + octaves}`)
    expect(keys.every(k => WHITE_KEYS.includes(k))).toBe(true)
    expect(blackAbove(topKey(octaves), topKey(octaves))).toBeUndefined()
  }
})

// What the case can hold, at a key wide enough to hit. Three octaves is
// twenty-two white keys, so the phone that would draw them thirteen pixels wide
// gets one octave of key it can play instead.
test('a narrower case draws less of the keyboard', () => {
  expect(octavesFor(820, MIN_KEY.fine)).toBe(3)
  expect(octavesFor(440, MIN_KEY.fine)).toBe(2)
  expect(octavesFor(320, MIN_KEY.fine)).toBe(1)
})

// The same case, under a finger. A key a mouse hits every time is one a thumb
// lands beside, so the widths that hold three octaves for a pointer hold two
// for a touchscreen — and whichever it is, no key comes out narrower than the
// thing pressing it needs.
test('a finger is given fewer keys than a pointer in the same case', () => {
  expect(octavesFor(600, MIN_KEY.coarse)).toBeLessThan(
    octavesFor(600, MIN_KEY.fine),
  )
  for (const minKey of [MIN_KEY.fine, MIN_KEY.coarse])
    for (const width of [280, 360, 480, 600, 700, 820, 1200]) {
      const keys = whiteKeys(octavesFor(width, minKey))
      const fits = width / keys.length >= minKey
      expect(fits || keys.length === whiteKeys(1).length).toBe(true)
    }
})
