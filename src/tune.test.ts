import { expect, test } from 'vitest'
import {
  asTuneLen,
  asTuneStep,
  decodeTune,
  encodeTune,
  foldNote,
  HOLD,
  isNote,
  keyOf,
  NOTE_HI,
  NOTE_LO,
  REST,
  TUNE_STEPS,
  TUNE_STEP_KEYS,
  voicing,
} from './tune'
import { DEFAULT_CONTROLS } from './controls'

test('the memory has a control per step, and they start empty', () => {
  expect(TUNE_STEP_KEYS).toHaveLength(TUNE_STEPS)
  for (const key of TUNE_STEP_KEYS) expect(DEFAULT_CONTROLS[key]).toBe(REST)
})

// Six wires file sixty-two notes and the octave switch reaches past that, so a
// note the memory has no room for comes back as the same note an octave nearer
// rather than as the wrong note or as no note.
test('a note past what six wires hold folds to the same note', () => {
  expect(foldNote(0)).toBe(0)
  expect(foldNote(NOTE_LO)).toBe(NOTE_LO)
  expect(foldNote(NOTE_HI)).toBe(NOTE_HI)

  for (const note of [-45, -33, -22, 41, 51, 64]) {
    const folded = foldNote(note)
    expect(folded).toBeGreaterThanOrEqual(NOTE_LO)
    expect(folded).toBeLessThanOrEqual(NOTE_HI)
    expect(((folded - note) % 12) + 12).toBe(12)
  }
})

test('the two things that are not notes survive the trip and the bus', () => {
  expect(isNote(REST)).toBe(false)
  expect(isNote(HOLD)).toBe(false)
  expect(isNote(0)).toBe(true)
  expect(isNote(NOTE_LO)).toBe(true)

  expect(asTuneStep(REST)).toBe(REST)
  expect(asTuneStep(HOLD)).toBe(HOLD)
  expect(asTuneStep(3.4)).toBe(3)

  for (const step of [REST, HOLD, NOTE_LO, -9, 0, 27, NOTE_HI])
    expect(decodeTune(encodeTune(step))).toBe(step)
})

// Every word the bus can hand back has to mean something: a knife on a data
// line turns one word into another, and a code the memory could not read would
// be a note that vanishes rather than a note that comes out wrong.
test('every word a cut bus can produce reads back as a step', () => {
  for (let word = 0; word < 64; word++) {
    const step = decodeTune(word)
    expect(step === REST || step === HOLD || isNote(step)).toBe(true)
    if (isNote(step)) {
      expect(step).toBeGreaterThanOrEqual(NOTE_LO)
      expect(step).toBeLessThanOrEqual(NOTE_HI)
    }
  }
})

test('a length is a whole number of the steps there are', () => {
  expect(asTuneLen(0)).toBe(1)
  expect(asTuneLen(7.4)).toBe(7)
  expect(asTuneLen(99)).toBe(TUNE_STEPS)
})

// A hold carries the note before it, which is what makes a bar across four
// steps one long note rather than four.
test('holds carry the note they follow', () => {
  const bars = voicing([5, HOLD, HOLD, REST, 9, HOLD])
  expect(bars.map(b => b.note)).toEqual([5, 5, 5, REST, 9, 9])
  expect(bars.map(b => b.head)).toEqual([
    true,
    false,
    false,
    false,
    true,
    false,
  ])
})

// The step before the first one is the last one, because the counter comes
// round — so a memory that opens on a hold is a note wrapping past the end
// rather than a hold with nothing to hold.
test('a hold at the top carries the last note in the memory', () => {
  expect(voicing([HOLD, HOLD, 12]).map(b => b.note)).toEqual([12, 12, 12])
  expect(voicing([HOLD, REST]).map(b => b.note)).toEqual([REST, REST])
})

// The accompaniment has no chord buttons — it reads the melody — so all it
// needs is where the three triads sit, and a tune you played in says that
// nowhere. The lowest note is the toy's answer.
test('the key of a melody is read off its lowest note', () => {
  expect(keyOf([REST, REST])).toEqual({ key: 0, minor: false })
  // A major on A: tonic, third, fifth.
  expect(keyOf([0, 4, 7, HOLD])).toEqual({ key: 0, minor: false })
  // The same shape with a flat third is minor, and a C is three above A.
  expect(keyOf([3, 6, 10])).toEqual({ key: 3, minor: true })
  // A third of neither kind decides nothing, so it stays major.
  expect(keyOf([5, 12])).toEqual({ key: 5, minor: false })
})
