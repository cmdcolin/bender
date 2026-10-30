import { IDX } from '../../engine/params.ts'
import {
  bandpass,
  highpass,
  lowpass,
  peak,
  response,
  type Biquad,
} from '../util/biquad.ts'
import { Burst } from '../util/burst.ts'
import { DelayLine } from '../util/delayline.ts'
import { coef } from '../util/follower.ts'
import { Halfband, LATENCY, Upsampler } from '../util/halfband.ts'
import { lpCoef } from '../util/onepole.ts'
import { mulberry32, type Rng } from '../util/rng.ts'
import { flushDenormal, softclip } from '../util/softclip.ts'

import type { Ctx, Stage, StereoBlock } from '../stage.ts'

export const AMP_VOICE = { fender: 0, marshall: 1 } as const
export const AMP_VOICE_NAMES = Object.keys(AMP_VOICE)

export const AMP_CAB = { direct: 0, open: 1, closed: 2 } as const
export const AMP_CAB_NAMES = ['direct', 'open 1×12', 'closed 4×12']

const OS = 2

/** The passive tone stack: treble, bass and mid pots (r1 to r3), the slope
    resistor (r4) and three caps. */
export interface StackParts {
  r1: number
  r2: number
  r3: number
  r4: number
  c1: number
  c2: number
  c3: number
}

const FENDER_STACK: StackParts = {
  r1: 250e3,
  r2: 1e6,
  r3: 25e3,
  r4: 56e3,
  c1: 250e-12,
  c2: 20e-9,
  c3: 20e-9,
}

const MARSHALL_STACK: StackParts = {
  r1: 220e3,
  r2: 1e6,
  r3: 25e3,
  r4: 33e3,
  c1: 470e-12,
  c2: 22e-9,
  c3: 22e-9,
}

/** The stack's transfer function in s for treble t, mid m and bass l, each 0 to
    1 (bass as its share of the track in circuit). `amp.test.ts` holds it to a
    node-by-node solve of the netlist. */
export function stackAnalog(p: StackParts, t: number, m: number, l: number) {
  const { r1, r2, r3, r4, c1, c2, c3 } = p
  const k = c1 * c2 * c3
  const b1 = t * c1 * r1 + m * c3 * r3 + l * (c1 + c2) * r2 + (c1 + c2) * r3
  const b2 =
    t * (c1 * c2 + c1 * c3) * r1 * r4 -
    m * m * (c1 + c2) * c3 * r3 * r3 +
    m * (c1 * c3 * r1 * r3 + (c1 + c2) * c3 * r3 * r3) +
    l * (c1 * c2 * r1 * r2 + c1 * c2 * r2 * r4 + c1 * c3 * r2 * r4) +
    l * m * (c1 + c2) * c3 * r2 * r3 +
    c1 * c2 * r1 * r3 +
    c1 * c2 * r3 * r4 +
    c1 * c3 * r3 * r4
  const cubic =
    k * (r3 * r3 * (r1 + r4) * (m - m * m) + l * m * r2 * r3 * (r1 + r4))
  const b3 = cubic + k * (t * r1 * r3 * r4 * (1 - m) + t * l * r1 * r2 * r4)
  const a1 =
    c1 * r1 +
    c1 * r3 +
    c2 * r3 +
    c2 * r4 +
    c3 * r4 +
    m * c3 * r3 +
    l * (c1 + c2) * r2
  const a2 =
    m * (c1 * c3 * r1 * r3 - c2 * c3 * r3 * r4 + (c1 + c2) * c3 * r3 * r3) +
    l * m * (c1 + c2) * c3 * r2 * r3 -
    m * m * (c1 + c2) * c3 * r3 * r3 +
    l * (c1 * c2 * r1 * r2 + (c1 * c2 + c1 * c3 + c2 * c3) * r2 * r4) +
    (c1 * c2 + c1 * c3) * r1 * r4 +
    c1 * c2 * r3 * r4 +
    c1 * c2 * r1 * r3 +
    c1 * c3 * r3 * r4 +
    c2 * c3 * r3 * r4
  const a3 = cubic + k * (r1 * r3 * r4 * (1 - m) + l * r1 * r2 * r4)
  return { b: [0, b1, b2, b3], a: [1, a1, a2, a3] } as const
}

const P0 = [1, 3, 3, 1]
const P1 = [1, 1, -1, -1]
const P2 = [1, -1, -1, 1]
const P3 = [1, -3, 3, -1]

/** `stackAnalog` through the bilinear transform: b0 to b3, then a1 to a3. */
export function stackDigital(
  p: StackParts,
  t: number,
  m: number,
  l: number,
  sr: number,
  out: Float64Array,
) {
  const { b, a } = stackAnalog(p, t, m, l)
  const c = 2 * sr
  const n1 = b[1] * c
  const n2 = b[2] * c * c
  const n3 = b[3] * c ** 3
  const d1 = a[1] * c
  const d2 = a[2] * c * c
  const d3 = a[3] * c ** 3
  const a0 = P0[0]! + d1 * P1[0]! + d2 * P2[0]! + d3 * P3[0]!
  for (let i = 0; i < 4; i++) {
    out[i] = (n1 * P1[i]! + n2 * P2[i]! + n3 * P3[i]!) / a0
    if (i > 0)
      out[3 + i] = (P0[i]! + d1 * P1[i]! + d2 * P2[i]! + d3 * P3[i]!) / a0
  }
}

/** The cathode cap gives full gain above `bypassHz` and `degen` of it below.
    The grid conducts above `knee`; the plate bottoms at `sink` and cuts off at
    `cutoff`. */
interface Spec {
  bypassHz: number
  degen: number
  knee: number
  sink: number
  cutoff: number
  missHz: number
}

const STAGE: Spec = {
  bypassHz: 6,
  degen: 1,
  knee: 0.7,
  sink: 1,
  cutoff: 0.85,
  missHz: 11000,
}

/** Grid-leak cap charge and bleed times, in seconds, and how far the charge
    pulls the bias. */
const BLOCK_ATK = 0.0012
const BLOCK_REL = 0.05
const BLOCK_DEPTH = 0.45

const COUPLING_HZ = 12
const DC_COEF = 0.9992
const OUT_TRIM = 0.5

/** The microphonic tube's mechanical resonance and how sharp it is, and what a
    full turn of the fault lets back into the first grid. */
const RING_HZ = 900
const RING_Q = 30
const MICRO_GAIN = 0.8

/** How much a fully dried cathode cap cuts the gain below its new corner. */
const CAP_DEGEN = 0.4

/** Dropouts a second of a fully failed output tube, and how long each lasts. */
const ARC_RATE = 6
const CRACKLE = 1
const ARC_SECONDS = [0.004, 0.03] as const
const RAIL_SECONDS = 0.05

/** The preamp sits behind a dropper and a cap, so it feels half the sag. */
const PREAMP_SAG = 0.5

interface Voicing {
  stack: StackParts
  /** gain after the stack, which loses 10 to 20 dB */
  makeup: number
  /** a second gain stage ahead of the stack */
  cascade: boolean
  first: Spec
  second: Spec
  /** dB into the first stage with the gain knob at 0 and at full */
  drive: readonly [number, number]
  /** dB of the stage after the stack */
  recovery: number
  /** the power stage's idle bias and how far it swings on a full rail */
  bias: number
  swing: number
  sagDepth: number
  sagAtk: number
  sagRel: number
  /** the output transformer's low corner and where its core saturates */
  coreHz: number
  coreSat: number
  /** the transformer's top corner */
  leakHz: number
  presenceHz: number
  /** how far a fully dried cathode cap raises the cap's corner, as a multiple */
  capCorner: number
}

const VOICINGS: readonly Voicing[] = [
  {
    stack: FENDER_STACK,
    makeup: 5,
    cascade: false,
    first: { ...STAGE, bypassHz: 3, knee: 0.8 },
    second: { ...STAGE, bypassHz: 3, knee: 0.8 },
    drive: [-4, 20],
    recovery: 6,
    bias: 0.45,
    swing: 1.1,
    sagDepth: 0.55,
    sagAtk: 0.02,
    sagRel: 0.12,
    coreHz: 40,
    coreSat: 1.1,
    leakHz: 12000,
    presenceHz: 3200,
    capCorner: 300,
  },
  {
    stack: MARSHALL_STACK,
    makeup: 5,
    cascade: true,
    first: { ...STAGE, bypassHz: 280, degen: 0.3, knee: 0.6 },
    second: { ...STAGE, bypassHz: 700, degen: 0.4, knee: 0.6 },
    drive: [-10, 16],
    recovery: 8,
    bias: 0.22,
    swing: 1,
    sagDepth: 0.7,
    sagAtk: 0.012,
    sagRel: 0.22,
    coreHz: 55,
    coreSat: 1.4,
    leakHz: 9000,
    presenceHz: 2600,
    capCorner: 4,
  },
]

const dbGain = (db: number) => Math.pow(10, db / 20)

/** A 10% audio-taper pot: a tenth of its track at half rotation. */
const audioTaper = (x: number) => (Math.pow(10, 2 * x) - 1) / 99

/** What the knobs decided this block, for both channels. */
interface Knobs {
  voicing: Voicing
  /** drive, degeneration and cathode-cap corner of each preamp stage */
  drive: Float64Array
  degen: Float64Array
  bypass: Float64Array
  gPower: number
  bias: number
  /** `3 * sqrt(bias)`, which holds the pair's gain at zero to one */
  biasNorm: number
  presence: number
  railPre: number
  railPow: number
  blockAtk: number
  blockRel: number
  couplingCoef: number
  wire: Wiring
  stack: Float64Array
  /** how much of the power stage's own output the first tube hears */
  micro: number
  /** the weaker output tube's strength, with its dropouts already in */
  weakGm: number
  /** the arc's hash, as a share of the power stage's drive */
  crackle: number
}

/** A voicing's corner frequencies as coefficients, settled once. */
interface Wiring {
  missCoefs: readonly [number, number, number]
  presenceCoef: number
  coreCoef: number
  leak: Biquad
  sagAtk: number
  sagRel: number
}

function wire(v: Voicing, sr: number): Wiring {
  const osr = sr * OS
  return {
    missCoefs: [
      lpCoef(v.first.missHz, osr),
      lpCoef(v.first.missHz * 0.8, osr),
      lpCoef(v.second.missHz, osr),
    ],
    presenceCoef: lpCoef(v.presenceHz, osr),
    coreCoef: lpCoef(v.coreHz, osr),
    leak: lowpass(v.leakHz, Math.SQRT1_2, osr),
    sagAtk: coef(v.sagAtk, sr),
    sagRel: coef(v.sagRel, sr),
  }
}

const SMOOTH = 0.015

function conduct(v: number): number {
  const r = 0.5 * (v + Math.sqrt(v * v + SMOOTH * SMOOTH))
  return r * Math.sqrt(r)
}

// A channel's state, a slot a value. Every double the sample loop hands on goes
// through a slot rather than an argument or a return: a call V8 declines to
// inline boxes each double that crosses it, and the amp, written as an object
// per filter, made 42 MB of garbage a second that way, where this makes none
// and runs about a tenth faster. The three triodes take three slots each at
// 3 × stage.
//
// Moving the amp to Rust and wasm was tried and declined on 2026-10-30 (spike
// in a28812ba): bit-exact and 1.45× faster in Chrome, but the DSP changes too
// often for a second language, and with the garbage gone that is about 1% of
// a core on the heaviest board.
const BLOCKED = 0
const BYPASS = 1
const MISS = 2
const STACK = 9
const COUPLING = 12
const PRESENCE = 13
const CORE = 14
const LEAK = 15
const RINGING = 19
const DC_X = 23
const DC_Y = 24
const FED = 25
const DRAWN = 26
/** the sample in flight between the stages of one run */
const SIG = 27
const OUT = 28
const SLOTS = 29

/** One channel through the amp. Everything between the upsampler and the
    downsampler runs at twice the board's rate. */
class Channel {
  readonly s = new Float64Array(SLOTS)
  private readonly up = new Upsampler()
  private readonly down = new Halfband()
  private readonly seed: Int32Array
  private readonly tuned: Biquad

  constructor(detune: number, seed: number, osr: number) {
    this.seed = Int32Array.of(seed)
    this.tuned = bandpass(RING_HZ * detune, RING_Q, osr)
  }

  /** What the power pair last put out, which the supply sags under. */
  get drawn() {
    return this.s[DRAWN]!
  }

  get out() {
    return this.s[OUT]!
  }

  /** One sample at the board's rate, `x[i]` in and `s[OUT]` out. */
  process(x: Float32Array, i: number, k: Knobs) {
    const s = this.s
    this.up.process(x[i]!)
    s[SIG] = this.up.pair[0]!
    this.run(k)
    const a = s[OUT]!
    s[SIG] = this.up.pair[1]!
    this.run(k)
    const y = this.down.process(a, s[OUT]!)
    const dc = y - s[DC_X]! + DC_COEF * s[DC_Y]!
    s[DC_X] = y
    s[DC_Y] = flushDenormal(dc)
    s[OUT] = dc
  }

  private run(k: Knobs) {
    const s = this.s
    const v = k.voicing
    s[SIG] = s[SIG]! + k.micro * s[FED]!
    this.triode(k, 0, v.first)
    if (v.cascade) this.triode(k, 1, v.first)
    this.stack(k.stack, v.makeup)
    this.triode(k, 2, v.second)
    this.power(k)
  }

  private triode(k: Knobs, stage: number, spec: Spec) {
    const s = this.s
    const o = 3 * stage
    const x = s[SIG]!
    const bypassed = flushDenormal(
      s[o + BYPASS]! + k.bypass[stage]! * (x - s[o + BYPASS]!),
    )
    s[o + BYPASS] = bypassed
    const hi = x - bypassed
    const degen = k.degen[stage]!
    const u = k.drive[stage]! * (degen * x + (1 - degen) * hi)
    const over = u - spec.knee
    const grid = over > 0 ? spec.knee + 0.3 * softclip(over / 0.3) : u
    const charge = over > 0 ? Math.min(over, 3) : 0
    const was = s[o + BLOCKED]!
    const blocked = flushDenormal(
      was + (charge > was ? k.blockAtk : k.blockRel) * (charge - was),
    )
    s[o + BLOCKED] = blocked
    const g = grid - BLOCK_DEPTH * blocked
    const railPre = k.railPre
    const sink = spec.sink * railPre
    const cut = spec.cutoff * railPre
    const plate = g >= 0 ? sink * softclip(g / sink) : cut * softclip(g / cut)
    const missed = flushDenormal(
      s[o + MISS]! + k.wire.missCoefs[stage]! * (-plate - s[o + MISS]!),
    )
    s[o + MISS] = missed
    s[SIG] = missed
  }

  /** The tone stack, transposed direct form II, and the makeup gain after it. */
  private stack(c: Float64Array, makeup: number) {
    const s = this.s
    const x = s[SIG]!
    const y = c[0]! * x + s[STACK]!
    s[STACK] = flushDenormal(c[1]! * x - c[4]! * y + s[STACK + 1]!)
    s[STACK + 1] = flushDenormal(c[2]! * x - c[5]! * y + s[STACK + 2]!)
    s[STACK + 2] = flushDenormal(c[3]! * x - c[6]! * y)
    s[SIG] = y * makeup
  }

  /** The coupling cap, presence, the push-pull pair and the transformer. */
  private power(k: Knobs) {
    const s = this.s
    const v = k.voicing
    let x = s[SIG]!
    const coupled = flushDenormal(
      s[COUPLING]! + k.couplingCoef * (x - s[COUPLING]!),
    )
    s[COUPLING] = coupled
    x -= coupled
    const presenced = flushDenormal(
      s[PRESENCE]! + k.wire.presenceCoef * (x - s[PRESENCE]!),
    )
    s[PRESENCE] = presenced
    const lifted = x + k.presence * (x - presenced)
    const drive = lifted * k.gPower + k.crackle * (2 * this.hash() - 1)
    const swing = v.swing * k.railPow
    // Two tubes back to back, each conducting its own half of the wave with a
    // 3/2 power law above cutoff. A cold bias leaves both nearly off around
    // zero and the crossover shows. With both tubes healthy the gain at zero
    // is one whatever the bias; `weakGm` is the second tube's strength.
    const bias = k.bias
    const weakGm = k.weakGm
    const pushPull =
      (conduct(bias + drive) -
        weakGm * conduct(bias * (0.6 + 0.4 * weakGm) - drive)) /
      k.biasNorm
    const pair = swing * softclip(pushPull / swing)
    s[DRAWN] = Math.abs(pair)
    s[FED] = k.micro === 0 ? 0 : biquadAt(s, RINGING, pair, this.tuned)
    const low = flushDenormal(s[CORE]! + k.wire.coreCoef * (pair - s[CORE]!))
    s[CORE] = low
    const saturated = softclip(low * v.coreSat) / v.coreSat
    s[OUT] = biquadAt(s, LEAK, pair - low + saturated, k.wire.leak)
  }

  /** mulberry32, kept in an Int32Array so its word never lands on the heap. */
  private hash() {
    const a = (this.seed[0]! + 0x6d2b79f5) | 0
    this.seed[0] = a
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  reset() {
    this.s.fill(0)
    this.up.reset()
    this.down.reset()
  }
}

/** A biquad whose x1, x2, y1, y2 sit in `s` from `at`. */
function biquadAt(s: Float64Array, at: number, x: number, c: Biquad) {
  const y = flushDenormal(
    c.b0 * x +
      c.b1 * s[at]! +
      c.b2 * s[at + 1]! -
      c.a1 * s[at + 2]! -
      c.a2 * s[at + 3]!,
  )
  s[at + 1] = s[at]!
  s[at] = x
  s[at + 3] = s[at + 2]!
  s[at + 2] = y
  return y
}

/** A cabinet as filters: where the bass gives out, the cone's peaks, and a
    fourth-order roll-off above 5 kHz. */
const CAB_FILTERS = 6

function cabinet(kind: number, sr: number): Biquad[] {
  if (kind === AMP_CAB.open)
    return [
      highpass(85, 0.75, sr),
      peak(115, 2.5, 0.9, sr),
      peak(2400, 4, 0.9, sr),
      lowpass(5600, 0.5412, sr),
      lowpass(5600, 1.3066, sr),
    ]
  if (kind === AMP_CAB.closed)
    return [
      highpass(68, 0.7, sr),
      peak(100, 4, 1.2, sr),
      peak(1800, 3, 0.8, sr),
      peak(3300, 2, 1.2, sr),
      lowpass(5000, 0.5412, sr),
      lowpass(5000, 1.3066, sr),
    ]
  return []
}

const CABS = [AMP_CAB.direct, AMP_CAB.open, AMP_CAB.closed]

const dbOf = (ratio: number) => 20 * Math.log10(Math.max(ratio, 1e-6))

/** The tone stack's gain in dB at a frequency, for the panel's drawing. */
export function stackDb(
  voice: number,
  treble: number,
  mid: number,
  bass: number,
  hz: number,
): number {
  const parts = (VOICINGS[voice] ?? VOICINGS[0]!).stack
  const { b, a } = stackAnalog(parts, treble, mid, audioTaper(bass))
  const w = 2 * Math.PI * hz
  const poly = (q: readonly number[]) => {
    let re = 0
    let im = 0
    q.forEach((v, k) => {
      re += v * w ** k * Math.cos((k * Math.PI) / 2)
      im += v * w ** k * Math.sin((k * Math.PI) / 2)
    })
    return Math.hypot(re, im)
  }
  return dbOf(poly(b) / poly(a))
}

/** A cabinet's gain in dB at a frequency, for the panel's drawing. */
export function cabDb(cab: number, hz: number, sr = 48000): number {
  return dbOf(
    cabinet(cab, sr).reduce((gain, c) => gain * response(c, hz, sr), 1),
  )
}

// A tube amp: the gain stages that turn a note into a chord of its own
// harmonics, a passive tone stack between them, a push-pull power stage on a
// supply that sags under it, an output transformer that runs out of core, and a
// speaker. Everything between the stack's input and the transformer runs at
// twice the board's rate, because a stage clipped hard enough is the loudest
// aliasing source on the board.
export class Amp implements Stage {
  label = 'amp'
  private readonly left: Channel
  private readonly right: Channel
  private readonly dryL = new DelayLine(LATENCY + 2)
  private readonly dryR = new DelayLine(LATENCY + 2)
  private readonly cabCoefs: Biquad[][]
  private readonly wiring: Wiring[]
  // Six biquads a side, each one's x1, x2, y1, y2 four slots on.
  private readonly cabL = new Float64Array(4 * CAB_FILTERS)
  private readonly cabR = new Float64Array(4 * CAB_FILTERS)
  /** the power pairs' draw, followed */
  private load = 0
  private readonly stackK = new Float64Array(7)
  private readonly rng: Rng = mulberry32(0x7ab3)
  private readonly arc: Burst
  private readonly flickCoef: number
  private arcLeft = 0
  private flick = 1
  private rail = 1
  private readonly railCoef: number
  private readonly osr: number
  private readonly k: Knobs

  private readonly sr: number

  constructor(sr: number) {
    this.sr = sr
    this.osr = sr * OS
    this.left = new Channel(1, 0x5a1, this.osr)
    this.right = new Channel(1.07, 0x5a2, this.osr)
    this.arc = new Burst(sr, 1)
    this.flickCoef = coef(0.001, sr)
    this.railCoef = coef(RAIL_SECONDS, sr)
    this.cabCoefs = CABS.map(c => cabinet(c, sr))
    this.wiring = VOICINGS.map(v => wire(v, sr))
    this.k = {
      voicing: VOICINGS[0]!,
      drive: new Float64Array(3),
      degen: new Float64Array(3),
      bypass: new Float64Array(3),
      gPower: 1,
      bias: 0.3,
      biasNorm: 3 * Math.sqrt(0.3),
      presence: 0,
      blockAtk: coef(BLOCK_ATK, this.osr),
      blockRel: coef(BLOCK_REL, this.osr),
      couplingCoef: lpCoef(COUPLING_HZ, this.osr),
      wire: this.wiring[0]!,
      stack: this.stackK,
      micro: 0,
      railPre: 1,
      railPow: 1,
      weakGm: 1,
      crackle: 0,
    }
  }

  when(p: Float32Array) {
    return p[IDX.ampMix]! > 0
  }

  private voice(p: Float32Array) {
    const k = this.k
    const osr = this.osr
    const v = VOICINGS[Math.round(p[IDX.ampVoice]!)] ?? VOICINGS[0]!
    k.voicing = v
    k.wire = this.wiring[VOICINGS.indexOf(v)]!
    const gain = p[IDX.ampGain]!
    k.drive[0] = dbGain(v.drive[0] + (v.drive[1] - v.drive[0]) * gain)
    k.drive[1] = dbGain(4 + 8 * gain)
    k.drive[2] = dbGain(v.recovery)
    const cap = p[IDX.ampCap]!
    for (let i = 0; i < 3; i++) {
      const spec = i === 2 ? v.second : v.first
      k.degen[i] = spec.degen * (1 - CAP_DEGEN * cap)
      k.bypass[i] = lpCoef(
        Math.min(spec.bypassHz * (1 + v.capCorner * cap), osr * 0.2),
        osr,
      )
    }
    k.micro = (v.cascade ? -1 : 1) * MICRO_GAIN * p[IDX.ampMicro]! ** 2
    k.gPower = dbGain(-18 + 36 * p[IDX.ampMaster]!)
    k.bias = v.bias * Math.pow(30, p[IDX.ampBias]! - 0.5)
    k.biasNorm = 3 * Math.sqrt(k.bias)
    k.presence = 1.6 * p[IDX.ampPresence]!
    stackDigital(
      v.stack,
      p[IDX.ampTreble]!,
      p[IDX.ampMid]!,
      audioTaper(p[IDX.ampBass]!),
      osr,
      k.stack,
    )
  }

  /** The failing tube arcing: it drops out for a few milliseconds, more often
      for having just done it. Leaves `flick` at how much of it is conducting. */
  private sputter(p: Float32Array) {
    const weak = p[IDX.ampTube]!
    const cluster = p[IDX.faultCluster]!
    if (weak <= 0) {
      this.flick = 1
      this.arcLeft = 0
      return
    }
    this.arc.step()
    if (
      this.arcLeft <= 0 &&
      this.arc.roll((weak * weak * ARC_RATE) / this.sr, cluster, this.rng)
    )
      this.arcLeft = Math.floor(
        (ARC_SECONDS[0] + (ARC_SECONDS[1] - ARC_SECONDS[0]) * this.rng()) *
          this.sr,
      )
    if (this.arcLeft > 0) this.arcLeft--
    this.flick += this.flickCoef * ((this.arcLeft > 0 ? 0 : 1) - this.flick)
  }

  process(io: StereoBlock, p: Float32Array, ctx: Ctx) {
    this.voice(p)
    const k = this.k
    const v = k.voicing
    const mix = p[IDX.ampMix]!
    const level = dbGain(p[IDX.ampLevel]!) * OUT_TRIM
    const sag = p[IDX.ampSag]!
    const cab = this.cabCoefs[Math.round(p[IDX.ampCab]!)] ?? this.cabCoefs[0]!

    const weak = p[IDX.ampTube]!
    const { left, right, cabL, cabR } = this

    for (let i = 0; i < io.n; i++) {
      const dl = io.l[i]!
      const dr = io.r[i]!
      this.sputter(p)
      const flick = this.flick
      k.weakGm = (1 - 0.8 * weak) * flick
      k.crackle = CRACKLE * weak * (1 - flick)
      const drawn = Math.abs(0.5 * (left.drawn + right.drawn))
      const was = this.load
      const load = flushDenormal(
        was + (drawn > was ? k.wire.sagAtk : k.wire.sagRel) * (drawn - was),
      )
      this.load = load
      const want =
        1 -
        v.sagDepth *
          sag *
          Math.min(Math.max(load / (1 + load), ctx.droop[i]!), 1)
      this.rail = flushDenormal(this.rail + this.railCoef * (want - this.rail))
      const railPow = Math.max(this.rail, 0.05)
      k.railPow = railPow
      k.railPre = 1 - PREAMP_SAG * (1 - railPow)

      left.process(io.l, i, k)
      right.process(io.r, i, k)
      let wl = left.out
      let wr = right.out
      for (let c = 0; c < cab.length; c++) {
        wl = biquadAt(cabL, 4 * c, wl, cab[c]!)
        wr = biquadAt(cabR, 4 * c, wr, cab[c]!)
      }
      this.dryL.write(dl)
      this.dryR.write(dr)
      io.l[i] = this.dryL.read(LATENCY) * (1 - mix) + wl * level * mix
      io.r[i] = this.dryR.read(LATENCY) * (1 - mix) + wr * level * mix
    }
  }

  panic() {
    this.left.reset()
    this.right.reset()
    this.load = 0
    this.arc.reset()
    this.arcLeft = 0
    this.flick = 1
    this.cabL.fill(0)
    this.cabR.fill(0)
    this.dryL.reset()
    this.dryR.reset()
    this.rail = 1
  }
}
