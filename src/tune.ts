import type { ControlKey } from './controls'

// The melody memory: the thirty-two steps the toy keeps of what you played,
// and the word each one is filed as.
//
// Toy keyboards of this kind had a record button, and what it wrote went into
// the same memory the demo song came out of — so the chip plays your melody the
// way it plays für Elise, off the same counter, through the same wires, under
// the same accompaniment. That is the whole design here: the memory is a
// nineteenth tune rather than a sequencer of its own, and everything the chip
// already does to a tune it does to yours.
//
// A step is a semitone in the chip's own counting (0 is A3, 220 Hz), or one of
// the two things a step can be that is not a note.

// As long as the songs in the ROM bank. The memory used to be half of one,
// which made yours the one tune on the chip that could not hold a phrase and
// its answer — and the design here is that the memory is a nineteenth tune, so
// it is the same length as the other eighteen.
export const TUNE_STEPS = 32

// Not notes: nothing sounding, and whatever is sounding carrying on. The ROM
// bank spells them -1 and -2 because its steps never go below the chip's bottom
// A; the memory's do, since the drawn keyboard starts nine semitones under it,
// so these sit far enough out that no note can be mistaken for one.
export const REST = -128
export const HOLD = -127

/** True for a step that strikes something. */
export const isNote = (step: number) => step !== REST && step !== HOLD

// What six wires can file. The memory word is the same width as the ROM's,
// because it is the same bus — one of the four faults on it reaches your tune
// exactly as it reaches the factory songs. Two codes go to the pair that are
// not notes and the other sixty-two are pitches, which is a little over five
// octaves and rather less than the octave switch can reach.
//
// Where those sixty-two sit is chosen around the drawn keyboard rather than
// around the chip's zero: three octaves from C3, and the octave switch one
// either way, all fit. Only the two far positions of the switch reach past the
// end of the word, and a note that does comes back an octave nearer.
export const NOTE_LO = -21
export const NOTE_HI = 40
const WORD_HOLD = 0
const WORD_REST = 63
const WORD_BIAS = 22

/** A note the memory cannot file, folded to the same note it can. */
export const foldNote = (note: number) => {
  let n = Math.round(note)
  while (n < NOTE_LO) n += 12
  while (n > NOTE_HI) n -= 12
  return n
}

/** Anything at all as a step the memory holds: the two sentinels as themselves,
    everything else as a note it has room for. */
export const asTuneStep = (v: number) => {
  const step = Math.round(v)
  return step === REST || step === HOLD ? step : foldNote(step)
}

/** A step as the word that crosses the bus, and back. The knife is between
    these two, which is the point of there being two. */
export const encodeTune = (step: number) =>
  step === HOLD ? WORD_HOLD : step === REST ? WORD_REST : step + WORD_BIAS

export const decodeTune = (word: number) => {
  const w = word & 63
  return w === WORD_HOLD ? HOLD : w === WORD_REST ? REST : w - WORD_BIAS
}

// Written out rather than built from the count, so the names are checked
// against the control table instead of asserted to be in it.
export const TUNE_STEP_KEYS = [
  'tuneStep0',
  'tuneStep1',
  'tuneStep2',
  'tuneStep3',
  'tuneStep4',
  'tuneStep5',
  'tuneStep6',
  'tuneStep7',
  'tuneStep8',
  'tuneStep9',
  'tuneStep10',
  'tuneStep11',
  'tuneStep12',
  'tuneStep13',
  'tuneStep14',
  'tuneStep15',
  'tuneStep16',
  'tuneStep17',
  'tuneStep18',
  'tuneStep19',
  'tuneStep20',
  'tuneStep21',
  'tuneStep22',
  'tuneStep23',
  'tuneStep24',
  'tuneStep25',
  'tuneStep26',
  'tuneStep27',
  'tuneStep28',
  'tuneStep29',
  'tuneStep30',
  'tuneStep31',
] as const satisfies readonly ControlKey[]

export type TuneStepKey = (typeof TUNE_STEP_KEYS)[number]

/** How many steps the memory plays before it comes round: a whole number of the
    steps it has. */
export const asTuneLen = (v: number) =>
  Math.min(Math.max(Math.round(v), 1), TUNE_STEPS)

// Which key the accompaniment plays in under a melody nobody wrote down the key
// of. The section has no chord buttons — it reads the melody and moves to
// whichever of its three triads holds the note — so all it needs is where the
// three are, and the lowest note of what you played is the toy's own answer:
// hands land on the tonic at the bottom of a riff often enough, and a wrong
// guess costs a chord that sits still rather than a key that fights.
//
// Minor when a minor third above that tonic is in the tune and a major third is
// not, which is the one distinction three chords can carry.
export function keyOf(steps: readonly number[]) {
  const notes = steps.filter(isNote)
  const tonic = notes.length === 0 ? 0 : Math.min(...notes)
  const classes = new Set(notes.map(n => (((n - tonic) % 12) + 12) % 12))
  return {
    key: ((tonic % 12) + 12) % 12,
    minor: classes.has(3) && !classes.has(4),
  }
}

/** What each step is actually sounding once the holds are resolved: the note,
    and whether the step struck it or is carrying the one before. A hold at the
    top of the memory carries the last note in it, because that is what the step
    before is when the counter comes round. */
export function voicing(steps: readonly number[]) {
  const carried = [...steps].reverse().find(isNote) ?? REST
  let note = carried
  return steps.map(step => {
    const head = isNote(step)
    if (head) note = step
    else if (step === REST) note = REST
    return { note, head }
  })
}
