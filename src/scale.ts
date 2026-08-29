// The key line, everywhere above the DSP. A board this random only stays
// musical if the notes it throws land somewhere, so one table of scales and one
// function that pulls a semitone onto the nearest of them — shared, because the
// panel has to light the key that sounds and the audio thread has to strike it,
// and the two arriving at different answers is a keyboard that lies.
import { A3 } from './notes'

export const SCALE_NAMES = [
  'off',
  'major',
  'minor',
  'dorian',
  'mixolydian',
  'pent major',
  'pent minor',
  'blues',
  'whole tone',
]

// Semitones above the root, one row per name above. Off is the empty row: no
// note to be nearest to, so nothing moves.
const STEPS: readonly (readonly number[])[] = [
  [],
  [0, 2, 4, 5, 7, 9, 11],
  [0, 2, 3, 5, 7, 8, 10],
  [0, 2, 3, 5, 7, 9, 10],
  [0, 2, 4, 5, 7, 9, 10],
  [0, 2, 4, 7, 9],
  [0, 3, 5, 7, 10],
  [0, 3, 5, 6, 7, 10],
  [0, 2, 4, 6, 8, 10],
]

const MASKS = STEPS.map(steps => steps.reduce((m, s) => m | (1 << s), 0))

// The chip counts its semitones from A3, so a semitone's pitch class is nine
// above its number and a root of C — 0 on the switch — is three semitones up
// the chip's own scale rather than none.
const A_CLASS = A3 % 12

const mod12 = (n: number) => ((n % 12) + 12) % 12

/** A semitone pulled onto the nearest note of the scale, or handed straight
    back when the lock is off. Off is scale 0, which is what every board that
    predates the switch has, so nothing that was written before it moves. */
export const snap = (semitone: number, scale: number, root: number) => {
  const mask = MASKS[Math.round(scale)] ?? 0
  if (mask === 0) return semitone
  const degree = mod12(semitone + A_CLASS - Math.round(root))
  // Outward from where the note is, so what comes back is the same note in the
  // same octave wherever it can be — a scale lock that transposed by an octave
  // would be a bend of its own. A tie goes to the note underneath: half the
  // steps of a seven-note scale are a semitone from a neighbour on both sides,
  // and a run up the black keys has to pick one of them and keep picking it.
  for (let d = 0; d <= 6; d++) {
    if ((mask >> mod12(degree - d)) & 1) return semitone - d
    if ((mask >> mod12(degree + d)) & 1) return semitone + d
  }
  return semitone
}
