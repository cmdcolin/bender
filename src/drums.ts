import type { ControlKey } from './controls'

// The drum machine's vocabulary, in one place: what the six voices are, in the
// bit order of a step; the controls each row's pattern and length live in; and
// the factory patterns. The panel draws its grid from this table, the trigger
// patch and the cross-patch name their choices off it, and the DSP reads its
// param order from it — the order of the rows here *is* the bit order of a step.
//
// Step 1 sits in the high bit, so every mask literal in this file and in
// DEFAULT_CONTROLS reads left to right exactly like the grid on screen.

export const STEPS = 16

export const DRUM_VOICES = [
  {
    key: 'drumKick',
    len: 'drumKickLen',
    label: 'kick',
    help: 'Sine thump, pitch falling through its own envelope.',
  },
  {
    key: 'drumSnare',
    len: 'drumSnareLen',
    label: 'snare',
    help: 'Filtered noise crack.',
  },
  {
    key: 'drumHat',
    len: 'drumHatLen',
    label: 'hat',
    help: 'The same noise, gated short and bright.',
  },
  {
    key: 'drumClap',
    len: 'drumClapLen',
    label: 'clap',
    help: 'Three noise bursts nine milliseconds apart, then the tail.',
  },
  {
    key: 'drumTom',
    len: 'drumTomLen',
    label: 'tom',
    help: 'A slower, higher kick — the fill voice.',
  },
  {
    key: 'drumBell',
    len: 'drumBellLen',
    label: 'bell',
    help: 'Two detuned squares through a notch: the cowbell.',
  },
] as const satisfies readonly {
  key: ControlKey
  len: ControlKey
  label: string
  help: string
}[]

// Not a voice: it decides how hard whatever plays on a step lands. It carries a
// length of its own all the same, so the accents can run against the voices.
const ACCENT_ROW = {
  key: 'drumAccent',
  len: 'drumAccentLen',
  label: 'accent',
  help: 'Not a voice — whatever plays on this step hits harder.',
} as const

export const GRID_ROWS = [...DRUM_VOICES, ACCENT_ROW] as const

export const N_DRUM_VOICES = DRUM_VOICES.length
export const VOICE_LABELS = DRUM_VOICES.map(v => v.label)

export type DrumRow = (typeof GRID_ROWS)[number]
export type DrumStepKey = DrumRow['key']
export type DrumLenKey = DrumRow['len']

export const LEN_KEYS = new Set<ControlKey>(GRID_ROWS.map(r => r.len))

/** Sixteen bits and nothing else, whatever a link or a stray float carried. */
export const asMask = (v: number) =>
  Math.min(Math.max(Math.round(v), 0), (1 << STEPS) - 1)

/** A length is a whole number of steps, and a row of no steps is not a row. */
export const asLen = (v: number) => Math.min(Math.max(Math.round(v), 1), STEPS)

export const stepBit = (step: number) => 1 << (STEPS - 1 - step)
export const hasStep = (mask: number, step: number) =>
  (mask & stepBit(step)) !== 0
export const toggleStep = (mask: number, step: number) => mask ^ stepBit(step)

export interface DrumRom {
  name: string
  blurb: string
  masks: Record<DrumStepKey, number>
}

const EMPTY = Object.fromEntries(GRID_ROWS.map(r => [r.key, 0])) as Record<
  DrumStepKey,
  number
>

const rom = (
  name: string,
  blurb: string,
  masks: Partial<Record<DrumStepKey, number>>,
): DrumRom => ({
  name,
  blurb,
  masks: { ...EMPTY, ...masks },
})

// The factory patterns, in the order the buttons sit above the grid. They are
// a starting point, not the state: the grid is the pattern, and loading a ROM
// writes over it.
export const DRUM_ROMS: DrumRom[] = [
  rom('rock', 'The one the machine boots with', {
    drumKick: 0b1000_0000_1001_0000,
    drumSnare: 0b0000_1000_0000_1000,
    drumHat: 0b0010_0010_0010_0010,
  }),
  rom('disco', 'Four on the floor under sixteenth hats', {
    drumKick: 0b1000_1000_1000_1000,
    drumSnare: 0b0000_1000_0000_1000,
    drumHat: 0b0011_0011_0011_0011,
    drumAccent: 0b1000_0000_1000_0000,
  }),
  rom('breaks', 'Kick off the beat, ghost snare in the gap', {
    drumKick: 0b1000_0010_0010_0000,
    drumSnare: 0b0000_1001_0000_1000,
    drumHat: 0b1010_1110_1010_1110,
    drumAccent: 0b0000_1000_0000_1000,
  }),
  rom('electro', 'Syncopated kick under a flat backbeat clap', {
    drumKick: 0b1001_0000_1001_0000,
    drumClap: 0b0000_1000_0000_1000,
    drumHat: 0b0010_0010_0010_0010,
    drumBell: 0b0000_0000_0000_0010,
    drumAccent: 0b1000_0000_1000_0000,
  }),
  rom('motorik', 'Eighths on the kick, sixteenths on the hat, no let-up', {
    drumKick: 0b1010_1010_1010_1010,
    drumSnare: 0b0000_1000_0000_1000,
    drumHat: 0b1111_1111_1111_1111,
    drumAccent: 0b1000_0000_1000_0000,
  }),
  rom('one drop', 'Nothing on the one — kick and snare together on three', {
    drumKick: 0b0000_0000_1000_0000,
    drumSnare: 0b0000_0000_1000_0000,
    drumHat: 0b0010_0010_0010_0010,
    drumAccent: 0b0000_0000_1000_0000,
  }),
  rom('bossa', 'Clave on the cowbell, no snare at all', {
    drumKick: 0b1001_0010_0010_0100,
    drumHat: 0b0010_0100_1001_0010,
    drumBell: 0b1001_0010_0010_1000,
    drumAccent: 0b1000_0000_0000_0000,
  }),
  rom('fill', 'Snare roll falling into eight toms', {
    drumKick: 0b1000_0000_0000_0000,
    drumSnare: 0b0111_0111_0000_0000,
    drumTom: 0b0000_0000_1111_1111,
    drumAccent: 0b1000_0000_1000_0000,
  }),
  rom(
    'clap',
    'Claps on the backbeat — solder the mic to the trigger and join in',
    {
      drumKick: 0b1000_0000_1000_0000,
      drumClap: 0b0000_1000_0000_1000,
      drumHat: 0b1010_1010_1010_1010,
      drumAccent: 0b0000_1000_0000_1000,
    },
  ),
  rom('march', 'Bell on the downbeat, toms into the turnaround', {
    drumKick: 0b1010_0000_1010_0000,
    drumSnare: 0b0000_1000_0000_1000,
    drumTom: 0b0000_0000_0000_0111,
    drumBell: 0b1000_0000_1000_0000,
    drumAccent: 0b1000_0000_1000_0000,
  }),
  rom('clear', 'Wipe every voice and write your own', {}),
]

export function romMatching(
  masks: Record<DrumStepKey, number>,
): DrumRom | undefined {
  return DRUM_ROMS.find(r =>
    GRID_ROWS.every(row => r.masks[row.key] === masks[row.key]),
  )
}
