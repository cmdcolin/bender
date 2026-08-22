// The chip's demo-song ROM bank, the way a bargain-bin keyboard ships it: four
// factory doodles and eight public-domain tunes everybody has heard come out of
// a plastic speaker. Steps are semitones above A3; -1 rests, -2 holds the note
// already sounding. stepHz is that ROM's own sequencer rate.
export interface Rom {
  name: string
  stepHz: number
  /** tonic as semitones above A, for the auto bass-chord section to harmonize against */
  key: number
  /** absent is major */
  minor?: boolean
  steps: number[]
}

export const ROMS: Rom[] = [
  {
    name: 'lullaby',
    stepHz: 3.2,
    key: 0,
    steps: [0, 0, 7, 7, 9, 9, 7, -1, 5, 5, 4, 4, 2, 2, 0, -1],
  },
  {
    name: 'march',
    stepHz: 3.2,
    key: 0,
    steps: [0, -1, 0, 4, 7, -1, 7, 4, 0, 4, 7, 12, 7, 4, 0, -1],
  },
  {
    name: 'arp',
    stepHz: 3.2,
    key: 0,
    steps: [0, 4, 7, 12, 7, 4, 0, 4, 7, 12, 16, 12, 7, 4, 0, 4],
  },
  {
    name: 'scale',
    stepHz: 3.2,
    key: 0,
    steps: [0, 2, 4, 5, 7, 9, 11, 12, 12, 11, 9, 7, 5, 4, 2, 0],
  },
  {
    name: 'für elise',
    stepHz: 8,
    key: 0,
    minor: true,
    steps: [
      19, 18, 19, 18, 19, 14, 17, 15, 12, -2, -2, -1, 3, 7, 12, 14, -2, -2, -1,
      -1, 7, 11, 14, 15, -2, -2, -1, -1, 7, 19, 18, 19,
    ],
  },
  {
    name: 'ode to joy',
    stepHz: 6,
    key: 3,
    steps: [
      7, -2, 7, -2, 8, -2, 10, -2, 10, -2, 8, -2, 7, -2, 5, -2, 3, -2, 3, -2, 5,
      -2, 7, -2, 7, -2, -2, 5, 5, -2, -2, -2,
    ],
  },
  {
    name: 'rondo turca',
    stepHz: 9,
    key: 0,
    minor: true,
    steps: [
      14, 12, 11, 12, 15, -2, -1, -1, 17, 15, 14, 15, 19, -2, -1, -1, 19, 17,
      16, 17, 20, -2, -1, -1, 24, 22, 20, 19, 17, 15, 14, 12,
    ],
  },
  {
    name: 'yankee',
    stepHz: 6,
    key: 3,
    steps: [
      3, 3, 5, 7, 3, 7, 5, -1, 3, 3, 5, 7, 3, -2, 2, -1, 3, 3, 5, 7, 8, 7, 5, 3,
      2, 0, 2, 5, 3, -2, -2, -1,
    ],
  },
  {
    name: 'camptown',
    stepHz: 6,
    key: 3,
    steps: [
      10, 10, 7, 10, 12, 10, 7, -1, 5, 7, 5, -2, -1, -1, -1, -1, 10, 10, 7, 10,
      12, 10, 7, -1, 5, 3, -2, -2, -1, -1, -1, -1,
    ],
  },
  {
    name: 'wm tell',
    stepHz: 9,
    key: 3,
    steps: [
      10, 10, 10, -1, 10, 10, 10, -1, 10, 10, 10, 10, 10, 10, 10, -1, 10, 15,
      19, -1, 10, 15, 19, -1, 19, 17, 15, 17, 15, 17, 15, -1,
    ],
  },
  {
    name: 'ragtime',
    stepHz: 8,
    key: 3,
    steps: [
      5, 6, 7, 15, -2, 7, 15, -2, 7, 15, -2, -2, -2, -2, -1, -1, 3, 5, 7, 12,
      -2, 5, 12, -2, 5, 12, -2, -2, -2, -2, -1, -1,
    ],
  },
  {
    name: 'danube',
    stepHz: 5,
    key: 5,
    steps: [
      5, -2, 9, 12, -2, -2, -2, -2, 12, -2, -1, -1, 12, -2, -1, -1, 14, -2, -2,
      -2, -2, -2, -1, -1, 12, -2, -1, -1, 12, -2, -1, -1,
    ],
  },

  // The sad end of the bank: slow ROMs in minor and modal keys, where a starved
  // rail sounds less like a joke and more like the toy is grieving.
  {
    name: 'gymnopédie',
    stepHz: 2.2,
    key: 9,
    minor: true,
    steps: [
      21, -2, -2, -2, 24, -2, 23, -2, 21, -2, -2, -2, 16, -2, -2, -1, 19, -2,
      -2, -2, 21, -2, 19, -2, 16, -2, -2, -2, 14, -2, -2, -1,
    ],
  },
  {
    name: 'gnossienne',
    stepHz: 4,
    key: 8,
    minor: true,
    steps: [
      8, 10, 11, 13, 15, -2, 16, 15, 14, 15, -2, -2, -1, -1, -1, -1, 15, 16, 15,
      13, 11, 10, 8, -2, -2, -1, -1, -1, -1, -1, -1, -1,
    ],
  },
  {
    name: 'sakura',
    stepHz: 3,
    key: 0,
    minor: true,
    steps: [
      12, -2, 14, -2, 12, -2, 14, -2, 12, -2, 14, 15, 14, -2, 12, -2, 14, -2,
      12, -2, 8, -2, 7, -2, 8, -2, 7, -2, 12, -2, -2, -1,
    ],
  },
  {
    name: 'dies irae',
    stepHz: 3,
    key: 5,
    minor: true,
    steps: [
      12, -2, 10, -2, 12, -2, -2, -1, 8, -2, 10, -2, 7, -2, -2, -1, 8, -2, 7,
      -2, 5, -2, -2, -1, 7, -2, 8, -2, 7, -2, 5, -1,
    ],
  },
  {
    name: 'funeral',
    stepHz: 2.6,
    key: 0,
    minor: true,
    steps: [
      12, -2, -2, -2, 12, -2, 12, -2, 12, -2, -2, -2, 15, -2, 14, 12, 14, -2,
      12, -2, -2, -1, -1, -1, 12, -2, -2, -2, 12, -2, -2, -1,
    ],
  },
  {
    name: 'greensleeves',
    stepHz: 4.5,
    key: 0,
    minor: true,
    steps: [
      12, 15, 17, 19, -2, 20, 19, 17, 14, -2, 10, 11, 12, 14, -2, 10, -2, -1,
      12, 15, 17, 19, -2, 20, 19, 17, 14, -2, 10, 11, 12, -1,
    ],
  },
]

export const ROM_NAMES = ROMS.map(r => r.name)

// The bank is what the chip shipped with, and the memory is not in it: the
// melody you played in sits one past the end of the bank, so picking a tune
// picks yours the same way it picks für Elise. See tune.ts for what is in it.
export const YOURS = ROMS.length
export const TUNE_NAMES = [...ROM_NAMES, 'yours']

export function romIndex(name: string): number {
  const i = ROMS.findIndex(r => r.name === name)
  if (i < 0) throw new Error(`no ROM named ${name}`)
  return i
}

// The step as a word on the data bus, which is what a melody chip actually
// stores: a note code, not a signed semitone. Codes 0 and 1 are the two things
// that are not notes and every code above them is a pitch, so the low bits are
// small intervals and the high ones are octaves. That encoding is the whole
// reason a cut data line is musical rather than random — one wire wrong is one
// interval wrong, the same interval every time that step comes round, and a
// wire stuck high turns the rests into notes because a rest is only a code.
export const ROM_DATA_LINES = 6
export const ROM_ADDR_LINES = 5
export const encodeStep = (step: number) => step + 2
export const decodeStep = (word: number) => word - 2
