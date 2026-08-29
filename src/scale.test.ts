import { expect, test } from 'vitest'
import { SCALE_NAMES, snap } from './scale'
import { semitoneName } from './notes'

const scale = (name: string) => SCALE_NAMES.indexOf(name)
const C = 0
const A = 9

const MAJOR = scale('major')

test('the lock off hands every semitone straight back', () => {
  for (let s = -24; s <= 24; s++) expect(snap(s, 0, C)).toBe(s)
})

// The one a wrong root offset would get wrong quietly: the chip's zero is A3,
// so C major on this keyboard is the scale that keeps semitone 3.
test('the root is read against the chip’s A, not against a C', () => {
  expect(semitoneName(0)).toBe('A3')
  expect(snap(3, MAJOR, C)).toBe(3)
  expect(snap(4, MAJOR, C)).toBe(3)
  expect(snap(0, MAJOR, A)).toBe(0)
  expect(snap(1, MAJOR, A)).toBe(0)
  // A minor and C major are the same seven notes, reached from either end.
  for (let s = -12; s <= 12; s++)
    expect(snap(s, MAJOR, C)).toBe(snap(s, scale('minor'), A))
})

test('a note already in the scale comes back untouched', () => {
  // C major on the chip's numbering: C is 3 and the rest follow it up.
  for (const s of [3, 5, 7, 8, 10, 12, 14, 15]) {
    expect(snap(s, MAJOR, C)).toBe(s)
    expect(snap(s - 12, MAJOR, C)).toBe(s - 12)
  }
})

test('everything else lands on the scale, within a whole tone of where it was', () => {
  for (let sc = 1; sc < SCALE_NAMES.length; sc++) {
    for (let root = 0; root < 12; root++) {
      for (let s = -30; s <= 30; s++) {
        const out = snap(s, sc, root)
        expect(Math.abs(out - s)).toBeLessThanOrEqual(2)
        expect(snap(out, sc, root)).toBe(out)
      }
    }
  }
})

test('a tie goes to the note underneath, every time', () => {
  expect(snap(4, MAJOR, C)).toBe(3)
  expect(snap(6, MAJOR, C)).toBe(5)
  // Whole tone is nothing but ties: every note outside it is a semitone from
  // both of its neighbours.
  for (let s = -12; s <= 12; s++) {
    const out = snap(s, scale('whole tone'), C)
    expect(out === s || out === s - 1).toBe(true)
  }
})

test('the octave is kept — a snapped note stays where it was played', () => {
  const pent = scale('pent minor')
  for (let s = -36; s <= 36; s++) {
    const out = snap(s, pent, C)
    expect(semitoneName(out).slice(-1)).toBe(semitoneName(s).slice(-1))
  }
})

test('the wider scales snap further, and still snap', () => {
  const blues = scale('blues')
  // The blues scale's own gap: a minor third over the root with nothing in it.
  expect(snap(3, blues, C)).toBe(3)
  expect(snap(4, blues, C)).toBe(3)
  expect(snap(5, blues, C)).toBe(6)
  expect(snap(6, blues, C)).toBe(6)
})
