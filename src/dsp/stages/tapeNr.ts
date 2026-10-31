import { lpCoef } from '../util/onepole.ts'
import { flushDenormal } from '../util/softclip.ts'

// The two companders a cassette deck put either side of the tape. Each encodes
// before the record head and decodes after the replay head. The decoder sets
// its gain from what the tape plays back, so it inverts the encoder exactly
// only when the tape is flat. A tape that lost top end, dropped out, saturated
// or came back at the wrong level makes the decoder mistrack the way a real
// deck does.

export const NR_DOLBY_B = 1
export const NR_DBX = 2

/** A first-order shelf as bilinear coefficients, and its exact inverse. The
    boost sits between `loHz` and `hiHz`, so the top gains `hiHz / loHz`. */
class Shelf {
  private b0 = 1
  private b1 = 0
  private a1 = 0
  private x1 = 0
  private y1 = 0

  constructor(loHz: number, hiHz: number, sr: number, inverse: boolean) {
    const k = 2 * sr
    const w1 = 2 * Math.PI * loHz
    const w2 = 2 * Math.PI * hiHz
    const g = w2 / w1
    let n0 = (k + w1) * g
    let n1 = (w1 - k) * g
    let d0 = k + w2
    let d1 = w2 - k
    if (inverse) [n0, n1, d0, d1] = [d0, d1, n0, n1]
    this.b0 = n0 / d0
    this.b1 = n1 / d0
    this.a1 = d1 / d0
  }

  process(x: number): number {
    const y = flushDenormal(this.b0 * x + this.b1 * this.x1 - this.a1 * this.y1)
    this.x1 = x
    this.y1 = y
    return y
  }

  reset() {
    this.x1 = 0
    this.y1 = 0
  }
}

// Dolby B: a high-passed copy of the signal, compressed, added on the way to
// the tape and taken off on the way back. Quiet top end goes down 10 dB hotter;
// loud top end barely moves, and the band slides up away from it. The decoder
// subtracts the same side chain computed off its own output, which is a loop
// with no delay in it; one pole solves in closed form.
const DOLBY_BOOST = 2.16
const DOLBY_HZ = 3000
const DOLBY_KNEE = 0.02
// How far the sliding band may move before its coefficient is worked out again.
// The rule reads only the envelope, so an encoder and its decoder recompute on
// the same samples however far apart the tape puts them.
const DOLBY_SLACK = 0.002

export class DolbyB {
  /** The sample in, and once `process` has run the sample out: see Dbx. */
  y = 0
  private lp = 0
  private env = 0
  private c = 0
  private overAt = -1
  private readonly atk: number
  private readonly rel: number
  private readonly sr: number

  private readonly decode: boolean

  constructor(sr: number, decode: boolean) {
    this.decode = decode
    this.sr = sr
    this.atk = lpCoef(1 / (2 * Math.PI * 0.002), sr)
    this.rel = lpCoef(1 / (2 * Math.PI * 0.08), sr)
  }

  process() {
    const x = this.y
    const over = this.env / DOLBY_KNEE
    const g = DOLBY_BOOST / (1 + over)
    if (Math.abs(over - this.overAt) > DOLBY_SLACK * (1 + this.overAt)) {
      this.overAt = over
      this.c = lpCoef(Math.min(DOLBY_HZ * (1 + over), this.sr * 0.4), this.sr)
    }
    const c = this.c
    const gh = g * (1 - c)
    const out = this.decode ? (x + gh * this.lp) / (1 + gh) : x
    const into = this.decode ? out : x
    const band = (1 - c) * (into - this.lp)
    this.lp = flushDenormal(this.lp + c * (into - this.lp))
    const a = band < 0 ? -band : band
    this.env = flushDenormal(
      this.env + (a > this.env ? this.atk : this.rel) * (a - this.env),
    )
    this.y = this.decode ? out : x + g * band
  }

  reset() {
    this.lp = 0
    this.env = 0
    this.overAt = -1
  }
}

// dbx: the whole band through a 2:1 compressor on the way in and a 1:2 expander
// on the way out, around a pre-emphasis and its inverse. Every decibel the tape
// gets wrong comes back as two once the detector settles, and the hiss under a
// loud note rides up with it, which is the breathing a four-track is known
// for. The detectors skip the bottom octaves, as type II's do, so a bass note
// pumps less.
const DBX_REF = 0.25
const DBX_FLOOR = 1e-10
const DBX_MAX = 100

export class Dbx {
  /** The sample in, and once `process` has run the sample out. A field rather
      than an argument and a return, because the tape heads call this on every
      sample and a call V8 declines to inline boxes the doubles across it. */
  y = 0
  private readonly emph: Shelf
  private ms = DBX_FLOOR
  private hp = 0
  private readonly hpC: number
  private readonly atk: number
  private readonly rel: number

  private readonly decode: boolean

  constructor(sr: number, decode: boolean) {
    this.decode = decode
    this.emph = new Shelf(1500, 6000, sr, decode)
    this.hpC = lpCoef(80, sr)
    this.atk = lpCoef(1 / (2 * Math.PI * 0.0015), sr)
    this.rel = lpCoef(1 / (2 * Math.PI * 0.025), sr)
  }

  // Both sides read the detector as it stood a sample ago, and both feed it
  // the uncompressed signal: the encoder its input, the decoder its own
  // output. So on a flat tape the two detectors see the same samples and the
  // decoder divides out exactly the gain the encoder applied.
  process() {
    const x = this.y
    const g = Math.min(
      Math.max(1 / Math.sqrt(Math.sqrt(this.ms) / DBX_REF), 1 / DBX_MAX),
      DBX_MAX,
    )
    if (this.decode) {
      const pre = x / g
      this.detect(pre)
      this.y = this.emph.process(pre)
    } else {
      const pre = this.emph.process(x)
      this.detect(pre)
      this.y = pre * g
    }
  }

  private detect(x: number) {
    this.hp = flushDenormal(this.hp + this.hpC * (x - this.hp))
    const d = x - this.hp
    const sq = d * d
    this.ms = Math.max(
      flushDenormal(
        this.ms + (sq > this.ms ? this.atk : this.rel) * (sq - this.ms),
      ),
      DBX_FLOOR,
    )
  }

  reset() {
    this.emph.reset()
    this.ms = DBX_FLOOR
    this.hp = 0
  }
}

export type Compander = DolbyB | Dbx

export function compander(
  kind: number,
  sr: number,
  decode: boolean,
): Compander | null {
  if (kind === NR_DOLBY_B) return new DolbyB(sr, decode)
  if (kind === NR_DBX) return new Dbx(sr, decode)
  return null
}
