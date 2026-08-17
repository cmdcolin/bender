import type { ControlKey } from '../controls'

// The drum machine's plugboard: one sixteen-bit mask per voice, plus an accent
// row that decides how hard a step hits rather than what plays on it. Step 1
// sits in the high bit, so every mask literal in this file and in
// DEFAULT_CONTROLS reads left to right exactly like the grid on screen.

export const STEPS = 16

export const GRID_ROWS = [
  {
    key: 'drumKick',
    label: 'kick',
    help: 'Sine thump, pitch falling through its own envelope.',
  },
  { key: 'drumSnare', label: 'snare', help: 'Filtered noise crack.' },
  {
    key: 'drumHat',
    label: 'hat',
    help: 'The same noise, gated short and bright.',
  },
  {
    key: 'drumClap',
    label: 'clap',
    help: 'Three noise bursts nine milliseconds apart, then the tail.',
  },
  {
    key: 'drumTom',
    label: 'tom',
    help: 'A slower, higher kick — the fill voice.',
  },
  {
    key: 'drumBell',
    label: 'bell',
    help: 'Two detuned squares through a notch: the cowbell.',
  },
  {
    key: 'drumAccent',
    label: 'accent',
    help: 'Not a voice — whatever plays on this step hits harder.',
  },
] as const satisfies readonly { key: ControlKey; label: string; help: string }[]

export type DrumStepKey = (typeof GRID_ROWS)[number]['key']

/** Sixteen bits and nothing else, whatever a link or a stray float carried. */
export const asMask = (v: number) =>
  Math.min(Math.max(Math.round(v), 0), (1 << STEPS) - 1)

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
