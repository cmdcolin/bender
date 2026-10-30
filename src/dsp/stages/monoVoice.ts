import { Drunk } from '../util/drift.ts'
import { Halfband } from '../util/halfband.ts'
import { removeAt } from '../util/list.ts'
import { DcBlocker } from '../util/onepole.ts'
import { octaves, wrap1 } from '../util/pitch.ts'
import { gaussian, mulberry32, type Rng } from '../util/rng.ts'
import { flushDenormal, softclip } from '../util/softclip.ts'

export const WAVE = {
  tri: 0,
  saw: 1,
  square: 2,
  wide: 3,
  narrow: 4,
} as const

const PULSE_WIDTH = [0.5, 0.5, 0.5, 0.3, 0.12]

export const MONO_WAVE_NAMES = ['triangle', 'saw', 'square', 'wide', 'narrow']
export const MONO_RANGE_NAMES = ['32′', '16′', '8′', '4′', '2′']
export const MONO_OSC3_NAMES = ['keyed', 'free', 'lo']

export const SYNC = { off: 0, hard: 1, soft: 2 } as const

export interface MonoPatch {
  wave: [number, number, number]
  /** octaves from 8' */
  range: [number, number, number]
  /** semitones */
  fine: [number, number, number]
  level: [number, number, number]
  noise: number
  /** the output patched back into the mixer, the way a Model D's headphone jack went into its external input */
  loop: number
  ext: number
  /** `soft` resets osc 2 on osc 1's wrap only when osc 2 is in the last `SOFT_WINDOW` of its own cycle */
  sync: number
  /** osc 2 into osc 1's linear FM input, in multiples of osc 1's frequency; past 1 osc 1 runs backwards through zero */
  linFm: number
  /** osc 3 off the keyboard: it runs at its own pitch, `lo` drops it to sub-audio */
  osc3Free: boolean
  osc3Lo: boolean
  cutoff: number
  /** 0 to 1.1, self-oscillation from about 0.95 */
  emphasis: number
  /** octaves of cutoff the filter contour opens at its peak */
  contour: number
  /** 0 to 1, how far the cutoff follows the key */
  track: number
  /** gain into the ladder */
  drive: number
  /** 0 to 1, how much of the passband the emphasis takes away is put back */
  bassComp: number
  fA: number
  fD: number
  fS: number
  fR: number
  aA: number
  aD: number
  aS: number
  aR: number
  glide: number
  /** 0 osc 3, 1 noise */
  modMix: number
  modAmt: number
  /** semitones at full mod */
  modPitch: number
  /** octaves at full mod */
  modFilter: number
  /** semitones the filter contour pushes osc 2, for a sync sweep */
  envOsc2: number
  /** cents of slow wander per oscillator */
  drift: number
  volume: number

  /** The expo converter's transistor pair, unheated: tracking stretches and each oscillator drifts separately. */
  heat: number
  /** The VCA never closes: this much of the mixer leaks through at rest. */
  vcaLeak: number
  /** The envelope timing caps, swapped for ones this many times larger. */
  envCap: number
  /** One transistor pair in the ladder mismatched: 0 matched, 1 a stage three times off. */
  mismatch: number
  /** The pitch sample-and-hold leaking toward 0 V, per second. */
  droop: number
  /** A bit on the key DAC stuck high, -1 for none. */
  dacBit: number
  /** How far a loud note pulls the supply, and the pitch with it. */
  sag: number
  /** How hard an accented note hits the VCA and the cutoff. */
  accent: number
}

export const MONO_DEFAULT: MonoPatch = {
  wave: [WAVE.saw, WAVE.saw, WAVE.square],
  range: [-1, -1, -2],
  fine: [0, 0.07, 0],
  level: [0.8, 0.7, 0.5],
  noise: 0,
  loop: 0,
  ext: 0,
  sync: SYNC.off,
  linFm: 0,
  osc3Free: false,
  osc3Lo: false,
  cutoff: 400,
  emphasis: 0.3,
  contour: 2.5,
  track: 0.33,
  drive: 1,
  bassComp: 0.4,
  fA: 0.002,
  fD: 0.3,
  fS: 0.3,
  fR: 0.15,
  aA: 0.002,
  aD: 0.4,
  aS: 0.85,
  aR: 0.08,
  glide: 0,
  modMix: 0,
  modAmt: 0,
  modPitch: 0,
  modFilter: 0,
  envOsc2: 0,
  drift: 1,
  volume: 0.7,
  heat: 0,
  vcaLeak: 0,
  envCap: 1,
  mismatch: 0,
  droop: 0,
  dacBit: -1,
  sag: 0,
  accent: 0,
}

const OS = 2
// The share of osc 2's cycle, counted back from its wrap, in which a pulse from
// osc 1 pushes it over the threshold.
const SOFT_WINDOW = 0.25
const LO_HZ = 0.25
const DRIFT_HZ = 0.15
const CONTROL = 16
const ACCENT_OCTAVES = 3
const ACCENT_VCA = 0.8
const ACCENT_DECAY_S = 0.2
// The 303 gangs its resonance pot with the accent cap's resistor, so emphasis
// slows the cap and back-to-back accents stack higher.
const ACCENT_CAP_S = 0.02
const ACCENT_CAP_EMPH_S = 0.3
const SLIDE_S = 0.06
// Hiss at the ladder input, enough to start it oscillating from silence.
const FLOOR = 1e-4
// The nonlinear gains in the ladder detune its resonance flat by about this much.
const TUNE = 1.02

// tanh(x)/x as a rational, for the ladder's per-stage gains.
function tanhXdX(x: number): number {
  const a = x * x
  return ((a + 105) * a + 945) / ((15 * a + 420) * a + 945)
}

// Padé [5/4], within a ten-thousandth of tan up to 0.45 of the rate.
function tan(x: number): number {
  const a = x * x
  return (x * (945 + a * (a - 105))) / (945 + a * (15 * a - 420))
}

function blep(t: number, dt: number): number {
  if (t < dt) {
    const x = t / dt
    return x + x - x * x - 1
  }
  if (t > 1 - dt) {
    const x = (t - 1) / dt
    return x * x + x + x + 1
  }
  return 0
}

// The oscillators and the ladder take their doubles in fields and leave what
// they make in one, rather than through arguments and returns: render() runs
// out of V8's inlining budget long before it has inlined three of each, and a
// call it does not inline boxes every double that crosses it.
class Osc {
  phase = 0
  /** the step `advance` takes, a cycle per sample */
  dt = 0
  wrapped = false
  /** samples since the wrap, when this sample wrapped */
  since = 0
  /** soft sync's window, for `synced` */
  window = 1
  /** what `value` or `synced` made */
  out = 0
  private held = 0

  reset() {
    this.phase = 0
    this.dt = 0
    this.wrapped = false
    this.since = 0
    this.held = 0
  }

  advance() {
    const dt = this.dt
    this.phase += dt
    this.wrapped = this.phase >= 1 || this.phase < 0
    if (this.phase >= 1) {
      this.phase -= 1
      this.since = this.phase / dt
    } else if (this.phase < 0) {
      this.phase += 1
      this.since = (this.phase - 1) / dt
    }
  }

  value(wave: number) {
    const p = this.phase
    const dt = Math.abs(this.dt)
    if (wave === WAVE.tri) this.out = p < 0.5 ? 4 * p - 1 : 3 - 4 * p
    else if (wave === WAVE.saw) this.out = 2 * p - 1 - blep(p, dt)
    else {
      const pw = PULSE_WIDTH[wave]!
      this.out = (p < pw ? 1 : -1) + blep(p, dt) - blep(wrap1(p + 1 - pw), dt)
    }
  }

  /**
   * Reset by the master `since` samples ago if this oscillator was within
   * `window` of the end of its cycle then, with the step spread across this
   * sample and the one before it. Output runs a sample late so the one before
   * is still there to correct.
   */
  synced(wave: number, master: Osc) {
    const window = this.window
    let now: number
    if (
      master.wrapped &&
      (window >= 1 || this.phase - master.since * this.dt >= 1 - window)
    ) {
      const old = naive(wave, this.phase)
      this.phase = master.since * this.dt
      const d = master.since
      now = naive(wave, this.phase)
      const jump = now - old
      this.held += (jump / 2) * d * d
      now -= (jump / 2) * (1 - d) * (1 - d)
    } else {
      this.value(wave)
      now = this.out
    }
    this.out = this.held
    this.held = now
  }
}

function naive(wave: number, p: number): number {
  if (wave === WAVE.tri) return p < 0.5 ? 4 * p - 1 : 3 - 4 * p
  if (wave === WAVE.saw) return 2 * p - 1
  return p < PULSE_WIDTH[wave]! ? 1 : -1
}

// ln(1.3 / 0.3): charging toward 1.3, this many time constants reach 1.
const ATTACK_TAUS = 1.466

// An analog envelope: an RC charging toward a target past the top for the
// attack, then toward the sustain, then toward the floor.
class Contour {
  level = 0
  stage = 0
  private ka = 0
  private kd = 0
  private kr = 0
  private s = 0

  gate(on: boolean) {
    this.stage = on ? 1 : 3
  }

  set(a: number, d: number, s: number, r: number, sr: number) {
    this.ka = 1 - Math.exp(-ATTACK_TAUS / (a * sr))
    this.kd = 1 - Math.exp(-3 / (d * sr))
    this.kr = Math.exp(-3 / (r * sr))
    this.s = s
  }

  step() {
    switch (this.stage) {
      case 1:
        this.level += (1.3 - this.level) * this.ka
        if (this.level >= 1) {
          this.level = 1
          this.stage = 2
        }
        break
      case 2:
        this.level = flushDenormal(this.level + (this.s - this.level) * this.kd)
        break
      case 3:
        this.level = flushDenormal(this.level * this.kr)
        break
    }
  }
}

class Ladder {
  private s0 = 0
  private s1 = 0
  private s2 = 0
  private s3 = 0
  private zi = 0
  /** the sample in, and once `process` has run, the sample out */
  y = 0
  /** cutoff as a per-sample coefficient, resonance, and how far the last
      pole's corner sits from the other three */
  f = 0
  r = 0
  skew = 1

  process() {
    const { f, r, skew } = this
    const x = this.y
    const ih = 0.5 * (x + this.zi)
    this.zi = x
    const f0 = f
    const f1 = f
    const f2 = f
    const f3 = f * skew
    const t0 = tanhXdX(ih - r * this.s3)
    const t1 = tanhXdX(this.s0)
    const t2 = tanhXdX(this.s1)
    const t3 = tanhXdX(this.s2)
    const t4 = tanhXdX(this.s3)
    const g0 = 1 / (1 + f0 * t1)
    const g1 = 1 / (1 + f1 * t2)
    const g2 = 1 / (1 + f2 * t3)
    const g3 = 1 / (1 + f3 * t4)
    const c3 = f3 * g3 * t3
    const c2 = f2 * g2 * t2 * c3
    const c1 = f1 * g1 * t1 * c2
    const c0 = f0 * g0 * t0 * c1
    const y3 =
      (g3 * this.s3 +
        c3 * g2 * this.s2 +
        c2 * g1 * this.s1 +
        c1 * g0 * this.s0 +
        c0 * ih) /
      (1 + r * c0)
    const xx = t0 * (ih - r * y3)
    const y0 = t1 * g0 * (this.s0 + f0 * xx)
    const y1 = t2 * g1 * (this.s1 + f1 * y0)
    const y2 = t3 * g2 * (this.s2 + f2 * y1)
    this.s0 = flushDenormal(this.s0 + 2 * f0 * (xx - y0))
    this.s1 = flushDenormal(this.s1 + 2 * f1 * (y0 - y1))
    this.s2 = flushDenormal(this.s2 + 2 * f2 * (y1 - y2))
    this.s3 = flushDenormal(this.s3 + 2 * f3 * (y2 - t4 * y3))
    this.y = y3
  }

  reset() {
    this.s0 = this.s1 = this.s2 = this.s3 = this.zi = 0
  }
}

// A three-oscillator monosynth after the Model D: oscillators and ladder run at
// twice the board's rate and come down through a half-band.
export class MonoVoice {
  patch: MonoPatch = {
    ...MONO_DEFAULT,
    wave: [...MONO_DEFAULT.wave],
    range: [...MONO_DEFAULT.range],
    fine: [...MONO_DEFAULT.fine],
    level: [...MONO_DEFAULT.level],
  }

  private readonly osr: number
  private readonly osc0 = new Osc()
  private readonly osc1 = new Osc()
  private readonly osc2 = new Osc()
  private readonly drunk = [new Drunk(), new Drunk(), new Drunk()]
  private readonly heatWalk = [new Drunk(), new Drunk(), new Drunk()]
  private readonly heatScale: [number, number, number]
  private readonly fEnv = new Contour()
  private readonly aEnv = new Contour()
  private readonly ladder = new Ladder()
  private readonly down = new Halfband()
  private readonly dc = new DcBlocker()
  private readonly rng: Rng
  private readonly noise: Rng
  private readonly held: number[] = []
  private velocity = 1
  private accentEnv = 0
  private accentCap = 0
  private boost = 1
  private boostTarget = 1
  private sliding = false
  /** semitones on every oscillator keyed off the keyboard, a block at a time */
  bend = 0
  /** octaves on the cutoff, a block at a time */
  open = 0
  private pinkish = 0
  private cv = 48
  private target = 48
  private last = 0
  private sagEnv = 0
  private v1 = 0
  private v2 = 0
  private tick = 0
  private readonly ratio = new Float64Array(3)

  constructor(sr: number, seed = 0x4d0e) {
    this.osr = sr * OS
    this.rng = mulberry32(seed)
    this.noise = gaussian(this.rng)
    this.heatScale = [
      0.6 + 0.8 * this.rng(),
      -(0.4 + 0.8 * this.rng()),
      0.3 + 0.9 * this.rng(),
    ]
  }

  noteOn(note: number, velocity = 1, accent = false, slide = false) {
    this.velocity = velocity
    this.sliding = slide
    this.boostTarget = accent ? 1 + ACCENT_VCA * this.patch.accent : 1
    if (accent) this.accentEnv = 1
    const i = this.held.indexOf(note)
    if (i >= 0) removeAt(this.held, i)
    const legato = this.held.length > 0
    this.held.push(note)
    this.target = this.keyed(note)
    if (!legato) {
      if (this.patch.glide === 0) this.cv = this.target
      this.fEnv.gate(true)
      this.aEnv.gate(true)
    }
  }

  noteOff(note: number) {
    const i = this.held.indexOf(note)
    if (i < 0) return
    removeAt(this.held, i)
    if (this.held.length > 0) {
      this.target = this.keyed(this.held.at(-1)!)
      return
    }
    this.fEnv.gate(false)
    this.aEnv.gate(false)
  }

  private keyed(note: number): number {
    const bit = this.patch.dacBit
    return bit >= 0 ? note | (1 << bit) : note
  }

  // Everything that moves slower than a note: drift, the heated converter's
  // wander and stretch, and the envelope coefficients.
  private control() {
    const p = this.patch
    const osr = this.osr
    const cap = p.envCap
    const sr = osr / OS
    this.fEnv.set(p.fA * cap, p.fD * cap, p.fS, p.fR * cap, sr)
    this.aEnv.set(p.aA * cap, p.aD * cap, p.aS, p.aR * cap, sr)
    const driftSemis = (p.drift + 12 * p.heat) / 100
    for (let j = 0; j < 3; j++) {
      const wander =
        driftSemis * this.drunk[j]!.step(DRIFT_HZ * CONTROL, sr, this.rng)
      const hot =
        p.heat > 0
          ? 0.4 *
            p.heat *
            this.heatScale[j]! *
            this.heatWalk[j]!.step(0.03 * CONTROL, sr, this.rng)
          : 0
      const stretch = p.heat * 0.04 * this.heatScale[j]! * (this.cv - 36)
      const tune = 12 * p.range[j]! + p.fine[j]! + wander + hot
      this.ratio[j] =
        j === 2 && p.osc3Free
          ? p.osc3Lo
            ? LO_HZ * octaves(tune / 12)
            : 440 * octaves((tune + 48 - 69) / 12)
          : octaves((tune + stretch) / 12)
    }
  }

  /** Every key up at once, the gate closing the way it does on a key-off. */
  allOff() {
    this.held.length = 0
    this.fEnv.gate(false)
    this.aEnv.gate(false)
  }

  /** The key the voice is playing, or -1 with no key down. */
  get sounding(): number {
    return this.held.at(-1) ?? -1
  }

  /**
   * Fills `out` from `from` to `to`. `pitchLane` and `cutoffLane` are in
   * octaves, a sample each and indexed like `out`, on top of the block-rate
   * `bend` (semitones) and `open` (octaves). Pitch, cutoff and the contours
   * move at the board's rate; the oscillators and the ladder run at twice it.
   */
  render(
    out: Float32Array,
    from: number,
    to: number,
    ext?: Float32Array | null,
    pitchLane?: Float32Array | null,
    cutoffLane?: Float32Array | null,
  ) {
    const p = this.patch
    const osr = this.osr
    const sr = osr / OS
    const { osc0, osc1, osc2, ratio, fEnv, aEnv, ladder } = this
    const glideS = this.sliding ? SLIDE_S : p.glide
    const glideK = glideS > 0 ? 1 - Math.exp(-1 / (glideS * sr)) : 1
    const accentFall = Math.exp(-1 / (ACCENT_DECAY_S * p.envCap * sr))
    const accentCapK =
      1 - Math.exp(-1 / ((ACCENT_CAP_S + ACCENT_CAP_EMPH_S * p.emphasis) * sr))
    const accentOct = ACCENT_OCTAVES * p.accent
    const boostK = 1 - Math.exp(-1 / (0.002 * sr))
    const droopK = p.droop > 0 ? 1 - Math.exp(-p.droop / sr) : 0
    const r = 4.2 * p.emphasis
    const comp = 1 + p.bassComp * r * 0.75
    const skew = 1 + 2 * p.mismatch
    const leak = p.vcaLeak * 0.35
    const sagK = 1 - Math.exp(-1 / (0.06 * osr))
    const fTop = 0.45 * osr
    const pinkK = 1 - Math.exp((-2 * Math.PI * 1200) / sr)
    const free = p.osc3Free
    const inGain = p.drive * comp * 0.5
    const piOverSr = (Math.PI * TUNE) / osr
    const contour = p.contour * (0.7 + 0.3 * this.velocity)
    const lvl0 = p.level[0]
    const lvl1 = p.level[1]
    const lvl2 = p.level[2]
    const wave0 = p.wave[0]
    const wave1 = p.wave[1]
    const wave2 = p.wave[2]
    const sync = p.sync
    osc1.window = sync === SYNC.soft ? SOFT_WINDOW : 1
    ladder.r = r
    ladder.skew = skew
    const linFm = p.linFm
    const hiss = p.noise * 0.3 + FLOOR
    const loop = p.loop * 2
    const extGain = p.ext
    const modAmt = p.modAmt
    const modMix = p.modMix
    const modPitch = p.modPitch
    const modFilter = p.modFilter
    const sweep = p.envOsc2
    const track = p.track / 12
    const sag = p.sag
    const gain = p.volume * 1.4
    const keyBase = 440 / osr
    const lo = free ? ratio[2]! / osr : 0

    for (let n = from; n < to; n++) {
      if (--this.tick <= 0) {
        this.tick = CONTROL
        this.control()
      }
      this.cv += (this.target - this.cv) * glideK
      if (droopK > 0) {
        this.cv -= this.cv * droopK
        this.target -= this.target * droopK
      }
      fEnv.step()
      aEnv.step()
      const fe = fEnv.level
      const ae = aEnv.level
      this.accentEnv = flushDenormal(this.accentEnv * accentFall)
      this.accentCap = flushDenormal(
        this.accentCap + (this.accentEnv - this.accentCap) * accentCapK,
      )
      this.boost += (this.boostTarget - this.boost) * boostK
      const amp = (leak + (1 - leak) * ae) * this.boost
      const mod =
        modMix > 0
          ? modAmt *
            ((1 - modMix) * this.v2 +
              modMix *
                2 *
                (this.pinkish += pinkK * (this.noise() - this.pinkish)))
          : modAmt * this.v2
      const sagged = this.sagEnv * sag
      const keyHz =
        keyBase *
        octaves(
          (this.cv - 69 + this.bend + modPitch * mod - sagged * 3) / 12 +
            (pitchLane ? pitchLane[n]! : 0),
        )
      const dt0 = keyHz * ratio[0]!
      const dt1 = Math.min(
        keyHz * ratio[1]! * (sweep === 0 ? 1 : octaves((sweep * fe) / 12)),
        0.45,
      )
      const dt2 = Math.min(free ? lo : keyHz * ratio[2]!, 0.45)
      const cutoff = Math.min(
        p.cutoff *
          octaves(
            contour * fe +
              accentOct * this.accentCap +
              track * (this.cv - 48) +
              modFilter * mod +
              this.open +
              (cutoffLane ? cutoffLane[n]! : 0) -
              sagged * 0.5,
          ),
        fTop,
      )
      const f = tan(piOverSr * Math.max(cutoff, 15))
      const e = ext ? ext[n]! * extGain : 0

      let pair0 = 0
      for (let k = 0; k < OS; k++) {
        const fm0 = linFm === 0 ? dt0 : dt0 * (1 + linFm * this.v1)
        osc0.dt = Math.min(Math.max(fm0, -0.45), 0.45)
        osc0.advance()
        osc1.dt = dt1
        osc1.advance()
        osc2.dt = dt2
        osc2.advance()
        if (sync === SYNC.off) osc1.value(wave1)
        else osc1.synced(wave1, osc0)
        const v1 = osc1.out
        this.v1 = v1
        osc2.value(wave2)
        const v2 = osc2.out
        osc0.value(wave0)
        const mix =
          lvl0 * osc0.out +
          lvl1 * v1 +
          lvl2 * v2 +
          hiss * this.noise() +
          loop * this.last +
          e
        ladder.y = mix * inGain
        ladder.f = f
        ladder.process()
        const v = ladder.y * amp
        this.last = v
        this.sagEnv = flushDenormal(
          this.sagEnv + sagK * (Math.abs(v) - this.sagEnv),
        )
        if (k === 0) pair0 = v
        else this.v2 = v2
      }
      const y = this.dc.process(this.down.process(pair0, this.last), 0.9995)
      out[n] = softclip(y * gain) * 0.9
    }
  }

  panic() {
    this.allOff()
    this.fEnv.level = 0
    this.aEnv.level = 0
    this.accentEnv = 0
    this.accentCap = 0
    this.boost = 1
    this.boostTarget = 1
    this.sliding = false
    this.ladder.reset()
    this.down.reset()
    this.dc.reset()
    this.last = 0
    this.pinkish = 0
    this.sagEnv = 0
    this.v1 = 0
    this.v2 = 0
    for (const osc of [this.osc0, this.osc1, this.osc2]) osc.reset()
    for (const walk of [...this.drunk, ...this.heatWalk]) walk.reset()
  }
}
