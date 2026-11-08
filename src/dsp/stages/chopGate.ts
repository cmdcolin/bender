import { octaves } from '../util/pitch.ts'
import { mulberry32, type Rng } from '../util/rng.ts'

export const CHOP_FILLS = [
  'silence',
  'repeat',
  'reverse',
  'pitch',
  'crush',
  'skip',
  'burst',
  'any',
]

const SILENCE = 0
const REPEAT = 1
const REVERSE = 2
const PITCH = 3
const CRUSH = 4
const SKIP = 5
const BURST = 6
const ANY = 7
const ANY_PICKS = [SKIP, PITCH, CRUSH, REVERSE, REPEAT, BURST]
const BURST_SPLITS = [2, 3, 4, 6, 8, 16]
const BURST_FADE = 48
const BURST_STEADY = 0.35
const BURST_RAMP_MIN = 0.7
const BURST_RAMP_SPAN = 0.7

const BUFFER_S = 1.5
const WOBBLE_OCTAVES = 4
const DUTY_SWING = 0.5
const DUTY_MIN = 0.02
const DUTY_MAX = 0.98
const EDGE_S = 0.005
const MIN_LOOP = 96
const SKIP_MIN_S = 0.001
const SKIP_SPAN_S = 0.024
const PITCH_SEMITONES = 24
const HOLD_MIN_HZ = 150
const HOLD_SPAN_HZ = 2500
const MAX_BITS = 4
const PEAK_DECAY = 0.99995
const PEAK_FLOOR = 1e-15
const SNAP = 1e-6
const OPEN_AT = 0.3
const SHUT_AT = 0.05

class Clock {
  phase = 0
  jump = 1
  jitter = 0
  open = true
  openLen = 0

  reset() {
    this.phase = 0
    this.jump = 1
    this.jitter = 0
    this.open = true
    this.openLen = 0
  }
}

class Lane {
  readonly buf: Float32Array
  w = 0
  k = 0
  loopEnd = 0
  loopLen = MIN_LOOP
  speed = 1
  held = 0
  holdLeft = 0
  holdEvery = 1
  bits = 1
  burstAt = 0
  burstLen = MIN_LOOP
  burstRatio = 1
  mode = SILENCE
  peak = 0.01
  gain = 1
  readonly clock = new Clock()

  constructor(size: number) {
    this.buf = new Float32Array(size)
  }

  reset() {
    this.buf.fill(0)
    this.w = 0
    this.k = 0
    this.held = 0
    this.holdLeft = 0
    this.peak = 0.01
    this.gain = 1
    this.mode = SILENCE
    this.clock.reset()
  }

  at(i: number) {
    const n = this.buf.length
    return this.buf[((i % n) + n) % n]!
  }

  fill(x: number) {
    this.k++
    const k = this.k - 1
    switch (this.mode) {
      case REPEAT:
        return this.at(this.loopEnd - this.loopLen + (k % this.loopLen))
      case BURST: {
        const fade = Math.min(
          1,
          this.burstAt / BURST_FADE,
          (this.burstLen - this.burstAt) / BURST_FADE,
        )
        const y = fade * this.at(this.loopEnd - this.burstLen + this.burstAt)
        this.burstAt++
        if (this.burstAt >= this.burstLen) {
          this.burstAt = 0
          this.burstLen = Math.round(
            Math.min(
              Math.max(this.burstLen * this.burstRatio, MIN_LOOP),
              this.loopLen,
            ),
          )
        }
        return y
      }
      case REVERSE:
        return this.at(this.loopEnd - 1 - (k % this.loopLen))
      case PITCH: {
        const pos = (k * this.speed) % this.loopLen
        const i = Math.floor(pos)
        const a = this.at(this.loopEnd - this.loopLen + i)
        const b = this.at(this.loopEnd - this.loopLen + i + 1)
        return a + (b - a) * (pos - i)
      }
      case CRUSH: {
        if (this.holdLeft-- <= 0) {
          this.held = x
          this.holdLeft = this.holdEvery
        }
        const q = 2 ** this.bits
        return (Math.round((this.held / this.peak) * q) / q) * this.peak
      }
      default:
        return 0
    }
  }
}

// The closed half of a pulse-width clock whose period and width are redrawn
// every cycle. Open it passes the signal; closed it plays silence or one of
// several things made out of what it just heard.
export class ChopGate {
  outL = 0
  outR = 0
  private readonly lanes: Lane[]
  private readonly rng: Rng
  private readonly sr: number
  private duty = 0.5
  private wobble = 0
  private depth = 1
  private edgeCoef = 1
  private fill = SILENCE

  constructor(sr: number, seed: number) {
    this.sr = sr
    this.rng = mulberry32(seed)
    const size = Math.ceil(BUFFER_S * sr)
    this.lanes = [new Lane(size), new Lane(size)]
  }

  configure(
    duty: number,
    wobble: number,
    depth: number,
    edge: number,
    fill: number,
  ) {
    this.duty = duty
    this.wobble = wobble
    this.depth = depth
    this.edgeCoef = edge > 0 ? 1 - Math.exp(-1 / (edge * EDGE_S * this.sr)) : 1
    this.fill = Math.min(Math.max(fill, SILENCE), ANY)
  }

  step(hz: number, l: number, r: number, level: number, follow: boolean) {
    this.outL = this.run(this.lanes[0]!, hz, l, level, follow)
    this.outR = this.run(this.lanes[1]!, hz, r, level, follow)
  }

  private run(
    lane: Lane,
    hz: number,
    x: number,
    level: number,
    follow: boolean,
  ) {
    const clock = lane.clock
    const open = follow ? this.schmitt(clock, level) : this.tick(clock, hz)
    if (open && !clock.open) clock.openLen = 0
    const closing = !open && clock.open
    clock.open = open
    if (open) clock.openLen++
    if (closing) this.close(lane)
    return this.lane(lane, x, open)
  }

  private schmitt(clock: Clock, level: number) {
    return Math.abs(level) > (clock.open ? SHUT_AT : OPEN_AT)
  }

  private tick(clock: Clock, hz: number) {
    clock.phase += (hz * clock.jump) / this.sr
    if (clock.phase >= 1) {
      clock.phase %= 1
      clock.jump = octaves((this.rng() * 2 - 1) * this.wobble * WOBBLE_OCTAVES)
      clock.jitter = (this.rng() * 2 - 1) * this.wobble * DUTY_SWING
    }
    const width = Math.min(
      Math.max(this.duty + clock.jitter, DUTY_MIN),
      DUTY_MAX,
    )
    return clock.phase < width
  }

  private close(lane: Lane) {
    const rng = this.rng
    lane.mode =
      this.fill === ANY
        ? ANY_PICKS[Math.floor(rng() * ANY_PICKS.length)]!
        : this.fill
    lane.loopEnd = lane.w
    lane.loopLen = Math.min(
      Math.max(lane.clock.openLen, MIN_LOOP),
      lane.buf.length - 2,
    )
    lane.k = 0
    if (lane.mode === SKIP) {
      lane.mode = REPEAT
      lane.loopLen = Math.round(
        this.sr * (SKIP_MIN_S + SKIP_SPAN_S * rng() ** 2),
      )
    }
    if (lane.mode === BURST) {
      const splits = BURST_SPLITS[Math.floor(rng() * BURST_SPLITS.length)]!
      lane.loopLen = Math.max(Math.floor(lane.clock.openLen / splits), MIN_LOOP)
      lane.burstLen = lane.loopLen
      lane.burstAt = 0
      lane.burstRatio =
        rng() < BURST_STEADY ? 1 : BURST_RAMP_MIN + rng() * BURST_RAMP_SPAN
    }
    lane.speed = octaves(Math.round((rng() * 2 - 1) * PITCH_SEMITONES) / 12)
    lane.holdEvery = Math.round(this.sr / (HOLD_MIN_HZ + rng() * HOLD_SPAN_HZ))
    lane.bits = 1 + Math.floor(rng() * MAX_BITS)
  }

  private lane(lane: Lane, x: number, open: boolean) {
    lane.peak = Math.max(Math.abs(x), lane.peak * PEAK_DECAY, PEAK_FLOOR)
    const target = open ? 1 : 0
    lane.gain += (target - lane.gain) * this.edgeCoef
    if (Math.abs(target - lane.gain) < SNAP) lane.gain = target
    const heard = lane.gain
    const closedPart =
      this.fill === SILENCE
        ? (1 - this.depth) * x
        : this.depth * (heard < 1 ? lane.fill(x) : 0)
    lane.buf[lane.w] = x
    lane.w = (lane.w + 1) % lane.buf.length
    return heard * x + (1 - heard) * closedPart
  }

  reset() {
    for (const lane of this.lanes) lane.reset()
  }
}
