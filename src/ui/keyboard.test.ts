// The drawn board against the chip's tuning. The two used to disagree by three
// semitones — the pattern was laid out from a C while the chip counts from A3 —
// which nothing could see until a controller played a note and lit a key a minor
// third away from the one under the player's finger.

import { expect, test } from 'vitest'
import { isSharp, semitoneName, toSemitone } from '../notes'
import { blackAbove, OCTAVES, pitch, TOP, WHITE_KEYS } from './keyboard'

test('every white key is a natural and every black key a sharp', () => {
  for (const key of WHITE_KEYS) {
    expect(isSharp(pitch(key, 0))).toBe(false)
    const black = blackAbove(key)
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
  expect(blackAbove(key!)).toBeDefined() // C has a C# over it
})

test('the octave switch moves the board by whole octaves', () => {
  for (const octave of OCTAVES)
    expect(semitoneName(pitch(0, octave * 12))).toBe(`C${3 + octave}`)
})
