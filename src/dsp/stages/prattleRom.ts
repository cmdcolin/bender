import { ALLOPHONES, type Allophone } from '../../prattle.ts'

// Prattle's two ROMs, laid out the way the chip reads them. The frame ROM holds
// every allophone as a run of frames, each frame a handful of small codes:
// energy, pitch, and ten reflection coefficients. The coefficient ROM turns a
// code into the 12-bit word the lattice multiplies by, 1.0 at 1024, so a data
// line held high can push a coefficient past one.
//
// Both are worked out here once, from formant targets, the way a speech lab
// would have built the masks: five resonances multiplied into one polynomial,
// stepped down to reflection coefficients, and each one rounded onto a table
// a few bits wide.

export const CHIP_HZ = 8000
export const FRAME_SAMPLES = 200
export const INTERP_STEPS = 8
export const N_K = 10
export const K_BITS = [5, 5, 4, 4, 4, 4, 4, 3, 3, 3] as const
export const ENERGY_BITS = 5
export const PITCH_BITS = 6

export const BLOCK_WORDS = 32
export const ENERGY_BLOCK = 10
export const PITCH_BLOCK = 11
export const CHIRP_BLOCK = 13
export const COEF_ADDR_LINES = 9
export const COEF_DATA_LINES = 12
export const COEF_ONE = 1024
const COEF_WORDS = 1 << COEF_ADDR_LINES
const ERASED = 0xfff

const PITCH_LO_HZ = 60
const PITCH_STEPS_PER_OCTAVE = 24
export const BASE_PITCH = 20

export const CHIRP_LEN = 48

const TARGET_RMS = 0.3
const E_MIN = 0.0005
const E_MAX = 1.9

type Pole = readonly [hz: number, bw: number]

interface Target {
  poles: readonly Pole[]
  amp: number
  voiced: boolean
  pitch: number
}

type Run = readonly (readonly [Target, number])[]

const HIGH: readonly Pole[] = [
  [3300, 250],
  [3750, 300],
]

const shape = (f1: number, f2: number, f3: number, wide = 1): Pole[] => [
  [f1, 80 * wide],
  [f2, 100 * wide],
  [f3, 140 * wide],
  ...HIGH,
]

const voiced = (poles: readonly Pole[], amp: number, pitch = 0): Target => ({
  poles,
  amp,
  voiced: true,
  pitch,
})

const hiss = (poles: readonly Pole[], amp: number): Target => ({
  poles,
  amp,
  voiced: false,
  pitch: 0,
})

const NEUTRAL = shape(500, 1500, 2500)
const SILENT: Target = { poles: NEUTRAL, amp: 0, voiced: false, pitch: 0 }

const FLAT: Pole[] = [
  [700, 1400],
  [1500, 1400],
  [2400, 1400],
  [3200, 1400],
  [3800, 1400],
]
const S_POLES: Pole[] = [
  [1000, 1500],
  [2200, 1000],
  [3000, 600],
  [3500, 450],
  [3850, 500],
]
const SH_POLES: Pole[] = [
  [600, 900],
  [1800, 400],
  [2500, 220],
  [3300, 400],
  [3800, 500],
]
const T_POLES: Pole[] = [
  [700, 900],
  [1800, 600],
  [2800, 400],
  [3600, 300],
  [3900, 300],
]
const K_POLES: Pole[] = [
  [500, 700],
  [1900, 250],
  [2700, 450],
  [3400, 600],
  [3800, 600],
]
const ASPIRATE = shape(500, 1500, 2500, 3)

/** A vowel's frames, its pitch falling a step over the last of them. */
function vowel(f1: number, f2: number, f3: number, frames: number): Run {
  const poles = shape(f1, f2, f3)
  return [
    [voiced(poles, 1, 1), Math.ceil(frames / 2)],
    [voiced(poles, 0.95, 0), Math.max(frames - Math.ceil(frames / 2) - 1, 0)],
    [voiced(poles, 0.8, -1), 1],
  ]
}

function glide(
  from: readonly [number, number, number],
  to: readonly [number, number, number],
  frames: number,
): Run {
  const run: [Target, number][] = []
  for (let i = 0; i < frames; i++) {
    const t = frames === 1 ? 1 : i / (frames - 1)
    const at = (j: number) => from[j]! + (to[j]! - from[j]!) * t
    run.push([
      voiced(shape(at(0), at(1), at(2)), 1, i < frames / 2 ? 1 : -1),
      1,
    ])
  }
  return run
}

const stop = (burst: readonly Pole[], amp: number, aspirate: number): Run => [
  [SILENT, 2],
  [hiss(burst, amp), 1],
  [hiss(ASPIRATE, aspirate), 1],
]

const voicedStop = (bar: readonly Pole[], burst: readonly Pole[]): Run => [
  [voiced(bar, 0.15), 1],
  [hiss(burst, 0.25), 1],
]

const SPECS: Record<Allophone, Run> = {
  PA: [[SILENT, 1]],
  PA2: [[SILENT, 4]],
  IY: vowel(270, 2290, 3010, 5),
  IH: vowel(390, 1990, 2550, 4),
  EH: vowel(530, 1840, 2480, 4),
  AE: vowel(660, 1720, 2410, 6),
  AA: vowel(730, 1090, 2440, 6),
  AH: vowel(620, 1190, 2390, 4),
  AO: vowel(570, 840, 2410, 6),
  UH: vowel(440, 1020, 2240, 4),
  UW: vowel(300, 870, 2240, 5),
  ER: vowel(490, 1350, 1690, 5),
  AX: vowel(500, 1500, 2500, 2),
  UX: vowel(320, 1100, 2240, 2),
  IX: vowel(400, 1900, 2500, 2),
  EY: glide([480, 1900, 2500], [300, 2200, 2900], 6),
  AY: glide([750, 1150, 2450], [350, 2100, 2800], 7),
  OY: glide([570, 840, 2410], [350, 2000, 2700], 6),
  AW: glide([750, 1150, 2450], [400, 900, 2300], 7),
  OW: glide([540, 950, 2400], [350, 800, 2300], 6),
  YU: glide([280, 2200, 2950], [300, 900, 2240], 6),
  AR: glide([730, 1090, 2440], [450, 1250, 1600], 6),
  OR: glide([570, 840, 2410], [450, 1150, 1600], 6),
  EHR: glide([530, 1840, 2480], [450, 1350, 1650], 6),
  EL: glide([500, 1300, 2500], [400, 850, 2700], 4),
  L: [[voiced(shape(380, 900, 2700), 0.6), 2]],
  R: [[voiced(shape(420, 1250, 1550), 0.6), 2]],
  W: [[voiced(shape(300, 700, 2200), 0.55), 2]],
  Y: [[voiced(shape(280, 2200, 2950), 0.55), 2]],
  WH: [
    [hiss(shape(300, 700, 2200, 3), 0.2), 1],
    [voiced(shape(300, 700, 2200), 0.5), 1],
  ],
  M: [[voiced(shape(250, 1100, 2200, 2), 0.4), 3]],
  N: [[voiced(shape(250, 1600, 2600, 2), 0.4), 3]],
  NG: [[voiced(shape(250, 2100, 2700, 2), 0.4), 3]],
  F: [[hiss(FLAT, 0.16), 4]],
  TH: [[hiss(FLAT, 0.12), 3]],
  S: [[hiss(S_POLES, 0.45), 5]],
  SH: [[hiss(SH_POLES, 0.45), 5]],
  HH: [[hiss(ASPIRATE, 0.22), 2]],
  V: [[voiced(FLAT, 0.22), 3]],
  DH: [[voiced(shape(300, 1400, 2500, 2), 0.25), 2]],
  Z: [
    [voiced(S_POLES, 0.25), 2],
    [hiss(S_POLES, 0.35), 2],
  ],
  ZH: [
    [voiced(SH_POLES, 0.25), 2],
    [hiss(SH_POLES, 0.3), 2],
  ],
  P: stop(FLAT, 0.3, 0.15),
  T: stop(T_POLES, 0.4, 0.15),
  K: stop(K_POLES, 0.45, 0.15),
  PP: [...stop(FLAT, 0.3, 0.15), [hiss(ASPIRATE, 0.1), 2]],
  TT: [...stop(T_POLES, 0.4, 0.15), [hiss(ASPIRATE, 0.1), 2]],
  KK: [...stop(K_POLES, 0.45, 0.15), [hiss(ASPIRATE, 0.1), 2]],
  B: voicedStop(shape(250, 800, 2200, 2), FLAT),
  D: voicedStop(shape(250, 1600, 2600, 2), T_POLES),
  G: voicedStop(shape(250, 1900, 2600, 2), K_POLES),
  CH: [
    [SILENT, 2],
    [hiss(SH_POLES, 0.5), 3],
  ],
  JH: [
    [voiced(shape(250, 1700, 2600, 2), 0.15), 1],
    [voiced(SH_POLES, 0.25), 1],
    [hiss(SH_POLES, 0.3), 2],
  ],
  DX: [[voiced(shape(300, 1600, 2600, 2), 0.3), 1]],
}

/** The ten-pole polynomial of a set of resonances, a[0] = 1. */
export function polynomial(poles: readonly Pole[]): Float64Array {
  let a = Float64Array.of(1)
  for (const [hz, bw] of poles) {
    const r = Math.exp((-Math.PI * bw) / CHIP_HZ)
    const c = -2 * r * Math.cos((2 * Math.PI * hz) / CHIP_HZ)
    const next = new Float64Array(a.length + 2)
    a.forEach((v, i) => {
      next[i]! += v
      next[i + 1]! += c * v
      next[i + 2]! += r * r * v
    })
    a = next
  }
  return a
}

/** Reflection coefficients of a stable all-pole polynomial, k[0] first. */
export function stepDown(poly: Float64Array): Float64Array {
  const order = poly.length - 1
  const k = new Float64Array(order)
  let a = Float64Array.from(poly)
  for (let i = order; i >= 1; i--) {
    const ki = a[i]!
    k[i - 1] = ki
    const scale = 1 / (1 - ki * ki)
    const next = new Float64Array(i)
    next[0] = 1
    for (let j = 1; j < i; j++) next[j] = (a[j]! - ki * a[i - j]!) * scale
    a = next
  }
  return k
}

/** The polynomial a set of reflection coefficients makes, a[0] = 1. */
export function stepUp(k: ArrayLike<number>): Float64Array {
  let a = Float64Array.of(1)
  for (let i = 0; i < k.length; i++) {
    const ki = k[i]!
    const next = new Float64Array(i + 2)
    for (let j = 0; j <= i + 1; j++)
      next[j] = (a[j] ?? 0) + ki * (a[i + 1 - j] ?? 0)
    a = next
  }
  return a
}

export const PITCH_PERIOD = Uint16Array.from(
  { length: 1 << PITCH_BITS },
  (_, i) =>
    i === 0
      ? 0
      : Math.round(
          CHIP_HZ / (PITCH_LO_HZ * 2 ** ((i - 1) / PITCH_STEPS_PER_OCTAVE)),
        ),
)

export const ENERGY = Float64Array.from({ length: 1 << ENERGY_BITS }, (_, i) =>
  i === 0 ? 0 : E_MIN * (E_MAX / E_MIN) ** ((i - 1) / ((1 << ENERGY_BITS) - 2)),
)

// One pulse of the voiced source: a glottal flow pulse, opening slowly and
// slamming shut, taken as its slope, with the energy of one unit so the
// energy code alone sets how loud a frame is.
const OPEN = 24
const CLOSE = 10
const flow = (n: number) =>
  n < 0
    ? 0
    : n < OPEN
      ? 0.5 * (1 - Math.cos((Math.PI * n) / OPEN))
      : n < OPEN + CLOSE
        ? Math.cos((Math.PI * (n - OPEN)) / (2 * CLOSE))
        : 0

export const CHIRP = (() => {
  const c = Float64Array.from(
    { length: CHIRP_LEN },
    (_, n) => flow(n) - flow(n - 1),
  )
  const e = Math.sqrt(c.reduce((s, v) => s + v * v, 0))
  return c.map(v => v / e)
})()

const nearestIn = (table: ArrayLike<number>, v: number) => {
  let best = 0
  for (let i = 1; i < table.length; i++)
    if (Math.abs(table[i]! - v) < Math.abs(table[best]! - v)) best = i
  return best
}

const word = (v: number) =>
  Math.round(Math.min(Math.max(v, -2), 1.999) * COEF_ONE) & ERASED

export interface Rom {
  /** The coefficient ROM, 12-bit words in blocks of 32. */
  coef: Uint16Array
  /** The k tables, as the lattice multiplies by them. */
  kTable: Float64Array[]
  frameEnergy: Uint8Array
  framePitch: Uint8Array
  /** N_K codes a frame. */
  frameK: Uint8Array
  /** Each allophone's first frame, and one past its last. */
  start: Uint16Array
  end: Uint16Array
  frames: number
  /** The targets each frame was built from, for a test to hold it to. */
  targets: Target[]
}

export function buildRom(): Rom {
  const targets: Target[] = []
  const start = new Uint16Array(ALLOPHONES.length)
  const end = new Uint16Array(ALLOPHONES.length)
  ALLOPHONES.forEach((name, a) => {
    start[a] = targets.length
    for (const [target, count] of SPECS[name])
      for (let i = 0; i < count; i++) targets.push(target)
    end[a] = targets.length
  })
  const frames = targets.length
  const raw = targets.map(t => stepDown(polynomial(t.poles)))

  const kTable = K_BITS.map((bits, s) => {
    const values = raw.map(k => k[s]!)
    const lo = Math.asin(Math.max(Math.min(...values), -0.995))
    const hi = Math.asin(Math.min(Math.max(...values), 0.995))
    const n = 1 << bits
    return Float64Array.from({ length: n }, (_, j) =>
      Math.sin(lo + ((hi - lo) * j) / (n - 1)),
    )
  })

  const frameK = new Uint8Array(frames * N_K)
  const frameEnergy = new Uint8Array(frames)
  const framePitch = new Uint8Array(frames)
  targets.forEach((t, f) => {
    let gain = 1
    for (let s = 0; s < N_K; s++) {
      const code = nearestIn(kTable[s]!, raw[f]![s]!)
      frameK[f * N_K + s] = code
      const k = kTable[s]![code]!
      gain *= 1 - k * k
    }
    const pitch = t.voiced ? BASE_PITCH + t.pitch : 0
    framePitch[f] = pitch
    const source = t.voiced ? Math.sqrt(PITCH_PERIOD[pitch]!) : 1
    const e = t.amp * TARGET_RMS * Math.sqrt(gain) * source
    frameEnergy[f] = t.amp === 0 ? 0 : nearestLog(e)
  })

  const coef = new Uint16Array(COEF_WORDS).fill(ERASED)
  kTable.forEach((table, s) =>
    table.forEach((v, j) => {
      coef[s * BLOCK_WORDS + j] = word(v)
    }),
  )
  ENERGY.forEach((v, j) => {
    coef[ENERGY_BLOCK * BLOCK_WORDS + j] = word(v)
  })
  PITCH_PERIOD.forEach((v, j) => {
    coef[PITCH_BLOCK * BLOCK_WORDS + j] = v
  })
  CHIRP.forEach((v, j) => {
    coef[CHIRP_BLOCK * BLOCK_WORDS + j] = word(v)
  })
  return {
    coef,
    kTable,
    frameEnergy,
    framePitch,
    frameK,
    start,
    end,
    frames,
    targets,
  }
}

function nearestLog(e: number) {
  let best = 1
  for (let i = 1; i < ENERGY.length; i++)
    if (
      Math.abs(Math.log(ENERGY[i]! / e)) < Math.abs(Math.log(ENERGY[best]! / e))
    )
      best = i
  return best
}

export const ROM = buildRom()

/** A coefficient word read as the signed number it is, 1.0 at COEF_ONE. */
export const signed = (w: number) => (w & 0x800 ? w - 0x1000 : w) / COEF_ONE
