import { mulberry32 } from '../util/rng'

// The sample ROM of an eight-bit home keyboard, cut in code rather than
// recorded. One short waveform a voice: an attack segment, then a loop the
// address counter drops back into and stays in for as long as the key is down.
//
// Nothing in here is a sample. Every voice is a handful of partials and an
// attack shape, rendered once when the chip is built — which is also what makes
// the loop seamless by construction rather than by a crossfade. Each partial
// runs a whole number of cycles over the loop, so the word after the last one
// in it *is* the first one in it, to the bit. A recipe that wanted a frequency
// between two of those cycles does not get one; it gets the nearest, and the
// loop stays a loop.
//
// The clock is the other half of the sound. Cut at a fifth of the board's own
// rate, with nothing interpolating on the way out, the part images everything
// it holds back down over the top of itself — which is the hiss and the grit a
// keyboard like this has instead of a filter.

/** What the ROM was cut at. Near enough the part this is standing in for. */
export const ROM_HZ = 9900

/** The note the ROM holds, read back at the rate it was cut at. */
export const ROOT_HZ = 110

/** ROM words one cycle of the root takes, and it is a whole number on purpose:
    a loop is a count of cycles, and a count of cycles has to be a count of
    words. */
export const ROM_PER_CYCLE = ROM_HZ / ROOT_HZ

// The address counter's wires. Twelve of them cover the wave ROM; the two above
// exist because the sample memory is the same bus and holds a second and a half
// rather than a waveform, so on every voice but `sampled` the top pair are
// wires nothing ever drives high.
export const PCM_ADDR_LINES = 14
export const PCM_DATA_LINES = 8

/** How much the sample memory holds, in seconds of its own clock. */
export const SAMPLE_SECS = 1.4

// The rate register: twelve bits of *divider*, which is the whole of why a
// keyboard like this is sharp at the top and dead in tune at the bottom. The
// counter that clocks the ROM is one crystal divided by this number, so a step
// of one is worth a fraction of a semitone down where the number is four
// thousand and an eighth of one up where it is ninety.
export const RATE_BITS = 12
export const RATE_MAX = (1 << RATE_BITS) - 1
/** The divider chain's numerator, in hertz. */
export const RATE_NUM = 220_000

/** Semitones above the toy's bottom A as a frequency, as the FM chip has it. */
export const noteHz = (note: number) => 220 * Math.pow(2, note / 12)

/** What the driver writes into the rate register for a note. */
export const rateReg = (hz: number) =>
  Math.min(Math.max(Math.round(RATE_NUM / hz), 1), RATE_MAX)

/** And what the chip plays, which is not quite what it was asked for. */
export const regHz = (reg: number) => RATE_NUM / reg

export const PCM_VOICE_NAMES = [
  'strings',
  'choir',
  'pipe organ',
  'e.piano',
  'flute',
  'brass',
  'vibes',
  'chime',
  'music box',
  'glass pad',
  'synth pad',
  'sampled',
]

/** The one voice that reads no ROM: whatever is threaded on the sampler. */
export const SAMPLED = PCM_VOICE_NAMES.indexOf('sampled')

export const PCM_ENV_NAMES = ['piano', 'organ', 'pad', 'chime']
export const PCM_VIBRATO_NAMES = ['off', 'vibrato', 'delayed']
export const PCM_CHORD_NAMES = [
  'off',
  'maj7',
  'min7',
  'min9',
  'sus4',
  'add9',
  'power',
]

// What one key plays with the chord button down. The voicings are four notes
// or fewer because the chip has four voices and no more — press a key with a
// four-note chord selected and the whole part is that key.
export const CHORDS: readonly (readonly number[])[] = [
  [0],
  [0, 4, 7, 11],
  [0, 3, 7, 10],
  [0, 3, 10, 14],
  [0, 5, 7, 12],
  [0, 4, 7, 14],
  [0, 7, 12],
]

/** One voice's attack and loop, as the address counter walks them. */
export interface PcmWave {
  name: string
  /** eight-bit words, signed — the DAC's own format */
  data: Int8Array
  loopStart: number
  loopEnd: number
}

// A partial, as a recipe writes one: how fast against the root, how loud, and
// how many whole cycles off the root's count it runs. The offset is where the
// beating comes from — one cycle over a loop of forty is a shimmer at a few
// hertz, and it costs nothing, because it is still a whole number of cycles.
type Partial = readonly [ratio: number, amp: number, offset?: number]

interface Recipe {
  name: string
  /** cycles of the root the loop runs for */
  cycles: number
  /** how long the attack segment ahead of the loop is, in seconds */
  attack: number
  partials: readonly Partial[]
  /** partials only in the attack, gone by the time the loop starts */
  chiff?: readonly Partial[]
  /** how the attack swells: 1 is a straight ramp, higher is slower off the
      bottom, and a small fraction is a keyboard that starts at once */
  swell?: number
  /** breath, fading out with the chiff */
  noise?: number
}

// A saw, as a stack of harmonics. The ratios are whole numbers and the
// amplitudes are the reciprocal, so the only thing a recipe has to say is how
// far up to go and which copy of the stack this is.
const saw = (n: number, amp: number, offset = 0): Partial[] =>
  Array.from({ length: n }, (_, i) => [i + 1, amp / (i + 1), offset * (i + 1)])

/** The same again with the even harmonics taken out: a stopped pipe. */
const odd = (n: number, amp: number): Partial[] =>
  Array.from({ length: n }, (_, i) => [2 * i + 1, amp / (2 * i + 1), 0])

// Three saws a hair apart. The fundamental of each stack is where a detune is
// most audible and least wanted, so the copies are offset per harmonic rather
// than per stack: the bottom of the note locks and everything above it beats,
// which is what a bank of dividers through one chorus circuit came out as.
const STRINGS: readonly Partial[] = [
  ...saw(10, 0.9),
  ...saw(10, 0.55, 1).slice(1),
  ...saw(10, 0.55, -1).slice(1),
]

const RECIPES: readonly Recipe[] = [
  {
    name: 'strings',
    cycles: 32,
    attack: 0.1,
    swell: 2.2,
    partials: STRINGS,
  },
  {
    // Vowel rather than waveform: three formants held up out of an otherwise
    // dull harmonic series, which is the whole of how a chip with no filter
    // makes a choir.
    name: 'choir',
    cycles: 24,
    attack: 0.15,
    swell: 1.8,
    partials: [
      [1, 1],
      [2, 0.5],
      [3, 0.62],
      [4, 0.28],
      [5, 0.42, 1],
      [6, 0.2],
      [7, 0.14],
      [8, 0.34],
      [9, 0.22, -1],
      [10, 0.12],
      [12, 0.16],
      [14, 0.08],
    ],
  },
  {
    // Drawbars: a fundamental, its octaves and a twelfth, with the chiff a real
    // pipe takes a moment to settle out of.
    name: 'pipe organ',
    cycles: 12,
    attack: 0.03,
    swell: 0.4,
    partials: [
      [1, 1],
      [2, 0.7],
      [3, 0.45],
      [4, 0.5],
      [6, 0.22],
      [8, 0.3],
      ...odd(6, 0.18).slice(2),
    ],
    chiff: [
      [8, 0.5],
      [11, 0.4],
      [16, 0.3],
    ],
    noise: 0.25,
  },
  {
    // A tine and the bar behind it: a fundamental with an inharmonic ring an
    // octave and a half up, which the piano envelope then takes away at two
    // different rates because the loop holds only the fundamental.
    name: 'e.piano',
    cycles: 24,
    attack: 0.04,
    swell: 0.25,
    partials: [
      [1, 1],
      [2, 0.16],
      [3, 0.07],
      [4.7, 0.09, 1],
    ],
    chiff: [
      [7.3, 0.55],
      [11.8, 0.4],
      [16.4, 0.22],
    ],
  },
  {
    name: 'flute',
    cycles: 20,
    attack: 0.1,
    swell: 1.4,
    partials: [
      [1, 1],
      [2, 0.22],
      [3, 0.07],
      [4, 0.03],
    ],
    chiff: [[2, 0.2]],
    noise: 0.45,
  },
  {
    name: 'brass',
    cycles: 20,
    attack: 0.07,
    swell: 1.1,
    partials: saw(14, 1),
    chiff: [
      [1, 0.3],
      [2, 0.25],
    ],
  },
  {
    // Metal: a bar's partials, which are nothing like a harmonic series, and
    // the pair of them a hair apart that gives a vibraphone its shimmer without
    // any motor in it.
    name: 'vibes',
    cycles: 32,
    attack: 0.015,
    swell: 0.15,
    partials: [
      [1, 1],
      [1, 0.5, 1],
      [3.98, 0.42],
      [10.7, 0.16],
      [17.6, 0.07],
    ],
    chiff: [
      [10.7, 0.4],
      [24.2, 0.3],
    ],
  },
  {
    // A tube bell: partials in no ratio anybody would write down, and two of
    // them one cycle apart over a long loop, so the ring walks in and out of
    // itself at a couple of hertz for as long as it lasts.
    name: 'chime',
    cycles: 40,
    attack: 0.008,
    swell: 0.12,
    partials: [
      [0.5, 0.35],
      [1, 1],
      [1, 0.65, 1],
      [2.76, 0.5],
      [2.76, 0.3, -1],
      [5.4, 0.28],
      [8.93, 0.14],
      [13.34, 0.07],
    ],
    chiff: [
      [8.93, 0.45],
      [13.34, 0.35],
      [19.8, 0.2],
    ],
  },
  {
    name: 'music box',
    cycles: 28,
    attack: 0.005,
    swell: 0.1,
    partials: [
      [1, 1],
      [3.4, 0.3],
      [7.1, 0.16],
      [12.8, 0.08],
      [20.3, 0.04],
    ],
    chiff: [
      [7.1, 0.5],
      [20.3, 0.35],
      [31.5, 0.2],
    ],
  },
  {
    // The pad that is all beating: pairs a cycle apart everywhere, so the loop
    // never arrives at the same place twice inside its own third of a second.
    name: 'glass pad',
    cycles: 32,
    attack: 0.12,
    swell: 2.6,
    partials: [
      [1, 1],
      [1, 0.8, 1],
      [2, 0.4],
      [2, 0.34, -1],
      [3.01, 0.3],
      [3.01, 0.26, 1],
      [5.02, 0.18],
      [5.02, 0.15, -1],
      [7.5, 0.1],
      [9.8, 0.06, 1],
    ],
  },
  {
    // Two dividers and a squarer, pulled apart far enough that the loop is a
    // chord rather than a buzz — which is the whole reason it is the longest
    // one in the ROM.
    name: 'synth pad',
    cycles: 36,
    attack: 0.08,
    swell: 1.6,
    partials: [
      ...saw(9, 0.8),
      ...odd(7, 0.7).map(([r, a]): Partial => [r, a, 1]),
      ...saw(6, 0.45, -1),
    ],
  },
]

/** The rate a partial runs at, as a whole number of cycles over the loop. */
const cyclesOf = (p: Partial, loopCycles: number) =>
  Math.max(1, Math.round(p[0] * loopCycles) + (p[2] ?? 0))

function cut(r: Recipe): PcmWave {
  const loop = r.cycles * ROM_PER_CYCLE
  const attack = Math.round(r.attack * ROM_HZ)
  const total = attack + loop
  const buf = new Float32Array(total)
  const w = (2 * Math.PI) / loop

  for (const p of r.partials) {
    const k = cyclesOf(p, r.cycles)
    const amp = p[1]
    for (let n = 0; n < total; n++) buf[n]! += amp * Math.sin(w * k * n)
  }

  // Everything the attack has that the loop does not, on an envelope that
  // reaches zero exactly where the loop starts. The seam is between the attack
  // and the loop as much as it is across the loop itself.
  const rng = mulberry32(0x5c1d)
  for (let n = 0; n < attack; n++) {
    const fade = 1 - n / attack
    const bite = fade * fade
    for (const p of r.chiff ?? []) {
      buf[n]! += p[1] * bite * Math.sin(w * cyclesOf(p, r.cycles) * n)
    }
    if (r.noise) buf[n]! += r.noise * bite * (rng() * 2 - 1)
  }

  // And the swell, which is the only thing in the ROM that is about level
  // rather than about tone: a bowed voice reaches full inside its attack
  // segment and a struck one is there at once.
  const swell = r.swell ?? 1
  for (let n = 0; n < attack; n++) buf[n]! *= Math.pow(n / attack, swell)

  let peak = 0
  for (const v of buf) peak = Math.max(peak, Math.abs(v))
  const g = peak > 0 ? 127 / peak : 0
  const data = new Int8Array(total)
  for (let n = 0; n < total; n++) {
    data[n] = Math.max(-127, Math.min(127, Math.round(buf[n]! * g)))
  }
  return { name: r.name, data, loopStart: attack, loopEnd: total }
}

/** The whole wave ROM, cut once when the chip is built. */
export const buildPcmRom = (): PcmWave[] => RECIPES.map(cut)
