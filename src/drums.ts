import type { ControlKey } from './controls'

// The drum machine's vocabulary, in one place: what the voices are, in the
// bit order of a step; the controls each row's pattern and length live in; and
// the factory patterns. The panel draws its grid from this table, the trigger
// patch and the cross-patch name their choices off it, and the DSP reads its
// param order from it — the order of the rows here *is* the bit order of a step.
//
// Step 1 sits in the high bit, so every mask literal in this file and in
// DEFAULT_CONTROLS reads left to right exactly like the grid on screen.

export const STEPS = 16

// The wires between the step counter and the pattern memory: four to carry a
// step number, and one a row to carry the word that comes back. Which is what
// there is to put a knife through — see the bus bend in toyDrum.
export const ADDR_LINES = 4

// Every voice carries two masks. `key` is the steps that close every lap, and
// `maybe` is the steps wired through the kit's dice instead — they close as
// often as drumChance says, rolled fresh each time the counter reaches them,
// which is the whole of how a sixteen-step pattern stops being sixteen steps
// long. The two never overlap in anything the grid writes, and where a hand-
// edited link makes them, the maybe wins.
export const DRUM_VOICES = [
  {
    key: 'drumKick',
    maybe: 'drumKickMaybe',
    len: 'drumKickLen',
    label: 'kick',
    help: 'A bridged-T network, shocked and left to ring. It pitches down as it runs down, so how hard you hit it is how far it swoops.',
  },
  {
    key: 'drumSnare',
    maybe: 'drumSnareMaybe',
    len: 'drumSnareLen',
    label: 'snare',
    help: 'A noise transistor over two tuned networks at 185 and 330 Hz. Snappy is the pot between them.',
  },
  {
    key: 'drumHat',
    maybe: 'drumHatMaybe',
    len: 'drumHatLen',
    label: 'hat',
    help: 'The metal bank through a steep high-pass, gated short. Metal is the pot between the bank and the noise transistor.',
  },
  {
    key: 'drumClap',
    maybe: 'drumClapMaybe',
    len: 'drumClapLen',
    label: 'clap',
    help: 'Three noise bursts nine milliseconds apart, then the tail.',
  },
  {
    key: 'drumTom',
    maybe: 'drumTomMaybe',
    len: 'drumTomLen',
    label: 'tom',
    help: 'The same network as the kick, tuned higher and rung shorter — the fill voice.',
  },
  {
    key: 'drumBell',
    maybe: 'drumBellMaybe',
    len: 'drumBellLen',
    label: 'bell',
    help: 'Two of the metal bank’s six oscillators through a notch: the cowbell.',
  },
  {
    key: 'drumOpen',
    maybe: 'drumOpenMaybe',
    len: 'drumOpenLen',
    label: 'open hat',
    help: 'The same bank and the same filter as the hat, held open instead of gated. A hat step cuts it short — the two share one cap.',
  },
  {
    key: 'drumCym',
    maybe: 'drumCymMaybe',
    len: 'drumCymLen',
    label: 'cymbal',
    help: 'All six oscillators through a wider band, and a tail nothing chokes. Cymbal tone is where the band sits.',
  },
] as const satisfies readonly {
  key: ControlKey
  maybe: ControlKey
  len: ControlKey
  label: string
  help: string
}[]

// Not a voice: it decides how hard whatever plays on a step lands. It carries a
// length of its own all the same, so the accents can run against the voices.
// No maybe mask — an accent is a weight rather than a hit, and a weight that
// came and went would be a second dice rolling against the one that decided
// whether there was anything to weigh.
const ACCENT_ROW = {
  key: 'drumAccent',
  maybe: null,
  len: 'drumAccentLen',
  label: 'accent',
  help: 'Not a voice — whatever plays on this step hits harder.',
} as const

export const GRID_ROWS = [...DRUM_VOICES, ACCENT_ROW] as const

// The wires carrying a word back out of the pattern memory: one a row, so the
// accent has a wire of its own beside the eight voices. It is the trigger line
// rather than an amplifier — a bit forced high strikes for real, and the accent
// wire is the one that decides how hard, on every step the machine fetches.
export const DATA_LINES = GRID_ROWS.length

export const N_DRUM_VOICES = DRUM_VOICES.length
export const VOICE_LABELS = DRUM_VOICES.map(v => v.label)

/** How much harder an accented step lands than a plain one — the kit's only two
    weights, and so the two ends a pad's velocity plays between. */
export const ACCENT_GAIN = 1.7

/** One voice as a step's bit, for anything striking the trigger line by hand. */
export const voiceBit = (voice: number) => 1 << voice

export type DrumVoice = (typeof DRUM_VOICES)[number]
export type DrumVoiceKey = DrumVoice['key']
export type DrumMaybeKey = DrumVoice['maybe']
export type DrumRow = (typeof GRID_ROWS)[number]
export type DrumStepKey = DrumRow['key']
export type DrumLenKey = DrumRow['len']

export const LEN_KEYS = new Set<ControlKey>(GRID_ROWS.map(r => r.len))

export const MAYBE_KEYS = DRUM_VOICES.map(v => v.maybe)

/** Every mask a pattern is made of, voice masks and maybe masks together, in
    the order the grid draws them. A move that rewrites a pattern rewrites all
    of these or it hands back a bar with somebody else's maybes in it. */
export const PATTERN_KEYS = GRID_ROWS.flatMap(r =>
  r.maybe ? [r.key, r.maybe] : [r.key],
)

/** Sixteen bits and nothing else, whatever a link or a stray float carried. */
export const asMask = (v: number) =>
  Math.min(Math.max(Math.round(v), 0), (1 << STEPS) - 1)

/** A length is a whole number of steps, and a row of no steps is not a row. */
export const asLen = (v: number) => Math.min(Math.max(Math.round(v), 1), STEPS)

/** Which of a row's steps a hit played by hand lands on: the step the kit is
    standing on, or the next one, because a hand aiming at a step arrives either
    side of it. `phase` is how far through the current step the hit came. */
export const quantizeStep = (tick: number, phase: number, len: number) =>
  (((tick + (phase >= 0.5 ? 1 : 0)) % len) + len) % len

export const stepBit = (step: number) => 1 << (STEPS - 1 - step)
export const hasStep = (mask: number, step: number) =>
  (mask & stepBit(step)) !== 0
export const toggleStep = (mask: number, step: number) => mask ^ stepBit(step)

/** What one contact is, out of the two masks that answer for it. Three states
    and one click cycling them, so a step is off, closed, or wired through the
    dice — and a step in both masks is the dice, because that is the wire that
    reaches the trigger line last. */
export type StepState = 'off' | 'on' | 'maybe'

export const stepState = (
  mask: number,
  maybe: number,
  step: number,
): StepState =>
  hasStep(maybe, step) ? 'maybe' : hasStep(mask, step) ? 'on' : 'off'

/** The pattern itself: a mask per row, and the length each row runs to. The two
    halves travel together through everything that rewrites a pattern. */
export type DrumMasks = Record<DrumStepKey | DrumMaybeKey, number>
export type DrumLens = Record<DrumLenKey, number>

export interface DrumRom {
  name: string
  blurb: string
  masks: DrumMasks
}

export const EMPTY_MASKS: DrumMasks = Object.fromEntries(
  PATTERN_KEYS.map(k => [k, 0]),
) as DrumMasks

const rom = (
  name: string,
  blurb: string,
  masks: Partial<Record<DrumStepKey, number>>,
): DrumRom => ({
  name,
  blurb,
  masks: { ...EMPTY_MASKS, ...masks },
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
  rom('disco', 'Four on the floor, open hats on the offbeat', {
    drumKick: 0b1000_1000_1000_1000,
    drumSnare: 0b0000_1000_0000_1000,
    drumHat: 0b1000_1000_1000_1000,
    drumOpen: 0b0010_0010_0010_0010,
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
    drumCym: 0b1000_0000_0000_0000,
    drumAccent: 0b1000_0000_1000_0000,
  }),
  rom('clear', 'Wipe every voice and write your own', {}),
]

export function romMatching(masks: DrumMasks): DrumRom | undefined {
  return DRUM_ROMS.find(r => PATTERN_KEYS.every(k => r.masks[k] === masks[k]))
}
