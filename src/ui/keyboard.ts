// The shape of the drawn keyboard, and — the part that has to agree with the
// chip — which note each key plays.
//
// A key's index is semitones above the board's bottom C, so the white/black
// pattern below can be written the way everyone reads a keyboard, from a C. The
// chip counts from A3 instead, so the two only line up through `pitch`: get that
// wrong and the board still looks like a keyboard while naming every key a minor
// third off, which is invisible until something outside the app — a controller —
// plays a note and lights the wrong key.

import { toSemitone } from '../notes'

// Three octaves on the board. The chip's divider reaches either side of them, so
// the octave switch moves the whole keyboard rather than scrolling it: what is
// drawn is where your hands are, not everything the chip can strike.
export const OCTAVES_DRAWN = 3
export const TOP = OCTAVES_DRAWN * 12

// The board opens on C3 and closes on C6, so middle C sits an octave in — where
// a keybed's own middle C lands, and with room under it for the bass end a
// controller spends most of its keys on.
const BOTTOM = toSemitone(48)

export const OCTAVES = [-2, -1, 0, 1, 2]

/** What a key plays, in the chip's semitones, with the octave switch at `shift`. */
export const pitch = (key: number, shift: number) => key + BOTTOM + shift

const WHITE_PC = [0, 2, 4, 5, 7, 9, 11]
// The pitch classes with a black key above them. Where there is none, two whites
// sit side by side — the pattern that makes a keyboard readable at a glance, and
// the reason the board closes on a tonic with nothing over it.
const BLACK_PC = new Set([0, 2, 5, 7, 9])

export const WHITE_KEYS = [
  ...Array.from({ length: OCTAVES_DRAWN }, (_, o) =>
    WHITE_PC.map(pc => pc + 12 * o),
  ).flat(),
  TOP,
]

export const blackAbove = (key: number) =>
  key < TOP && BLACK_PC.has(key % 12) ? key + 1 : undefined
