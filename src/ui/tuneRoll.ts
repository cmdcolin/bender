import { isNote, NOTE_HI, NOTE_LO } from '../tune.ts'
import styles from './TuneRoll.module.css'

// How much of the keyboard the roll shows at once. Two octaves is what a toy
// melody stays inside of and what fits the panel without the grid becoming the
// whole of it; the rest of the memory's reach is a press away on the octave
// buttons, and the window opens on what you played.
export const ROWS = 24
const TOP_BASE = Math.max(NOTE_HI - ROWS + 1, NOTE_LO)

// C, in the chip's counting — its zero note is A, so a C is three semitones up.
export const isC = (note: number) => ((note % 12) + 12) % 12 === 3

// The window's bottom, snapped to a C so the rows read as octaves rather than
// as wherever the lowest note you played happened to land.
export const octaveFloor = (note: number) =>
  Math.floor((note - 3) / 12) * 12 + 3

export const clampBase = (note: number) =>
  Math.min(Math.max(note, NOTE_LO), TOP_BASE)

export const baseFor = (lanes: number[][]) => {
  const notes = lanes.flat().filter(isNote)
  return clampBase(octaveFloor(notes.length === 0 ? -9 : Math.min(...notes)))
}

export function cellClass(s: {
  on: boolean
  head: boolean
  ghost: boolean
  sharp: boolean
  beat: boolean
  under: boolean
  past: boolean
  wrap: boolean
}): string {
  return [
    s.on ? (s.head ? styles.headOn : styles.holdOn) : styles.cell,
    s.ghost && styles.ghost,
    s.sharp && styles.sharp,
    s.beat && styles.beat,
    s.under && styles.under,
    s.past && styles.past,
    s.wrap && styles.wrapLine,
  ]
    .filter(Boolean)
    .join(' ')
}
