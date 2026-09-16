// The talking pet's speech data: an LPC-10 frame format in the style of the
// late-70s speech chips, the quantizer tables it indexes, and a phrase ROM
// built at load from formant targets.
//
// A frame is 25 ms of the chip's 8 kHz clock. Bits, most significant first:
//   energy 4 · 0 is a silent frame, 15 ends the phrase
//   repeat 1 · reuse the last frame's K1–K10
//   pitch  6 · 0 is unvoiced (noise); otherwise an index into PERIOD
//   K1–K4  5 5 4 4
//   K5–K10 4 4 4 3 3 3 · voiced frames only; unvoiced frames zero them

export const CHIP_HZ = 8000
export const FRAME = 200
export const SUBFRAMES = 8
export const SUBFRAME = FRAME / SUBFRAMES
export const N_K = 10
export const K_BITS = [5, 5, 4, 4, 4, 4, 4, 3, 3, 3] as const
export const ENERGY_BITS = 4
export const PITCH_BITS = 6
export const E_STOP = (1 << ENERGY_BITS) - 1
export const PET_ADDR_LINES = 12
export const PET_DATA_LINES = 8
export const ROM_BYTES = 1 << PET_ADDR_LINES

// Evenly spaced in arcsine, so the steps crowd toward ±1 where a reflection
// coefficient moves a formant furthest.
const arcsine = (bits: number, lo: number, hi: number) => {
  const n = 1 << bits
  const a = Math.asin(lo)
  const b = Math.asin(hi)
  return Float32Array.from({ length: n }, (_, i) =>
    Math.sin(a + ((b - a) * i) / (n - 1)),
  )
}

export const K_TABLES: readonly Float32Array[] = [
  arcsine(5, -0.6, 0.998),
  arcsine(5, -0.5, 0.99),
  arcsine(4, -0.92, 0.95),
  arcsine(4, -0.6, 0.85),
  arcsine(4, -0.8, 0.8),
  arcsine(4, -0.7, 0.6),
  arcsine(4, -0.7, 0.7),
  arcsine(3, -0.5, 0.35),
  arcsine(3, -0.3, 0.8),
  arcsine(3, -0.2, 0.7),
]

/** Excitation amplitude per energy code; 0 and E_STOP are silent. */
export const ENERGY = Float32Array.from({ length: 1 << ENERGY_BITS }, (_, i) =>
  i === 0 || i === E_STOP ? 0 : 0.0015 * Math.pow(0.25 / 0.0015, (i - 1) / 13),
)

/** Pitch period in chip samples per pitch code; 0 is unvoiced. */
export const PERIOD = Float32Array.from({ length: 1 << PITCH_BITS }, (_, i) =>
  i === 0 ? 0 : 10 * Math.pow(16, (i - 1) / 62),
)

/** One glottal pulse, unit energy. */
export const CHIRP = (() => {
  const c = Float32Array.from({ length: 24 }, (_, n) =>
    n === 0
      ? 0
      : Math.exp(-n / 3.5) * Math.cos(Math.PI * n * (0.12 + 0.02 * n)),
  )
  let e = 0
  for (const v of c) e += v * v
  const g = 1 / Math.sqrt(e)
  for (let i = 0; i < c.length; i++) c[i]! *= g
  return c
})()

interface Phoneme {
  f: readonly number[]
  b?: readonly number[]
  voiced: boolean
  amp: number
}

const BW = [70, 90, 150, 200, 250]
const WIDE = [300, 350, 300, 250, 250]
const HI = [3400, 3750]

const PH = {
  AA: { f: [730, 1090, 2440, ...HI], voiced: true, amp: 1 },
  AE: { f: [660, 1720, 2410, ...HI], voiced: true, amp: 1 },
  AH: { f: [640, 1190, 2390, ...HI], voiced: true, amp: 0.9 },
  EH: { f: [530, 1840, 2480, ...HI], voiced: true, amp: 0.9 },
  IH: { f: [390, 1990, 2550, ...HI], voiced: true, amp: 0.8 },
  IY: { f: [270, 2290, 3010, ...HI], voiced: true, amp: 0.8 },
  OW: { f: [570, 840, 2410, ...HI], voiced: true, amp: 0.95 },
  UW: { f: [300, 870, 2240, ...HI], voiced: true, amp: 0.8 },
  ER: { f: [490, 1350, 1690, ...HI], voiced: true, amp: 0.8 },
  L: { f: [360, 1300, 2700, ...HI], voiced: true, amp: 0.55 },
  W: { f: [300, 610, 2200, ...HI], voiced: true, amp: 0.5 },
  Y: { f: [260, 2070, 3020, ...HI], voiced: true, amp: 0.5 },
  R: { f: [420, 1300, 1600, ...HI], voiced: true, amp: 0.55 },
  M: {
    f: [250, 1100, 2200, ...HI],
    b: [60, 200, 300, 300, 300],
    voiced: true,
    amp: 0.35,
  },
  N: {
    f: [250, 1700, 2600, ...HI],
    b: [60, 200, 300, 300, 300],
    voiced: true,
    amp: 0.35,
  },
  NG: {
    f: [250, 2300, 2750, ...HI],
    b: [60, 200, 300, 300, 300],
    voiced: true,
    amp: 0.3,
  },
  D: { f: [300, 1700, 2600, ...HI], voiced: true, amp: 0.3 },
  G: { f: [300, 1990, 2850, ...HI], voiced: true, amp: 0.3 },
  H: { f: [640, 1190, 2390, ...HI], b: WIDE, voiced: false, amp: 0.3 },
  S: {
    f: [400, 1600, 2600, 3300, 3800],
    b: [400, 400, 200, 150, 200],
    voiced: false,
    amp: 0.35,
  },
  SH: {
    f: [300, 1840, 2750, 3300, 3750],
    b: [400, 300, 200, 200, 250],
    voiced: false,
    amp: 0.4,
  },
  K: { f: [300, 1990, 2850, ...HI], b: WIDE, voiced: false, amp: 0.45 },
  T: { f: [400, 1600, 2600, ...HI], b: WIDE, voiced: false, amp: 0.4 },
  P: { f: [400, 1100, 2150, ...HI], b: WIDE, voiced: false, amp: 0.3 },
  _: { f: [500, 1500, 2500, ...HI], voiced: false, amp: 0 },
} satisfies Record<string, Phoneme>

type Ph = keyof typeof PH
/** phoneme, frames, pitch at its start, pitch at its end */
type Seg = readonly [Ph, number, number?, number?]

// The pet's formants sit above an adult's.
const FORMANT_SCALE = 1.1

export const PHRASE = {
  hello: 0,
  'dah noh loo': 1,
  'koh mah': 2,
  hungry: 3,
  'yum yum': 4,
  sleep: 5,
  laugh: 6,
  yawn: 7,
  'la la loo': 8,
  'uh oh': 9,
  wee: 10,
  snore: 11,
  'may may': 12,
  nighty: 13,
} as const

export const PHRASE_NAMES = Object.keys(PHRASE)

const SCRIPT: readonly (readonly Seg[])[] = [
  [
    ['H', 2, 330],
    ['EH', 6, 360],
    ['L', 3, 390],
    ['OW', 11, 380, 290],
  ],
  [
    ['D', 1, 300],
    ['AA', 6, 330],
    ['N', 3, 360],
    ['OW', 6, 360],
    ['L', 3, 300],
    ['UW', 9, 290, 260],
  ],
  [
    ['K', 2, 380],
    ['OW', 7, 390],
    ['M', 3, 330],
    ['AA', 11, 320, 280],
  ],
  [
    ['H', 2, 320],
    ['AH', 6, 320],
    ['NG', 3, 300],
    ['G', 1, 290],
    ['R', 3, 290],
    ['IY', 11, 280, 230],
  ],
  [
    ['Y', 2, 360],
    ['AH', 5, 380],
    ['M', 4, 340],
    ['_', 2],
    ['Y', 2, 400],
    ['AH', 5, 420],
    ['M', 6, 360, 330],
  ],
  [
    ['S', 4, 260],
    ['L', 3, 260],
    ['IY', 9, 250, 210],
    ['P', 2, 210],
  ],
  [
    ['H', 2, 450],
    ['IY', 4, 470, 430],
    ['_', 2],
    ['H', 2, 440],
    ['IY', 4, 450, 410],
    ['_', 2],
    ['H', 2, 420],
    ['IY', 7, 430, 360],
  ],
  [
    ['AA', 5, 420, 380],
    ['AH', 12, 380, 240],
    ['OW', 9, 240, 180],
    ['M', 7, 180, 150],
  ],
  [
    ['L', 2, 330],
    ['AA', 7, 330],
    ['L', 2, 392],
    ['AA', 7, 392],
    ['L', 2, 440],
    ['UW', 13, 440, 430],
  ],
  [
    ['AH', 6, 400, 420],
    ['_', 2],
    ['OW', 11, 330, 280],
  ],
  [
    ['W', 3, 450],
    ['IY', 13, 480, 620],
  ],
  [
    ['N', 10, 110, 100],
    ['_', 3],
    ['SH', 12],
    ['_', 4],
  ],
  [
    ['M', 2, 420],
    ['EH', 4, 440],
    ['IY', 3, 460],
    ['_', 1],
    ['M', 2, 470],
    ['EH', 4, 490],
    ['IY', 6, 500, 440],
  ],
  [
    ['N', 2, 300],
    ['AA', 5, 300],
    ['IY', 3, 290],
    ['T', 1],
    ['IY', 8, 260, 220],
  ],
]

const LOUDNESS = 0.45
const LOG_ENERGY = Array.from(ENERGY, v => Math.log(v + 1e-9))

/** Five resonators multiplied out and stepped down to reflection coefficients. */
export function formantsToK(
  f: readonly number[],
  b: readonly number[],
  out = new Float64Array(N_K),
): Float64Array {
  let poly = [1]
  for (let r = 0; r < 5; r++) {
    const hz = Math.min(f[r]! * FORMANT_SCALE, CHIP_HZ / 2 - 150)
    const radius = Math.exp((-Math.PI * b[r]!) / CHIP_HZ)
    const c1 = -2 * radius * Math.cos((2 * Math.PI * hz) / CHIP_HZ)
    const c2 = radius * radius
    const next = Array.from({ length: poly.length + 2 }, () => 0)
    for (let i = 0; i < poly.length; i++) {
      next[i]! += poly[i]!
      next[i + 1]! += c1 * poly[i]!
      next[i + 2]! += c2 * poly[i]!
    }
    poly = next
  }
  return stepDown(poly, out)
}

/** Reflection coefficients of a monic all-pole polynomial, K1 first. */
export function stepDown(
  poly: readonly number[],
  out = new Float64Array(N_K),
): Float64Array {
  let a = poly.slice()
  for (let m = N_K; m >= 1; m--) {
    const k = a[m]!
    out[m - 1] = k
    const d = 1 - k * k
    const next = a.slice(0, m)
    for (let i = 1; i < m; i++) next[i] = (a[i]! - k * a[m - i]!) / d
    a = next
  }
  return out
}

const nearest = (table: ArrayLike<number>, v: number, from = 0, to = -1) => {
  let best = from
  const end = to < 0 ? table.length : to
  for (let i = from; i < end; i++)
    if (Math.abs(table[i]! - v) < Math.abs(table[best]! - v)) best = i
  return best
}

class BitWriter {
  bytes: number[] = []
  private bit = 0

  put(value: number, bits: number) {
    for (let i = bits - 1; i >= 0; i--) {
      if (this.bit === 0) this.bytes.push(0)
      if ((value >> i) & 1)
        this.bytes[this.bytes.length - 1]! |= 1 << (7 - this.bit)
      this.bit = (this.bit + 1) & 7
    }
  }

  align() {
    this.bit = 0
  }
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

function encode(script: readonly Seg[], w: BitWriter) {
  const k = new Float64Array(N_K)
  const f = [0, 0, 0, 0, 0]
  const bw = [0, 0, 0, 0, 0]
  let prevK: number[] | null = null
  let prevPh: Phoneme = PH._
  let hz = 300
  for (const [name, frames, start, end] of script) {
    const ph: Phoneme = PH[name]
    const from = start ?? hz
    const to = end ?? from
    for (let j = 0; j < frames; j++) {
      const blend = Math.min((j + 1) / Math.min(frames, 2), 1)
      for (let r = 0; r < 5; r++) {
        f[r] = lerp(prevPh.f[r]!, ph.f[r]!, blend)
        bw[r] = lerp((prevPh.b ?? BW)[r]!, (ph.b ?? BW)[r]!, blend)
      }
      const amp = prevPh.amp === 0 ? ph.amp : lerp(prevPh.amp, ph.amp, blend)
      hz = frames > 1 ? lerp(from, to, j / (frames - 1)) : from
      if (amp === 0) {
        w.put(0, ENERGY_BITS)
        prevK = null
        continue
      }
      formantsToK(f, bw, k)
      const count = ph.voiced ? N_K : 4
      const idx: number[] = []
      let gain = 1
      for (let i = 0; i < count; i++) {
        idx.push(nearest(K_TABLES[i]!, k[i]!))
        const q = K_TABLES[i]![idx[i]!]!
        gain *= 1 - q * q
      }
      const noise = ph.voiced ? 1 : 0.5
      const e = nearest(
        LOG_ENERGY,
        Math.log(LOUDNESS * amp * noise * Math.sqrt(gain)),
        1,
        E_STOP,
      )
      const pitch = ph.voiced ? nearest(PERIOD, CHIP_HZ / hz, 1) : 0
      const repeat =
        prevK !== null &&
        prevK.length === idx.length &&
        prevK.every((v, i) => v === idx[i])
      w.put(e, ENERGY_BITS)
      w.put(repeat ? 1 : 0, 1)
      w.put(pitch, PITCH_BITS)
      if (!repeat) for (let i = 0; i < count; i++) w.put(idx[i]!, K_BITS[i]!)
      prevK = idx
    }
    prevPh = ph
  }
  w.put(E_STOP, ENERGY_BITS)
  w.align()
}

function build() {
  const w = new BitWriter()
  const starts: number[] = []
  for (const script of SCRIPT) {
    starts.push(w.bytes.length)
    encode(script, w)
  }
  if (w.bytes.length > ROM_BYTES)
    throw new Error(`pet ROM is ${w.bytes.length} bytes, over ${ROM_BYTES}`)
  // The data fills the bottom of the address space and repeats above it, the
  // way a small ROM on a partly decoded bus reads.
  const rom = new Uint8Array(ROM_BYTES)
  for (let i = 0; i < ROM_BYTES; i++) rom[i] = w.bytes[i % w.bytes.length]!
  return { rom, starts: Uint16Array.from(starts), used: w.bytes.length }
}

const built = build()

export const PET_ROM = built.rom
export const PHRASE_START = built.starts
export const ROM_USED = built.used
