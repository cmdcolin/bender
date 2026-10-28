import type { ControlKey } from './controls.ts'

// The drum machine's vocabulary, in one place: what the voices are, in the
// bit order of a step; the controls each row's pattern and length live in; and
// the factory patterns. The panel draws its grid from this table, the trigger
// patch and the cross-patch name their choices off it, and the DSP reads its
// param order from it — the order of the rows here *is* the bit order of a step.
//
// Step 1 sits in the high bit, so every mask literal reads left to right exactly
// like the grid on screen.

export const STEPS = 16

// The wires between the step counter and the pattern memory: four to carry a
// step number, and one a row to carry the word that comes back. Which is what
// there is to cut or short — see the bus bend in toyDrum.
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
    help: 'A bridged-T network, shocked and left to ring. The trigger pulse snaps it at the front, and it pitches down as it runs down, so how hard you hit it is how far it swoops.',
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
    help: 'The metal bank’s upper band through a high-pass, gated short. Metal is the pot between the bank and the noise transistor.',
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
    help: 'Two of the metal bank’s six oscillators through a band around the pair: the cowbell, a clank over a ring.',
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
    help: 'All six oscillators through a wider band, a crash over a long tail nothing chokes. Cymbal tone is where the band sits.',
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

// Not on the pattern bus either: hits on these steps also go to the tape delay.
export const THROW_ROW = {
  key: 'drumThrow',
  maybe: null,
  len: 'drumThrowLen',
  label: 'echo',
  help: 'Hits on these steps also go into Wraith.',
} as const

export type PanelRow = (typeof GRID_ROWS)[number] | typeof THROW_ROW

/** How many times each column fires inside its step, as an index into RATCHETS. */
export const RATCHET_KEYS = [
  'drumRatchet0',
  'drumRatchet1',
  'drumRatchet2',
  'drumRatchet3',
  'drumRatchet4',
  'drumRatchet5',
  'drumRatchet6',
  'drumRatchet7',
  'drumRatchet8',
  'drumRatchet9',
  'drumRatchet10',
  'drumRatchet11',
  'drumRatchet12',
  'drumRatchet13',
  'drumRatchet14',
  'drumRatchet15',
] as const satisfies readonly ControlKey[]
export const RATCHETS = [1, 2, 3, 4, 6, 8]

/** How late each column fires, in twelfths of its step. */
export const NUDGE_KEYS = [
  'drumNudge0',
  'drumNudge1',
  'drumNudge2',
  'drumNudge3',
  'drumNudge4',
  'drumNudge5',
  'drumNudge6',
  'drumNudge7',
  'drumNudge8',
  'drumNudge9',
  'drumNudge10',
  'drumNudge11',
  'drumNudge12',
  'drumNudge13',
  'drumNudge14',
  'drumNudge15',
] as const satisfies readonly ControlKey[]
export const NUDGE_PARTS = 12
export const NUDGES = [0, 2, 3, 4, 6, 8, 9]

/** The fault the kit puts on the whole board for each column's step, as an index
    into EVENTS. */
export const EVENT_KEYS = [
  'drumEvent0',
  'drumEvent1',
  'drumEvent2',
  'drumEvent3',
  'drumEvent4',
  'drumEvent5',
  'drumEvent6',
  'drumEvent7',
  'drumEvent8',
  'drumEvent9',
  'drumEvent10',
  'drumEvent11',
  'drumEvent12',
  'drumEvent13',
  'drumEvent14',
  'drumEvent15',
] as const satisfies readonly ControlKey[]
export const EVENTS = [
  'none',
  'cut',
  'drop',
  'brake',
  'freeze',
  'reboot',
] as const
export const EVENT = {
  cut: 1,
  drop: 2,
  brake: 3,
  freeze: 4,
  reboot: 5,
} as const satisfies Record<Exclude<(typeof EVENTS)[number], 'none'>, number>

export const asRatchet = (v: number) =>
  Math.min(Math.max(Math.round(v), 0), RATCHETS.length - 1)
export const asNudge = (v: number) =>
  Math.min(Math.max(Math.round(v), 0), NUDGE_PARTS - 1)
export const asEvent = (v: number) =>
  Math.min(Math.max(Math.round(v), 0), EVENTS.length - 1)
/** Bars between the event row's faults: it fires on the last bar of each run. */
export const EVENT_EVERY = [1, 2, 4, 8]
export const asEventEvery = (v: number) =>
  Math.min(Math.max(Math.round(v), 0), EVENT_EVERY.length - 1)

/** Which bars each voice row plays, as an index into CONDS, in voice order. */
export const COND_KEYS = [
  'drumKickCond',
  'drumSnareCond',
  'drumHatCond',
  'drumClapCond',
  'drumTomCond',
  'drumBellCond',
  'drumOpenCond',
  'drumCymCond',
] as const satisfies readonly ControlKey[]
/** A:B plays on the Ath bar of every B, and !A:B on every other bar. */
export const CONDS = [
  '1:1',
  '1:2',
  '2:2',
  '1:4',
  '2:4',
  '3:4',
  '4:4',
  '1:8',
  '8:8',
  '!4:4',
  '!8:8',
] as const
export const asCond = (v: number) =>
  Math.min(Math.max(Math.round(v), 0), CONDS.length - 1)

const CONDS_PARSED = CONDS.map(c => {
  const [a, b] = c.replace('!', '').split(':').map(Number)
  return { a: a!, b: b!, not: c.startsWith('!') }
})

/** Whether a row under condition `cond` plays on bar `bar` of the kit. */
export function condPlays(cond: number, bar: number): boolean {
  const { a, b, not } = CONDS_PARSED[asCond(cond)]!
  return (bar % b === a - 1) !== not
}

/** Each column's condition, as an index into STEP_CONDS. */
export const STEP_COND_KEYS = [
  'drumStepCond0',
  'drumStepCond1',
  'drumStepCond2',
  'drumStepCond3',
  'drumStepCond4',
  'drumStepCond5',
  'drumStepCond6',
  'drumStepCond7',
  'drumStepCond8',
  'drumStepCond9',
  'drumStepCond10',
  'drumStepCond11',
  'drumStepCond12',
  'drumStepCond13',
  'drumStepCond14',
  'drumStepCond15',
] as const satisfies readonly ControlKey[]
/** A column plays on the bars its A:B says, as a row does. pre plays only when
    the last column with an A:B before it played, !pre only when it did not;
    fill plays only while the fill key is down, !fill only while it is up. */
export const STEP_CONDS = [...CONDS, 'pre', '!pre', 'fill', '!fill'] as const
export const asStepCond = (v: number) =>
  Math.min(Math.max(Math.round(v), 0), STEP_CONDS.length - 1)
const PRE = CONDS.length

/** Whether a column under `cond` plays on bar `bar`, given how the last
    column with an A:B went and whether the fill key is down. */
export function stepCondPlays(
  cond: number,
  bar: number,
  pre: boolean,
  fill: boolean,
): boolean {
  const c = asStepCond(cond)
  if (c < PRE) return condPlays(c, bar)
  return [pre, !pre, fill, !fill][c - PRE]!
}

export const RATCHET_SET = new Set<ControlKey>(RATCHET_KEYS)
export const NUDGE_SET = new Set<ControlKey>(NUDGE_KEYS)
export const EVENT_SET = new Set<ControlKey>(EVENT_KEYS)
export const COND_SET = new Set<ControlKey>(COND_KEYS)
export const STEP_COND_SET = new Set<ControlKey>(STEP_COND_KEYS)

/** A setting of the kit's tracker rows clamped to what it can hold, or
    undefined for a key that is none of them. */
export function asKitSetting(key: ControlKey, v: number): number | undefined {
  if (RATCHET_SET.has(key)) return asRatchet(v)
  if (NUDGE_SET.has(key)) return asNudge(v)
  if (EVENT_SET.has(key) || key === 'drumEventLive') return asEvent(v)
  if (key === 'drumEventEvery') return asEventEvery(v)
  if (COND_SET.has(key)) return asCond(v)
  if (STEP_COND_SET.has(key)) return asStepCond(v)
  if (key === 'drumFill') return v > 0.5 ? 1 : 0
  return undefined
}

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

export const LEN_KEYS = new Set<ControlKey>([
  ...GRID_ROWS.map(r => r.len),
  THROW_ROW.len,
])

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

// Every pattern length divides this, so the counter can wrap without a row
// jumping mid-bar: it is the least common multiple of 1 through 16. At the
// fastest tempo the panel offers, one lap of it is over an hour.
export const CYCLE = 720720

export interface StepReport {
  /** The step the counter reported standing on. */
  tick: number
  /** How far into that step it had got, in unswung steps. */
  clock: number
  /** How long an unswung step lasts; 0 when nothing has said. */
  stepMs: number
  /** How long ago the report arrived. */
  ageMs: number
  /** How long the counter's sound takes to reach the ear. */
  latencyMs: number
}

/** The step a listener was hearing when they played, and how far through it.
    The counter runs ahead of the ear by the output latency, so the heard step
    trails the reported one. A report older than its own step is a clock that
    has stopped, read as it stood. `span` is each step's length in unswung
    steps, which swing makes uneven. */
export function heardStep(
  r: StepReport,
  span: (tick: number) => number = () => 1,
): { tick: number; phase: number } {
  let tick = r.tick
  let into = r.clock
  const ticking = r.stepMs > 0 && r.ageMs < span(tick) * r.stepMs
  if (ticking) into += (r.ageMs - r.latencyMs) / r.stepMs
  while (into < 0) into += span(--tick)
  while (into >= span(tick)) into -= span(tick++)
  return { tick, phase: Math.max(into, 0) / span(tick) }
}

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

// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Object.fromEntries widens to string keys; the entries are every pattern key
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
  rom('rock', 'Kick, snare and hat, the plainest beat', {
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
  rom('techno', 'Four on the floor, clap on two and four, open hat between', {
    drumKick: 0b1000_1000_1000_1000,
    drumClap: 0b0000_1000_0000_1000,
    drumHat: 0b1101_1101_1101_1101,
    drumOpen: 0b0010_0010_0010_0010,
    drumAccent: 0b0010_0010_0010_0010,
  }),
  rom('rumble', 'Kick on the beat, a low tom rolling after it, no backbeat', {
    drumKick: 0b1000_1000_1000_1000,
    drumTom: 0b0011_0011_0011_0011,
    drumHat: 0b0010_0010_0010_0010,
    drumCym: 0b0000_0000_0000_0010,
    drumAccent: 0b1000_0000_1000_0000,
  }),
  rom('clear', 'Wipe every voice and write your own', {}),
]

export const ROCK: DrumMasks = DRUM_ROMS[0]!.masks

export function romMatching(masks: DrumMasks): DrumRom | undefined {
  return DRUM_ROMS.find(r => PATTERN_KEYS.every(k => r.masks[k] === masks[k]))
}

const STEP_CHARS: Record<StepState, string> = { on: 'x', maybe: '?', off: '.' }

/** Formats a row up to its length with one character per step: `x` for a hit,
    `?` for a hit on the dice, `.` for a rest. */
export const rowText = (mask: number, maybe: number, len: number) =>
  Array.from(
    { length: asLen(len) },
    (_, s) => STEP_CHARS[stepState(mask, maybe, s)],
  ).join('')

/** A Euclidean rhythm: `hits` spread as evenly as they go over `steps` by
    Bjorklund's algorithm, turned left by `rotate`. The strings match Tidal's:
    euclid(3, 8) is `x..x..x.`. */
export function euclid(hits: number, steps: number, rotate = 0): string {
  if (steps < 1) return ''
  const k = Math.min(Math.max(Math.round(hits), 0), steps)
  let a = Array.from({ length: k }, () => 'x')
  let b = Array.from({ length: steps - k }, () => '.')
  while (b.length > 1 && a.length > 0) {
    const m = Math.min(a.length, b.length)
    const joined = a.slice(0, m).map((s, i) => s + b[i]!)
    b = a.length > m ? a.slice(m) : b.slice(m)
    a = joined
  }
  const flat = a.join('') + b.join('')
  const r = ((Math.round(rotate) % steps) + steps) % steps
  return flat.slice(r) + flat.slice(0, r)
}

/** How many of a row's first `len` steps fire. */
export const hitsIn = (mask: number, len: number) => {
  let n = 0
  for (let s = 0; s < asLen(len); s++) if (hasStep(mask, s)) n++
  return n
}

/** A row's hits spread evenly over its length, starting from the step its
    first hit stood on. Steps past the length keep what they had. */
export function euclidMask(hits: number, len: number, mask: number): number {
  const n = asLen(len)
  let first = 0
  while (first < n && !hasStep(mask, first)) first++
  if (first === n) first = 0
  const text = euclid(hits, n)
  let out = mask
  for (let s = 0; s < n; s++) {
    const at = (s + first) % n
    out = text[s] === 'x' ? out | stepBit(at) : out & ~stepBit(at)
  }
  return out
}

const EUCLID = /([x?.])\((\d+),(\d+)(?:,(-?\d+))?\)/g

/** Parses the format rowText writes, ignoring spaces and `|`. The text length
    sets the row length, and an empty string gives sixteen rests. Two short
    forms expand first: `x(3,8)` is a Euclidean row (a third number rotates
    it), and `[xxx]` is one step struck three times, which the kit plays as a
    ratchet on that column. */
export function parseRow(text: string) {
  const flat = text
    .toLowerCase()
    .replace(/[\s|]/g, '')
    .replace(EUCLID, (_, ch: string, k: string, n: string, r?: string) =>
      euclid(Number(k), Number(n), Number(r ?? 0)).replaceAll('x', ch),
    )
  const steps: string[] = []
  const ratchets: Record<number, number> = {}
  for (let i = 0; i < flat.length; i++) {
    if (flat[i] !== '[') {
      steps.push(flat[i]!)
      continue
    }
    const end = flat.indexOf(']', i)
    const inner = end < 0 ? '' : flat.slice(i + 1, end)
    const count = inner.length
    if (!/^(x+|\?+)$/.test(inner) || !RATCHETS.includes(count))
      throw new Error(
        `'[${inner}]' is not a step; a bracket holds ${RATCHETS.slice(1).join(', ')} of x or of ?`,
      )
    ratchets[steps.length] = count
    steps.push(inner[0]!)
    i = end
  }
  if (steps.length > STEPS)
    throw new Error(`${steps.length} steps; the maximum is ${STEPS}`)
  let mask = 0
  let maybe = 0
  for (const [s, ch] of steps.entries()) {
    if (ch === 'x') mask |= stepBit(s)
    else if (ch === '?') maybe |= stepBit(s)
    else if (ch !== '.') throw new Error(`'${ch}' is not a step; use x, ? or .`)
  }
  return { mask, maybe, len: steps.length || STEPS, ratchets }
}

/** The event row's letters, by EVENT value: c cut, d drop, b brake, f freeze,
    r reboot. */
export const EVENT_LETTERS = ['.', 'c', 'd', 'b', 'f', 'r'] as const

/** One character a column for the ratchet, nudge and event rows, read back the
    way `parseCells` takes them. */
export const CELL_ROWS = {
  ratchet: {
    keys: RATCHET_KEYS,
    write: (v: number) => (v ? String(RATCHETS[asRatchet(v)]) : '.'),
    read: (ch: string) =>
      ch === '.' || ch === '1' ? 0 : RATCHETS.indexOf(Number(ch)),
    says: `a count of ${RATCHETS.slice(1).join(', ')}, or . for one`,
  },
  nudge: {
    keys: NUDGE_KEYS,
    write: (v: number) => (v ? asNudge(v).toString(NUDGE_PARTS) : '.'),
    read: (ch: string) => (ch === '.' ? 0 : Number.parseInt(ch, NUDGE_PARTS)),
    says: 'twelfths late as 1 to 9, a or b, or . for on time',
  },
  event: {
    keys: EVENT_KEYS,
    write: (v: number) => EVENT_LETTERS[asEvent(v)]!,
    read: (ch: string) => (EVENT_LETTERS as readonly string[]).indexOf(ch),
    says: 'c cut, d drop, b brake, f freeze, r reboot, or . for none',
  },
} as const

export type CellRow = keyof typeof CELL_ROWS

/** A ratchet, nudge or event row: one character a column, up to sixteen, the
    columns past the text left at none. */
export function parseCells(row: CellRow, text: string): number[] {
  const { read, says } = CELL_ROWS[row]
  const chars = text.toLowerCase().replace(/[\s|]/g, '').split('')
  if (chars.length > STEPS)
    throw new Error(`${chars.length} steps; the maximum is ${STEPS}`)
  return Array.from({ length: STEPS }, (_, s) => {
    const ch = chars[s] ?? '.'
    const v = read(ch)
    if (!Number.isInteger(v) || v < 0)
      throw new Error(`'${ch}' is not a ${row} step; use ${says}`)
    return v
  })
}
