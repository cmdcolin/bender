import { IDX } from '../../engine/params'
import { DEST } from '../modbus'
import type { Ctx, Stage, StereoBlock } from '../stage'
import { KEY_BIAS } from '../trigbus'
import { A3_HZ, octaves } from '../util/pitch'
import { QuadOsc } from '../util/lfo'

export const RING_SHAPES = ['sine', 'square', 'diode']

// Where the carrier sits relative to the note the board is sounding, and what
// each one does to the note's own harmonics.
//
// A ring modulator moves every partial by the same number of hertz, so a
// carrier that stands still puts the sidebands of `f0·n` at `f0·n ± c` — a grid
// with nothing in common with the one the note came in on, which is the clang
// this stage is known for and the only thing it could do until now.
//
// Lock the carrier to the note at an integer ratio and the sidebands land at
// `f0·(n ± k)`, which is the same grid again: the note survives and only its
// timbre moved. At a half-integer they land on a grid an octave *under* the
// note, so the effect writes a new fundamental below what you played. And at an
// irrational ratio they land on no grid at all — the clang is back, but it
// follows the melody instead of sitting still under it.
//
// The three behaviours are why the list is these eight and not a number: what
// you are picking is which grid comes out, and only the name says that.
export const RING_TRACK = [
  'off',
  'sub',
  'unison',
  'fifth',
  'octave',
  'oct+5th',
  'two oct',
  'tritone',
]
const TRACK_RATIO = [0, 0.5, 1, 1.5, 2, 3, 4, Math.SQRT2]

// The diode drop, and the gain that gets a bridge back to the level of the
// multiply it sits beside. The trim is not exact and is not meant to be: it
// holds at low level and lets the bridge come up about a decibel when it is
// driven, which is the level dependence being asked for.
const VT = 0.2
const BRIDGE_TRIM = 0.4

const diode = (v: number) => (v > 0 ? (v * v) / (v + VT) : 0)

// Four diodes in a ring, which is the circuit the effect is named after. What
// it does that a multiply cannot is fail to conduct near zero, so a quiet
// programme comes out gritty and crossover-distorted and a loud one pushes
// through to something close to the clean product. Neither of the other two
// shapes moves at all with level.
const bridge = (x: number, c: number) =>
  BRIDGE_TRIM * (diode(c + x) - diode(c - x) - diode(x - c) + diode(-c - x))

export class RingMod implements Stage {
  label = 'ringmod'
  private carrier = new QuadOsc()
  /** Where the carrier is being asked to sit, before any wire moves it: the
      knob, or the note the key line last carried. */
  private hz = 0
  /** The rate actually loaded into the oscillator. A tracked carrier only
      changes on a note, which is rare, so the two trig calls a rate costs are
      worth a compare to skip. */
  private loaded = -1

  constructor(private readonly sr: number) {}

  private tune(hz: number) {
    if (hz === this.loaded) return
    this.carrier.setRate(hz, this.sr)
    this.loaded = hz
  }

  when(p: Float32Array) {
    return p[IDX.ringMix]! > 0
  }

  process(io: StereoBlock, p: Float32Array, ctx: Ctx) {
    const base = p[IDX.ringHz]!
    const mod = ctx.mod.read(DEST.ringHz)
    const shape = Math.round(p[IDX.ringShape]!)
    const ratio = TRACK_RATIO[Math.round(p[IDX.ringTrack]!)] ?? 0
    const mix = p[IDX.ringMix]!
    const micCarrier = Math.round(p[IDX.micPatch]!) === 4
    const carrier = this.carrier
    // Untracked, the knob is the whole story. Tracked, it is where the carrier
    // waits until the first note arrives — which is also where it stays on a
    // board whose sound is coming from the FM chip or the sampler, since
    // neither of those stamps the key line.
    if (!ratio || this.hz === 0) this.hz = base
    // A wire on the carrier rewrites the rate every sample, so the rate the
    // oscillator is holding stops meaning anything while one is patched: the
    // block after it comes out has to set the rate again rather than believe
    // the last thing this wrote.
    if (mod) this.loaded = -1
    else this.tune(this.hz)

    for (let i = 0; i < io.n; i++) {
      let carL: number
      let carR: number
      if (micCarrier) {
        carL = carR = Math.min(Math.max(ctx.mic[i]! * 2, -1), 1)
      } else {
        if (ratio) {
          const struck = ctx.trig.key[i]!
          if (struck > 0) {
            this.hz = A3_HZ * octaves((struck - KEY_BIAS) / 12) * ratio
            if (!mod) this.tune(this.hz)
          }
        }
        if (mod) {
          carrier.setRate(
            Math.min(this.hz * octaves(mod[i]! * 4), this.sr * 0.45),
            this.sr,
          )
        }
        carrier.step()
        // The oscillator turns a whole vector and has been handing back half of
        // it: sine and cosine of one phase, for the price the sine cost on its
        // own. Giving the right channel the cosine puts a quarter turn between
        // the two, which is the width the stage never had — and at sub-audio
        // rates it is what makes the tremolo pan rather than pump. Folded to
        // mono the pair is one carrier 45° over and 3 dB down, so nothing
        // cancels.
        carL = carrier.im
        carR = carrier.re
        if (shape === 1) {
          carL = Math.sign(carL) || 1
          carR = Math.sign(carR) || 1
        }
      }
      const l = io.l[i]!
      const r = io.r[i]!
      const wl = shape === 2 ? bridge(l, carL) : l * carL
      const wr = shape === 2 ? bridge(r, carR) : r * carR
      io.l[i] = l * (1 - mix) + wl * mix
      io.r[i] = r * (1 - mix) + wr * mix
    }
  }

  panic() {
    this.carrier.reset()
    this.hz = 0
    this.loaded = -1
  }
}
