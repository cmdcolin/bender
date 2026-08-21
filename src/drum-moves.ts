import {
  asLen,
  DRUM_VOICES,
  EMPTY_MASKS,
  GRID_ROWS,
  hasStep,
  STEPS,
  stepBit,
  type DrumLens,
  type DrumMasks,
  type DrumStepKey,
  type DrumVoiceKey,
} from './drums'
import type { Rng } from './dsp/util/rng'

// What the machine can do to a pattern that a hand drawing sixteen contacts one
// at a time cannot be bothered to: write a fresh one, nudge the one you have,
// drop a fill over the end of the bar, turn it, halve it, double it.
//
// Everything here is a function from a pattern to a pattern, so the panel's
// verbs are one line each and every one of them is a thing a test can check
// without a browser. Nothing reaches for the clock: a move is a write, and the
// kit plays whatever the grid says the next time it comes round to it.

const ALL = (1 << STEPS) - 1

const pick = <T>(xs: readonly T[], rand: Rng) =>
  xs[Math.floor(rand() * xs.length)]!

const bits = (steps: readonly number[]) =>
  steps.reduce((mask, s) => mask | stepBit(s), 0)

/** Every nth step of the bar, from `at` — the eighths, the sixteenths, and the
    offbeats that are the same thing started late. */
const every = (n: number, at = 0) => {
  let mask = 0
  for (let s = at; s < STEPS; s += n) mask |= stepBit(s)
  return mask
}

const mapRows = (masks: DrumMasks, f: (mask: number) => number) =>
  Object.fromEntries(
    GRID_ROWS.map(row => [row.key, f(masks[row.key])]),
  ) as DrumMasks

const setSteps = (mask: number) => {
  const steps: number[] = []
  for (let s = 0; s < STEPS; s++) if (hasStep(mask, s)) steps.push(s)
  return steps
}

/** Hits spread as evenly as whole steps allow — four in sixteen is the beat,
    but five, seven and eleven are the ones with a limp in them, and they are
    where most of the world's rhythms live and none of this machine's ROMs do. */
export const euclid = (hits: number, len = STEPS, turn = 0) => {
  let mask = 0
  for (let i = 0; i < hits; i++)
    mask |= stepBit((Math.floor((i * len) / hits) + turn) % len)
  return mask
}

// A pattern that reads as a pattern rather than as noise on a grid: pick a feel,
// and let it say where the kick, the snare and the hat go. Rolling all sixteen
// steps of all seven rows independently is the one thing the plugboard already
// lets you draw by hand.
type Feel = (rand: Rng) => Partial<DrumMasks>

const FEELS: Feel[] = [
  // Four on the floor, hats between the kicks.
  rand => ({
    drumKick: every(4),
    drumSnare: bits([4, 12]),
    drumHat: rand() < 0.6 ? every(4, 2) : every(2),
    drumClap: rand() < 0.4 ? bits([4, 12]) : 0,
  }),
  // The backbeat the machine boots on: kick either side of the snare.
  rand => ({
    drumKick:
      bits([0, 8]) |
      (rand() < 0.6 ? stepBit(10) : 0) |
      (rand() < 0.4 ? stepBit(3) : 0),
    drumSnare: bits([4, 12]),
    drumHat: every(pick([1, 2, 2], rand)),
  }),
  // A break: kick off the beat, ghost snare in the gap, a hole in the hats.
  rand => ({
    drumKick: bits([0, 6]) | (rand() < 0.5 ? stepBit(10) : stepBit(11)),
    drumSnare: bits([4, 12]) | stepBit(pick([7, 10, 14, 15], rand)),
    drumHat: every(1) & ~stepBit(pick([5, 9, 13], rand)),
  }),
  // Halftime: one snare in the middle of the bar and room all round it.
  rand => ({
    drumKick: stepBit(0) | (rand() < 0.6 ? stepBit(6) : stepBit(11)),
    drumSnare: stepBit(8),
    drumHat: rand() < 0.5 ? every(4) : every(2),
  }),
  // Euclidean: nobody's genre, and the rows land against each other somewhere
  // none of the feels above would have put them.
  rand => ({
    drumKick: euclid(pick([3, 4, 5], rand)),
    drumSnare: euclid(pick([2, 3], rand), STEPS, 4),
    drumHat: euclid(pick([7, 9, 11, 13], rand)),
    drumBell: rand() < 0.5 ? euclid(5, STEPS, 2) : 0,
  }),
]

// The clave, for when the bell comes on: two bars of Latin dance music in five
// hits, and the one figure that sounds deliberate on a cowbell.
const CLAVE = bits([0, 3, 6, 10, 12])

/** A whole new pattern. The downbeat is the one step every roll agrees on —
    everything else is the feel it landed in, its trimmings, and a fill often
    enough that you hear the bar end. */
export function randomPattern(rand: Rng): DrumMasks {
  const masks: DrumMasks = { ...EMPTY_MASKS, ...pick(FEELS, rand)(rand) }
  if (masks.drumClap === 0 && rand() < 0.3)
    masks.drumClap = masks.drumSnare & bits([4, 12])
  if (rand() < 0.3) masks.drumTom = bits([13, 14, 15])
  if (masks.drumBell === 0 && rand() < 0.2) masks.drumBell = CLAVE
  masks.drumAccent = pick(
    [every(8), every(4), stepBit(0), masks.drumSnare],
    rand,
  )
  masks.drumKick |= stepBit(0)
  return rand() < 0.3 ? fillBar(masks, rand) : masks
}

/** Steps `at` and after, as a mask: the end of the bar a fill is written over. */
const zone = (at: number) => {
  let mask = 0
  for (let s = at; s < STEPS; s++) mask |= stepBit(s)
  return mask
}

const FIRST_BEAT = ~zone(4) & ALL

const clearFrom = (masks: DrumMasks, at: number) =>
  mapRows(masks, mask => mask & ~zone(at) & ALL)

// The five ways this kit knows to say the bar is ending. Each is handed the
// pattern and the step the fill starts on, and each clears what was there first:
// a fill played over the beat it replaces is two patterns at once.
interface Fill {
  name: string
  write: (masks: DrumMasks, at: number, rand: Rng) => DrumMasks
}

export const FILLS: Fill[] = [
  {
    name: 'tom roll',
    write: (masks, at, rand) => {
      const base = clearFrom(masks, at)
      const stride = STEPS - at > 4 && rand() < 0.5 ? 2 : 1
      let tom = 0
      for (let s = at; s < STEPS; s += stride) tom |= stepBit(s)
      return {
        ...base,
        drumTom: tom,
        drumAccent: base.drumAccent | stepBit(at),
      }
    },
  },
  {
    name: 'snare roll',
    write: (masks, at) => {
      const base = clearFrom(masks, at)
      return {
        ...base,
        drumSnare: base.drumSnare | zone(at),
        drumAccent: base.drumAccent | bits([STEPS - 2, STEPS - 1]),
      }
    },
  },
  // The first beat of the bar, said again at the end of it — a beat repeat
  // written into the grid rather than played by holding a button down.
  {
    name: 'stutter',
    write: (masks, at) => {
      const base = clearFrom(masks, at)
      for (const row of GRID_ROWS)
        for (let to = at; to < STEPS; to += 4)
          base[row.key] |= (masks[row.key] & FIRST_BEAT) >>> to
      return base
    },
  },
  {
    name: 'clap trade',
    write: (masks, at) => {
      const base = clearFrom(masks, at)
      const steps = setSteps(zone(at))
      return {
        ...base,
        drumClap: base.drumClap | bits(steps.filter((_, i) => i % 2 === 0)),
        drumSnare: base.drumSnare | bits(steps.filter((_, i) => i % 2 === 1)),
        drumAccent: base.drumAccent | stepBit(at),
      }
    },
  },
  // A hole is a fill: everything stops, and one hit on the last step picks the
  // bar back up.
  {
    name: 'drop',
    write: (masks, at) => {
      const base = clearFrom(masks, at)
      return {
        ...base,
        drumSnare: base.drumSnare | stepBit(STEPS - 1),
        drumAccent: base.drumAccent | stepBit(STEPS - 1),
      }
    },
  },
]

/** A fill over the end of the bar — the last beat, or the last two when the roll
    asks for the room. What comes before it is left exactly as it was, and half
    the time the bell marks the downbeat the fill is running at. */
export function fillBar(masks: DrumMasks, rand: Rng): DrumMasks {
  const at = rand() < 0.25 ? STEPS / 2 : STEPS - 4
  const filled = pick(FILLS, rand).write(masks, at, rand)
  if (rand() < 0.5) {
    filled.drumBell |= stepBit(0)
    filled.drumAccent |= stepBit(0)
  }
  return filled
}

const VOICE_KEYS = DRUM_VOICES.map(v => v.key)
const GHOST_VOICES = ['drumSnare', 'drumHat', 'drumKick'] as const
const OFF_STEPS = [1, 3, 5, 7, 9, 11, 13, 15]

// One small thing done to a pattern, of the kind a hand does to a pattern it has
// been listening to for a while. Each is allowed to do nothing — a voice with no
// hits in it has no hit to move — because a vary that had to find something to
// change would go looking in the rows you left empty on purpose.
type Edit = (masks: DrumMasks, rand: Rng) => void

// Every step the row plays but the downbeat kick, which is not a hit so much as
// where the bar is: an edit that took it away or moved it off the one would be
// handing back a different bar rather than the same one varied.
const looseSteps = (masks: DrumMasks, key: DrumVoiceKey) =>
  setSteps(masks[key]).filter(s => !(key === 'drumKick' && s === 0))

const EDITS: Edit[] = [
  // A hit lands a step either side of where it was.
  (masks, rand) => {
    const key = pick(VOICE_KEYS, rand)
    const steps = looseSteps(masks, key)
    if (steps.length > 0) {
      const from = pick(steps, rand)
      const to = (from + (rand() < 0.5 ? 1 : STEPS - 1)) % STEPS
      masks[key] = (masks[key] & ~stepBit(from)) | stepBit(to)
    }
  },
  // A ghost between the beats, and the accent taken off it so it stays one.
  (masks, rand) => {
    const step = pick(OFF_STEPS, rand)
    masks[pick(GHOST_VOICES, rand)] |= stepBit(step)
    masks.drumAccent &= ~stepBit(step)
  },
  // One hit goes.
  (masks, rand) => {
    const key = pick(VOICE_KEYS, rand)
    const steps = looseSteps(masks, key)
    if (steps.length > 0) masks[key] &= ~stepBit(pick(steps, rand))
  },
  // An accent moves, which changes what you hear without changing a step.
  (masks, rand) => {
    masks.drumAccent ^= stepBit(Math.floor(rand() * STEPS))
  },
  // A hit said twice, on the step after itself.
  (masks, rand) => {
    const key = pick(VOICE_KEYS, rand)
    const steps = setSteps(masks[key])
    if (steps.length > 0) masks[key] |= stepBit((pick(steps, rand) + 1) % STEPS)
  },
]

/** The pattern you have, still recognisably itself, with two to four small
    things done to it. */
export function varyPattern(masks: DrumMasks, rand: Rng): DrumMasks {
  const next = { ...masks }
  const moved = () => GRID_ROWS.some(row => next[row.key] !== masks[row.key])
  // A handful of edits is allowed to come to nothing — a ghost written where
  // one already was, an accent flipped twice — but a press that changed nothing
  // reads as a button that isn't wired up, so it goes round again.
  for (let tries = 0; tries < 8 && !moved(); tries++) {
    const edits = 2 + Math.floor(rand() * 3)
    for (let i = 0; i < edits; i++) pick(EDITS, rand)(next, rand)
  }
  return next
}

const rotate = (mask: number, len: number, by: number) => {
  // Steps past the row's length stay where they are: the sequencer never
  // reaches them, and turning them would be turning something nobody hears.
  let out = mask & zone(len)
  for (let s = 0; s < len; s++)
    if (hasStep(mask, s)) out |= stepBit((((s + by) % len) + len) % len)
  return out
}

/** Every row turned by a step, each within its own length — a five-step hat
    comes round where a five-step hat does, not where the bar does. */
export const shiftPattern = (masks: DrumMasks, lens: DrumLens, by: number) =>
  Object.fromEntries(
    GRID_ROWS.map(row => [
      row.key,
      rotate(masks[row.key], asLen(lens[row.len]), by),
    ]),
  ) as DrumMasks

/** Twice as slow: every step of the first half of the bar is given two, and the
    second half is what the first half became. */
export const halfTime = (masks: DrumMasks) =>
  mapRows(masks, mask => {
    let out = 0
    for (let s = 0; s * 2 < STEPS; s++)
      if (hasStep(mask, s)) out |= stepBit(s * 2)
    return out
  })

/** Twice as fast: the bar squeezed into half of itself, and said twice. */
export const doubleTime = (masks: DrumMasks) =>
  mapRows(masks, mask => {
    let out = 0
    for (let s = 0; s < STEPS; s++)
      if (hasStep(mask, s)) out |= stepBit(Math.floor(s / 2))
    return out | (out >>> (STEPS / 2))
  })

/** What the panel puts above the grid. `back` is the modifier held while
    pressing: the same move the other way round, where a move has one. */
export interface DrumMove {
  name: string
  blurb: string
  play: (kit: {
    masks: DrumMasks
    lens: DrumLens
    rand: Rng
    back: boolean
  }) => DrumMasks
}

export const DRUM_MOVES: DrumMove[] = [
  {
    name: 'roll',
    blurb:
      'a pattern nobody has heard: a feel picked at random — four on the floor, a backbeat, a break, halftime, or hits spread evenly the Euclidean way — with its trimmings, and a fill often enough to notice. It writes the grid and nothing else, so the kit keeps its tempo and its tone',
    play: kit => randomPattern(kit.rand),
  },
  {
    name: 'vary',
    blurb:
      'keep this pattern and do two or three small things to it: a hit a step to one side, a ghost between the beats, one hit gone, an accent somewhere else. The bar you wrote is still the bar you wrote',
    play: kit => varyPattern(kit.masks, kit.rand),
  },
  // Not 'fill': the ROM row above it already has a pattern by that name, and
  // two buttons a centimetre apart both saying fill is a machine lying about
  // which of them wipes the bar.
  {
    name: 'turnaround',
    blurb:
      'drop a fill over the end of the bar — a tom roll, a snare roll, the first beat stuttered, claps trading with the snare, or a hole with one hit at the bottom of it. What comes before it stays put',
    play: kit => fillBar(kit.masks, kit.rand),
  },
  {
    name: 'shift',
    blurb:
      'turn every row one step later, each within its own length, so a pattern you like lands somewhere else against the beat. Shift-click turns it back',
    play: kit => shiftPattern(kit.masks, kit.lens, kit.back ? -1 : 1),
  },
  {
    name: 'half',
    blurb:
      'twice as slow: the first half of the bar stretched over the whole of it, every step given two',
    play: kit => halfTime(kit.masks),
  },
  {
    name: 'double',
    blurb:
      'twice as fast: the bar squeezed into half of itself and said twice over',
    play: kit => doubleTime(kit.masks),
  },
]

/** Only the seven rows, out of a board that carries a hundred other numbers. */
export const masksOf = (board: Record<DrumStepKey, number>): DrumMasks =>
  Object.fromEntries(
    GRID_ROWS.map(row => [row.key, board[row.key]]),
  ) as DrumMasks
