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

// Three octaves on the board, where there is room for three. The chip's divider
// reaches either side of them, so the octave switch moves the whole keyboard
// rather than scrolling it: what is drawn is where your hands are, not
// everything the chip can strike.
export const OCTAVES_DRAWN = 3

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

const whiteCount = (octaves: number) => octaves * 7 + 1

// The narrowest a white key can be and still be a key rather than a stripe. The
// two numbers are not the same kind of number, and it is worth saying which is
// which: 34 is a fingertip, which is a measurement — a third of an inch of glass
// lands on one key or on two. 22 is a judgement, and the case that set it is the
// FM chip's own 380px board, which is not narrow because a window is narrow. A
// pointer lands where it was aimed, so under a mouse the floor is about reading
// the board rather than hitting it.
export const MIN_KEY = { fine: 22, coarse: 34 }

/** How much of the board a case this wide can draw and still be playable. */
export const octavesFor = (width: number, minKey: number) =>
  width >= whiteCount(OCTAVES_DRAWN) * minKey
    ? OCTAVES_DRAWN
    : width >= whiteCount(2) * minKey
      ? 2
      : 1

/** The top key of a board of `octaves`: the tonic it closes on. */
export const topKey = (octaves: number) => octaves * 12

export const whiteKeys = (octaves: number) => [
  ...Array.from({ length: octaves }, (_, o) =>
    WHITE_PC.map(pc => pc + 12 * o),
  ).flat(),
  topKey(octaves),
]

export const blackAbove = (key: number, top: number) =>
  key < top && BLACK_PC.has(key % 12) ? key + 1 : undefined
