// What a semitone is, everywhere above the DSP. The chip counts semitones from
// its own zero rather than from MIDI's, and every place the two meet — the wire,
// the drawn keyboard, a readout — got the conversion right on its own or, in one
// case, didn't. One place to be right.

// The chip's zero note is A3, 220 Hz: the pitch its ROM steps count up from, and
// MIDI 57. Middle C is three semitones above it, which is why a controller's C
// arrives here as 3 rather than 0.
export const A3 = 57

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

/** A MIDI note number as a name — 60 is C4. */
export const noteName = (midi: number) =>
  `${NAMES[((midi % 12) + 12) % 12] ?? '?'}${Math.floor(midi / 12) - 1}`

/** A MIDI note number as one of the chip's semitones. */
export const toSemitone = (midi: number) => midi - A3

/** One of the chip's semitones as a note name — 0 is A3. */
export const semitoneName = (semitone: number) => noteName(semitone + A3)

/** True for the semitones a keyboard draws black. */
export const isSharp = (semitone: number) =>
  semitoneName(semitone).includes('#')
