import { IDX } from '../../engine/params'
import { DEST } from '../modbus'
import { BLOCK, type Ctx, type Stage, type StereoBlock } from '../stage'
import { coef } from '../util/follower'
import { SineOsc } from '../util/lfo'
import { LoopAmp, ampVoicing, type AmpVoicing } from '../util/loopamp'
import { lpCoef } from '../util/onepole'
import { octaves } from '../util/pitch'
import { gaussian, mulberry32, type Rng } from '../util/rng'
import { flushDenormal, softclip } from '../util/softclip'
import { Dbx } from './tapeNr'

// A cassette four-track: a desk of four channel strips in front of a deck of
// four tape loops. Each loop is cut to its own length and spliced, so four
// loops of no common length drift against each other and never line up twice.
//
// The buffer holds positions on the tape at 1⅞ ips, one sample a frame, and
// the capstan moves the head through it at whatever the transport is doing, so speed, pitch, a dying battery, wow and
// flutter all move one thing. Record at 1⅞ and switch to 3¾ and the take plays
// an octave up in half the time, because the head now passes two frames a
// sample. Both heads' bandwidth is set by the wavelength, so the record and
// replay corners move with the speed and nothing the tape holds can alias.

export const TRACKS = 4
export const INPUT_TAPE = 0
export const INPUT_BOARD = 1
export const INPUT_MIC = 2
export const INPUT_AUX = 3

/** The longest loop, at 1⅞. */
export const MAX_LOOP_S = 60
/** How a loop grows when a longer one is asked for: whole chunks, so a knob
    being turned up reallocates a few times rather than every block. */
const GROW_S = 5
/** One cell of the wear map, in frames: about 10 ms of tape at 1⅞. */
const CELL = 480
/** How far behind the play head the record head writes, in frames. The play
    head reads a few frames either side of where it stands, and none of them
    may be ones this lap has already written over. */
const HEAD_GAP = 4
const PER_CELL = 1 / CELL
/** Samples between updates of the corners that follow the level or the wear,
    both of which move over tens of milliseconds. */
const CONTROL = 16

// The cassette heads match the tape machine's cassette row at 1⅞, with a gap
// corner near 10 kHz and a bump near 50 Hz, both proportional to speed.
const GAP_HZ = 10000
const GAP_POLE = 1.5538
const BUMP_HZ = 50
const BUMP_Q = 1 / 1.2
const BUMP_DEPTH = 0.5
const LOW_CUT_HZ = 35
const HISS = 2.9 * 0.006
/** How hiss falls with speed: the tape machine's 1⅞ and 3¾ rows. */
const HISS_SLOPE = -0.77
const EMPH_HZ = 1200
const EMPH = 1.2
const ERASE = 0.45
/** The tape machine's stock Hysteresis, as the curve's offset per unit of
    level the medium is carrying. */
const REMANENCE = 0.45
/** Bias erasure: recording over a track takes some of what was there off with
    it, and more of the top than the bottom, so every pass a loop survives is
    darker than the one before. */
const BIAS_ERASE_HZ = 6000
const BIAS_KEEP = 0.55
const REPLAY_REF = 0.891

// The desk's op-amps clip at twice the board's full scale, which is the
// headroom a line-level four-track has over its nominal level.
const HEADROOM = 2
/** Thermal noise at each preamp input, about -100 dBFS: the seed a desk with
    nothing plugged into it squeals up out of. */
const NOISE = 1e-5
const TRIM_FLOOR_DB = -20
const MID_Q = 1.2
const LOW_HZ = 100
const HIGH_HZ = 10000
/** The coupling cap on the aux return, which is the desk's whole low end in a
    no-input loop and where it motorboats from. */
const AUX_HP_HZ = 20

/** Wow off the hub at 1⅞, flutter off the capstan and the pinch roller. */
const WOW_HZ = 0.55
const CAPSTAN_HZ = 7.6
const ROLLER_HZ = 11.9
const WOW_DEPTH = 0.012
const FLUTTER_DEPTH = 0.004
/** Batteries: how far a flat set drags the motor, how much the desk's own
    current adds to it, and how the servo hunts as the voltage goes. */
const SAG = 0.35
const SAG_LOAD = 0.4
const HUNT_HZ = 2.7
const HUNT_DEPTH = 0.02

interface Biquad {
  b0: number
  b1: number
  b2: number
  a1: number
  a2: number
}

const flat = (): Biquad => ({ b0: 1, b1: 0, b2: 0, a1: 0, a2: 0 })

function shelf(hz: number, db: number, sr: number, high: boolean): Biquad {
  const a = Math.pow(10, db / 40)
  const w = (2 * Math.PI * hz) / sr
  const cos = Math.cos(w)
  const alpha = (Math.sin(w) / 2) * Math.SQRT2
  const s = 2 * Math.sqrt(a) * alpha
  const sign = high ? -1 : 1
  const b0 = a * (a + 1 - sign * (a - 1) * cos + s)
  const b1 = sign * 2 * a * (a - 1 - sign * (a + 1) * cos)
  const b2 = a * (a + 1 - sign * (a - 1) * cos - s)
  const a0 = a + 1 + sign * (a - 1) * cos + s
  const a1 = -sign * 2 * (a - 1 + sign * (a + 1) * cos)
  const a2 = a + 1 + sign * (a - 1) * cos - s
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 }
}

function peak(hz: number, db: number, q: number, sr: number): Biquad {
  const a = Math.pow(10, db / 40)
  const w = (2 * Math.PI * Math.min(hz, sr * 0.45)) / sr
  const cos = Math.cos(w)
  const alpha = Math.sin(w) / (2 * q)
  const a0 = 1 + alpha / a
  return {
    b0: (1 + alpha * a) / a0,
    b1: (-2 * cos) / a0,
    b2: (1 - alpha * a) / a0,
    a1: (-2 * cos) / a0,
    a2: (1 - alpha / a) / a0,
  }
}

class BiquadState {
  private x1 = 0
  private x2 = 0
  private y1 = 0
  private y2 = 0

  process(x: number, c: Biquad): number {
    const y = flushDenormal(
      c.b0 * x +
        c.b1 * this.x1 +
        c.b2 * this.x2 -
        c.a1 * this.y1 -
        c.a2 * this.y2,
    )
    this.x2 = this.x1
    this.x1 = x
    this.y2 = this.y1
    this.y1 = y
    return y
  }

  reset() {
    this.x1 = 0
    this.x2 = 0
    this.y1 = 0
    this.y2 = 0
  }
}

// One channel of the desk: a trim into a preamp, three bands of EQ into the
// stage that drives the fader, each an op-amp that can clip, slew and block.
class Strip {
  private readonly pre = new LoopAmp()
  private readonly post = new LoopAmp()
  private readonly lo = new BiquadState()
  private readonly mid = new BiquadState()
  private readonly hi = new BiquadState()
  loC = flat()
  midC = flat()
  hiC = flat()
  loOn = false
  midOn = false
  hiOn = false
  private keyLo = NaN
  private keyMid = NaN
  private keyMidHz = NaN
  private keyHi = NaN

  constructor(private readonly gauss: Rng) {}

  tune(low: number, midHz: number, mid: number, high: number, sr: number) {
    if (low !== this.keyLo) {
      this.keyLo = low
      this.loOn = low !== 0
      this.loC = shelf(LOW_HZ, low, sr, false)
    }
    if (mid !== this.keyMid || midHz !== this.keyMidHz) {
      this.keyMid = mid
      this.keyMidHz = midHz
      this.midOn = mid !== 0
      this.midC = peak(midHz, mid, MID_Q, sr)
    }
    if (high !== this.keyHi) {
      this.keyHi = high
      this.hiOn = high !== 0
      this.hiC = shelf(HIGH_HZ, high, sr, true)
    }
  }

  process(x: number, trim: number, rail: number, v: AmpVoicing): number {
    const into = (x * trim + this.gauss() * NOISE) / HEADROOM
    let y = this.pre.process(into, rail, v)
    if (this.loOn) y = this.lo.process(y, this.loC)
    if (this.midOn) y = this.mid.process(y, this.midC)
    if (this.hiOn) y = this.hi.process(y, this.hiC)
    return this.post.process(y, rail, v) * HEADROOM
  }

  reset() {
    this.pre.reset()
    this.post.reset()
    this.lo.reset()
    this.mid.reset()
    this.hi.reset()
  }
}

// One loop of tape and the heads that run over it.
class Loop {
  tape: Float32Array | null = null
  wear: Float32Array | null = null
  /** Frames in the loop as cut, which the Length knob can move under the
      head; never more than the tape threaded. */
  len = 0
  pos = 0
  private wearAt = -1
  // Record side: emphasis, the oxide's remanence, self-erase.
  private pre = 0
  private de = 0
  private mag = 0
  private selfLp = 0
  private prevRec = 0
  private biasLp = 0
  // Replay side: hiss shaping, the gap's two poles, the bump, the low cut, and
  // how much oxide is under the head.
  private hissY = 0
  private gap = 0
  private gap2 = 0
  private bumpLow = 0
  private bumpBand = 0
  private low1 = 0
  private low2 = 0
  private worn = 0
  private gc = 0
  private gapIn = 0
  private selfC = 0
  private selfIn = 0
  private offset = 0
  private offsetClip = 0
  readonly enc: Dbx
  readonly dec: Dbx

  constructor(
    sr: number,
    private readonly gauss: Rng,
    private readonly rng: Rng,
  ) {
    this.enc = new Dbx(sr, false)
    this.dec = new Dbx(sr, true)
  }

  // Threading tape: the first time a track is armed, and again whenever the
  // loop is cut longer than what is on the spool. What was recorded stays
  // where it was; the new length is blank.
  thread(frames: number) {
    const have = this.tape?.length ?? 0
    if (frames <= have) return
    const tape = new Float32Array(frames)
    const wear = new Float32Array(Math.ceil(frames / CELL))
    if (this.tape) tape.set(this.tape)
    if (this.wear) wear.set(this.wear)
    this.tape = tape
    this.wear = wear
  }

  /** The head's reading at the current position, cubic between frames. */
  read(): number {
    const tape = this.tape
    if (!tape || this.len < 4) return 0
    const n = this.len
    const i = Math.floor(this.pos)
    const t = this.pos - i
    const i1 = i + 1 < n ? i + 1 : i + 1 - n
    const i2 = i1 + 1 < n ? i1 + 1 : i1 + 1 - n
    const xm = tape[i > 0 ? i - 1 : n - 1]!
    const x0 = tape[i]!
    const x1 = tape[i1]!
    const x2 = tape[i2]!
    const c1 = 0.5 * (x1 - xm)
    const c2 = xm - 2.5 * x0 + 2 * x1 - 0.5 * x2
    const c3 = 0.5 * (x2 - xm) + 1.5 * (x0 - x1)
    return ((c3 * t + c2) * t + c1) * t + x0
  }

  /** How much oxide has come off under the head, 0 to 1, smoothed so a cell
      edge is a slope rather than a step. */
  oxide(smooth: number): number {
    const wear = this.wear
    const want =
      wear && this.len > 0 ? (wear[(this.pos * PER_CELL) | 0] ?? 0) : 0
    this.worn = flushDenormal(this.worn + smooth * (want - this.worn))
    return this.worn
  }

  // What comes off the replay head: hiss laid on the medium, the gap's cliff
  // and the bump at wavelengths set by the speed, the playback amp's low cut,
  // and a gap where the oxide has gone.
  replay(raw: number, s: Settings): number {
    const n = this.gauss()
    this.hissY = flushDenormal(this.hissY + s.hissCoef * (n - this.hissY))
    const hiss = (n + 0.8 * (n - 2 * this.hissY)) * s.hiss
    const d = this.worn
    let y = raw + hiss
    if (--this.gapIn <= 0) {
      this.gapIn = CONTROL
      this.gc = d > 1e-3 ? 1 - Math.exp((1 - 0.75 * d) * s.gapLog) : s.gapC
    }
    const gc = this.gc
    this.gap = flushDenormal(this.gap + gc * (y - this.gap))
    this.gap2 = flushDenormal(this.gap2 + gc * (this.gap - this.gap2))
    y = this.gap2
    this.bumpLow = flushDenormal(this.bumpLow + s.bumpF * this.bumpBand)
    const high = y - this.bumpLow - BUMP_Q * this.bumpBand
    this.bumpBand = flushDenormal(this.bumpBand + s.bumpF * high)
    y += BUMP_Q * BUMP_DEPTH * this.bumpBand
    this.low1 = flushDenormal(this.low1 + s.lowC * (y - this.low1))
    y -= this.low1
    this.low2 = flushDenormal(this.low2 + s.lowC * (y - this.low2))
    y -= this.low2
    return y * (1 - 0.9 * d)
  }

  // What the record head lays down: the oxide's curve between a pre-emphasis
  // and its inverse, as the tape machine's head does it, then the top end the
  // medium cannot hold at this speed and this level.
  record(x: number, s: Settings): number {
    const xd = x * s.drive
    this.pre = flushDenormal(this.pre + s.emphCoef * (xd - this.pre))
    const field = this.pre + (1 + EMPH) * (xd - this.pre)
    // The offset rides a 60 Hz envelope, so it and its own clip are held for a
    // control period, both together so the curve stays read at one point.
    if (--this.selfIn <= 0) {
      this.selfIn = CONTROL
      const held = 1 - ERASE * this.mag
      this.selfC = 1 - Math.exp(held * held * s.recLog)
      this.offset = s.remanence * this.mag
      this.offsetClip = softclip(this.offset)
    }
    const rec =
      this.offset === 0
        ? softclip(field)
        : softclip(field + this.offset) - this.offsetClip
    const m = rec < 0 ? -rec : rec
    this.mag = flushDenormal(
      this.mag + (m > this.mag ? s.magAtk : s.magRel) * (m - this.mag),
    )
    this.de = flushDenormal(this.de + s.deCoef * (rec - this.de))
    const played = (this.de + (rec - this.de) / (1 + EMPH)) * s.makeup
    this.selfLp = flushDenormal(
      this.selfLp + this.selfC * (played - this.selfLp),
    )
    return this.selfLp
  }

  // The head has moved from `from` to `to`. Every frame that passed under it
  // gets the take, interpolated across the span so a fast tape is laid down
  // whole and a slow one is not written twice, over whatever the erase head
  // left of what was there. Oxide that has shed takes nothing.
  lay(from: number, to: number, u: number, keep: number, s: Settings) {
    const tape = this.tape
    const wear = this.wear
    if (!tape || !wear) return
    const n = this.len
    const span = to - from
    if (span === 0) {
      this.prevRec = u
      return
    }
    const forward = span > 0
    let j = forward ? Math.floor(from) + 1 : Math.ceil(from) - 1
    const stop = forward ? Math.floor(to) : Math.ceil(to)
    const u0 = this.prevRec
    for (; forward ? j <= stop : j >= stop; j += forward ? 1 : -1) {
      const at = j >= n ? j - n : j < 0 ? j + n : j
      const t = (j - from) / span
      const take = u0 + t * (u - u0)
      const old = tape[at]!
      this.biasLp = flushDenormal(this.biasLp + s.biasC * (old - this.biasLp))
      const kept = keep * (this.biasLp + BIAS_KEEP * (old - this.biasLp))
      const bare = 1 - wear[(at * PER_CELL) | 0]!
      tape[at] = softclip(kept + take * bare)
    }
    this.prevRec = u
  }

  // A cell the head has just come onto wears by a pass. Fresh damage starts
  // at random; damage already there deepens and spreads to its neighbours, so
  // a loop left running sheds in patches that grow, at the same places every
  // lap.
  scuff(amount: number) {
    const wear = this.wear
    if (!wear || amount <= 0 || this.len < CELL) return
    const cell = (this.pos * PER_CELL) | 0
    if (cell === this.wearAt) return
    this.wearAt = cell
    const cells = Math.ceil(this.len / CELL)
    const d = wear[cell]!
    if (d > 0) {
      const grown = Math.min(d + amount * 0.05 * (0.5 + this.rng()), 1)
      wear[cell] = grown
      if (grown > 0.3) {
        const side = this.rng() < 0.5 ? cell - 1 : cell + 1
        const k = (side + cells) % cells
        wear[k] = Math.min(wear[k]! + amount * 0.02, 1)
      }
    } else if (this.rng() < amount * 0.01) {
      wear[cell] = 0.05 + 0.2 * this.rng()
    }
  }

  reset() {
    this.pre = 0
    this.de = 0
    this.mag = 0
    this.selfLp = 0
    this.prevRec = 0
    this.biasLp = 0
    this.hissY = 0
    this.gap = 0
    this.gap2 = 0
    this.bumpLow = 0
    this.bumpBand = 0
    this.low1 = 0
    this.low2 = 0
    this.worn = 0
    this.gapIn = 0
    this.selfIn = 0
    this.offset = 0
    this.offsetClip = 0
    this.wearAt = -1
    this.enc.reset()
    this.dec.reset()
  }
}

interface Settings {
  drive: number
  makeup: number
  emphCoef: number
  deCoef: number
  remanence: number
  magAtk: number
  magRel: number
  recLog: number
  biasC: number
  hiss: number
  hissCoef: number
  gapLog: number
  gapC: number
  bumpF: number
  lowC: number
}

const keys = (k: 1 | 2 | 3 | 4) => ({
  input: IDX[`four${k}In`],
  trim: IDX[`four${k}Trim`],
  low: IDX[`four${k}Low`],
  midHz: IDX[`four${k}MidHz`],
  mid: IDX[`four${k}Mid`],
  high: IDX[`four${k}High`],
  send: IDX[`four${k}Send`],
  pan: IDX[`four${k}Pan`],
  fader: IDX[`four${k}Fader`],
  rec: IDX[`four${k}Rec`],
  erase: IDX[`four${k}Erase`],
  cue: IDX[`four${k}Cue`],
  len: IDX[`four${k}Len`],
})
const TRACK_IDX = ([1, 2, 3, 4] as const).map(keys)

export class FourTrack implements Stage {
  label = 'fourTrack'
  readonly loops: Loop[]
  private readonly strips: Strip[]
  private readonly amps = {
    aux: new LoopAmp(),
    l: new LoopAmp(),
    r: new LoopAmp(),
  }
  private readonly s: Settings
  private readonly gauss: Rng
  private aux = 0
  private auxHp = 0
  private wow = new SineOsc()
  private capstan = new SineOsc()
  private roller = new SineOsc()
  private hunt = new SineOsc()
  private drift = 0
  private motor = 1
  private load = 0
  private readonly e = new Float64Array(TRACKS)
  private readonly ret = new Float64Array(TRACKS)
  // The knobs, read once a block into arrays this owns.
  private readonly block = {
    input: new Int32Array(TRACKS),
    trim: new Float64Array(TRACKS),
    fader: new Float64Array(TRACKS),
    send: new Float64Array(TRACKS),
    cue: new Float64Array(TRACKS),
    panL: new Float64Array(TRACKS),
    panR: new Float64Array(TRACKS),
    rec: new Float64Array(TRACKS),
    keep: new Float64Array(TRACKS),
    /** A strip whose fader and record are both down feeds nothing. */
    used: new Uint8Array(TRACKS),
    /** A head nobody is listening to: cue down, and no strip reading it. */
    heard: new Uint8Array(TRACKS),
  }
  private readonly motorC: number
  private readonly loadC: number
  private readonly driftC: number
  private readonly auxC: number
  private readonly smooth: number

  constructor(
    private readonly sr: number,
    seed = 1,
  ) {
    const draw = mulberry32(seed)
    const next = () => (draw() * 0x1_0000_0000) >>> 0
    this.gauss = gaussian(mulberry32(next()))
    this.loops = Array.from(
      { length: TRACKS },
      () => new Loop(sr, gaussian(mulberry32(next())), mulberry32(next())),
    )
    this.strips = Array.from(
      { length: TRACKS },
      () => new Strip(gaussian(mulberry32(next()))),
    )
    const g = 1 + EMPH
    const a = 1 - lpCoef(EMPH_HZ, sr)
    this.s = {
      drive: 1,
      makeup: 1,
      emphCoef: 1 - a,
      deCoef: 1 - (g * a) / (g + (1 - a) * (1 - g)),
      remanence: 0,
      magAtk: lpCoef(60, sr),
      magRel: lpCoef(2.5, sr),
      recLog: 0,
      biasC: 0,
      hiss: 0,
      hissCoef: lpCoef(1500, sr),
      gapLog: 0,
      gapC: 0,
      bumpF: 0,
      lowC: lpCoef(LOW_CUT_HZ / GAP_POLE, sr),
    }
    this.motorC = coef(0.08, sr / BLOCK)
    this.loadC = coef(0.05, sr)
    this.driftC = lpCoef(0.12, sr)
    this.auxC = lpCoef(AUX_HP_HZ, sr)
    this.smooth = lpCoef(120, sr)
  }

  // Running whenever the desk is up or a track is armed: a loop being laid
  // down with the master fader shut is still a loop being laid down.
  when(p: Float32Array) {
    if (p[IDX.fourLevel]! > 0) return true
    for (const t of TRACK_IDX) if (p[t.rec]! > 0) return true
    return false
  }

  process(io: StereoBlock, p: Float32Array, ctx: Ctx) {
    const sr = this.sr
    const s = this.s
    const b = this.block
    const level = p[IDX.fourLevel]!
    const flip = Math.round(p[IDX.fourSide]!) === 1
    const dbx = Math.round(p[IDX.fourDbx]!) === 1
    const battery = p[IDX.fourBattery]!
    const wearAmt = p[IDX.fourWear]!
    const auxMaster = p[IDX.fourAux]!

    const drive = Math.pow(10, p[IDX.fourDrive]! / 20)
    s.drive = drive
    s.makeup = softclip(REPLAY_REF) / softclip(REPLAY_REF * drive)
    s.remanence = REMANENCE

    // Four cells power the desk and the motor. A flat set drops the op-amps'
    // rails, slows and hardens them, and drags the motor, and the louder the
    // desk works the more it drags.
    const rail = 1 - 0.55 * battery
    const v = ampVoicing(
      0.5 + 0.4 * battery,
      0.1,
      0.15 + 0.35 * battery,
      0.5 * battery,
      sr,
    )
    const sag =
      battery * SAG * (1 - SAG_LOAD + SAG_LOAD * Math.min(this.load, 2))
    this.motor += this.motorC * (1 - sag - this.motor)
    const nominal =
      (Math.round(p[IDX.fourSpeed]!) === 1 ? 2 : 1) *
      (1 + p[IDX.fourPitch]!) *
      this.motor
    const dir = flip ? -1 : 1

    // Wavelength sets both heads' corners and the bump, so they follow the
    // speed: a dying motor goes dull as it goes flat. Read once a block at the
    // speed the motor is making; wow and flutter move it by a percent.
    s.gapLog = Math.log(
      1 - lpCoef(Math.min(GAP_HZ * nominal * GAP_POLE, sr * 0.47), sr),
    )
    s.gapC = 1 - Math.exp(s.gapLog)
    s.recLog = Math.log(
      1 - lpCoef(Math.min(GAP_HZ * nominal * 1.2, sr * 0.47), sr),
    )
    s.biasC = lpCoef(Math.min(BIAS_ERASE_HZ * nominal, sr * 0.45), sr)
    s.bumpF = 2 * Math.sin((Math.PI * BUMP_HZ * nominal) / sr)
    s.hiss = p[IDX.fourHiss]! * HISS * Math.pow(nominal, HISS_SLOPE)
    const wowK = SineOsc.rate(WOW_HZ * nominal, sr)
    const capK = SineOsc.rate(CAPSTAN_HZ * nominal, sr)
    const rollK = SineOsc.rate(ROLLER_HZ * nominal, sr)
    const huntK = SineOsc.rate(HUNT_HZ, sr)
    const huntAmt = HUNT_DEPTH * battery * battery
    const wowAmt = p[IDX.fourWow]! * WOW_DEPTH
    const flutAmt = p[IDX.fourFlutter]! * FLUTTER_DEPTH

    const pitchLane = ctx.mod.read(DEST.fourPitch)
    const auxLane = ctx.mod.read(DEST.fourAux)
    const midLane = ctx.mod.read(DEST.four1MidHz)
    for (let k = 0; k < TRACKS; k++) {
      const t = TRACK_IDX[k]!
      const midHz =
        k === 0 && midLane
          ? p[t.midHz]! * octaves(midLane[0]! * 2)
          : p[t.midHz]!
      this.strips[k]!.tune(p[t.low]!, midHz, p[t.mid]!, p[t.high]!, sr)
      b.input[k] = Math.round(p[t.input]!)
      const trimDb = p[t.trim]!
      b.trim[k] = trimDb <= TRIM_FLOOR_DB ? 0 : Math.pow(10, trimDb / 20)
      b.fader[k] = p[t.fader]!
      b.send[k] = p[t.send]!
      b.cue[k] = p[t.cue]!
      const th = (p[t.pan]! + 1) * (Math.PI / 4)
      b.panL[k] = Math.cos(th)
      b.panR[k] = Math.sin(th)
      b.rec[k] = p[t.rec]!
      b.keep[k] = 1 - p[t.erase]!
      b.used[k] = b.fader[k]! > 0 || b.rec[k]! > 0 ? 1 : 0
      // A track with no loop threaded has no oxide to read, hiss included.
      b.heard[k] =
        this.loops[flip ? TRACKS - 1 - k : k]!.tape &&
        (b.cue[k]! > 0 || (b.used[k] && b.input[k] === INPUT_TAPE))
          ? 1
          : 0
      const loop = this.loops[k]!
      const frames = Math.round(Math.min(p[t.len]!, MAX_LOOP_S) * sr)
      if (b.rec[k]! > 0 && (loop.tape?.length ?? 0) < frames)
        loop.thread(
          Math.min(
            Math.ceil(frames / (GROW_S * sr)) * GROW_S * sr,
            MAX_LOOP_S * sr,
          ),
        )
      if (loop.tape) {
        loop.len = Math.min(Math.max(frames, CELL), loop.tape.length)
        if (loop.pos >= loop.len) loop.pos %= loop.len
      }
    }

    let anySend = false
    for (let k = 0; k < TRACKS; k++) if (b.send[k]! > 0) anySend = true
    const auxOn = anySend && (auxMaster > 0 || auxLane !== null)
    if (!auxOn) this.aux = 0

    const out = ctx.out
    const mic = ctx.mic
    for (let i = 0; i < io.n; i++) {
      // One capstan moves every track, so they all wobble and sag together.
      this.drift = flushDenormal(
        this.drift + this.driftC * (this.gauss() - this.drift),
      )
      const wobble =
        wowAmt * (0.7 * this.wow.step(wowK) + 18 * this.drift) +
        flutAmt *
          (0.6 * this.capstan.step(capK) + 0.4 * this.roller.step(rollK)) +
        huntAmt * this.hunt.step(huntK)
      const wired = pitchLane ? nominal * octaves(pitchLane[i]!) : nominal
      const vel = dir * Math.max(wired * (1 + wobble), 0.01)

      // The heads read first, so a lap plays what the last one left.
      for (let k = 0; k < TRACKS; k++) {
        if (!b.heard[k]) {
          this.ret[k] = 0
          continue
        }
        const loop = this.loops[flip ? TRACKS - 1 - k : k]!
        loop.oxide(this.smooth)
        let r = loop.replay(loop.read(), s)
        if (dbx) r = loop.dec.process(r)
        this.ret[k] = r
      }

      let auxSum = 0
      let busL = 0
      let busR = 0
      let draw = 0
      for (let k = 0; k < TRACKS; k++) {
        if (!b.used[k]) {
          this.e[k] = 0
          const cue = this.ret[k]! * b.cue[k]!
          busL += cue * b.panL[k]!
          busR += cue * b.panR[k]!
          continue
        }
        const src = b.input[k]!
        const x =
          src === INPUT_TAPE
            ? this.ret[k]!
            : src === INPUT_BOARD
              ? out[i]!
              : src === INPUT_MIC
                ? mic[i]!
                : this.aux
        const e = this.strips[k]!.process(x, b.trim[k]!, rail, v)
        this.e[k] = e
        const f = e * b.fader[k]!
        auxSum += f * b.send[k]!
        const sum = f + this.ret[k]! * b.cue[k]!
        busL += sum * b.panL[k]!
        busR += sum * b.panR[k]!
        draw += e < 0 ? -e : e
      }
      this.load = flushDenormal(this.load + this.loadC * (draw - this.load))

      // The aux bus returns to whichever channel has its input on aux, a sample
      // late, through the cap that couples it.
      if (auxOn) {
        const sent =
          auxSum * (auxLane ? Math.max(auxMaster + auxLane[i]!, 0) : auxMaster)
        this.auxHp = flushDenormal(this.auxHp + this.auxC * (sent - this.auxHp))
        this.aux =
          this.amps.aux.process((sent - this.auxHp) / HEADROOM, rail, v) *
          HEADROOM
      }

      // The record heads write behind the play heads, and the tape moves on.
      for (let k = 0; k < TRACKS; k++) {
        const loop = this.loops[flip ? TRACKS - 1 - k : k]!
        const n = loop.len
        if (!loop.tape || n === 0) continue
        const from = loop.pos
        const recLvl = b.rec[k]!
        if (recLvl > 0) {
          let u = this.e[k]! * recLvl
          if (dbx) u = loop.enc.process(u)
          const behind = from - (vel > 0 ? HEAD_GAP : -HEAD_GAP)
          loop.lay(behind, behind + vel, loop.record(u, s), b.keep[k]!, s)
        }
        const to = from + vel
        loop.pos = to >= n ? to - n : to < 0 ? to + n : to
        loop.scuff(wearAmt)
      }

      const l = this.amps.l.process(busL / HEADROOM, rail, v) * HEADROOM
      const r = this.amps.r.process(busR / HEADROOM, rail, v) * HEADROOM
      io.l[i]! += l * level
      io.r[i]! += r * level
    }
  }

  panic() {
    for (const loop of this.loops) loop.reset()
    for (const strip of this.strips) strip.reset()
    this.amps.aux.reset()
    this.amps.l.reset()
    this.amps.r.reset()
    this.aux = 0
    this.auxHp = 0
    this.wow.reset()
    this.capstan.reset()
    this.roller.reset()
    this.hunt.reset()
    this.drift = 0
    this.motor = 1
    this.load = 0
  }
}
